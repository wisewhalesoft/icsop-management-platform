import { apiFetch } from './client';
import type {
  SessionUser,
  SyncRunSummary,
  SyncResult,
  AccountView,
  AccountFilters,
  LifecycleView,
  DagGraph,
  DagNode,
  DagEdge,
  DocumentListPage,
  DocumentFilters,
  DocumentStatus,
  DocumentView,
  DocumentUpdateResult,
  DocumentLinkView,
  DocumentAttachmentRecord,
  UsageFormRecord,
  NodeDrawerData,
  AccessHistoryFilters,
  AccessHistoryPage,
  AccessHistoryRow,
  PublicListFilters,
  PublicListPage,
  OrgUnitRecord,
  PersonRecord,
  AlertStatus,
  ResolutionKind,
  OrgChangeAlertView,
  OrgSyncMonthlySummary,
} from './types';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** GET /auth/me（受保護；401 AUTH_SESSION_EXPIRED 代表未登入/逾時）。 */
export function getMe(): Promise<SessionUser> {
  return apiFetch<SessionUser>('/auth/me');
}

/**
 * POST /auth/login（途徑 B 帳密登入，F001 定案 A/B/C）。
 * 成功 → 後端核發 icsop_session cookie 並回 SessionUser；失敗 → 401 AUTH_INVALID_CREDENTIALS、
 * 400 AUTH_MISSING_FIELD（由 ApiError.code 承載）。識別鍵＝loginId。
 */
export function passwordLogin(body: {
  loginId: string;
  password: string;
}): Promise<SessionUser> {
  return apiFetch<SessionUser>('/auth/login', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}

/**
 * GET /admin/org-sync/runs?limit=N（US-011 輪詢/歷程）。
 * limit 省略時不帶 query，交後端預設（20，上限 100）。
 */
export function getOrgSyncRuns(limit?: number): Promise<SyncRunSummary[]> {
  const q = limit === undefined ? '' : `?limit=${limit}`;
  return apiFetch<SyncRunSummary[]>(`/admin/org-sync/runs${q}`);
}

/** POST /admin/org-sync/run（手動同步，僅 SysAdmin；409 SYNC_IN_PROGRESS）。 */
export function triggerOrgSync(): Promise<SyncResult> {
  return apiFetch<SyncResult>('/admin/org-sync/run', { method: 'POST' });
}

// ===== F006 組織異動待確認提示 =====

/**
 * GET /admin/org-change-alerts?status=（組織人員異動管理 read：SysAdmin+ICSOPAdmin）。
 * 回傳兩種 alertKind 之混合清單（依 createdAt）。
 */
export function getOrgChangeAlerts(
  status: AlertStatus = 'pending',
): Promise<OrgChangeAlertView[]> {
  return apiFetch<OrgChangeAlertView[]>(`/admin/org-change-alerts?status=${status}`);
}

/**
 * PATCH /admin/org-change-alerts/:id/resolve（處理提示；write，僅 SysAdmin）。
 * 未指定 resolutionKind → 後端預設 NO_CHANGE_NEEDED（「已確認無需變更」）。
 * 404 ALERT_NOT_FOUND／409 ALERT_ALREADY_RESOLVED 由 ApiError.code 承載。
 */
export function resolveOrgChangeAlert(
  id: string,
  resolutionKind?: ResolutionKind,
): Promise<OrgChangeAlertView> {
  return apiFetch<OrgChangeAlertView>(`/admin/org-change-alerts/${id}/resolve`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(resolutionKind ? { resolutionKind } : {}),
  });
}

/** GET /admin/org-sync/monthly-summary（總覽 4 張 KPI 卡；read）。 */
export function getOrgSyncMonthlySummary(): Promise<OrgSyncMonthlySummary> {
  return apiFetch<OrgSyncMonthlySummary>('/admin/org-sync/monthly-summary');
}

// ===== F003 帳號與角色管理 =====

/** GET /admin/accounts（帳號管理 read：SysAdmin+ICSOPAdmin）。 */
export function getAccounts(f: AccountFilters = {}): Promise<AccountView[]> {
  const qs = new URLSearchParams();
  if (f.source) qs.set('source', f.source);
  if (f.roleCode) qs.set('roleCode', f.roleCode);
  if (f.status) qs.set('status', f.status);
  if (f.keyword) qs.set('keyword', f.keyword);
  const q = qs.toString();
  return apiFetch<AccountView[]>(`/admin/accounts${q ? `?${q}` : ''}`);
}

