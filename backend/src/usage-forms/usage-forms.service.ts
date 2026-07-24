import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  BLOB_STORE,
  BlobStore,
  DOWNLOAD_URL_TTL_SECONDS,
} from '../storage/blob-store';
import {
  assertFormatAllowed,
  assertSizeWithinLimit,
  extensionOf,
} from '../storage/file-rules';
import { assertCanWriteDocumentAsset } from '../storage/document-asset-authz';
import { canPerform, FunctionKey } from '../rbac/function-matrix';
import { FieldKey } from '../rbac/field-matrix';
import { SessionContext, UploadFile } from '../attachments/attachments.service';
import {
  AUDIT_RECORDER,
  AuditRecorder,
  FORM_POOL_STORE,
  FormPoolStore,
  UPLOADER_DIRECTORY,
  UPLOADER_ORG_RESOLVER,
  UploaderDirectory,
  UploaderOrgResolver,
  UsageFormPoolItem,
  UsageFormRecord,
} from './usage-forms.store';

/** 覆蓋共用警示門檻：被 ≥2 份文件引用時觸發 USAGE_FORM_OVERWRITE_SHARED（prototype 19 定案）。 */
export const SHARED_OVERWRITE_MIN_REFS = 2;

/** 表單名稱長度上限＝`USAGE_FORM_POOL.name` 之 nvarchar(400)（entity 權威）。 */
export const USAGE_FORM_NAME_MAX_LENGTH = 400;

/**
 * 解析欲儲存之表單名稱（純函式）：trim 後採用；未提供／空字串／純空白 → fallback 檔名。
 * 超出欄寬 → USAGE_FORM_NAME_TOO_LONG（400）。刻意於 **trim 後**量測，前後空白不佔配額；
 * fallback 之檔名同樣受檢，避免超長檔名繞過驗證後於 MSSQL driver 拋未分類例外。
 */
export function resolveUsageFormName(name: string | undefined | null, fileName: string): string {
  const resolved = (name ?? '').trim() || fileName;
  if (resolved.length > USAGE_FORM_NAME_MAX_LENGTH) {
    throw new BadRequestException(
      `USAGE_FORM_NAME_TOO_LONG: 表單名稱長度上限為 ${USAGE_FORM_NAME_MAX_LENGTH} 字元`,
    );
  }
  return resolved;
}

export interface DownloadGrant {
  url: string;
  expiresInSeconds: number;
}

/** 表單 blob key（穩定；覆蓋一律新 key，舊 key 於 DB 參照更新後回收）。 */
export function buildFormBlobPath(fileName: string): string {
  const ext = extensionOf(fileName);
  return `usage-forms/${randomUUID()}${ext ? '.' + ext : ''}`;
}

/**
 * F018 使用表單管理（表單池 + 文件多對多）。
 *
 * 授權（G 定案）：
 *   - 寫入類（上傳/覆蓋/刪除/關聯）→ 兩道閘門（USAGE_FORM_MANAGEMENT read → USAGE_FORMS 欄位 write）。
 *     系統管理員（READ）卡欄位層 → FIELD_WRITE_FORBIDDEN；主管/部門窗口/一般使用者（無）→ PERMISSION_DENIED。
 *   - 後台查詢類（表單池清單）→ 功能 read gate（USAGE_FORM_MANAGEMENT）。
 *   - 前台下載/詳情表單清單 → 屬文件瀏覽/下載列印（全角色 READ），僅需 session 存在，不受表單池功能限制。
 */
@Injectable()
export class UsageFormsService {
  constructor(
    @Inject(BLOB_STORE) private readonly blob: BlobStore,
    @Inject(FORM_POOL_STORE) private readonly store: FormPoolStore,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    // G-ADM-024 上傳者名冊（accountId→姓名/orgCode）。選填以免破壞既有純 store 單測（無→uploadedByName/Dept 留 null）。
    @Optional()
    @Inject(UPLOADER_DIRECTORY)
    private readonly uploaderDir?: UploaderDirectory,
    // G-ADM-024 部門名解析（orgCode→ORG_UNIT 名）。選填。
    @Optional()
    @Inject(UPLOADER_ORG_RESOLVER)
    private readonly orgResolver?: UploaderOrgResolver,
  ) {}

  /**
   * 上傳單一表單至表單池（建立，初始關聯數 0）。
   * `name`＝使用者於上傳 modal 輸入之自訂表單名稱（prototype 19「表單名稱 *」欄）；
   * 未提供 → 沿用檔名（與 modal 之自動帶入行為一致）。
   */
  async uploadForm(
    session: SessionContext | undefined,
    file: UploadFile,
    name?: string,
  ): Promise<UsageFormRecord> {
    this.assertCanWrite(session?.roleCode);
    assertFormatAllowed('USAGE_FORM', file);
    assertSizeWithinLimit(file.size);
    return this.createFromFile(session, file, resolveUsageFormName(name, file.fileName));
  }

