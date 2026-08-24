/**
 * 後端 API 傳輸型別（over-the-wire）。
 * 權威來源：backend/src/auth/session-token.service.ts（SessionUser）、
 * backend/src/org-sync/org-sync.types.ts（SyncRunSummary / SyncResult / SyncStats）。
 * ⚠ JSON 序列化後 Date → ISO 字串，故時間欄位型別為 string。
 */

/**
 * GET /auth/me 回傳。orgCode/name/employeeNo 由 SessionGuard 每請求以 DB 現行值填入
 * （PII 不進 JWT），供前台置頂（依部門）與浮水印身分快照；未經 guard 時可能缺，故選填。
 */
export interface SessionUser {
  loginId: string;
  email: string;
  companyCode: string;
  roleCode?: string;
  orgCode?: string | null;
  name?: string | null;
  employeeNo?: string | null;
  /** F041 一般使用者子分類（'business' / 'other'）；僅 roleCode='User' 時具效力（INV-2）。 */
  userSubtype?: string | null;
}

/** 帳號管理檢視（GET/POST/PATCH /admin/accounts；鏡射後端 accounts.store AccountView / AccountListItem）。 */
export interface AccountView {
  id: string;
  loginId: string;
  employeeNo: string | null;
  name: string | null;
  email: string | null;
  orgCode: string | null;
  roleCode: string;
  status: string;
  source: string;
  disableReason: string | null;
  /** 最後登入時間戳（ISO；每次成功登入寫入一次）。清單「最後登入」欄。查無→null。 */
  lastLoginAt?: string | null;
  /** 公司全稱（GET /admin/accounts 清單富化；resolveCompanyName）。單筆建立/編輯回傳不含 → undefined。 */
  company?: string | null;
  /** 部門名（GET /admin/accounts 清單富化；orgCode→ORG_UNIT 名）。 */
  department?: string | null;
  /**
   * 職位名（清單富化；jobTitleCode→JOB_TITLE 名，見後端 job-title-directory 之兩段式解析）。
   * 單筆建立/編輯回傳不含 → undefined；查無對照 → null（皆顯示「—」）。
   */
  title?: string | null;
  /**
   * F041 一般使用者子分類（'business' / 'other'）。供角色指派 modal 預選現值；
   * 非 User 角色亦可能保有此值（AC-36 休眠但保留），呈現與否由 isSubtypeApplicable 決定。
   */
  userSubtype?: string | null;
  /**
   * F003 delta AC-P19：該帳號自身之公司代碼（**非**操作者之公司）。編輯 modal 之公司欄以此預填，
   * 部門／職位之候選與解析亦以此為 (companyCode, code) 複合鍵之前半（AC-P23d／AC-P23e）。
   */
  companyCode?: string;
  /** F003 delta AC-P19：職位代碼（JOB_TITLE.code）。編輯 modal 之職位欄以此預填；null＝未設定。 */
  jobTitleCode?: string | null;
}

export interface AccountFilters {
  source?: string;
  roleCode?: string;
  status?: string;
  keyword?: string;
  /** F003 delta AC-P23b：選填公司篩選（未帶＝全部公司）。 */
  companyCode?: string;
}

/** 循環（F007）。updatedAt 為 ISO 字串。 */
export interface LifecycleView {
  id: string;
  name: string;
  /**
   * F040 子分類（非必填）。無值恆為 `null`（不得為空字串）。顯示一律經 `lifecycleDisplayName`。
   * 選填宣告以免既有 fixture／呼叫端需大改（缺鍵＝無子分類）。
   */
  subcategory?: string | null;
  description: string | null;
  status: 'active' | 'inactive';
  nodeCount: number;
  updatedAt: string;
  /** G-LC-002 掛載文件數（清單「掛載文件」欄；後端富化，缺→前端顯示 0）。 */
  mountedDocCount?: number;
}

/** DAG 圖（F008）。 */
export interface DagNode {
  id: string;
  lifecycleId: string;
  name: string | null;
  positionX: number;
  positionY: number;
  docCount?: number;
}
export interface DagEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
}
export interface DagGraph {
  nodes: DagNode[];
  edges: DagEdge[];
}

/** F036 循環樹狀圖預覽（GET /admin/lifecycles/:id/tree-preview）。 */
export interface LifecycleTreePreview {
  lifecycle: { id: string; name: string };
  graph: DagGraph;
  /** 伺服器端組裝之浮水印快照（與稽核、下載/列印燒錄一致；前端不可自組）。 */
  watermark: string;
}