/** POST /admin/accounts（建立手動帳號，SysAdmin；409 ACCOUNT_USERNAME_EXISTS、400 ROLE_INVALID）。 */
export function createAccount(body: {
  loginId: string;
  password: string;
  roleCode: string;
  name?: string | null;
}): Promise<AccountView> {
  return apiFetch<AccountView>('/admin/accounts', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}

/** PATCH /admin/accounts/:id（編輯：手動帳號姓名/重設密碼；上游 ACCOUNT_UPSTREAM_READONLY）。 */
export function updateAccount(
  id: string,
  body: { name?: string | null; password?: string },
): Promise<AccountView> {
  return apiFetch<AccountView>(`/admin/accounts/${id}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}

/** PATCH /admin/accounts/:id/role（指派角色，僅 SysAdmin；ROLE_INVALID/ROLE_SELF_DOWNGRADE_BLOCKED）。 */
/**
 * F041（架構 §3.7 決策四）：新增第三個選填參數 `userSubtype`——僅角色為「一般使用者」時由呼叫端
 * 傳入（`isSubtypeApplicable(selected) ? subtype : undefined`），故 PATCH body **條件式**納入該鍵。
 * 非 User 角色時 body 不含此鍵，後端亦不寫入（AC-36：既有值保留、不清空）。
 */
export function assignAccountRole(
  id: string,
  roleCode: string,
  userSubtype?: string,
): Promise<AccountView> {
  return apiFetch<AccountView>(`/admin/accounts/${id}/role`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(userSubtype === undefined ? { roleCode } : { roleCode, userSubtype }),
  });
}

/** PATCH /admin/accounts/:id/status（停用/恢復，SysAdmin）。 */
export function setAccountStatus(
  id: string,
  status: 'active' | 'disabled',
): Promise<AccountView> {
  return apiFetch<AccountView>(`/admin/accounts/${id}/status`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({ status }),
  });
}

// ===== E03 循環 DAG（F007/F008） =====

/** GET /admin/lifecycles（循環管理 read：SysAdmin/ICSOPAdmin/Supervisor）。 */
export function getLifecycles(): Promise<LifecycleView[]> {
  return apiFetch<LifecycleView[]>('/admin/lifecycles');
}

/**
 * POST /admin/lifecycles（建立，ICSOPAdmin；LIFECYCLE_NAME_REQUIRED）。
 * F040：`subcategory` 為非必填，呼叫端 trim 後空值一律送 `null`（不得送空字串，INV-3）；
 * 唯一性違反回 409 LIFECYCLE_DUPLICATE／LIFECYCLE_SUBCATEGORY_CONFLICT。
 */
export function createLifecycle(body: {
  name: string;
  subcategory?: string | null;
  description?: string | null;
}): Promise<LifecycleView> {
  return apiFetch<LifecycleView>('/admin/lifecycles', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}

/**
 * PATCH /admin/lifecycles/:id（改名稱/子分類/說明）。
 * F040 三態：未帶 `subcategory` 鍵＝不修改；`null`＝清空；字串＝設定（呼叫端 trim 後空值送 `null`）。
 */
export function updateLifecycle(
  id: string,
  body: { name?: string; subcategory?: string | null; description?: string | null },
): Promise<LifecycleView> {
  return apiFetch<LifecycleView>(`/admin/lifecycles/${id}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}

/** PATCH /admin/lifecycles/:id/status（啟用/停用）。 */
export function setLifecycleStatus(
  id: string,
  status: 'active' | 'inactive',
): Promise<LifecycleView> {
  return apiFetch<LifecycleView>(`/admin/lifecycles/${id}/status`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({ status }),
  });
}

/** DELETE /admin/lifecycles/:id（刪除；仍有掛載 → 409 LIFECYCLE_HAS_DOCUMENTS）。 */
export function deleteLifecycle(id: string): Promise<void> {
  return apiFetch<void>(`/admin/lifecycles/${id}`, { method: 'DELETE' });
}

// ===== DAG 節點/邊（F008） =====

export function getDagGraph(lifecycleId: string): Promise<DagGraph> {
  return apiFetch<DagGraph>(`/admin/lifecycles/${lifecycleId}/graph`);
}
export function addDagNode(
  lifecycleId: string,
  body: { name?: string | null; positionX?: number; positionY?: number },
): Promise<DagNode> {
  return apiFetch<DagNode>(`/admin/lifecycles/${lifecycleId}/nodes`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}
export function updateDagNode(
  lifecycleId: string,
  nodeId: string,
  body: { name?: string | null; positionX?: number; positionY?: number },
): Promise<DagNode> {
  return apiFetch<DagNode>(`/admin/lifecycles/${lifecycleId}/nodes/${nodeId}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}
export function deleteDagNode(lifecycleId: string, nodeId: string): Promise<void> {
  return apiFetch<void>(`/admin/lifecycles/${lifecycleId}/nodes/${nodeId}`, {
    method: 'DELETE',
  });
}
/** 新增邊；409 DAG_SELF_LOOP / DAG_CYCLE_DETECTED。 */
export function addDagEdge(
  lifecycleId: string,
  source: string,
  target: string,
): Promise<DagEdge> {
  return apiFetch<DagEdge>(`/admin/lifecycles/${lifecycleId}/edges`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ source, target }),
  });
}
export function deleteDagEdge(lifecycleId: string, edgeId: string): Promise<void> {
  return apiFetch<void>(`/admin/lifecycles/${lifecycleId}/edges/${edgeId}`, {
    method: 'DELETE',
  });
}

// ===== F036 循環樹狀圖預覽（唯讀＋浮水印） =====

/**
 * GET /admin/lifecycles/:id/tree-preview（唯讀圖資＋伺服器端浮水印快照；記錄 LIFECYCLE_VIEW 稽核）。
 * 循環管理 read：SysAdmin/ICSOPAdmin/Supervisor；DeptContact/User → 403 PERMISSION_DENIED。
 */
export function getLifecycleTreePreview(
  lifecycleId: string,
): Promise<import('./types').LifecycleTreePreview> {
  return apiFetch(`/admin/lifecycles/${lifecycleId}/tree-preview`);
}

/** 下載 URL（樹狀圖 PDF，內容層已燒錄浮水印；記錄 LIFECYCLE_DOWNLOAD）。 */
export function lifecycleTreeDownloadUrl(lifecycleId: string): string {
  return `/admin/lifecycles/${lifecycleId}/tree-preview/download`;
}

/** 列印用 URL（樹狀圖 PDF，內容層已燒錄浮水印；記錄 LIFECYCLE_PRINT）。 */
export function lifecycleTreePrintUrl(lifecycleId: string): string {
  return `/admin/lifecycles/${lifecycleId}/tree-preview/print`;
}

// ===== E04 ICSOP 文件（F010/F012/F017） =====

/**
 * GET /admin/documents（ICSOP文件管理 read）。F017 起後端回傳分頁物件
 * `{items,total,page,pageSize,hasNext}`；清單頁讀 items＋分頁，建立頁之唯一性即時檢查讀 items。
 */
export function getDocuments(f: DocumentFilters = {}): Promise<DocumentListPage> {
  const qs = new URLSearchParams();
  if (f.lifecycleId) qs.set('lifecycleId', f.lifecycleId);
  if (f.status) qs.set('status', f.status);
  if (f.keyword) qs.set('keyword', f.keyword);
  if (f.documentNumber) qs.set('documentNumber', f.documentNumber);
  if (f.documentName) qs.set('documentName', f.documentName);
  if (f.draftingCompanyId) qs.set('draftingCompanyId', f.draftingCompanyId);
  if (f.draftingDeptId) qs.set('draftingDeptId', f.draftingDeptId);
  if (f.draftingSectionId) qs.set('draftingSectionId', f.draftingSectionId);
  if (f.primaryChiefId) qs.set('primaryChiefId', f.primaryChiefId);
  if (f.linkTargetId) qs.set('linkTargetId', f.linkTargetId);
  if (f.sortBy) qs.set('sortBy', f.sortBy);
  if (f.sortDir) qs.set('sortDir', f.sortDir);
  if (f.page) qs.set('page', String(f.page));
  if (f.pageSize) qs.set('pageSize', String(f.pageSize));
  const q = qs.toString();
  return apiFetch<DocumentListPage>(`/admin/documents${q ? `?${q}` : ''}`);
}

/** POST /admin/documents（建立，ICSOPAdmin；DOCUMENT_REQUIRED_FIELD_MISSING/NUMBER_DUPLICATE）。回傳含 id 之單筆檢視。 */
export function createDocument(body: Record<string, unknown>): Promise<DocumentView> {
  return apiFetch<DocumentView>('/admin/documents', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}

/** GET /admin/documents/:id（單筆文件，F011 編輯對照/F016 檢視；查無→404 DOCUMENT_NOT_FOUND）。 */
export function getDocument(id: string): Promise<DocumentView> {
  return apiFetch<DocumentView>(`/admin/documents/${id}`);
}

/**
 * PATCH /admin/documents/:id（F011 編輯：以新值覆蓋，UUID 不變、不留歷史）。
 * links[]（F015）隨此 PATCH 整批送出；回傳覆寫後之文件＋新舊值對照。
 */
export function updateDocument(
  id: string,
  body: Record<string, unknown>,
): Promise<DocumentUpdateResult> {
  return apiFetch<DocumentUpdateResult>(`/admin/documents/${id}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}

/** GET /admin/documents/:id/links（F015 連結點清單，附目標編號/書名/狀態）。 */
export function getDocumentLinks(id: string): Promise<DocumentLinkView[]> {
  return apiFetch<DocumentLinkView[]>(`/admin/documents/${id}/links`);
}

/** PATCH /admin/documents/:id/status（切換狀態，ICSOPAdmin；切回有效重驗編號唯一性）。 */
export function setDocumentStatus(id: string, status: DocumentStatus): Promise<void> {
  return apiFetch<void>(`/admin/documents/${id}/status`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({ status }),
  });
}

// ===== E04/E05 附件與使用表單（F016/F018） =====

/** multipart 上傳單一檔案（欄位名 file），回傳型別 T。 */
function uploadFile<T>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.append('file', file);
  // 不設 Content-Type，交瀏覽器帶 multipart boundary。
  return apiFetch<T>(path, { method: 'POST', body: form });
}

/** POST /admin/documents/:documentId/attachments/icsop-pdf（F016 ICSOP PDF 覆蓋式上傳）。 */
export function uploadIcsopPdf(
  documentId: string,
  file: File,
): Promise<DocumentAttachmentRecord> {
  return uploadFile<DocumentAttachmentRecord>(
    `/admin/documents/${documentId}/attachments/icsop-pdf`,
    file,
  );
}

/** POST /admin/documents/:documentId/attachments/ojt（F016 OJT 簽到表覆蓋式上傳）。 */
export function uploadOjtAttachment(
  documentId: string,
  file: File,
): Promise<DocumentAttachmentRecord> {
  return uploadFile<DocumentAttachmentRecord>(
    `/admin/documents/${documentId}/attachments/ojt`,
    file,
  );
}

/**
 * GET /admin/documents/:documentId/attachments（F016 附件清單，ICSOP文件管理 read）。
 * 固定序 ICSOP_PDF→OJT_SIGNIN，缺者不列；查無文件→404 DOCUMENT_NOT_FOUND。
 */
export function getDocumentAttachments(
  documentId: string,
): Promise<DocumentAttachmentRecord[]> {
  return apiFetch<DocumentAttachmentRecord[]>(
    `/admin/documents/${documentId}/attachments`,
  );
}

/**
 * GET /documents/attachments/download?blobPath=（F016 受控下載；核發短效期 URL＋寫入稽核）。
 * 失效/非現存參照 → FILE_ACCESS_DENIED。
 */
export function downloadAttachment(
  blobPath: string,
): Promise<{ url: string; expiresInSeconds: number }> {
  return apiFetch(
    `/documents/attachments/download?blobPath=${encodeURIComponent(blobPath)}`,
  );
}

/** GET /admin/usage-forms（F018 表單池清單，USAGE_FORM_MANAGEMENT read）。 */
export function getUsageFormPool(): Promise<UsageFormRecord[]> {
  return apiFetch<UsageFormRecord[]>('/admin/usage-forms');
}

/** GET /documents/:documentId/usage-forms（某文件之關聯表單，前後台共用 READ）。 */
export function getDocumentForms(documentId: string): Promise<UsageFormRecord[]> {
  return apiFetch<UsageFormRecord[]>(`/documents/${documentId}/usage-forms`);
}

/** POST /admin/documents/:documentId/usage-forms（F018 建立/編輯時多選關聯表單）。 */
export function linkUsageForms(documentId: string, formIds: string[]): Promise<void> {
  return apiFetch<void>(`/admin/documents/${documentId}/usage-forms`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ formIds }),
  });
}