  /**
   * 批次上傳（先驗證全部格式/大小，再全部建立，避免部分寫入）。
   * **刻意不接受自訂名稱**：prototype 19 之檔案選取無 `multiple`，UI 無逐檔命名之驗收依據；
   * 各記錄一律沿用各自檔名。
   */
  async uploadForms(
    session: SessionContext | undefined,
    files: UploadFile[],
  ): Promise<UsageFormRecord[]> {
    this.assertCanWrite(session?.roleCode);
    for (const f of files) {
      assertFormatAllowed('USAGE_FORM', f);
      assertSizeWithinLimit(f.size);
    }
    const out: UsageFormRecord[] = [];
    for (const f of files) {
      out.push(await this.createFromFile(session, f, resolveUsageFormName(undefined, f.fileName)));
    }
    return out;
  }

  private async createFromFile(
    session: SessionContext | undefined,
    file: UploadFile,
    name: string,
  ): Promise<UsageFormRecord> {
    const blobPath = buildFormBlobPath(file.fileName);
    await this.blob.put(blobPath, file.buffer ?? Buffer.alloc(0), file.contentType);
    return this.store.create({
      name,
      blobPath,
      format: extensionOf(file.fileName),
      size: file.size,
      uploadedBy: session?.accountId ?? 'unknown',
      uploadedAt: new Date(),
    });
  }

  /**
   * 覆蓋上傳新檔。格式/大小驗證優先於引用數判斷（TS-020）。
   * 被 ≥2 份文件引用且未二次確認 → USAGE_FORM_OVERWRITE_SHARED（409，附 N），不寫入。
   * **刻意不接受自訂名稱**：覆蓋僅取代檔案內容，表單名稱維持原值（prototype 19 之
   * doOverwrite/overwriteForm 均無改名欄位）。
   */
  async overwriteForm(
    session: SessionContext | undefined,
    formId: string,
    file: UploadFile,
    opts: { confirmed?: boolean } = {},
  ): Promise<UsageFormRecord> {
    this.assertCanWrite(session?.roleCode);
    assertFormatAllowed('USAGE_FORM', file);
    assertSizeWithinLimit(file.size);

    const form = await this.requireForm(formId);
    const refs = await this.store.countLinks(formId);
    if (refs >= SHARED_OVERWRITE_MIN_REFS && !opts.confirmed) {
      throw new ConflictException(
        `USAGE_FORM_OVERWRITE_SHARED: 此表單另被 ${refs} 份文件引用，覆蓋將同時更新全部`,
      );
    }

    const oldBlobPath = form.blobPath;
    const blobPath = buildFormBlobPath(file.fileName);
    await this.blob.put(blobPath, file.buffer ?? Buffer.alloc(0), file.contentType);
    const updated = await this.store.updateFile(formId, {
      blobPath,
      format: extensionOf(file.fileName),
      size: file.size,
      uploadedBy: session?.accountId ?? 'unknown',
      uploadedAt: new Date(),
    });
    if (oldBlobPath !== blobPath) await this.blob.delete(oldBlobPath);
    return updated;
  }

  /**
   * 自表單池刪除。被 ≥1 份文件引用且未二次確認 → USAGE_FORM_IN_USE（附 N）。
   * 確認後（或無引用）→ 解除全部關聯 + 刪除表單池記錄 + 回收 blob。
   */
  async deleteForm(
    session: SessionContext | undefined,
    formId: string,
    opts: { confirmed?: boolean } = {},
  ): Promise<void> {
    this.assertCanWrite(session?.roleCode);
    const form = await this.requireForm(formId);
    const refs = await this.store.countLinks(formId);
    if (refs >= 1 && !opts.confirmed) {
      throw new ConflictException(
        `USAGE_FORM_IN_USE: 已被 ${refs} 份文件使用，移除將一併解除全部關聯`,
      );
    }
    await this.store.unlinkAll(formId);
    await this.store.delete(formId);
    await this.blob.delete(form.blobPath);
  }

  /** 文件建立/編輯時自表單池多選關聯（多對多）。 */
  async linkForms(
    session: SessionContext | undefined,
    documentId: string,
    formIds: string[],
  ): Promise<void> {
    this.assertCanWrite(session?.roleCode);
    for (const formId of formIds) {
      await this.requireForm(formId);
      await this.store.link(documentId, formId);
    }
  }

  /** 文件編輯時解除單一表單關聯（表單仍留於池中）。 */
  async unlinkForm(
    session: SessionContext | undefined,
    documentId: string,
    formId: string,
  ): Promise<void> {
    this.assertCanWrite(session?.roleCode);
    await this.store.unlink(documentId, formId);
  }