/**
 * F036 節點雙擊之唯讀文件清單列
 * （GET /admin/lifecycles/:lifecycleId/nodes/:nodeId/documents）。
 * 後端回原始 `status`＋`announcedDate`，徽章由前端以 `deriveDisplayStatus` 衍生
 * ⇒ 與後台清單同一份規則，不可能分歧。
 */
export interface NodeMountedDocument {
  id: string;
  documentNumber: string;
  documentName: string;
  edition: string | null;
  status: DocumentStatus;
  announcedDate: string | null;
}

/**
 * F036 `AC-T25` ④（2026-08-21 delta）：子樹文件清單端點之回應。
 * 🔴 分組順序、組內排序與去重**皆已由後端完成**——前端不得再排一次、也不得再去重一次
 * （`AC-T11` ④／`AC-T13` ④）。`isSelf`／`count` 刻意不在 wire 上，由前端以
 * `group.nodeId === 請求之 nodeId` 與 `documents.length` 推導。
 */
export interface SubtreeDocumentGroup {
  nodeId: string;
  nodeName: string | null;
  documents: NodeMountedDocument[];
}

export interface SubtreeDocumentsResponse {
  /** 回顯請求之根節點 id。 */
  nodeId: string;
  /** 去重後之子樹文件總數（＝Σ 各組 `documents.length`）。 */
  totalCount: number;
  groups: SubtreeDocumentGroup[];
}

/** F038 新舊快照 diff（後-前＝新增；前-後＝刪除；改名/掛載變更＝amber）。 */
export interface LifecycleDiff {
  addNodes: string[];
  rmNodes: string[];
  amberNodes: string[];
  addEdges: Array<[string, string]>;
  rmEdges: Array<[string, string]>;
}

/**
 * F038 循環樹狀圖變更歷程 · 單筆事件之新舊對照
 * （GET /admin/change-history/lifecycles/:lifecycleId/changes/:changeLogId/tree-diff）。
 * before＝前一筆事件之完整快照（或空 DAG）；after＝本筆事件自身快照。
 */
export interface LifecycleTreeDiff {
  lifecycle: { id: string; name: string };
  before: DagGraph;
  after: DagGraph;
  diff: LifecycleDiff;
  /** 伺服器端組裝之浮水印快照（前端不可自組）。 */
  watermark: string;
}

/** F009 節點抽屜資料。 */
export interface DrawerDoc {
  id: string;
  documentNumber: string;
  documentName: string;
}
export interface DrawerCandidate extends DrawerDoc {
  assignedNode: { id: string; name: string | null } | null;
}
export interface NodeDrawerData {
  node: { id: string; name: string | null };
  mounted: DrawerDoc[];
  candidates: DrawerCandidate[];
  /** G-LC-015 掛載於其他循環而排除於候選之文件數（候選過濾註記）。缺→前端顯示 0。 */
  excludedCount?: number;
}

/** ICSOP 文件（E04）。狀態為儲存值（active/inactive/void）；衍生已公告/進度中由前端計算。 */
export type DocumentStatus = 'active' | 'inactive' | 'void';

export interface DocumentListItem {
  id: string;
  status: DocumentStatus;
  documentNumber: string;
  documentName: string;
  lifecycleId: string;
  lifecycleName: string | null;
  nodeId: string | null;
  draftingCompanyId: string | null;
  draftingDeptId: string | null;
  draftingSectionId: string | null;
  /** F017 名稱解析（org-foundation NameResolutionService；查無→null，前端顯示「—」）。 */
  draftingCompanyName: string | null;
  draftingDeptName: string | null;
  draftingSectionName: string | null;
  primaryChiefId: string | null;
  /** F017 當責室長姓名（查無→null，前端 fallback 顯示員編）。 */
  primaryChiefName: string | null;
  /** G-DOC-001 當責室長「+N」次要室長數（0＝無）。 */
  secondaryChiefCount?: number;
  /** G-DOC-001「+N」badge tooltip：次要室長姓名（查無→員編），與 count 同序。 */
  secondaryChiefNames?: string[];
  /** F017 `AC-D7`（2026-08-16 delta）：次要當責室長之**員編**（篩選比對鍵；顯示用的是 Names）。 */
  secondaryChiefIds?: string[];
  /** F017 `AC-D5`（2026-08-16 delta）：是否有 OJT 簽到表（後端列富化）。缺鍵＝無。 */
  hasOjt?: boolean;
  edition: string | null;
  announcedDate: string | null;
  contentSummary: string | null;
  /** F017「檔案」欄：該文件自身之 ICSOP PDF blobPath（供受控下載端點）；無附件→null。 */
  icsopPdfBlobPath: string | null;
  /** F017「檔案」欄：下載鈕 title「下載 {檔名}」之來源；無附件→null。 */
  icsopPdfFileName: string | null;
  /** F017「連結點程序書」欄：連結點摘要（0..*；空陣列→顯示「—」）。 */
  links: DocumentLinkView[];
}

