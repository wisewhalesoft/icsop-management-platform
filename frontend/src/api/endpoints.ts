import { apiFetch } from './client';
import type {
  SessionUser,
  SyncRunSummary,
  SyncResult,
  AccountView,
  AccountFilters,
} from './types';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** GET /auth/me（受保護；401 AUTH_SESSION_EXPIRED 代表未登入/逾時）。 */
export function getMe(): Promise<SessionUser> {
  return apiFetch<SessionUser>('/auth/me');
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
