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
  APPENDIX_POOL_STORE,
  AppendixPoolItem,
  AppendixPoolStore,
  AppendixRecord,
  AUDIT_RECORDER,
  AuditRecorder,
  DOCUMENT_EXISTENCE_CHECKER,
  DocumentAppendixRecord,
  DocumentExistenceChecker,
  UPLOADER_DIRECTORY,
  UPLOADER_ORG_RESOLVER,
  UploaderDirectory,
  UploaderOrgResolver,
} from './appendices.store';

/** 覆蓋共用警示門檻：被 ≥2 份文件引用時觸發 APPENDIX_OVERWRITE_SHARED（AC-11／AC-12）。 */
export const SHARED_OVERWRITE_MIN_REFS = 2;

/** 移除保護門檻：被 ≥1 份文件引用時觸發 APPENDIX_IN_USE（AC-10）。 */
export const IN_USE_MIN_REFS = 1;

/** 附錄名稱長度上限＝`APPENDIX_POOL.name` 之 nvarchar(400)（entity 權威，AC-07）。 */
export const APPENDIX_NAME_MAX_LENGTH = 400;

/**
 * 解析欲儲存之附錄名稱（純函式，AC-05／AC-06／AC-07）：
 * trim 後採用；未提供／空字串／純空白 → fallback 原始檔名（含副檔名）。
 * 超出欄寬 → APPENDIX_NAME_TOO_LONG（400）。刻意於 **trim 後**量測（前後空白不佔配額）；
 * fallback 之檔名同樣受檢（AC-07 第三分句），避免超長檔名繞過驗證。
 */
export function resolveAppendixName(
  name: string | undefined | null,
  fileName: string,
): string {
  const resolved = (name ?? '').trim() || fileName;
  if (resolved.length > APPENDIX_NAME_MAX_LENGTH) {
    throw new BadRequestException(
      `APPENDIX_NAME_TOO_LONG: 附錄名稱長度上限為 ${APPENDIX_NAME_MAX_LENGTH} 字元`,
    );
  }
  return resolved;
}

export interface DownloadGrant {
  url: string;
  expiresInSeconds: number;
}

/** 附錄 blob key（穩定；覆蓋一律新 key，舊 key 於 DB 參照更新後回收，AC-13）。 */
export function buildAppendixBlobPath(fileName: string): string {
  const ext = extensionOf(fileName);
  return `appendices/${randomUUID()}${ext ? '.' + ext : ''}`;
}

/** 去重且保留首次出現順序（AC「關聯清單中出現重複 appendixId → 去重後處理」）。 */
function dedupe(ids: string[]): string[] {
  return [...new Set(ids)];
}

/**
 * F039 附錄管理（附錄池 ＋ 文件多對多關聯 ＋ 文件內顯示順序 sortOrder）。
 *
 * 授權（AC-31～AC-34，與 F018 守門鏈一致）：
 *   - 寫入類（上傳/覆蓋/移除/關聯/解除）→ 兩道閘門（APPENDIX_MANAGEMENT read → APPENDICES 欄位 write）。
 *     系統管理員（READ）卡欄位層 → FIELD_WRITE_FORBIDDEN；主管/部門窗口/一般使用者（無）→ PERMISSION_DENIED。
 *   - 後台查詢類（附錄池清單/總覽/個別下載）→ 功能 read gate（APPENDIX_MANAGEMENT）。
 *   - 前台詳情附錄清單／下載 → 屬文件瀏覽/下載列印（全角色 READ），僅需 session 存在。
 *
 * ⚠ 與 F018 之刻意差異（architecture-spec §3.6 決策二）：關聯／解除／詳情查詢**主動驗證
 * documentId 存在性**（DOCUMENT_NOT_FOUND），不沿用 usage-forms 之「信任外鍵」模式。
 */