/** DELETE /admin/documents/:documentId/usage-forms/:formId（解除單一表單關聯）。 */
export function unlinkUsageForm(documentId: string, formId: string): Promise<void> {
  return apiFetch<void>(`/admin/documents/${documentId}/usage-forms/${formId}`, {
    method: 'DELETE',
  });
}

/** GET /documents/:documentId/usage-forms/:formId/download（前後台共用；核發短效期 URL＋寫入稽核）。 */
export function downloadUsageForm(
  documentId: string,
  formId: string,
): Promise<{ url: string; expiresInSeconds: number }> {
  return apiFetch(`/documents/${documentId}/usage-forms/${formId}/download`);
}

// ===== F009 節點抽屜（文件掛載） =====

/** GET 節點抽屜資料（節點名＋已掛載＋候選文件，候選過濾為當前循環）。 */
export function getNodeDrawer(lifecycleId: string, nodeId: string): Promise<NodeDrawerData> {
  return apiFetch<NodeDrawerData>(`/admin/lifecycles/${lifecycleId}/nodes/${nodeId}/drawer`);
}

/** 掛載文件至節點；confirm=true 允許自他節點改派（否則 409 NODE_DOC_ALREADY_ASSIGNED）。 */
export function mountNodeDoc(
  lifecycleId: string,
  nodeId: string,
  documentId: string,
  confirm = false,
): Promise<void> {
  return apiFetch<void>(`/admin/lifecycles/${lifecycleId}/nodes/${nodeId}/documents`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ documentId, confirm }),
  });
}

