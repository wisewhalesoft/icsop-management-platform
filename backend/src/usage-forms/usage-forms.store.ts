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

export interface FormPoolStore {
  create(input: CreateFormInput): Promise<UsageFormRecord>;
  findById(formId: string): Promise<UsageFormRecord | null>;
  list(): Promise<UsageFormRecord[]>;
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
