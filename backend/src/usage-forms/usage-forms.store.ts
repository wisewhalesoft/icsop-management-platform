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
  /** F018 delta：表單編號（選填、池內唯一、不分大小寫）；未設定一律為 `null`（不得為空字串）。 */
  formNumber: string | null;
}

export interface CreateFormInput {
  name: string;
  blobPath: string;
  format: string;
  size: number;
  uploadedBy: string;
  uploadedAt: Date;
  formNumber: string | null;
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
  /**
   * 🔴 D9 delta（`AC-N47`）：制定部門之 `orgCode` 陣列，依 orgCode 昇冪；0 筆為合法值（空陣列）。
   * additive **選填**（不打爆既有 store 替身與 fixture）；由服務層批次富化，避免 N+1。
   */
  draftingDeptCodes?: string[];
}

/**
 * G-ADM-024 上傳者名冊：accountId(UUID) → 姓名 + orgCode。反循環自建 TypeOrm adapter（讀 ACCOUNT）。
 * uploadedBy 存的是 accountId 而非員編，故需獨立的 by-accountId 解析路徑（非 resolvePersonNames 之員編路徑）。
 */
export const UPLOADER_DIRECTORY = Symbol('UPLOADER_DIRECTORY');
export interface UploaderInfo {
  name: string | null;
  orgCode: string | null;
  /** 🔴 部門名解析需要它：`orgCode` 僅在單一公司內有意義（見 `UploaderOrgResolver`）。 */
  companyCode: string | null;
}
export interface UploaderDirectory {
  resolveUploaders(accountIds: string[]): Promise<Map<string, UploaderInfo>>;
}

/** G-ADM-024 部門名解析（結構相容 NameResolutionService.resolveOrgUnitName）。 */
export const UPLOADER_ORG_RESOLVER = Symbol('UPLOADER_ORG_RESOLVER');
export interface UploaderOrgResolver {
  /**
   * 🔴 B 階段（多公司）：`companyCode` 為**必要**第一參數（`orgCode` 各公司獨立編碼）。
   * 📝 已作廢（⚠ 不得復原）：OLD> `resolveOrgUnitName(orgCode: string)`——本 port 與實作
   * （`NameResolutionService`）長期不同步，而模組之 `useExisting` 綁定不受 TS 型別檢查，
   * 編譯期看不出來、執行期第二參數恆 `undefined`（2026-08-26 前台同型缺陷之姊妹案）。
   */
  resolveOrgUnitName(companyCode: string, orgCode: string): Promise<string | null>;
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
  /**
   * F018 delta「編輯編號」：**只**更新 `formNumber` 之寫入路徑，回傳最終列。
   * 🔴 刻意獨立於 `updateFile()`——AC-D20 之「六欄逐欄未變、Blob 未讀未寫」由**寫入路徑本身**
   * 保證，而非靠實作者記得不要碰其他欄。
   *
   * 選填宣告沿用本 repo「既有 store 介面加方法一律 additive optional」之慣例（不打爆既有測試
   * 替身）；未提供時「編輯編號」拋錯，**不得**降級為 `updateFile()`（那會把 AC-D20 之結構保證
   * 降級為實作紀律）。
   */
  updateFormNumber?(formId: string, formNumber: string | null): Promise<UsageFormRecord>;
  delete(formId: string): Promise<void>;

  // ── 🔴 D9 delta：制定部門（多值，USAGE_FORM_DRAFTING_DEPT，`AC-N45`／`AC-N47`）──
  /**
   * replace-set 語意（delete-then-insert，單一交易）：完全取代該表單之制定部門集合，**非累加**。
   * 傳入空陣列＝清空（0 筆為合法狀態，非錯誤）。比照 F014 多值欄位之既有模式。
   *
   * 選填宣告沿用本 repo「既有 store 介面加方法一律 additive optional」之慣例（不打爆既有替身）；
   * 未提供時「編輯制定部門」拋錯，**不得**靜默忽略——靜默忽略會讓使用者以為存檔成功。
   */
  replaceDraftingDepts?(formId: string, orgCodes: string[]): Promise<void>;
  /** 單一表單之制定部門（依 orgCode 昇冪）。 */
  listDraftingDepts?(formId: string): Promise<string[]>;
  /** 批次版（清單富化用，避免 N+1）：formId → orgCode[]（各自昇冪）。未關聯者不出現於 Map。 */
  listDraftingDeptsByForms?(formIds: string[]): Promise<Map<string, string[]>>;

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
  /** 🔴 D9 delta（`AC-N51`）：後台池管理頁下載無文件脈絡 ⇒ 允許 `null`（其餘路徑仍帶文件 id）。 */
  documentId: string | null;
  accountId: string;
  /**
   * 🔴 §11.6／§11.11 #20（D9 delta，`AC-N17`／`AC-N51`）：操作者身分快照五欄。
   *
   * **既有缺口之修正**：本 seam 過去只攜帶 `accountId`，`AuditWriterRecorder` 轉送時
   * 其餘欄一律留空由 `AuditWriter` 補 `null` ⇒ `AUDIT_LOG` 之 `employeeNo`／`company`／
   * `department`／`section`／`roleCode` 對本路徑之列**恆為 null**，已直接違反既有已核准之
   * `AC-D5`／`AC-D14`（只是當時沒有測試證偽）。
   *
   * additive 選填：既有呼叫端（不帶身分欄者）不需同步改動，型別上仍合法。
   */
  employeeNo?: string | null;
  company?: string | null;
  department?: string | null;
  section?: string | null;
  roleCode?: string | null;

  /** F020 `AC-D5`：前台下載之浮水印快照（PDF 落值、非 PDF 為 `null`）。 */
  watermarkSnapshot?: string | null;
}

export interface AuditRecorder {
  record(event: UsageFormAuditEvent): Promise<void> | void;
}