/** 移除節點之文件掛載。 */
export function unmountNodeDoc(lifecycleId: string, nodeId: string, docId: string): Promise<void> {
  return apiFetch<void>(`/admin/lifecycles/${lifecycleId}/nodes/${nodeId}/documents/${docId}`, {
    method: 'DELETE',
  });
}

// ===== E07 文件調閱歷程查詢（F024） =====

function accessHistoryQuery(f: AccessHistoryFilters): string {
  const qs = new URLSearchParams();
  if (f.kind) qs.set('kind', f.kind);
  if (f.person) qs.set('person', f.person);
  if (f.target) qs.set('target', f.target);
  if (f.from) qs.set('from', f.from);
  if (f.to) qs.set('to', f.to);
  if (f.page) qs.set('page', String(f.page));
  const q = qs.toString();
  return q ? `?${q}` : '';
}

/** GET /admin/access-history（文件調閱歷程查詢 read：SysAdmin/ICSOPAdmin）。 */
export function getAccessHistory(f: AccessHistoryFilters = {}): Promise<AccessHistoryPage> {
  return apiFetch<AccessHistoryPage>(`/admin/access-history${accessHistoryQuery(f)}`);
}

/** GET /admin/access-history/export（匯出，遵循當前查詢條件與角色範圍）。 */
export function exportAccessHistory(
  f: AccessHistoryFilters = {},
): Promise<{ rows: AccessHistoryRow[]; total: number }> {
  return apiFetch<{ rows: AccessHistoryRow[]; total: number }>(
    `/admin/access-history/export${accessHistoryQuery(f)}`,
  );
}