/** F017 後端分頁結果（GET /admin/documents 回傳）。 */
/**
 * F017 `AC-T45`（2026-08-21 delta）：後端解析出之子樹篩選描述子。
 * 🔴 chip 之顯示與其文案完全以本描述子為準——前端**不得**自行組字或另行查名（`AC-T43`）。
 */
export interface SubtreeFilterDescriptor {
  lifecycleId: string;
  /** 循環顯示名稱（後端 `lifecycleDisplayName()` 之輸出，含子分類時為 `名稱（子分類）`）。 */
  lifecycleName: string;
  nodeId: string;
  nodeName: string | null;
}

export interface DocumentListPage {
  items: DocumentListItem[];
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
  /**
   * F017 `AC-T45`／`AC-T48` ⑥：**additive 第 6 個頂層欄位**。後端回應恆為顯式 key（不適用時 `null`）；
   * 此處宣告為選填係沿用本 repo「既有共享型別加欄一律 additive optional」之慣例——前端仍須對
   * 「`null`」與「缺席」**兩種情形一視同仁**防禦性判斷（`AC-T41` 之 no-op 於畫面上即「chip 不渲染」）。
   */
  subtreeFilter?: SubtreeFilterDescriptor | null;
}

/** F017 清單排序鍵（後端支援 documentNumber/announcedDate）。 */
export type DocumentSortBy = 'documentNumber' | 'announcedDate';
export type SortDir = 'asc' | 'desc';

export interface DocumentFilters {
  lifecycleId?: string;
  /** 狀態：接受原始儲存值（active/inactive/void）或衍生顯示值（已公告/進度中/失效/作廢）。 */
  status?: string;
  keyword?: string;
  documentNumber?: string;
  documentName?: string;
  draftingCompanyId?: string;
  draftingDeptId?: string;
  draftingSectionId?: string;
  primaryChiefId?: string;
  /** 連結點程序書篩選（擁有指向此目標之連結者）。 */
  linkTargetId?: string;
  /** F017 `AC-D6`（2026-08-16 delta）：附錄／使用表單篩選（比照 linkTargetId 之後端交集樣板）。 */
  appendixId?: string;
  formId?: string;
  /**
   * F017 `AC-T40`／`AC-T43`（2026-08-21 delta）：節點子樹 deep link 之根節點 id。
   * 🔴 **恆與 `lifecycleId` 成對**且由前端**原樣**帶上——子樹展開是後端職責，前端不得自行走訪
   * （否則會出現「樹狀圖說 7 個節點、清單按 6 個節點篩」的分家）。
   */
  nodeSubtreeId?: string;
  sortBy?: DocumentSortBy;
  sortDir?: SortDir;
  /** 1-based 頁碼（預設 1）。 */
  page?: number;
  /** 每頁筆數（預設 50）。 */
  pageSize?: number;
}

/**
 * 單筆文件檢視（GET /admin/documents/:id；鏡射後端 DocumentView）。
 * ⚠ announcedDate 經 JSON 序列化為 ISO 字串（或 null）。制定組織欄為 ORG_UNIT.orgCode；
 * 當責室長欄為 employeeNo；名稱解析由前端另以 /org-units、/persons 補齊（單筆讀取不附名稱）。
 */
export interface DocumentView {
  id: string;
  status: DocumentStatus;
  documentNumber: string;
  documentName: string;
  lifecycleId: string;
  nodeId: string | null;
  /** G-DOC-205/301 所屬節點名（GET /admin/documents/:id 回；nodeId→LIFECYCLE_NODE.name；無→null）。 */
  nodeName?: string | null;
  draftingCompanyId: string | null;
  draftingDeptId: string | null;
  draftingSectionId: string | null;
  primaryChiefId: string | null;
  /** F014 多值：一律回明確集合（可為空陣列）。 */
  secondaryChiefIds: string[];
  usingDeptIds: string[];
  edition: string | null;
  announcedDate: string | null;
  contentSummary: string | null;
}

/** F011 版本對照：單一欄位之新舊值快照。 */
export interface DocumentFieldChange {
  field: string;
  before: unknown;
  after: unknown;
}

/** F011 PATCH /admin/documents/:id 回傳：覆寫後之文件 + 本次異動之新舊值對照。 */
export interface DocumentUpdateResult {
  document: DocumentView;
  changes: DocumentFieldChange[];
}

