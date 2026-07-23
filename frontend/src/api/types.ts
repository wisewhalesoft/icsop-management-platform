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
  primaryChiefId: string | null;
  edition: string | null;
  announcedDate: string | null;
  contentSummary: string | null;
}

export interface DocumentFilters {
  lifecycleId?: string;
  status?: string;
  keyword?: string;
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