// ===== E07 文件變更歷程（F037 程序書 / F038 循環樹狀圖） =====

import type {
  DocumentChangeView,
  DocumentChangeFilters,
  LifecycleChangeView,
  LifecycleChangeFilters,
} from './types';

/** GET /admin/change-history/documents（F037 程序書變更清單；文件變更歷程 read）。 */
export function getDocumentChanges(
  f: DocumentChangeFilters = {},
): Promise<{ items: DocumentChangeView[]; total: number }> {
  const qs = new URLSearchParams();
  if (f.doc) qs.set('doc', f.doc);
  if (f.field) qs.set('field', f.field);
  if (f.person) qs.set('person', f.person);
  if (f.from) qs.set('from', f.from);
  if (f.to) qs.set('to', f.to);
  const q = qs.toString();
  return apiFetch(`/admin/change-history/documents${q ? `?${q}` : ''}`);
}

/** GET /admin/change-history/documents/:documentId（F037 展開某文件 before/after ＋記 CHANGE_LOG_VIEW 稽核）。 */
export function viewDocumentChanges(
  documentId: string,
): Promise<{ items: DocumentChangeView[] }> {
  return apiFetch(`/admin/change-history/documents/${encodeURIComponent(documentId)}`);
}

/** GET /admin/change-history/lifecycles（F038 循環結構變更清單；read）。 */
export function getLifecycleChanges(
  f: LifecycleChangeFilters = {},
): Promise<{ items: LifecycleChangeView[]; total: number }> {
  const qs = new URLSearchParams();
  if (f.lifecycleId) qs.set('lifecycleId', f.lifecycleId);
  if (f.changeType) qs.set('changeType', f.changeType);
  if (f.person) qs.set('person', f.person);
  if (f.from) qs.set('from', f.from);
  const q = qs.toString();
  return apiFetch(`/admin/change-history/lifecycles${q ? `?${q}` : ''}`);
}

/** GET /admin/change-history/lifecycles/:lifecycleId（F038 某循環結構變更 ＋記 LIFECYCLE_CHANGELOG_VIEW 稽核）。 */
export function viewLifecycleChanges(
  lifecycleId: string,
  name?: string,
): Promise<{ items: LifecycleChangeView[] }> {
  const q = name ? `?name=${encodeURIComponent(name)}` : '';
  return apiFetch(`/admin/change-history/lifecycles/${encodeURIComponent(lifecycleId)}${q}`);
}

/**
 * GET .../lifecycles/:lifecycleId/changes/:changeLogId/tree-diff（F038 單筆事件之新舊結構 + diff + 浮水印）。
 * 本端點純資料、不記稽核（VIEW 稽核仍由 viewLifecycleChanges 記錄）；404 LIFECYCLE_CHANGE_LOG_NOT_FOUND。
 */
