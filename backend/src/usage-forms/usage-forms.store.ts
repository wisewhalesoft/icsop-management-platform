/**
 * 使用表單資料存取邊界（表單池 USAGE_FORM_POOL + 文件關聯 DOC_USAGE_FORM 多對多）。
 * ⚠ data-model 僅將 USAGE_FORM 併入 DOCUMENT_ATTACHMENT，未明列表單池 + 關聯附屬表
 * （OQ-F018-07）；本 worktree 依「表單池多對多（OQ-E05-04 定案）」採獨立表，已於 summary flag。
 */
export const FORM_POOL_STORE = Symbol('FORM_POOL_STORE');

export interface UsageFormRecord {
  id: string;
  name: string;
  blobPath: string;
  format: string; // xlsx / xls / pdf
  size: number;
  uploadedBy: string;
  uploadedAt: Date;
}

export interface CreateFormInput {
  name: string;
  blobPath: string;
  format: string;
  size: number;
  uploadedBy: string;
  uploadedAt: Date;
}

export interface UpdateFormFileInput {
  blobPath: string;
  format: string;
  size: number;
  uploadedBy: string;
  uploadedAt: Date;
}

/** 表單所關聯之文件精簡參照（供表單池頁展開檢視「使用此表單的文件」）。 */
export interface UsageFormDocumentRef {
  id: string;
  documentNumber: string;
  documentName: string;
}

/**
 * 表單池總覽項（後台管理頁 prototype 19 所需）：表單記錄 + 關聯文件數 + 關聯文件精簡清單。
 * `docCount` 驅動覆蓋（≥2）／移除（≥1）門檻之顯示；`documents` 供展開列與跳轉。
 * uploadedByName/Dept（G-ADM-024）：由服務層以 uploadedBy(accountId) 解析（選填；缺→null，前端 fallback）。
 */
export interface UsageFormPoolItem extends UsageFormRecord {
  docCount: number;
  documents: UsageFormDocumentRef[];
  /** G-ADM-024 上傳者姓名（uploadedBy=accountId → ACCOUNT.name）；未解析→null。 */
  uploadedByName?: string | null;
  /** G-ADM-024 上傳者部門名（accountId → orgCode → ORG_UNIT.name）；未解析→null。 */
  uploadedByDept?: string | null;
}

/**
 * G-ADM-024 上傳者名冊：accountId(UUID) → 姓名 + orgCode。反循環自建 TypeOrm adapter（讀 ACCOUNT）。
 * uploadedBy 存的是 accountId 而非員編，故需獨立的 by-accountId 解析路徑（非 resolvePersonNames 之員編路徑）。
 */
export const UPLOADER_DIRECTORY = Symbol('UPLOADER_DIRECTORY');
export interface UploaderInfo {
  name: string | null;
  orgCode: string | null;
}
export interface UploaderDirectory {
  resolveUploaders(accountIds: string[]): Promise<Map<string, UploaderInfo>>;
}

/** G-ADM-024 部門名解析（結構相容 NameResolutionService.resolveOrgUnitName）。 */
export const UPLOADER_ORG_RESOLVER = Symbol('UPLOADER_ORG_RESOLVER');
export interface UploaderOrgResolver {
  resolveOrgUnitName(orgCode: string): Promise<string | null>;
}

export interface FormPoolStore {
  create(input: CreateFormInput): Promise<UsageFormRecord>;
  findById(formId: string): Promise<UsageFormRecord | null>;
  list(): Promise<UsageFormRecord[]>;
  /** 表單池總覽（每筆附關聯文件數 + 關聯文件精簡清單）。單次載入組裝，避免逐筆 N+1。 */
  listPoolOverview(): Promise<UsageFormPoolItem[]>;
  /** 覆蓋上傳：更新檔案參照（保留 id/name），回傳最終列。 */
  updateFile(
    formId: string,
    patch: UpdateFormFileInput,
  ): Promise<UsageFormRecord>;
  delete(formId: string): Promise<void>;

  // 多對多關聯（documentId ↔ formId）
  /** 某表單目前被幾份文件引用（覆蓋/刪除門檻判定）。 */
  countLinks(formId: string): Promise<number>;
  /** 某文件之關聯表單清單（詳情頁）。 */
  listByDocument(documentId: string): Promise<UsageFormRecord[]>;
  link(documentId: string, formId: string): Promise<void>;
  unlink(documentId: string, formId: string): Promise<void>;
  /** 解除某表單之全部關聯（刪除表單時一併清理）。 */
  unlinkAll(formId: string): Promise<void>;
}

/**
 * 調閱稽核收集器（前台下載表單 → AUDIT_LOG）。AUDIT_LOG 實體/持久化屬 F023（未建），
 * 本 worktree 上限＝驗證「以正確參數呼叫收集器」（FakeAuditRecorder），不驗證落地。
 */
export const AUDIT_RECORDER = Symbol('AUDIT_RECORDER');

export interface UsageFormAuditEvent {
  targetType: 'USAGE_FORM';
  actionType: 'DOWNLOAD';
  formId: string;
  documentId: string;
  accountId: string;
}

export interface AuditRecorder {
  record(event: UsageFormAuditEvent): Promise<void> | void;
}
