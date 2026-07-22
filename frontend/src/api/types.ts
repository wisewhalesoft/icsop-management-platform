/**
 * 後端 API 傳輸型別（over-the-wire）。
 * 權威來源：backend/src/auth/session-token.service.ts（SessionUser）、
 * backend/src/org-sync/org-sync.types.ts（SyncRunSummary / SyncResult / SyncStats）。
 * ⚠ JSON 序列化後 Date → ISO 字串，故時間欄位型別為 string。
 */

/** GET /auth/me 回傳。 */
export interface SessionUser {
  loginId: string;
  email: string;
  companyCode: string;
  roleCode?: string;
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
