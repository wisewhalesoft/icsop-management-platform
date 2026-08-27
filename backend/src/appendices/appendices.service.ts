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
  baseNameOf,
  extensionOf,
} from '../storage/file-rules';
import { assertCanWriteDocumentAsset } from '../storage/document-asset-authz';
import {
  WATERMARK_BURNER,
  WatermarkBurner,
  WatermarkSession,
  resolveAuditIdentity,
} from '../public/watermark-burner.service';
import { supportsWatermark } from '../public/watermark';
import {
  CsvColumn,
  assertExportRowLimit,
  exportFileName,
  formatExportTimestamp,
  joinLinkedDocumentNumbers,
  toCsvBuffer,
} from '../storage/csv-export';
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
  UploaderInfo,
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
 * trim 後採用；未提供／空字串／純空白 → fallback **去副檔名之檔名主體**。
 * 超出欄寬 → APPENDIX_NAME_TOO_LONG（400）。刻意於 **trim 後**量測（前後空白不佔配額）；
 * fallback 之檔名同樣受檢（AC-07 第三分句），避免超長檔名繞過驗證。
 *
 * 🔴 2026-08-27 使用者裁決（`AC-X1`）：fallback **去掉副檔名**（`baseNameOf`）。
 * 📝 被推翻之原行為逐字保留供追溯：OLD> `fallback 原始檔名（含副檔名）`。
 * ⚠ 長度上限**於去副檔名後量測**——副檔名不佔 400 字元配額（`AC-X3`）。
 */