export function getLifecycleTreeDiff(
  lifecycleId: string,
  changeLogId: string,
): Promise<import('./types').LifecycleTreeDiff> {
  return apiFetch(
    `/admin/change-history/lifecycles/${encodeURIComponent(lifecycleId)}/changes/${encodeURIComponent(changeLogId)}/tree-diff`,
  );
}

/** 下載 URL（雙頁新舊對照 PDF，內容層已燒錄浮水印；記錄 LIFECYCLE_CHANGELOG_DOWNLOAD）。 */
export function lifecycleTreeDiffDownloadUrl(lifecycleId: string, changeLogId: string): string {
  return `/admin/change-history/lifecycles/${encodeURIComponent(lifecycleId)}/changes/${encodeURIComponent(changeLogId)}/tree-diff/download`;
}

// ===== E06 前台瀏覽（F019） =====

/**
 * GET /public/documents（前台清單，全 5 角色 READ；排序/篩選/分頁皆後端權威）。
 * 401 → 未登入（SPA 全域 gating 導回登入）。
 */
export function getPublicDocuments(f: PublicListFilters = {}): Promise<PublicListPage> {
  const qs = new URLSearchParams();
  if (f.keyword) qs.set('keyword', f.keyword);
  if (f.deptCode) qs.set('deptCode', f.deptCode);
  if (f.lifecycleId) qs.set('lifecycleId', f.lifecycleId);
  if (f.status) qs.set('status', f.status);
  if (f.page) qs.set('page', String(f.page));
  if (f.pageSize) qs.set('pageSize', String(f.pageSize));
  const q = qs.toString();
  return apiFetch<PublicListPage>(`/public/documents${q ? `?${q}` : ''}`);
}

/**
 * GET /public/documents/:id（G-PUB-020 前台文件詳情，全 5 角色 READ）。
 * 非「已公告」文件 → 404 DOCUMENT_NOT_FOUND（視同不存在）；未登入 → 401。
 */
export function getPublicDocumentDetail(
  id: string,
): Promise<import('./types').PublicDocumentDetail> {
  return apiFetch(`/public/documents/${encodeURIComponent(id)}`);
}

/** GET /org-units（組織單位清單，全 5 角色 READ；供前台部門篩選下拉之 5 層樹來源）。 */
export function getOrgUnits(): Promise<OrgUnitRecord[]> {
  return apiFetch<OrgUnitRecord[]>('/org-units');
}

/**
 * GET /persons/search（當責室長候選，全 5 角色 READ；僅回在職者）。
 * F014：當責室長-主要/次要之可搜尋來源。空關鍵字＝回預設候選（後端限制筆數）。
 */
export function searchPersons(q: string, limit = 20): Promise<PersonRecord[]> {
  const qs = new URLSearchParams();
  if (q.trim()) qs.set('q', q.trim());
  qs.set('limit', String(limit));
  return apiFetch<PersonRecord[]>(`/persons/search?${qs.toString()}`);
}

// ===== E06 文件浮水印檢視器（F020） =====

/**
 * GET /public/documents/:id/view（檢視器疊加用浮水印字串；記錄 VIEW 稽核）。
 * G-PUB-032：另回開啟中文件之 documentNumber/documentName（供檢視器標題列）。
 */
export function getDocumentWatermark(
  documentId: string,
): Promise<{ watermark: string; documentNumber?: string | null; documentName?: string | null }> {
  return apiFetch(`/public/documents/${documentId}/view`);
}

/** 原始 PDF 代理串流 URL（檢視器 <iframe> 預覽；後端代理，不核發 SAS）。 */
export function documentPdfUrl(documentId: string): string {
  return `/public/documents/${documentId}/pdf`;
}

/** 下載 URL（內容層已燒錄浮水印）。 */
export function documentDownloadUrl(documentId: string): string {
  return `/public/documents/${documentId}/download`;
}

/** 列印用 URL（內容層已燒錄浮水印）。 */
export function documentPrintUrl(documentId: string): string {
  return `/public/documents/${documentId}/print`;
}

// ===== E05 F018 使用表單管理（表單池） =====

/**
 * GET /admin/usage-forms/overview（表單池總覽，read：SysAdmin 唯讀+ICSOPAdmin CRUD）。
 * 每筆附關聯文件數（docCount）與關聯文件精簡清單（documents），供清單欄與展開檢視。
 */
export function getUsageFormOverview(): Promise<import('./types').UsageFormPoolItem[]> {
  return apiFetch('/admin/usage-forms/overview');
}