/** F015 連結點列（GET /admin/documents/:id/links；附目標編號/書名/目前狀態）。 */
export interface DocumentLinkView {
  linkId: string;
  targetDocumentId: string;
  targetNumber: string | null;
  targetName: string | null;
  targetStatus: DocumentStatus | null;
}

/** F016 單份附件類型（覆蓋式，各文件各 1 份）。 */
export type SingleAttachmentType = 'ICSOP_PDF' | 'OJT_SIGNIN';

/** F016 附件記錄（上傳端點回傳；鏡射後端 DocumentAttachmentRecord）。 */
export interface DocumentAttachmentRecord {
  id: string;
  documentId: string;
  type: SingleAttachmentType;
  fileName: string;
  blobPath: string;
  contentType: string;
  size: number;
  uploadedBy: string;
  uploadedAt: string;
}

/** F018 使用表單記錄（表單池 / 文件關聯；鏡射後端 UsageFormRecord）。 */
export interface UsageFormRecord {
  id: string;
  name: string;
  /** F018 delta：表單編號（選填、池內唯一）；下拉 label 組法見 `domain/usage-form-label.ts`。 */
  formNumber?: string | null;
  blobPath: string;
  format: string;
  size: number;
  uploadedBy: string;
  uploadedAt: string;
}

// ===== E07 文件調閱歷程（F024） =====

/**
 * 類型篩選前端顯示值（↔ 後端 targetType 集合）。
 * 🔴 2026-08-20 D9 delta（F024 `AC-N69`／`OQ-D9-29`）新增第四種類型值 `上傳`
 * （↔ `targetType='DOCUMENT_ATTACHMENT'`）——使 OJT 上傳事件既可**自「文件」類排除**、
 * 亦可**單獨篩出**。既有三者之字面與相對順序逐字不變。
 */
export type AuditKind = '文件' | '循環' | '變更' | '上傳';

/**
 * 稽核調閱列（GET /admin/access-history）。鏡射後端 audit.types AuditRow；
 * ⚠ occurredAt 經 JSON 序列化為 ISO 字串。
 */
export interface AccessHistoryRow {
  id: string;
  accountId: string;
  employeeNo: string | null;
  name: string | null;
  company: string | null;
  department: string | null;
  section: string | null;
  roleCode: string | null;
  targetType: string;
  actionType: string;
  documentId: string | null;
  documentNumber: string | null;
  lifecycleId: string | null;
  lifecycleName: string | null;
  formId: string | null;
  targetName: string | null;
  watermarkSnapshot: string | null;
  occurredAt: string;
  source: string;
}

/** 查詢分頁結果。appliedDefaultRange＝伺服器因空條件套用近 30 天預設。 */
export interface AccessHistoryPage {
  items: AccessHistoryRow[];
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
  appliedDefaultRange: boolean;
}

/** 查詢篩選（任意組合；空條件套用近 30 天預設，非阻斷）。 */
export interface AccessHistoryFilters {
  kind?: AuditKind | '';
  person?: string;
  target?: string;
  from?: string;
  to?: string;
  page?: number;
}

// ===== E07 文件變更歷程（F037 程序書 / F038 循環樹狀圖） =====

/** F037 程序書欄位層變更列（GET /admin/change-history/documents[/:id]）。occurredAt 為 ISO 字串。 */
export interface DocumentChangeView {
  id: string;
  documentId: string;
  documentNumber: string | null;
  /** G-LC-023 現行書名（自 ICSOP_DOCUMENT 併入；程序書 cell「書名」行）。查無→null。 */
  documentName?: string | null;
  changeType: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  actorId: string | null;
  actorName: string | null;
  actorEmployeeNo: string | null;
  /** F012 切換原因（僅 STATUS 事件承載；其餘 changeType 為 null；供變更歷程檢視，F012 AC36）。 */
  reason?: string | null;
  occurredAt: string;
}
export interface DocumentChangeFilters {
  doc?: string;
  field?: string;
  person?: string;
  from?: string;
  to?: string;
}

/** F038 循環結構變更列（GET /admin/change-history/lifecycles[/:id]）。 */
export interface LifecycleChangeView {
  id: string;
  lifecycleId: string;
  changeType: string;
  summary: string;
  oldValue: string | null;
  newValue: string | null;
  nodeId: string | null;
  actorId: string | null;
  actorName: string | null;
  actorEmployeeNo: string | null;
  occurredAt: string;
}
export interface LifecycleChangeFilters {
  lifecycleId?: string;
  changeType?: string;
  person?: string;
  from?: string;
}

