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
  DocumentListItem,
  DocumentFilters,
  DocumentStatus,
  NodeDrawerData,
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
export function assignAccountRole(id: string, roleCode: string): Promise<AccountView> {
  return apiFetch<AccountView>(`/admin/accounts/${id}/role`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({ roleCode }),
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

/** POST /admin/lifecycles（建立，ICSOPAdmin；LIFECYCLE_NAME_REQUIRED）。 */
export function createLifecycle(body: {
  name: string;
  description?: string | null;
}): Promise<LifecycleView> {
  return apiFetch<LifecycleView>('/admin/lifecycles', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}

/** PATCH /admin/lifecycles/:id（改名稱/說明）。 */
export function updateLifecycle(
  id: string,
  body: { name?: string; description?: string | null },
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

// ===== E04 ICSOP 文件（F010/F012/F017） =====

/** GET /admin/documents（ICSOP文件管理 read）。 */
export function getDocuments(f: DocumentFilters = {}): Promise<DocumentListItem[]> {
  const qs = new URLSearchParams();
  if (f.lifecycleId) qs.set('lifecycleId', f.lifecycleId);
  if (f.status) qs.set('status', f.status);
  if (f.keyword) qs.set('keyword', f.keyword);
  const q = qs.toString();
  return apiFetch<DocumentListItem[]>(`/admin/documents${q ? `?${q}` : ''}`);
}

/** POST /admin/documents（建立，ICSOPAdmin；DOCUMENT_REQUIRED_FIELD_MISSING/NUMBER_DUPLICATE）。 */
export function createDocument(body: Record<string, unknown>): Promise<DocumentListItem> {
  return apiFetch<DocumentListItem>('/admin/documents', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}

/** PATCH /admin/documents/:id/status（切換狀態，ICSOPAdmin；切回有效重驗編號唯一性）。 */
export function setDocumentStatus(id: string, status: DocumentStatus): Promise<void> {
  return apiFetch<void>(`/admin/documents/${id}/status`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({ status }),
  });
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