@Injectable()
export class AppendicesService {
  constructor(
    @Inject(BLOB_STORE) private readonly blob: BlobStore,
    @Inject(APPENDIX_POOL_STORE) private readonly store: AppendixPoolStore,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(DOCUMENT_EXISTENCE_CHECKER)
    private readonly documents: DocumentExistenceChecker,
    // 上傳者名冊（accountId→姓名/orgCode）。選填以免破壞純 store 單測（無→uploadedByName/Dept 留 null）。
    @Optional()
    @Inject(UPLOADER_DIRECTORY)
    private readonly uploaderDir?: UploaderDirectory,
    // 部門名解析（orgCode→ORG_UNIT 名）。選填。
    @Optional()
    @Inject(UPLOADER_ORG_RESOLVER)
    private readonly orgResolver?: UploaderOrgResolver,
  ) {}

  // ══════════ 附錄池 CRUD ══════════

  /**
   * 上傳單一附錄至附錄池（建立，初始關聯數 0，AC-01）。
   * `name`＝上傳 modal 之「附錄名稱」（選填；留空／純空白 → fallback 檔名，AC-06）。
   */
  async uploadAppendix(
    session: SessionContext | undefined,
    file: UploadFile,
    name?: string,
  ): Promise<AppendixRecord> {
    this.assertCanWrite(session?.roleCode);
    assertFormatAllowed('APPENDIX', file);
    assertSizeWithinLimit(file.size);
    return this.createFromFile(session, file, resolveAppendixName(name, file.fileName));
  }

  /**
   * 批次上傳（AC-02）：**先全部驗證（格式／大小／名稱長度）再全部建立**，任一違規整批不建立
   * （不得部分寫入，亦不寫任何 blob）。
   * **刻意不接受自訂名稱**（Alt Flow）：各記錄一律沿用各自檔名（prototype 24 multiNameNote）。
   */
  async uploadAppendices(
    session: SessionContext | undefined,
    files: UploadFile[],
  ): Promise<AppendixRecord[]> {
    this.assertCanWrite(session?.roleCode);
    const names: string[] = [];
    for (const f of files) {
      assertFormatAllowed('APPENDIX', f);
      assertSizeWithinLimit(f.size);
      names.push(resolveAppendixName(undefined, f.fileName));
    }
    const out: AppendixRecord[] = [];
    for (let i = 0; i < files.length; i++) {
      out.push(await this.createFromFile(session, files[i], names[i]));
    }
    return out;
  }