// ===== E06 前台瀏覽（F019/F020/F021） =====

/** 前台清單顯示狀態（前台恆為 announced）。 */
export type PublicDisplayStatus = 'announced' | 'in_progress' | 'inactive' | 'void';

/** 前台清單項（GET /public/documents；鏡射後端 PublicListItemDto）。 */
export interface PublicListItem {
  id: string;
  documentNumber: string;
  documentName: string;
  lifecycleId: string;
  lifecycleName: string | null;
  /**
   * 🔴 2026-08-16 delta（F019 `AC-D12`）：**移除** `usingDeptIds`／`usingDeptNames`，
   * **新增** `draftingCompanyName`／`draftingSectionName`／`edition`。
   * 未解析之名稱一律為 `null`（前端渲染為「—」），不 fallback 為 code。
   */
  draftingCompanyName: string | null;
  draftingDeptId: string | null;
  draftingDeptName: string | null;
  draftingSectionName: string | null;
  edition: string | null;
  status: DocumentStatus;
  displayStatus: PublicDisplayStatus;
  announcedDate: string | null;
  contentSummary: string | null;
  /** 是否屬使用者部門相關（置頂區）。 */
  pinned: boolean;
}

/** 前台清單分頁結果。 */
export interface PublicListPage {
  items: PublicListItem[];
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
  /** G-PUB-012：被基底條件隱藏之候選數（進度中/失效/作廢）。供「另有 N 筆…已由後端隱藏」。 */
  hiddenCount?: number;
}

// ===== E06 F019 前台文件詳情（G-PUB-020） =====

/** 前台詳情之附件（唯讀；下載走既有受控端點 downloadAttachment(blobPath)）。 */
export interface PublicDetailAttachment {
  type: string;
  fileName: string;
  blobPath: string;
  /**
   * 🔴 F020 `AC-D2`／architecture-spec §10.3：**伺服器端**之浮水印支援旗標
   * （＝後端「要不要呼叫 `burnPdf`」之同一個判定結果）。
   * 前端**不得**自行以 `format` 字串重算——判定式只能有一份，重算一份在日後白名單擴充時必然
   * 漂移，且漂移的表現是「UI 說支援、實際沒燒」這種沒有任何測試會抓到的靜默錯誤。
   * additive 選填以免打爆既有 fixture（缺鍵＝不支援）。
   */
  watermarkSupported?: boolean;
}

/** 前台詳情之使用表單（精簡）。 */
export interface PublicDetailUsageForm {
  id: string;
  name: string;
  format: string;
  /**
   * 🔴 F020 `AC-D2`／architecture-spec §10.3：**伺服器端**之浮水印支援旗標
   * （＝後端「要不要呼叫 `burnPdf`」之同一個判定結果）。
   * 前端**不得**自行以 `format` 字串重算——判定式只能有一份，重算一份在日後白名單擴充時必然
   * 漂移，且漂移的表現是「UI 說支援、實際沒燒」這種沒有任何測試會抓到的靜默錯誤。
   * additive 選填以免打爆既有 fixture（缺鍵＝不支援）。
   */
  watermarkSupported?: boolean;
}

/** 前台詳情之連結點（單向 source→target）。 */
export interface PublicDetailLink {
  targetDocumentId: string;
  targetNumber: string | null;
  targetName: string | null;
  targetStatus: DocumentStatus | null;
}

/**
 * 前台文件詳情（GET /public/documents/:id；鏡射後端 PublicDocumentDetailDto）。
 * 登入員工可讀；非「已公告」文件 → 404（視同不存在）。
 */
export interface PublicDocumentDetail {
  id: string;
  status: DocumentStatus;
  displayStatus: PublicDisplayStatus;
  documentNumber: string;
  documentName: string;
  lifecycleId: string;
  lifecycleName: string | null;
  nodeId: string | null;
  nodeName: string | null;
  draftingCompanyId: string | null;
  draftingCompanyName: string | null;
  draftingDeptId: string | null;
  draftingDeptName: string | null;
  draftingSectionId: string | null;
  draftingSectionName: string | null;
  primaryChiefId: string | null;
  primaryChiefName: string | null;
  /**
   * 🔴 2026-08-16 delta（F019 `AC-D9`／`AC-D12`）：`usingDeptIds`／`usingDeptNames` 已自
   * 前台詳情之對外回應移除。可見性與置頂判定仍在後端以使用部門進行——「不顯示 ≠ 不判定」。
   *
   * 🔴 2026-08-17 delta（F019 `AC-D15`）：`secondaryChiefIds`／`secondaryChiefNames` 同此處置
   * （前台詳情已無「當責室長-次要」欄）。後台清單之同名欄位（`DocumentListItem`）不受影響。
   */
  edition: string | null;
  announcedDate: string | null;
  contentSummary: string | null;
  attachments: PublicDetailAttachment[];
  usageForms: PublicDetailUsageForm[];
  links: PublicDetailLink[];
}