/**
 * POST /admin/usage-forms（multipart 上傳，欄位名 `files`；單/多檔皆可）。
 * 格式 FILE_FORMAT_NOT_ALLOWED（僅 xlsx/xls/pdf）、大小 FILE_SIZE_EXCEEDED（50MB）、
 * 名稱長度 USAGE_FORM_NAME_TOO_LONG（400 字元）由後端裁決。
 * `name`＝自訂表單名稱（選填，trim 後送出）：**僅單檔路徑**附加——批次上傳無逐檔命名之 UI
 * （prototype 19 之 fileInput 無 multiple），各檔由後端沿用各自檔名。
 * ⚠ FormData 不可設 Content-Type（瀏覽器需自帶 multipart boundary）。
 */
export function uploadUsageForms(files: File[], name?: string): Promise<unknown> {
  const fd = new FormData();
  for (const f of files) fd.append('files', f);
  const trimmed = (name ?? '').trim();
  if (files.length === 1 && trimmed !== '') fd.append('name', trimmed);
  return apiFetch('/admin/usage-forms', { method: 'POST', body: fd });
}

/**
 * PUT /admin/usage-forms/:formId（覆蓋上傳單檔，欄位名 `file`）。
 * 被 ≥2 份文件引用且未確認 → 409 USAGE_FORM_OVERWRITE_SHARED；confirmed=true 放行。
 */
export function overwriteUsageForm(
  formId: string,
  file: File,
  confirmed = false,
): Promise<unknown> {
  const fd = new FormData();
  fd.append('file', file);
  const q = confirmed ? '?confirmed=true' : '';
  return apiFetch(`/admin/usage-forms/${formId}${q}`, {
    method: 'PUT',
    body: fd,
  });
}

/**
 * DELETE /admin/usage-forms/:formId（自表單池移除）。
 * 被 ≥1 份文件引用且未確認 → 409 USAGE_FORM_IN_USE；confirmed=true → 解除全部關聯後刪除。
 */
export function deleteUsageForm(formId: string, confirmed = false): Promise<void> {
  const q = confirmed ? '?confirmed=true' : '';
  return apiFetch<void>(`/admin/usage-forms/${formId}${q}`, { method: 'DELETE' });
}

/** GET /admin/usage-forms/:formId/download（表單池管理頁個別下載，核發短效 URL）。 */
export function downloadPoolForm(
  formId: string,
): Promise<import('./types').UsageFormDownloadGrant> {
  return apiFetch(`/admin/usage-forms/${formId}/download`);
}

// ===== E10 F039 附錄管理（附錄池 ＋ 文件關聯與 sortOrder） =====

/** GET /admin/appendices（附錄池清單，APPENDIX_MANAGEMENT read；供建立/編輯畫面之候選）。 */
export function getAppendixPool(): Promise<import('./types').AppendixRecord[]> {
  return apiFetch('/admin/appendices');
}

/**
 * GET /admin/appendices/overview（附錄池總覽，read：SysAdmin 唯讀＋ICSOPAdmin CRUD）。
 * 每筆附關聯文件數（docCount）與關聯文件精簡清單（documents），供清單欄與展開檢視（AC-16/17）。
 */
export function getAppendixPoolOverview(): Promise<import('./types').AppendixPoolItem[]> {
  return apiFetch('/admin/appendices/overview');
}

/**
 * POST /admin/appendices（multipart 上傳，欄位名 `files`；單/多檔皆可）。
 * 格式 FILE_FORMAT_NOT_ALLOWED（僅 xlsx/xls/pdf）、大小 FILE_SIZE_EXCEEDED（50MB）、
 * 名稱長度 APPENDIX_NAME_TOO_LONG（400 字元）由後端裁決。
 * `name`＝自訂附錄名稱（選填，trim 後送出）：**僅單檔路徑**附加——多檔不接受自訂名稱
 * （F039 Alt Flow／prototype 24 multiNameNote），各檔由後端沿用各自檔名。
 * ⚠ FormData 不可設 Content-Type（瀏覽器需自帶 multipart boundary）。
 */
export function uploadAppendix(files: File[], name?: string): Promise<unknown> {
  const fd = new FormData();
  for (const f of files) fd.append('files', f);
  const trimmed = (name ?? '').trim();
  if (files.length === 1 && trimmed !== '') fd.append('name', trimmed);
  return apiFetch('/admin/appendices', { method: 'POST', body: fd });
}

/**
 * PUT /admin/appendices/:appendixId（覆蓋上傳單檔，欄位名 `file`）。
 * 被 ≥2 份文件引用且未確認 → 409 APPENDIX_OVERWRITE_SHARED；confirmed=true 放行。**不改名稱**。
 */
export function overwriteAppendix(
  appendixId: string,
  file: File,
  confirmed = false,
): Promise<unknown> {
  const fd = new FormData();
  fd.append('file', file);
  const q = confirmed ? '?confirmed=true' : '';
  return apiFetch(`/admin/appendices/${appendixId}${q}`, { method: 'PUT', body: fd });
}