  private async createFromFile(
    session: SessionContext | undefined,
    file: UploadFile,
    name: string,
  ): Promise<AppendixRecord> {
    const blobPath = buildAppendixBlobPath(file.fileName);
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
   * 覆蓋上傳新檔（AC-11～AC-15）。
   * **格式／大小驗證優先於引用數判斷**（AC-15）：不合法一律先回 400，不回 409。
   * 被 ≥2 份文件引用且未二次確認 → APPENDIX_OVERWRITE_SHARED（409，訊息含 N），不寫入。
   * **不改附錄名稱**（AC-13）；成功後回收舊 blob（舊檔即時不再可經任何引用文件存取）。
   */
  async overwriteAppendix(
    session: SessionContext | undefined,
    appendixId: string,
    file: UploadFile,
    opts: { confirmed?: boolean } = {},
  ): Promise<AppendixRecord> {
    this.assertCanWrite(session?.roleCode);
    assertFormatAllowed('APPENDIX', file);
    assertSizeWithinLimit(file.size);

    const appendix = await this.requireAppendix(appendixId);
    const refs = await this.store.countLinks(appendixId);
    if (refs >= SHARED_OVERWRITE_MIN_REFS && !opts.confirmed) {
      throw new ConflictException(
        `APPENDIX_OVERWRITE_SHARED: 此附錄另被 ${refs} 份文件引用，覆蓋將同時更新全部`,
      );
    }

    const oldBlobPath = appendix.blobPath;
    const blobPath = buildAppendixBlobPath(file.fileName);
    await this.blob.put(blobPath, file.buffer ?? Buffer.alloc(0), file.contentType);
    const updated = await this.store.updateFile(appendixId, {
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
   * 自附錄池移除（AC-08／AC-10）。被 ≥1 份文件引用且未二次確認 → APPENDIX_IN_USE（409，附 N）。
   * 確認後（或無引用）→ 解除全部關聯 ＋ 刪除池記錄 ＋ 回收 blob。
   */
  async deleteAppendix(
    session: SessionContext | undefined,
    appendixId: string,
    opts: { confirmed?: boolean } = {},
  ): Promise<void> {
    this.assertCanWrite(session?.roleCode);
    const appendix = await this.requireAppendix(appendixId);
    const refs = await this.store.countLinks(appendixId);
    if (refs >= IN_USE_MIN_REFS && !opts.confirmed) {
      throw new ConflictException(
        `APPENDIX_IN_USE: 已被 ${refs} 份文件使用，移除將一併解除全部關聯`,
      );
    }
    await this.store.unlinkAllForAppendix(appendixId);
    await this.store.delete(appendixId);
    await this.blob.delete(appendix.blobPath);
  }

  /** 後台附錄池清單（功能 read gate，AC-16 之資料前提）。 */
  async listPool(session: SessionContext | undefined): Promise<AppendixRecord[]> {
    this.assertCanRead(session?.roleCode);
    return this.store.list();
  }

  /**
   * 後台附錄池總覽（功能 read gate）：每筆附關聯文件數 ＋ 關聯文件精簡清單，
   * 供管理頁「關聯文件數」欄與展開檢視（AC-16／AC-17，prototype 24）。
   */
  async listPoolOverview(
    session: SessionContext | undefined,
  ): Promise<AppendixPoolItem[]> {
    this.assertCanRead(session?.roleCode);
    const items = await this.store.listPoolOverview();
    await this.enrichUploaders(items);
    return items;
  }

  /**
   * 以 uploadedBy(accountId) 批次解析上傳者姓名 ＋ 部門名（單次名冊查詢 ＋ 去重部門解析，無 N+1）。
   * 無名冊（uploaderDir 未注入）→ 略過（uploadedByName/Dept 留 undefined，前端 fallback 顯示）。
   */
  private async enrichUploaders(items: AppendixPoolItem[]): Promise<void> {
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

  // ══════════ 文件關聯與排序（附錄特有） ══════════

  /**
   * **排序權威寫入路徑**（architecture-spec §3.6 決策二）：取代整組關聯並依陣列索引重寫
   * sortOrder（1-based）。建立/編輯畫面送出「已選＋排序」最終狀態之唯一寫入路徑；
   * 單次呼叫即可表達「新增＋移除＋重排」（AC-18／AC-19／AC-22／AC-23）。
   * ⚠ 非 diff-based link/unlink（那是 F018 使用表單之模式，無法表達純重排）。
   */
  async replaceDocumentAppendices(
    session: SessionContext | undefined,
    documentId: string,
    orderedAppendixIds: string[],
  ): Promise<void> {
    this.assertCanWrite(session?.roleCode);
    await this.requireDocument(documentId);
    const ids = dedupe(orderedAppendixIds);
    for (const appendixId of ids) await this.requireAppendix(appendixId);
    await this.store.replaceDocumentAppendices(documentId, ids);
  }

  /**
   * 附加關聯（AC-18 之「新選取者接續末位」語意；API 完整性保留，建立/編輯 UI 不呼叫）。
   * 已存在之關聯忽略且其 sortOrder 不變。
   */
  async appendDocumentAppendices(
    session: SessionContext | undefined,
    documentId: string,
    appendixIds: string[],
  ): Promise<void> {
    this.assertCanWrite(session?.roleCode);
    await this.requireDocument(documentId);
    const ids = dedupe(appendixIds);
    for (const appendixId of ids) await this.requireAppendix(appendixId);
    await this.store.appendDocumentAppendices(documentId, ids);
  }

  /**
   * 解除單一關聯（AC-24）：附錄仍留於池中；剩餘關聯依原相對順序重新編號為連續 1..N（無缺口）。
   * 該附錄未關聯此文件 → 404 APPENDIX_NOT_FOUND。
   */
  async unlinkDocumentAppendix(
    session: SessionContext | undefined,
    documentId: string,
    appendixId: string,
  ): Promise<void> {
    this.assertCanWrite(session?.roleCode);
    await this.requireDocument(documentId);
    const linked = await this.store.listByDocument(documentId);
    if (!linked.some((a) => a.id === appendixId)) {
      throw new NotFoundException('APPENDIX_NOT_FOUND');
    }
    await this.store.unlinkDocumentAppendix(documentId, appendixId);
  }

  /**
   * 文件詳情頁之關聯附錄清單，**依 sortOrder 遞增**（AC-25；前後台共用同一方法故順序必然一致）。
   * 無關聯 → 空陣列（AC-26，非錯誤）。documentId 不存在 → 404 DOCUMENT_NOT_FOUND。
   * 屬文件瀏覽（全角色 READ），不受附錄管理功能權限限制 → 簽章不吃 session（比照 F018）。
   */
  async listByDocument(documentId: string): Promise<DocumentAppendixRecord[]> {
    await this.requireDocument(documentId);
    return this.store.listByDocument(documentId);
  }

  // ══════════ 下載 ══════════

  /**
   * 後台附錄池個別下載（prototype 24 之下載鈕；功能 read gate → SysAdmin 唯讀亦可下載，
   * 主管/部門窗口/一般使用者=無 → PERMISSION_DENIED）。核發短效 URL。
   * **管理端存取：不寫稽核、不燒錄浮水印**（比照 F026 OQ-FM-01 之既有裁決）。
   */
  async downloadFromPool(
    session: SessionContext | undefined,
    appendixId: string,
  ): Promise<DownloadGrant> {
    this.assertCanRead(session?.roleCode);
    const appendix = await this.requireAppendix(appendixId);
    const url = await this.blob.getDownloadUrl(appendix.blobPath, DOWNLOAD_URL_TTL_SECONDS);
    return { url, expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS };
  }

  /**
   * 前台下載附錄（AC-27～AC-29／AC-34）：
   *   - 未登入 → 403 FILE_ACCESS_DENIED（不核發 URL、**不寫稽核**）；
   *   - 該附錄未關聯此文件 → 404 APPENDIX_NOT_FOUND；
   *   - 通過 → 核發原始檔短效期 URL（**不燒錄浮水印**，AC-29）＋ 寫入調閱稽核
   *     （targetType=APPENDIX、appendixId ＋ documentId 皆落列，AC-27）。
   * 任一已登入角色皆允許（屬前台瀏覽/下載列印，不受附錄管理功能權限限制，AC-34）。
   */
  async downloadAppendix(
    session: SessionContext | undefined,
    documentId: string,
    appendixId: string,
  ): Promise<DownloadGrant> {
    if (!session?.accountId) {
      throw new ForbiddenException('FILE_ACCESS_DENIED');
    }
    await this.requireDocument(documentId);
    const linked = await this.store.listByDocument(documentId);
    const appendix = linked.find((a) => a.id === appendixId);
    if (!appendix) throw new NotFoundException('APPENDIX_NOT_FOUND');

    const url = await this.blob.getDownloadUrl(appendix.blobPath, DOWNLOAD_URL_TTL_SECONDS);
    await this.audit.record({
      targetType: 'APPENDIX',
      actionType: 'DOWNLOAD',
      appendixId,
      documentId,
      accountId: session.accountId,
    });
    return { url, expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS };
  }

  // ══════════ 守門與共用查找 ══════════

  private assertCanRead(roleCode: string | undefined): void {
    if (!canPerform(roleCode, FunctionKey.APPENDIX_MANAGEMENT, 'read')) {
      throw new ForbiddenException('PERMISSION_DENIED');
    }
  }

  private assertCanWrite(roleCode: string | undefined): void {
    assertCanWriteDocumentAsset(
      roleCode,
      FunctionKey.APPENDIX_MANAGEMENT,
      FieldKey.APPENDICES,
    );
  }

  private async requireAppendix(appendixId: string): Promise<AppendixRecord> {
    const appendix = await this.store.findById(appendixId);
    if (!appendix) throw new NotFoundException('APPENDIX_NOT_FOUND');
    return appendix;
  }

  /** ⚠ F039 對 F018 之刻意新增要求（§3.6 決策二 ⚠ 發現）：不可信任外鍵、須主動驗證。 */
  private async requireDocument(documentId: string): Promise<void> {
    if (!(await this.documents.exists(documentId))) {
      throw new NotFoundException('DOCUMENT_NOT_FOUND');
    }
  }
}
