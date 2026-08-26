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
import { BLOB_STORE, BlobStore } from '../storage/blob-store';
import { contentTypeOfFormat } from '../storage/content-disposition';
import {
  assertFormatAllowed,
  assertSizeWithinLimit,
  extensionOf,
} from '../storage/file-rules';
import { assertCanWriteDocumentAsset } from '../storage/document-asset-authz';
import { isUniqueConstraintViolation } from '../documents/db-error';
import {
  assertFormNumberValid,
  formNumberCompareKey,
  normalizeFormNumber,
} from './form-number';
import { canPerform, FunctionKey } from '../rbac/function-matrix';
import { FieldKey } from '../rbac/field-matrix';
import { SessionContext, UploadFile } from '../attachments/attachments.service';
import {
  WATERMARK_BURNER,
  WatermarkBurner,
  WatermarkSession,
  resolveAuditIdentity,
} from '../public/watermark-burner.service';
import {
  AUDIT_RECORDER,
  AuditRecorder,
  FORM_POOL_STORE,
  FormPoolStore,
  UPLOADER_DIRECTORY,
  UploaderInfo,
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

/**
 * F020 `AC-D3a`：使用表單下載一律**代理串流**——回傳位元組本身，不核發 SAS、不 3xx 轉址。
 * 🔴 2026-08-17：後台兩支（`downloadFromPool()`／`downloadFormRaw()`）**亦改用本型別**，
 * 原 `DownloadGrant`（`{ url, expiresInSeconds }`）已無消費端而移除。前後台之差別只剩
 * 「是否燒錄／是否寫稽核」（`AC-D4` 之後台 RAW 硬邊界），不再是傳輸模式的差別。
 */
export interface UsageFormDownloadBytes {
  bytes: Buffer;
  fileName: string;
  contentType: string;
}

/**
 * 🔴 §11.5（2026-08-20 D9 delta）：本檔原持有之 `FrontBurner` 介面**已刪除**，改用
 * `public/watermark-burner.service.ts` 之 `WatermarkBurner`（token `WATERMARK_BURNER`）。
 *
 * 📝 被取代之既有註記逐字保留供追溯：OLD> 「本宣告與 `appendices.service.ts` 之 `FrontBurner`
 * **必須逐字同形**……兩處刻意各自宣告以避免模組循環，故新增能力時兩邊都要加。」
 * **為何可以取消那條紀律**：兩處各自宣告是為了迴避 `appendices ↔ usage-forms ↔ public` 之
 * 模組循環；`WatermarkBurnerModule` 抽出後該循環在結構上已不存在，兩份宣告可收斂為一份，
 * 「新增能力時兩邊都要加」這條**靠人記得**的規則隨之消失。
 */

/**
 * 使用表單之允許格式 → 回應 Content-Type（白名單既定，不接受客戶端宣告）。
 * 🔴 2026-08-17：改指向 `storage/content-disposition` 之**全站唯一表**——原本此處、附錄服務與
 * `watermark.controller` 各有一份逐字相同的私有實作（白名單擴充時必然只改到其中一份）。
 */
const usageFormContentType = contentTypeOfFormat;

/**
 * 🔴 D9 delta（`AC-N45`）：制定部門編輯之 patch 形狀。
 *
 * **兩鍵皆選填，且「未帶鍵」與「帶鍵但值為空」語意不同**——`{}` ＝兩項都不動；
 * `{ draftingDeptCodes: [] }` ＝清空制定部門（0 筆為合法狀態）。故服務層一律以
 * `'key' in patch` 判斷，不得用 `patch.x !== undefined`（那會把「顯式清空」誤判為「不動」）。
 */
export interface UsageFormMetadataPatch {
  formNumber?: string | null;
  draftingDeptCodes?: string[];
}

/**
 * 制定部門代碼之正規化（`AC-N45`）：trim → 去空 → 去重 → 依 orgCode 昇冪。
 * 排序於**寫入時**完成，使「重新開啟編輯頁完整回填且依 orgCode 昇冪」不依賴讀取端各自排序。
 */
export function normalizeDraftingDeptCodes(codes: readonly string[] | undefined): string[] {
  return [...new Set((codes ?? []).map((c) => (c ?? '').trim()).filter((c) => c.length > 0))].sort();
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
    /**
     * F020 `AC-D2`／architecture-spec §10.1：前台附屬檔案燒錄之**單一共用協作點**
     * （與附錄之注入形狀逐字相同——三處共用同一個 `burnIfPdf`，不各寫一份 `if (format === 'pdf')`）。
     * 選填以免破壞既有純建構單測（未注入 → 前台一律回原始位元組、快照為 null）。
     */
    /**
     * 🔴 **`@Optional()` 已移除**（§11.5：啟動期 fail-fast）——理由與 `AppendicesService` 逐字相同：
     * 缺 provider 必須讓容器啟動失敗，而非靜默降級為「不燒錄」。TS 型別之 `?` 保留，既有純建構子
     * 單元測試（`new UsageFormsService(blob, store, audit)`）不受影響。
     */
    @Inject(WATERMARK_BURNER)
    private readonly burner?: WatermarkBurner,
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
    formNumber?: string | null,
    draftingDeptCodes?: string[],
  ): Promise<UsageFormRecord> {
    this.assertCanWrite(session?.roleCode);
    assertFormatAllowed('USAGE_FORM', file);
    assertSizeWithinLimit(file.size);
    const resolvedName = resolveUsageFormName(name, file.fileName);
    // 驗證順序（error-handling#usage-form-number）：格式/大小 → 名稱長度 → 編號長度 → 編號唯一性。
    // 全部在寫 blob 之前完成 ⇒ 任一失敗皆「不建立記錄、不寫 blob」。
    const number = normalizeFormNumber(formNumber);
    assertFormNumberValid(number);
    await this.assertFormNumberAvailable(number, null);
    const rec = await this.createFromFile(session, file, resolvedName, number);
    // 🔴 `AC-N43`／`AC-N45`：制定部門為 additive 欄位；**未帶該鍵**時完全不觸碰關聯表
    // （既有呼叫端之行為逐字不變）。帶了才寫，與本體建立同屬一次流程。
    if (draftingDeptCodes !== undefined) {
      await this.writeDraftingDepts(rec.id, draftingDeptCodes);
    }
    return rec;
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
    formNumber: string | null = null,
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
      formNumber,
    });
  }

  /**
   * 唯一性第一道（應用層先查後判）：池中他列之 `formNumber` 正規化後不分大小寫相等 → 409。
   * `null` 不參與比對（多筆空編號可並存）；`excludeFormId` 為編輯時排除之自身列。
   * 🔴 第二道為 DB 之 filtered unique index——先查後判存在 TOCTOU 視窗，見 `updateFormNumber`。
   */
  private async assertFormNumberAvailable(
    formNumber: string | null,
    excludeFormId: string | null,
  ): Promise<void> {
    const key = formNumberCompareKey(formNumber);
    if (key === null) return;
    const existing = await this.store.list();
    const taken = existing.some(
      (f) => f.id !== excludeFormId && formNumberCompareKey(f.formNumber ?? null) === key,
    );
    if (taken) {
      throw new ConflictException(
        `USAGE_FORM_NUMBER_DUPLICATE: 表單編號「${formNumber}」已被池中其他表單使用`,
      );
    }
  }

  /**
   * F018 編輯頁 metadata 更新（🔴 D9 delta `AC-N48`：由「編輯編號」擴大為「表單編號＋制定部門」）。
   *
   * 📝 **被取代之方法名逐字保留供追溯**：OLD> `updateFormNumber(session, formId, formNumber)`
   * ——body 已擴為物件形狀（`AC-N48`），service 簽章隨之物件化。
   *
   * 🔒 `AC-D20`／`AC-N49`（副作用邊界）：**六欄未變、Blob 未讀未寫**——本方法收不到檔案，
   * 就不可能碰檔案；`USAGE_FORM_DRAFTING_DEPT` 為獨立關聯表，其 replace-set 與 `USAGE_FORM_POOL`
   * 本體六欄互不相涉，此邊界是**結構性**成立，不需額外設計保證。
   *
   * 授權沿用既有兩道閘門：功能面 `USAGE_FORM_MANAGEMENT`＋欄位面 `USAGE_FORMS`
   * ⇒ ICSOPAdmin 通過／SysAdmin `FIELD_WRITE_FORBIDDEN`／其餘三角色 `PERMISSION_DENIED`。
   */
  async updateFormMetadata(
    session: SessionContext | undefined,
    formId: string,
    patch: UsageFormMetadataPatch,
  ): Promise<UsageFormRecord & { draftingDeptCodes: string[] }> {
    this.assertCanWrite(session?.roleCode);
    let record = await this.requireForm(formId);

    if ('formNumber' in patch) {
      record = await this.writeFormNumber(formId, patch.formNumber ?? null);
    }
    if ('draftingDeptCodes' in patch) {
      await this.writeDraftingDepts(formId, patch.draftingDeptCodes);
    }
    return { ...record, draftingDeptCodes: await this.readDraftingDepts(formId) };
  }

  /**
   * 制定部門之 replace-set 寫入（`AC-N45`）。store 未提供該能力 → **拋錯而非靜默忽略**：
   * 靜默忽略會讓使用者看到「儲存成功」卻什麼都沒存進去（本 repo 已有同型前科）。
   */
  private async writeDraftingDepts(
    formId: string,
    codes: string[] | undefined,
  ): Promise<void> {
    const write = this.store.replaceDraftingDepts;
    if (!write) {
      throw new Error('EDIT_DRAFTING_DEPT_NOT_SUPPORTED: store 未提供 replaceDraftingDepts');
    }
    await write.call(this.store, formId, normalizeDraftingDeptCodes(codes));
  }

  /** 單一表單之制定部門（store 未提供 → 空陣列，比照既有選填能力之優雅降級）。 */
  private async readDraftingDepts(formId: string): Promise<string[]> {
    const read = this.store.listDraftingDepts;
    return read ? await read.call(this.store, formId) : [];
  }

  /**
   * 清單之制定部門批次富化（`AC-N47`；比照 §10.12「後端列富化」既有模式，單次查詢、零 N+1）。
   * store 未提供批次方法 → 逐筆退回單筆查詢；兩者皆無 → 一律留空陣列（不拋錯，清單為讀取路徑）。
   */
  private async enrichDraftingDepts(items: UsageFormPoolItem[]): Promise<void> {
    if (items.length === 0) return;
    const batch = this.store.listDraftingDeptsByForms;
    if (batch) {
      const map = await batch.call(
        this.store,
        items.map((i) => i.id),
      );
      for (const it of items) it.draftingDeptCodes = map.get(it.id) ?? [];
      return;
    }
    for (const it of items) it.draftingDeptCodes = await this.readDraftingDepts(it.id);
  }

  /**
   * 🔒 **既有窄口徑（只改編號）之相容保留**：`AC-N48` 擴大的是**端點與編輯頁範圍**，不是
   * 「只改編號」這個既有行為本身——`AC-D16`～`AC-D21` 之編號驗證鏈（長度／唯一性排除自身列／
   * trim 收斂／409 對映）逐字仍然有效，其既有測試（`usage-forms.service.number.spec.ts`／
   * `usage-forms.number-concurrency.spec.ts`）為該鏈之回歸鎖定。
   *
   * 本方法因此保留為 `updateFormMetadata` 之**薄轉接**（不是第二份實作，是同一條路徑的窄入口），
   * 使那些回歸鎖定不需為了本輪的端點擴大而改寫。回傳形狀刻意剝除 `draftingDeptCodes`——
   * 舊入口之契約是「回傳 `UsageFormRecord`」，不得因內部改走新路徑而悄悄多一個欄位。
   */
  async updateFormNumber(
    session: SessionContext | undefined,
    formId: string,
    formNumber: string | null,
  ): Promise<UsageFormRecord> {
    const { draftingDeptCodes: _drafting, ...record } = await this.updateFormMetadata(
      session,
      formId,
      { formNumber },
    );
    return record;
  }

  /** `formNumber` 之既有驗證鏈與寫入路徑（逐字未變，僅由 `updateFormMetadata` 呼叫）。 */
  private async writeFormNumber(
    formId: string,
    formNumber: string | null,
  ): Promise<UsageFormRecord> {
    const number = normalizeFormNumber(formNumber);
    assertFormNumberValid(number);
    await this.assertFormNumberAvailable(number, formId);

    const write = this.store.updateFormNumber;
    if (!write) {
      // 不得降級為 updateFile()——那會讓「只改編號、不碰檔案」從結構保證變成實作紀律。
      throw new Error('EDIT_NUMBER_NOT_SUPPORTED: store 未提供 updateFormNumber');
    }
    try {
      return await write.call(this.store, formId, number);
    } catch (e) {
      // 並發第二道：DB filtered unique index 攔下時 MSSQL 拋 2601／2627，
      // 必須以**同一個 409** 現身而非 500（architecture-spec §10.7 注意事項 7）。
      if (isUniqueConstraintViolation(e)) {
        throw new ConflictException(
          `USAGE_FORM_NUMBER_DUPLICATE: 表單編號「${number}」已被池中其他表單使用`,
        );
      }
      throw e;
    }
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
    await this.enrichDraftingDepts(items);
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
        : new Map<string, UploaderInfo>();

    // 🔴 以 (上傳者公司, 部門代碼) 配對解析——跨公司的同名代碼是不同單位。
    const key = (companyCode: string, orgCode: string): string => `${companyCode}\u0000${orgCode}`;
    const pairs = new Map<string, { companyCode: string; orgCode: string }>();
    for (const u of uploaders.values()) {
      if (u.orgCode && u.companyCode) {
        pairs.set(key(u.companyCode, u.orgCode), { companyCode: u.companyCode, orgCode: u.orgCode });
      }
    }
    const deptNames = new Map<string, string | null>();
    if (this.orgResolver) {
      for (const { companyCode, orgCode } of pairs.values()) {
        deptNames.set(key(companyCode, orgCode), await this.orgResolver.resolveOrgUnitName(companyCode, orgCode));
      }
    }

    for (const it of items) {
      const u = uploaders.get(it.uploadedBy);
      it.uploadedByName = u?.name ?? null;
      it.uploadedByDept =
        u?.orgCode && u?.companyCode ? (deptNames.get(key(u.companyCode, u.orgCode)) ?? null) : null;
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
    session: (SessionContext & Partial<Omit<WatermarkSession, 'accountId'>>) | undefined,
    formId: string,
  ): Promise<UsageFormDownloadBytes> {
    this.assertCanRead(session?.roleCode);
    const form = await this.requireForm(formId);
    // AC-N14／AC-N51：後台池管理頁下載自本輪起一律燒錄＋寫稽核；documentId 為 null（無文件脈絡）。
    return this.burnAndAudit(session, form, null);
  }

  /**
   * F018 `AC-D22`／`AC-D23`：**後台**唯讀詳情頁之表單下載——核發 RAW 短效期 SAS URL，
   * **不燒錄、不寫稽核**（管理存取，比照 `OQ-FM-01` 與附錄後台下載）。
   *
   * 🔴 與 `downloadForm()`（前台，回燒錄後之位元組並寫稽核）**刻意分為兩支**：兩端期待相反，
   * 「一條 route／一支方法同時滿足兩者」在架構上不可能——後台若取得燒錄後位元組即違反
   * F020 `AC-D4`（後台恆 RAW、`burnPdf` spy 必須為 0）。
   * 🔴 **不得**改呼叫 `downloadFromPool()`：後者之閘門為 `使用表單管理` read，而 Supervisor／
   * DeptContact 對該功能無權（F025），會使兩者於後台唯讀詳情頁吃 403，牴觸 F026 矩陣
   * 「使用表單（多）＝唯讀（可下載）」。本方法之授權由 route 層 `下載列印文件` read 承擔。
   *
   * `documentId` 不參與查找（表單以 `formId` 唯一定位，與 `downloadForm()` 一致），
   * 故不列為參數；路徑保留該段僅為與前台端點形狀對稱。
   */
  async downloadFormRaw(
    session: (SessionContext & Partial<Omit<WatermarkSession, 'accountId'>>) | undefined,
    documentId: string,
    formId: string,
  ): Promise<UsageFormDownloadBytes> {
    if (!session?.accountId) {
      throw new ForbiddenException('FILE_ACCESS_DENIED');
    }
    const form = await this.requireForm(formId);
    // AC-N14／AC-N17：後台唯讀/編輯頁下載自本輪起一律燒錄＋寫稽核，且 `documentId` 落列
    // （該路徑之呼叫脈絡確實隸屬某份文件——§11.6 v1.9a 之簽章擴充即為此）。
    return this.burnAndAudit(session, form, documentId);
  }

  /**
   * 後台兩支下載之**共用出口**（差別僅在授權前提：池為功能閘門、詳情頁為 session 存在）。
   *
   * 🔴 **2026-08-17：由核發 SAS URL 改為代理串流**（F020 `AC-D3a` 之後台側修訂）。
   * 原作法回 `{ url }`，前端 `window.open(sasUrl)` 導覽至 `*.blob.core.windows.net`
   * ⇒ Chrome Safe Browsing 出示「偵測到危險網站」紅底攔截頁。代理後無第三方網域參與。
   *
   * 🔒 **RAW 語意逐字未動**（`AC-D4`）：不呼叫 `burnIfPdf`、不寫調閱稽核——只換傳輸方式。
   * 這也是刻意**不**改呼叫 `downloadForm()` 的理由：後者會燒錄並寫稽核。
   */
  private async burnAndAudit(
    session: (SessionContext & Partial<Omit<WatermarkSession, 'accountId'>>) | undefined,
    form: UsageFormRecord,
    documentId: string | null,
  ): Promise<UsageFormDownloadBytes> {
    const raw = await this.blob.getBytes(form.blobPath);
    // DB 有參照但 blob 不存在 → 與「表單不存在」同一對外錯誤碼（區分兩者即洩漏參照存在）。
    if (!raw) {
      throw new NotFoundException('FILE_ACCESS_DENIED');
    }
    // §10.3：格式以上傳時已驗證之 `format` 欄為權威，不採客戶端宣告之 content-type。
    // AC-N15：策略 A 於後台亦適用（非 PDF 原檔直通、burnPdf 不被呼叫）。
    const burned = this.burner
      ? await this.burner.burnIfPdf(session as WatermarkSession, raw, form.format)
      : { bytes: raw, snapshot: null };
    await this.recordDownload(session, form.id, documentId, burned.snapshot);
    return {
      bytes: burned.bytes,
      fileName: form.name,
      contentType: usageFormContentType(form.format),
    };
  }

  /**
   * 使用表單下載稽核之**單一組裝點**（前台 `downloadForm` 與後台兩支共用）。
   * `AC-D14`／`AC-N17`／`AC-N51` 對三條路徑之要求逐字相同，僅 `documentId` 之落值不同。
   */
  private async recordDownload(
    session: (SessionContext & Partial<Omit<WatermarkSession, 'accountId'>>) | undefined,
    formId: string,
    documentId: string | null,
    watermarkSnapshot: string | null,
  ): Promise<void> {
    const identity = await resolveAuditIdentity(this.burner, session as WatermarkSession);
    await this.audit.record({
      targetType: 'USAGE_FORM',
      actionType: 'DOWNLOAD',
      formId,
      documentId,
      accountId: session?.accountId ?? '',
      ...identity,
      watermarkSnapshot,
    });
  }

  /**
   * **前台**下載表單（`AC-D22` 之前台專屬端點所用）：未登入 → FILE_ACCESS_DENIED（不回位元組、不稽核）；
   * 通過 → 回**代理串流之位元組**（PDF 已燒錄／非 PDF 原檔）＋ 同步寫入調閱稽核（`AC-D14`）。
   */
  async downloadForm(
    session: (SessionContext & Partial<Omit<WatermarkSession, 'accountId'>>) | undefined,
    documentId: string,
    formId: string,
  ): Promise<UsageFormDownloadBytes> {
    if (!session?.accountId) {
      throw new ForbiddenException('FILE_ACCESS_DENIED');
    }
    // F041 `AC-D22` ③：業務子分類 viewer 對使用部門不相符之文件 → 404 DOCUMENT_NOT_FOUND，
    // 且**先於**讀取位元組、燒錄與寫稽核（拒絕路徑不留稽核、不洩漏表單是否存在）。
    await this.burner?.assertDocumentVisible?.(session as WatermarkSession, documentId);
    const form = await this.requireForm(formId);

    // 🔴 §10.3：格式判定以上傳時已驗證之伺服器端 `format` 為權威（絕不採 client-supplied
    // content-type）。與附錄之改法**逐字相同**——使用表單只是第三個消費者（§10.1 v1.6a）。
    const raw = (await this.blob.getBytes(form.blobPath)) ?? Buffer.alloc(0);
    const burned = this.burner
      ? await this.burner.burnIfPdf(session as WatermarkSession, raw, form.format)
      : { bytes: raw, snapshot: null };

    await this.recordDownload(session, formId, documentId, burned.snapshot);
    return {
      bytes: burned.bytes,
      fileName: form.name,
      contentType: usageFormContentType(form.format),
    };
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
