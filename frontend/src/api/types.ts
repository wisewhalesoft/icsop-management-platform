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
}

/** 帳號管理檢視（GET/POST/PATCH /admin/accounts；鏡射後端 accounts.store AccountView）。 */
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
}

export interface AccountFilters {
  source?: string;
  roleCode?: string;
  status?: string;
  keyword?: string;
}

/** 循環（F007）。updatedAt 為 ISO 字串。 */
export interface LifecycleView {
  id: string;
  name: string;
  description: string | null;
  status: 'active' | 'inactive';
  nodeCount: number;
  updatedAt: string;
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
export interface DocumentListPage {
  items: DocumentListItem[];
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
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
  blobPath: string;
  format: string;
  size: number;
  uploadedBy: string;
  uploadedAt: string;
}

// ===== E07 文件調閱歷程（F024） =====

/** 類型篩選前端顯示值（↔ 後端 targetType 集合）。 */
export type AuditKind = '文件' | '循環' | '變更';

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
  draftingDeptId: string | null;
  draftingDeptName: string | null;
  usingDeptIds: string[];
  usingDeptNames: string[];
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
}

/** 前台清單篩選（皆選填）。 */
export interface PublicListFilters {
  keyword?: string;
  /** 選定組織單位 orgCode（任意層級，後端自動展開子樹）。 */
  deptCode?: string;
  lifecycleId?: string;
  status?: string;
  page?: number;
  pageSize?: number;
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
  format: string;
  size: number;
  uploadedBy: string;
  uploadedAt: string;
  docCount: number;
  documents: UsageFormDocumentRef[];
}

/** 下載憑證（GET /admin/usage-forms/:formId/download；短效期 URL）。 */
export interface UsageFormDownloadGrant {
  url: string;
  expiresInSeconds: number;
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
  // 以下為 [integration] 之 ICSOP_DOCUMENT/DOC_SOURCE_XLS join（前端優雅降級，缺時以 documentId 呈現）
  documentNumber?: string;
  documentName?: string;
  hasXls?: boolean;
}

export interface DocIndexOverview {
  successCount: number;
  failedCount: number;
  runningCount: number;
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
}

/** GET /admin/doc-index/:documentId/chunks（chunk 預覽 + 8 項 metadata）。 */
export interface DocIndexChunk {
  chunkSeq: number;
  content: string;
  documentNumber: string;
  lifecycleId: string;
  chapterSection: string;
  usingDeptIds: string[];
  status: string;
  announcedDate: string | null;
  edition: string;
  pageNumber: number;
}
