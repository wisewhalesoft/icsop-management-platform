/**
 * F038 循環樹狀圖變更日誌（LIFECYCLE_CHANGE_LOG）store 契約。
 *
 * append-only DAG 結構變更事件日誌：每列＝一次原子結構變更（新增/刪除節點、改名、新增/刪除連線、
 * 文件掛載/改派/移除）。與「僅保存當前版本」調和——非保留完整歷史版本檔（見 F038 spec）。
 *
 * ⚠ 不可竄改（比照 AUDIT_LOG）：store 介面**結構上不暴露** update/delete/remove；僅 append＋讀。
 */

export interface LifecycleChangeLogRow {
  id: string;
  lifecycleId: string;
  /** 結構變更類型（NODE_ADDED / EDGE_ADDED / NODE_RENAMED / DOCUMENT_MOUNTED …）。 */
  changeType: string;
  /** 人類可讀之變更摘要。 */
  summary: string;
  oldValue: string | null;
  newValue: string | null;
  nodeId: string | null;
  actorId: string | null;
  actorName: string | null;
  actorEmployeeNo: string | null;
  occurredAt: Date;
}

export interface LifecycleChangeLogStore {
  append(row: LifecycleChangeLogRow): Promise<void>;
  listAll(): Promise<LifecycleChangeLogRow[]>;
  listByLifecycle(lifecycleId: string): Promise<LifecycleChangeLogRow[]>;
}

export const LIFECYCLE_CHANGE_LOG_STORE = Symbol('LIFECYCLE_CHANGE_LOG_STORE');