export function resolveAppendixName(
  name: string | undefined | null,
  fileName: string,
): string {
  const resolved = (name ?? '').trim() || baseNameOf(fileName);
  if (resolved.length > APPENDIX_NAME_MAX_LENGTH) {
    throw new BadRequestException(
      `APPENDIX_NAME_TOO_LONG: 附錄名稱長度上限為 ${APPENDIX_NAME_MAX_LENGTH} 字元`,
    );
  }
  return resolved;
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
/**
 * F020 `AC-D3a`：附錄下載一律**代理串流**——回傳位元組本身，**不核發 SAS URL、不 3xx 轉址**。
 * 🔴 2026-08-17：後台之 `downloadFromPool()` **亦改用本型別**，原 `DownloadGrant` 已無消費端
 * 而移除。前後台之差別只剩「是否燒錄／是否寫稽核」（`AC-D4`），不再是傳輸模式的差別。
 */
export interface AppendixDownloadBytes {
  bytes: Buffer;
  fileName: string;
  contentType: string;
}

/**
 * 🔴 §11.5（2026-08-20 D9 delta）：本檔原持有之 `FRONT_BURNER` token 與 `FrontBurner` 介面
 * **已搬遷並更名**為 `WATERMARK_BURNER`／`WatermarkBurner`（`public/watermark-burner.service.ts`）。
 *
 * **更名理由**：`AC-N14` 起後台四條下載端點亦為消費者，名稱中的「Front」已與語意脫節，會誤導
 * 下一位工程師以為它只用於前台。**搬遷理由**：附錄與使用表單此前各自宣告一份結構同形的介面
 * （「兩處必須逐字同形」是紀律性保證），搬到零相依之共用模組後只剩一份，結構上不可能漂移。
 */

/**
 * 附錄之允許格式 → 回應 Content-Type（白名單既定，不接受客戶端宣告）。
 * 🔴 2026-08-17：改指向 `storage/content-disposition` 之**全站唯一表**（原為三份逐字重複之
 * 私有實作，見該檔註解）。
 */
const contentTypeOf = contentTypeOfFormat;

/** 匯出結果（controller 據此設定 Content-Disposition 並 `res.send(buffer)`）。 */
export interface AppendixExportResult {
  csv: Buffer;
  fileName: string;
}

/**
 * 匯出之篩選條件——**與管理頁清單之篩選同一組**（`AC-D5`：匯出範圍＝當前篩選之全部結果）。
 * `format` 之 `excel` 涵蓋 `xlsx`／`xls`（與畫面之格式篩選同一分類，AC-16）。
 */
export interface AppendixExportFilters {
  q?: string;
  format?: 'excel' | 'pdf' | '';
}

/** 檔案大小之顯示格式——與前端 `AppendixManagementPage.formatSize()` 同值（值層＝畫面所見）。 */
function formatSizeLabel(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** 名稱關鍵字（不分大小寫）＋ 格式分類之 AND 比對。 */
function matchesAppendixFilters(item: AppendixPoolItem, filters: AppendixExportFilters): boolean {
  const q = (filters.q ?? '').trim().toLowerCase();
  if (q && !item.name.toLowerCase().includes(q)) return false;
  if (filters.format === 'pdf' && item.format !== 'pdf') return false;
  if (filters.format === 'excel' && item.format !== 'xlsx' && item.format !== 'xls') return false;
  return true;
}

/**
 * F039 匯出之**七欄**（`AC-D6` ②）。⚠ 畫面之「操作」欄**不匯出**；
 * 畫面之「上傳者 / 上傳時間」單欄於 CSV **拆為兩欄**。
 *
 * 🔵 2026-08-27 使用者裁決（`AC-X2`）：末尾新增「關聯文件編號」欄——「關聯文件數」只回答
 * 「幾份」，回答不了「哪幾份」；後者原本只能逐列展開才看得到，在 CSV 裡等於看不到。
 * 📝 被取代之欄集逐字保留供追溯：OLD> 六欄（`附錄名稱,格式,大小,上傳者,上傳時間,關聯文件數`）。
 * 🔒 既有六欄之字面與相對順序**一格不動**（新欄一律接在末尾，既有欄索引不位移）。
 */
const APPENDIX_EXPORT_COLUMNS: CsvColumn<AppendixPoolItem>[] = [
  { header: '附錄名稱', value: (r) => r.name },
  { header: '格式', value: (r) => r.format },
  { header: '大小', value: (r) => formatSizeLabel(r.size) },
  { header: '上傳者', value: (r) => r.uploadedByName ?? r.uploadedBy },
  { header: '上傳時間', value: (r) => formatExportTimestamp(r.uploadedAt) },
  { header: '關聯文件數', value: (r) => r.docCount },
  { header: '關聯文件編號', value: (r) => joinLinkedDocumentNumbers(r.documents) },
];

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
    /**
     * F020 `AC-D2`／architecture-spec §10.1：前台附屬檔案燒錄之**單一共用協作點**。
     * 三處（附件／附錄／使用表單）一律呼叫同一個 `burnIfPdf`，不各寫一份 `if (format === 'pdf')`。
     * 選填以免破壞既有純建構單測（未注入 → 前台一律回原始位元組、快照為 null）。
     */
    /**
     * 🔴 **`@Optional()` 已移除**（§11.5：啟動期 fail-fast）。上一輪 `FRONT_BURNER` 曾**從未被
     * 任何模組 provide**，而注入處寫了 `@Optional()` ⇒ 燒錄整段靜默跳過、單元測試全綠、
     * 使用者以為有浮水印其實一個字都沒燒。移除後，若 `AppendicesModule` 忘記 import
     * `WatermarkBurnerModule` 或漏註冊 provider，Nest 於 `app.listen()` **之前**即拋
     * `UnknownDependenciesException`、程序非 0 結束。
     *
     * ⚠ TS 型別之 `?` **保留**：`@Optional()`（Nest 容器解析行為）與 `?`（編譯期）是兩個獨立
     * 的旋鈕。既有純建構子單元測試（`new AppendicesService(blob, store, audit, checker)`）完全
     * 繞過 Nest 容器，故移除 `@Optional()` 對它們零影響。
     */
    @Inject(WATERMARK_BURNER)
    private readonly burner?: WatermarkBurner,
  ) {}

  /**
   * F039 `AC-D4`～`AC-D11`：附錄池匯出（CSV）。
   *
   * 範圍＝**當前篩選之全部結果**（非當前頁）；列序即 `listPoolOverview()` 之列序（畫面當前排序）。
   * 閘門沿用既有 `assertCanRead`——匯出屬讀取類動作，SysAdmin（唯讀）允許。**不寫稽核**
   * （管理存取，比照後台下載）。
   *
   * 📌 沿用 load-all：附錄池為**有界**集合（百量級），10,000 上限即為天花板，不需 SQL 下推
   * （架構 §10.4 ④ 之表格：只有兩張 append-only 變更日誌表需要 COUNT 下推）。
   */
  async exportPool(
    session: SessionContext | undefined,
    filters: AppendixExportFilters,
  ): Promise<AppendixExportResult> {
    this.assertCanRead(session?.roleCode);
    const items = await this.store.listPoolOverview();
    await this.enrichUploaders(items);
    const rows = items.filter((it) => matchesAppendixFilters(it, filters));
    assertExportRowLimit(rows.length);
    return {
      csv: toCsvBuffer(rows, APPENDIX_EXPORT_COLUMNS),
      fileName: exportFileName('appendices', new Date()),
    };
  }

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
  async listByDocument(
    documentId: string,
  ): Promise<(DocumentAppendixRecord & { watermarkSupported: boolean })[]> {
    await this.requireDocument(documentId);
    const rows = await this.store.listByDocument(documentId);
    /**
     * F020 `AC-D2`／`AC-D7` ①：列內浮水印註記之旗標**由伺服器端產生**（前端不得以 `format`
     * 字串自行重算）。判定式與 `burnIfPdf` **同一個** `supportsWatermark()`——兩處各算一次
     * 就會出現「UI 說會燒、實際沒燒」，而使用者只看得到 UI 那一半。
     * 附加欄為 additive：後台頁面同樣取用本方法但不渲染該註記（`AC-D7` ④）。
     */
    return rows.map((r) => ({ ...r, watermarkSupported: supportsWatermark(r.format) }));
  }

  // ══════════ 下載 ══════════

  /**
   * 後台附錄池個別下載（prototype 24 之下載鈕；功能 read gate → SysAdmin 唯讀亦可下載，
   * 主管/部門窗口/一般使用者=無 → PERMISSION_DENIED）。
   * **管理端存取：不寫稽核、不燒錄浮水印**（比照 F026 OQ-FM-01 之既有裁決）。
   *
   * 🔴 **2026-08-17：由核發 SAS URL 改為代理串流**（F020 `AC-D3a` 之後台側修訂）。
   * 原作法回 `{ url }`，前端 `window.open(sasUrl)` 導覽至 `*.blob.core.windows.net`
   * ⇒ Chrome Safe Browsing 出示「偵測到危險網站」紅底攔截頁。代理後無第三方網域參與。
   * 🔒 RAW 語意逐字未動（`AC-D4`）：**不**呼叫 `burnIfPdf`、**不**寫稽核——只換傳輸方式。
   */
  async downloadFromPool(
    session: (SessionContext & Partial<Omit<WatermarkSession, 'accountId'>>) | undefined,
    appendixId: string,
  ): Promise<AppendixDownloadBytes> {
    this.assertCanRead(session?.roleCode);
    const appendix = await this.requireAppendix(appendixId);
    const raw = await this.blob.getBytes(appendix.blobPath);
    // DB 有參照但 blob 不存在 → 與「附錄不存在」同一對外錯誤碼（區分兩者即洩漏參照存在）。
    if (!raw) throw new NotFoundException('APPENDIX_NOT_FOUND');
    // §10.3：格式以上傳時已驗證之 `format` 欄為權威，不採客戶端宣告之 content-type。
    // AC-N56／AC-N15：策略 A 於後台亦適用——PDF 燒錄、非 PDF 原檔直通。
    // AC-N16／AC-N18：無例外角色，浮水印身分＝執行下載動作之操作者本人。
    const burned = this.burner
      ? await this.burner.burnIfPdf(session as WatermarkSession, raw, appendix.format)
      : { bytes: raw, snapshot: null };
    // AC-N57：一律寫稽核；documentId 為 null（池管理頁脈絡無所屬文件）。
    await this.recordDownload(session, appendixId, null, burned.snapshot);
    return {
      bytes: burned.bytes,
      fileName: appendix.name,
      contentType: contentTypeOf(appendix.format),
    };
  }

  /**
   * 附錄下載稽核之**單一組裝點**（前台 `downloadAppendix` 與後台 `downloadFromPool` 共用）。
   *
   * 🔴 兩條路徑共用同一組裝點，是為了不讓「身分快照欄要不要帶」這件事在兩處各自演化——
   * `AC-N17`／`AC-D5` 對兩條路徑之要求逐字相同，只有 `documentId` 之落值不同（前台＝來源文件、
   * 後台池管理頁＝null）。
   */
  private async recordDownload(
    session: (SessionContext & Partial<Omit<WatermarkSession, 'accountId'>>) | undefined,
    appendixId: string,
    documentId: string | null,
    watermarkSnapshot: string | null,
  ): Promise<void> {
    const identity = await resolveAuditIdentity(this.burner, session as WatermarkSession);
    await this.audit.record({
      targetType: 'APPENDIX',
      actionType: 'DOWNLOAD',
      appendixId,
      documentId,
      accountId: session?.accountId ?? '',
      ...identity,
      watermarkSnapshot,
    });
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
    session: (SessionContext & Partial<Omit<WatermarkSession, 'accountId'>>) | undefined,
    documentId: string,
    appendixId: string,
  ): Promise<AppendixDownloadBytes> {
    if (!session?.accountId) {
      throw new ForbiddenException('FILE_ACCESS_DENIED');
    }
    await this.requireDocument(documentId);
    // F041：業務子分類 viewer 對使用部門不相符之文件 → 404 DOCUMENT_NOT_FOUND，且**先於**
    // 讀取任何位元組、燒錄與寫稽核（拒絕路徑不得留下稽核，亦不得洩漏附錄是否存在）。
    await this.burner?.assertDocumentVisible?.(session as WatermarkSession, documentId);
    const linked = await this.store.listByDocument(documentId);
    const appendix = linked.find((a) => a.id === appendixId);
    if (!appendix) throw new NotFoundException('APPENDIX_NOT_FOUND');

    // 🔴 §10.3：格式判定一律以**上傳時已通過白名單驗證之伺服器端事實**（`APPENDIX_POOL.format`）
    // 為權威，絕不採 client-supplied `content-type`——後者等同讓上傳者宣告「我這份 PDF 不是 PDF」。
    const raw = (await this.blob.getBytes(appendix.blobPath)) ?? Buffer.alloc(0);
    const burned = this.burner
      ? await this.burner.burnIfPdf(session as WatermarkSession, raw, appendix.format)
      : { bytes: raw, snapshot: null };

    await this.recordDownload(session, appendixId, documentId, burned.snapshot);
    return {
      bytes: burned.bytes,
      fileName: appendix.name,
      contentType: contentTypeOf(appendix.format),
    };
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
