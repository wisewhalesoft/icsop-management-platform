/**
 * 附錄資料存取邊界（附錄池 APPENDIX_POOL ＋ 文件關聯 DOC_APPENDIX 多對多，含 sortOrder）。
 *
 * 結構對位 usage-forms/usage-forms.store.ts（architecture-spec §3.6 決策一：獨立複製、
 * 不抽出泛型 pool 抽象），但**多出排序語意**：
 *   - `listByDocument` 回傳依 sortOrder 遞增之列（每列附 sortOrder）；
 *   - `replaceDocumentAppendices` 為排序權威寫入（整組覆寫、依陣列索引重寫 sortOrder，決策二）；
 *   - `appendDocumentAppendices` 接續現有最大 sortOrder 之後（API 完整性，UI 不呼叫）；
 *   - `unlinkDocumentAppendix` 解除單一關聯後，剩餘依原相對順序重新編號為連續 1..N。
 */
export const APPENDIX_POOL_STORE = Symbol('APPENDIX_POOL_STORE');

export interface AppendixRecord {
  id: string;
  name: string;
  blobPath: string;
  format: string; // xlsx / xls / pdf
  size: number;
  uploadedBy: string;
  uploadedAt: Date;
}

export interface CreateAppendixInput {
  name: string;
  blobPath: string;
  format: string;
  size: number;
  uploadedBy: string;
  uploadedAt: Date;
}

/** 覆蓋上傳之檔案參照更新（**不含 name**——覆蓋不改附錄名稱，AC-13）。 */
export interface UpdateAppendixFileInput {
  blobPath: string;
  format: string;
  size: number;
  uploadedBy: string;
  uploadedAt: Date;
}

/** 附錄所關聯之文件精簡參照（供附錄池頁展開檢視「使用此附錄的文件」，AC-17）。 */
export interface AppendixDocumentRef {
  id: string;
  documentNumber: string;
  documentName: string;
}

/**
 * 附錄池總覽項（後台管理頁 prototype 24 所需）：附錄記錄 ＋ 關聯文件數 ＋ 關聯文件精簡清單。
 * `docCount` 驅動覆蓋（≥2）／移除（≥1）門檻之顯示；`documents` 供展開列與跳轉。
 */
export interface AppendixPoolItem extends AppendixRecord {
  docCount: number;
  documents: AppendixDocumentRef[];
  /** 上傳者姓名（uploadedBy=accountId → ACCOUNT.name）；未解析→null。 */
  uploadedByName?: string | null;
  /** 上傳者部門名（accountId → orgCode → ORG_UNIT.name）；未解析→null。 */
  uploadedByDept?: string | null;
}

/** 某文件之關聯附錄列（附該文件內之顯示順序）。 */
export interface DocumentAppendixRecord extends AppendixRecord {
  sortOrder: number;
}

/**
 * 上傳者名冊：accountId(UUID) → 姓名 + orgCode。反循環自建 TypeOrm adapter（讀 ACCOUNT）。
 * 比照 F018 之 UploaderDirectory（架構決策一：建議複製而非跨模組匯入 usage-forms 內部檔案）。
 */
export const UPLOADER_DIRECTORY = Symbol('APPENDIX_UPLOADER_DIRECTORY');
export interface UploaderInfo {
  name: string | null;
  orgCode: string | null;
}
export interface UploaderDirectory {
  resolveUploaders(accountIds: string[]): Promise<Map<string, UploaderInfo>>;
}

/** 部門名解析（結構相容 NameResolutionService.resolveOrgUnitName）。 */
export const UPLOADER_ORG_RESOLVER = Symbol('APPENDIX_UPLOADER_ORG_RESOLVER');
export interface UploaderOrgResolver {
  resolveOrgUnitName(orgCode: string): Promise<string | null>;
}

/**
 * documentId 存在性檢查（唯讀 join DocumentModule 擁有之 ICSOP_DOCUMENT）。
 *
 * ⚠ architecture-spec §3.6 決策二之「⚠ 發現」：F039 明列 `DOCUMENT_NOT_FOUND` 錯誤場景，
 * 而既有 usage-forms.service 之 linkForms()／unlinkForm() **不**驗證 documentId 存在性。
 * 附錄之關聯／解除／詳情端點**必須**主動驗證，不可沿用 F018 之「信任外鍵」模式。
 */
export const DOCUMENT_EXISTENCE_CHECKER = Symbol('APPENDIX_DOCUMENT_EXISTENCE_CHECKER');
export interface DocumentExistenceChecker {
  exists(documentId: string): Promise<boolean>;
}

/**
 * 調閱稽核收集器（前台下載附錄 → AUDIT_LOG）。
 * ⚠ AC-27：事件**同時**攜帶 appendixId 與 documentId（不同於 F018 之單一 formId 模式）。
 */
export const AUDIT_RECORDER = Symbol('APPENDIX_AUDIT_RECORDER');

export interface AppendixAuditEvent {
  targetType: 'APPENDIX';
  actionType: 'DOWNLOAD';
  appendixId: string;
  documentId: string;
  accountId: string;
}

export interface AuditRecorder {
  record(event: AppendixAuditEvent): Promise<void> | void;
}

export interface AppendixPoolStore {
  create(input: CreateAppendixInput): Promise<AppendixRecord>;
  findById(appendixId: string): Promise<AppendixRecord | null>;
  list(): Promise<AppendixRecord[]>;
  /** 附錄池總覽（每筆附關聯文件數 + 關聯文件精簡清單）。單次載入組裝，避免逐筆 N+1。 */
  listPoolOverview(): Promise<AppendixPoolItem[]>;
  /** 覆蓋上傳：更新檔案參照（保留 id/name），回傳最終列。 */
  updateFile(
    appendixId: string,
    patch: UpdateAppendixFileInput,
  ): Promise<AppendixRecord>;
  delete(appendixId: string): Promise<void>;

  // ── 多對多關聯（documentId ↔ appendixId，含 sortOrder）──
  /** 某附錄目前被幾份文件引用（覆蓋 ≥2／移除 ≥1 門檻判定）。 */
  countLinks(appendixId: string): Promise<number>;
  /** 某文件之關聯附錄清單，**依 sortOrder 遞增**（詳情頁；前後台共用）。 */
  listByDocument(documentId: string): Promise<DocumentAppendixRecord[]>;
  /** 排序權威寫入：整組覆寫，sortOrder 依陣列索引重寫為 1..N（單一交易 delete-then-insert）。 */
  replaceDocumentAppendices(
    documentId: string,
    orderedAppendixIds: string[],
  ): Promise<void>;
  /** 附加關聯：依陣列順序接續現有最大 sortOrder 之後；已存在者忽略且其 sortOrder 不變。 */
  appendDocumentAppendices(documentId: string, appendixIds: string[]): Promise<void>;
  /** 解除單一關聯；剩餘依原相對順序重新編號為連續 1..N（無缺口）。 */
  unlinkDocumentAppendix(documentId: string, appendixId: string): Promise<void>;
  /** 解除某附錄之全部關聯（自池移除時一併清理）。 */
  unlinkAllForAppendix(appendixId: string): Promise<void>;
}