  /** 後台表單池清單（功能 read gate）。 */
  async listPool(session: SessionContext | undefined): Promise<UsageFormRecord[]> {
    this.assertCanRead(session?.roleCode);
    return this.store.list();
  }

  /**
   * 後台表單池總覽（功能 read gate）：每筆附關聯文件數 + 關聯文件精簡清單，
   * 供管理頁清單「關聯文件數」欄與展開檢視（prototype 19）。
   */
  async listPoolOverview(
    session: SessionContext | undefined,
  ): Promise<UsageFormPoolItem[]> {
    this.assertCanRead(session?.roleCode);
    const items = await this.store.listPoolOverview();
    await this.enrichUploaders(items);
    return items;
  }

  /**
   * G-ADM-024：以 uploadedBy(accountId) 批次解析上傳者姓名 + 部門名（單次名冊查詢 + 去重部門解析，無 N+1）。
   * 無名冊（uploaderDir 未注入）→ 略過（uploadedByName/Dept 留 undefined，前端 fallback 顯示 accountId 或空）。
   */
  private async enrichUploaders(items: UsageFormPoolItem[]): Promise<void> {
    if (!this.uploaderDir || items.length === 0) return;
    const accountIds = [
      ...new Set(items.map((i) => i.uploadedBy).filter((x) => !!x && x !== 'unknown')),
    ];
    const uploaders =
      accountIds.length > 0
        ? await this.uploaderDir.resolveUploaders(accountIds)
        : new Map<string, { name: string | null; orgCode: string | null }>();

    const orgCodes = new Set<string>();
    for (const u of uploaders.values()) if (u.orgCode) orgCodes.add(u.orgCode);
    const deptNames = new Map<string, string | null>();
    if (this.orgResolver) {
      for (const c of orgCodes) deptNames.set(c, await this.orgResolver.resolveOrgUnitName(c));
    }

    for (const it of items) {
      const u = uploaders.get(it.uploadedBy);
      it.uploadedByName = u?.name ?? null;
      it.uploadedByDept = u?.orgCode ? (deptNames.get(u.orgCode) ?? null) : null;
    }
  }

  /** 文件詳情頁之關聯表單清單（前後台共用；屬文件瀏覽，不受表單池功能限制）。 */
  listFormsByDocument(documentId: string): Promise<UsageFormRecord[]> {
    return this.store.listByDocument(documentId);
  }

  /**
   * 後台表單池個別下載（管理頁 prototype 19 之下載鈕；功能 read gate → SysAdmin 唯讀亦可下載，
   * 主管/部門窗口/一般使用者=無 → PERMISSION_DENIED）。核發短效 URL。
   * ⚠ 管理端下載之稽核義務未定（OQ-F018-06；spec 僅明文「前台下載→稽核」）→ 暫不記錄，於 summary flag。
   */
  async downloadFromPool(
    session: SessionContext | undefined,
    formId: string,
  ): Promise<DownloadGrant> {
    this.assertCanRead(session?.roleCode);
    const form = await this.requireForm(formId);
    const url = await this.blob.getDownloadUrl(form.blobPath, DOWNLOAD_URL_TTL_SECONDS);
    return { url, expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS };
  }

  /**
   * 前台下載表單：未登入 → FILE_ACCESS_DENIED（不核發、不稽核）；
   * 通過 → 核發短效期 URL + 同步寫入調閱稽核。
   */
  async downloadForm(
    session: SessionContext | undefined,
    documentId: string,
    formId: string,
  ): Promise<DownloadGrant> {
    if (!session?.accountId) {
      throw new ForbiddenException('FILE_ACCESS_DENIED');
    }
    const form = await this.requireForm(formId);
    const url = await this.blob.getDownloadUrl(form.blobPath, DOWNLOAD_URL_TTL_SECONDS);
    await this.audit.record({
      targetType: 'USAGE_FORM',
      actionType: 'DOWNLOAD',
      formId,
      documentId,
      accountId: session.accountId,
    });
    return { url, expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS };
  }

  private assertCanRead(roleCode: string | undefined): void {
    if (!canPerform(roleCode, FunctionKey.USAGE_FORM_MANAGEMENT, 'read')) {
      throw new ForbiddenException('PERMISSION_DENIED');
    }
  }

  private assertCanWrite(roleCode: string | undefined): void {
    assertCanWriteDocumentAsset(
      roleCode,
      FunctionKey.USAGE_FORM_MANAGEMENT,
      FieldKey.USAGE_FORMS,
    );
  }

  private async requireForm(formId: string): Promise<UsageFormRecord> {
    const form = await this.store.findById(formId);
    if (!form) throw new NotFoundException('USAGE_FORM_NOT_FOUND');
    return form;
  }
}
