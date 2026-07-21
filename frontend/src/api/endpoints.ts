import { apiFetch } from './client';
import type { SessionUser, SyncRunSummary, SyncResult } from './types';

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