/** 前台清單篩選（皆選填）。 */
export interface PublicListFilters {
  keyword?: string;
  /**
   * 🔴 2026-08-16 delta（F019 `AC-D1`）：`deptCode`（使用部門篩選）**已移除**；
   * 改為制定三級＋當責室長之 id 等值比對。
   */
  draftingCompanyId?: string;
  draftingDeptId?: string;
  draftingSectionId?: string;
  /** 當責室長員編（後端比對主要 ∪ 次要）。 */
  chiefId?: string;
  lifecycleId?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

/** 可搜尋下拉之單一選項（`value` 恆為 id／code）。 */
export interface PublicFilterOption {
  value: string;
  label: string;
}

/** F019 `AC-D5`：五組前台篩選選項（GET /public/documents/filter-options，單一端點）。 */
export interface PublicFilterOptions {
  draftingCompanies: PublicFilterOption[];
  draftingDepts: PublicFilterOption[];
  draftingSections: PublicFilterOption[];
  chiefs: PublicFilterOption[];
  lifecycles: PublicFilterOption[];
}

/** 組織單位（GET /org-units；鏡射後端 OrgUnitRecord，供前台部門篩選下拉）。 */
export interface OrgUnitRecord {
  companyCode: string;
  orgCode: string;
  codePrefix: string;
  parentCode: string | null;
  tier: string;
  name: string;
  descFull: string | null;
  managerEmpNo: string | null;
  isActive: boolean;
}

/** 組織層級碼（ORG_UNIT.tier）。 */
export type OrgTier = 'ROOT' | 'DIVISION' | 'DEPARTMENT' | 'SECTION' | 'SUBSECTION';

/**
 * 公司（GET /companies；F003 delta AC-P15）。候選＝全部有效公司（SELECTABLE_COMPANIES），
 * **不限操作者所屬公司**——建立/編輯帳號之公司欄與清單公司篩選器共用同一來源。
 */
export interface CompanyRecord {
  companyCode: string;
  companyName: string;
}

/**
 * 職稱（GET /job-titles；F003 delta AC-P14）。唯一鍵為 (companyCode, code) 複合鍵——
 * 跨公司可有相同 code 但不同 name（如 AE 之 C01＝高級協理 vs AS 之 C01＝協理），
 * 故候選與解析一律以複合鍵比對，不得僅以 code 比對（AC-P23e）。
 */
export interface JobTitleRecord {
  companyCode: string;
  code: string;
  name: string;
}

/** 人員（GET /persons/search；鏡射後端 PersonRecord，供 F014 當責室長候選；搜尋僅回在職）。 */
export interface PersonRecord {
  employeeNo: string;
  name: string | null;
  orgCode: string | null;
  employmentStatus: 'active' | 'departed';
}

// ===== E05 F018 使用表單管理（表單池） =====

/** 表單所關聯之文件精簡參照（表單池頁展開檢視「使用此表單的文件」）。 */
export interface UsageFormDocumentRef {
  id: string;
  documentNumber: string;
  documentName: string;
}

/**
 * 表單池總覽項（GET /admin/usage-forms/overview）。
 * ⚠ uploadedAt 經 JSON 序列化為 ISO 字串。format＝xlsx/xls/pdf（前端歸類 excel/pdf 兩顯示類）。
 */
export interface UsageFormPoolItem {
  id: string;
  name: string;
  /** F018 delta：表單編號（選填、池內唯一、不分大小寫）；未設定為 `null`。 */
  formNumber: string | null;
  format: string;
  size: number;
  uploadedBy: string;
  uploadedAt: string;
  docCount: number;
  documents: UsageFormDocumentRef[];
  /** G-ADM-024 上傳者姓名（uploadedBy=accountId → ACCOUNT.name；未解析→null）。 */
  uploadedByName?: string | null;
  /** G-ADM-024 上傳者部門名（accountId→orgCode→ORG_UNIT.name；未解析→null）。 */
  uploadedByDept?: string | null;
  /**
   * F018 D9 delta（`AC-N45`／`AC-N47`）：制定部門之 `orgCode` 清單（0..*，0 筆為合法）。
   *
   * 🔴 **純 metadata**（`AC-N46`）——顯示與清單呈現用，**不參與任何可見性或 RBAC 判定**。
   * 選填：後端 store 未提供該能力時為 `undefined`，既有呼叫端不受影響（additive）。
   */
  draftingDeptCodes?: string[];
}

/**
 * 🔴 2026-08-17：`UsageFormDownloadGrant`／`AppendixDownloadGrant` 兩個下載憑證型別已移除。
 * 全部下載端點（前台與後台）皆改為代理串流，前端以 `downloadViaBlob` 觸發、回傳 `void`，
 * 已無任何 `{ url, expiresInSeconds }` 形狀之回應（F020 `AC-D3a`／architecture-spec §5.2 v1.6b）。
 */

// ===== E10 F039 附錄管理（附錄池 ＋ 文件關聯與 sortOrder） =====

/** 附錄所關聯之文件精簡參照（附錄池頁展開檢視「使用此附錄的文件」，AC-17）。 */
export interface AppendixDocumentRef {
  id: string;
  documentNumber: string;
  documentName: string;
}

/**
 * 附錄池記錄（GET /admin/appendices；鏡射後端 AppendixRecord 之呈現子集）。
 * ⚠ uploadedAt 經 JSON 序列化為 ISO 字串。format＝xlsx/xls/pdf（前端歸類 excel/pdf 兩顯示類）。
 * 刻意不含 blobPath：前端一律經受控下載端點取短效 URL，不直接組合 blob 位址。
 */
export interface AppendixRecord {
  id: string;
  name: string;
  format: string;
  size: number;
  uploadedBy: string;
  uploadedAt: string;
}

/** 附錄池總覽項（GET /admin/appendices/overview）：附 docCount ＋ 關聯文件精簡清單。 */
export interface AppendixPoolItem extends AppendixRecord {
  docCount: number;
  documents: AppendixDocumentRef[];
  /** 上傳者姓名（uploadedBy=accountId → ACCOUNT.name；未解析→null）。 */
  uploadedByName?: string | null;
  /** 上傳者部門名（accountId→orgCode→ORG_UNIT.name；未解析→null）。 */
  uploadedByDept?: string | null;
}

/**
 * 某文件之關聯附錄（GET /documents/:documentId/appendices；**已由後端依 sortOrder 遞增排序**，
 * 前端不得再排序，維持後端為唯一排序權威）。
 * 前台詳情僅需 id/name/format/sortOrder，故其餘欄位為選填。
 */
export interface DocumentAppendixRecord {
  id: string;
  name: string;
  format: string;
  sortOrder: number;
  size?: number;
  uploadedBy?: string;
  uploadedAt?: string;
  /** F020 `AC-D2`／§10.3：伺服器端之浮水印支援旗標（前端不得自行以 `format` 重算）。 */
  watermarkSupported?: boolean;
}

export type TriggerType = 'scheduled' | 'manual';
export type SyncRunStatus = 'running' | 'success' | 'failed';

/** GET /admin/org-sync/runs 之單筆。 */
export interface SyncRunSummary {
  id: string;
  triggerType: TriggerType;
  status: SyncRunStatus;
  startedAt: string;
  endedAt: string | null;
  changeCount: number;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface SyncStats {
  departmentsRead: number;
  orgCreated: number;
  orgUpdated: number;
  accountsRead: number;
  accountsCreated: number;
  accountsUpdated: number;
  accountsDisabled: number;
  orphanWarnings: number;
  dirtyRows: number;
  disappearedCount: number;
  disappearedRatio: number;
}

/** POST /admin/org-sync/run 回傳。 */
export interface SyncResult {
  runId: string;
  triggerType: TriggerType;
  status: Exclude<SyncRunStatus, 'running'>;
  changeCount: number;
  errorCode?: string;
  errorMessage?: string;
  stats: SyncStats;
  warnings: string[];
}

// ===== F006 組織異動待確認提示（後台頁「總覽」KPI 與「待確認異動」頁籤） =====

export type AlertKind =
  | 'DOCUMENT_FIELD'
  | 'CLOSED_DEPT_PERSON'
  | 'DATA_INCONSISTENCY'
  | 'ACCOUNT_DISAPPEARED';
export type AlertStatus = 'pending' | 'resolved';
export type ResolutionKind = 'FIELD_UPDATED' | 'NO_CHANGE_NEEDED';

/**
 * GET /admin/org-change-alerts 之單筆（後端 AlertRow）。
 * DOCUMENT_FIELD 使用 document*／affectedField／before-after；
 * CLOSED_DEPT_PERSON 使用 person 與 dept 系列欄位（documentId 為 null，無導頁對象）；
 * DATA_INCONSISTENCY／ACCOUNT_DISAPPEARED（F005）以 accountLoginId 為主要識別＋before-after 事實快照
 * （ACCOUNT_DISAPPEARED 另帶消失前部門 dept*）。
 */
export interface OrgChangeAlertView {
  id: string;
  alertKind: AlertKind;
  documentId: string | null;
  documentNumber: string | null;
  documentName: string | null;
  affectedField: string | null;
  beforeValue: string | null;
  afterValue: string | null;
  personEmployeeNo: string | null;
  personName: string | null;
  /** F005 兩類之主要識別（帳號 loginId）；既有兩類為 null。 */
  accountLoginId: string | null;
  deptOrgCode: string | null;
  deptName: string | null;
  deptCloseDate: string | null;
  status: AlertStatus;
  resolutionKind: ResolutionKind | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
  sourceSyncRunId: string | null;
}

/** GET /admin/org-sync/monthly-summary（總覽 4 張 KPI 卡）。 */
export interface OrgSyncMonthlySummary {
  /** YYYY-MM（Asia/Taipei 當月）。 */
  month: string;
  newPersonCount: number;
  updatedCount: number;
  departedDisabledCount: number;
  /** 待確認之當責室長類提示筆數（窄口徑；與頁籤 badge 之全部 pending 不同）。 */
  pendingChiefAlertCount: number;
}

// ===== E09 F031 文件索引管理（AI 提取/索引） =====

export type IndexStatusState = 'running' | 'success' | 'failed' | 'not_built';

/** GET /admin/doc-index/overview 之單筆（文件層級 metadata join 為 [integration]，placeholder 省略）。 */
export interface DocIndexOverviewRow {
  documentId: string;
  state: IndexStatusState;
  triggerType: string | null;
  chunkCount: number | null;
  lastIndexedAt: string | null;
  errorStage: string | null;
  errorMessage: string | null;
  /** G-ADM-030 失敗錯誤碼（失敗列顯示錯誤碼而非階段標籤）；非失敗→null。 */
  errorCode?: string | null;
  // 以下為 [integration] 之 ICSOP_DOCUMENT/DOC_SOURCE_XLS join（前端優雅降級，缺時以 documentId 呈現）
  documentNumber?: string;
  documentName?: string;
  hasXls?: boolean;
  // G-ADM-029「循環 · 版次 · 使用部門」子行（[integration] 文件層 join，後端尚未落地；前端優雅降級）
  lifecycleName?: string;
  edition?: string;
  usingDeptNames?: string[];
}

export interface DocIndexOverview {
  successCount: number;
  failedCount: number;
  runningCount: number;
  /** G-ADM-028「尚未建立」計數（有文件但無 INDEX_RUN）。 */
  notBuiltCount?: number;
  items: DocIndexOverviewRow[];
  page: number;
  pageSize: number;
  total: number;
}

/** GET /admin/doc-index/:documentId（單文件三態 + 失敗詳情）。 */
export interface DocIndexStatus {
  state: IndexStatusState;
  triggerType: string | null;
  lastIndexedAt: string | null;
  errorStage: string | null;
  stageLabel: string | null;
  errorMessage: string | null;
  /** G-ADM-031 失敗錯誤碼（失敗詳情 modal「錯誤碼」列）；非失敗→null。 */
  errorCode?: string | null;
}

/** GET /admin/doc-index/:documentId/chunks（chunk 預覽 + 8 項 metadata + chunk id + 循環名）。 */
export interface DocIndexChunk {
  /** G-ADM-034 chunk 唯一 id（預覽 chip）。 */
  chunkId?: string;
  chunkSeq: number;
  content: string;
  documentNumber: string;
  lifecycleId: string;
  /** G-ADM-034 循環名（lifecycleId→LIFECYCLE.name；無→null）。 */
  lifecycleName?: string | null;
  chapterSection: string;
  usingDeptIds: string[];
  status: string;
  announcedDate: string | null;
  edition: string;
  pageNumber: number;
}

/** GAP-07-1 後台儀表板 KPI 彙總（GET /admin/dashboard/summary）。全欄 optional（缺→前端顯 0）。 */
export interface DashboardSummary {
  /** 待確認組織異動（ORG_CHANGE_ALERT pending）。 */
  pendingOrgChanges?: number;
  /** 未指派節點文件（有效文件且 nodeId null）。 */
  unassignedDocs?: number;
  /** 停用帳號待覆核（ACCOUNT disabled）。 */
  disabledAccounts?: number;
  /** 調閱紀錄（近7日）。 */
  accessLast7Days?: number;
  /** 待公布的文件（有效且進度中）。 */
  pendingPublish?: number;
}