/**
 * DELETE /admin/appendices/:appendixId（自附錄池移除）。
 * 被 ≥1 份文件引用且未確認 → 409 APPENDIX_IN_USE；confirmed=true → 解除全部關聯後刪除。
 */
export function deleteAppendix(appendixId: string, confirmed = false): Promise<void> {
  const q = confirmed ? '?confirmed=true' : '';
  return apiFetch<void>(`/admin/appendices/${appendixId}${q}`, { method: 'DELETE' });
}

/** GET /admin/appendices/:appendixId/download（後台個別下載；管理端存取，不寫稽核、不燒錄浮水印）。 */
export function downloadAppendixFromPool(
  appendixId: string,
): Promise<import('./types').AppendixDownloadGrant> {
  return apiFetch(`/admin/appendices/${appendixId}/download`);
}

/** GET /documents/:documentId/appendices（前後台共用；**已依 sortOrder 遞增**，前端不得再排序）。 */
export function getDocumentAppendices(
  documentId: string,
): Promise<import('./types').DocumentAppendixRecord[]> {
  return apiFetch(`/documents/${documentId}/appendices`);
}

/**
 * PUT /admin/documents/:documentId/appendices（**排序權威寫入**：整組覆寫並依陣列索引重寫
 * sortOrder 1..N）。architecture-spec §3.6 決策二：文件建立/編輯頁**唯一**接入之附錄寫入呼叫，
 * 刻意不採 F018 使用表單之 diff-based link/unlink（無法表達純重排）。
 */
export function replaceDocumentAppendices(
  documentId: string,
  appendixIds: string[],
): Promise<void> {
  return apiFetch<void>(`/admin/documents/${documentId}/appendices`, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify({ appendixIds }),
  });
}

/**
 * POST /admin/documents/:documentId/appendices（附加關聯，接續現有最大 sortOrder 之後）。
 * API 完整性保留；**建立/編輯 UI 刻意不呼叫**（見 replaceDocumentAppendices 之決策二說明）。
 */
export function appendDocumentAppendices(
  documentId: string,
  appendixIds: string[],
): Promise<void> {
  return apiFetch<void>(`/admin/documents/${documentId}/appendices`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ appendixIds }),
  });
}

/** DELETE /admin/documents/:documentId/appendices/:appendixId（解除單一關聯，剩餘重編為 1..N）。 */
export function unlinkDocumentAppendix(
  documentId: string,
  appendixId: string,
): Promise<void> {
  return apiFetch<void>(`/admin/documents/${documentId}/appendices/${appendixId}`, {
    method: 'DELETE',
  });
}

/** GET /documents/:documentId/appendices/:appendixId/download（前台下載＋**寫入稽核**，不燒錄浮水印）。 */
export function downloadDocumentAppendix(
  documentId: string,
  appendixId: string,
): Promise<import('./types').AppendixDownloadGrant> {
  return apiFetch(`/documents/${documentId}/appendices/${appendixId}/download`);
}

// ===== E09 F031 文件索引管理 =====

/** GET /admin/doc-index/overview（總覽：彙總計數 + 分頁 + 狀態篩選；read）。 */
/** GAP-07-1 後台儀表板 KPI 彙總（待確認組織異動/未指派節點文件/停用帳號/調閱近7日/待公布）。 */
export function getDashboardSummary(): Promise<import('./types').DashboardSummary> {
  return apiFetch('/admin/dashboard/summary');
}

export function getDocIndexOverview(
  f: { state?: string; page?: number } = {},
): Promise<import('./types').DocIndexOverview> {
  const qs = new URLSearchParams();
  if (f.state) qs.set('state', f.state);
  if (f.page) qs.set('page', String(f.page));
  const q = qs.toString();
  return apiFetch(`/admin/doc-index/overview${q ? `?${q}` : ''}`);
}

/** GET /admin/doc-index/:documentId（單文件索引狀態三態 + 失敗詳情；read）。 */
export function getDocIndexStatus(
  documentId: string,
): Promise<import('./types').DocIndexStatus> {
  return apiFetch(`/admin/doc-index/${encodeURIComponent(documentId)}`);
}

/** GET /admin/doc-index/:documentId/chunks（chunk 預覽 + 8 項 metadata；read）。 */
export function getDocIndexChunks(
  documentId: string,
): Promise<import('./types').DocIndexChunk[]> {
  return apiFetch(`/admin/doc-index/${encodeURIComponent(documentId)}/chunks`);
}

/** POST /admin/doc-index/:documentId/reindex（手動重新索引；write，SysAdmin→403）。 */
export function reindexDocument(
  documentId: string,
): Promise<{ accepted: true }> {
  return apiFetch(`/admin/doc-index/${encodeURIComponent(documentId)}/reindex`, {
    method: 'POST',
  });
}
