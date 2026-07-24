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
  /**
   * F038：1:1 回指之 LIFECYCLE_SNAPSHOT.id（同一交易內產生）。DB 層為 NULLable（既有表 ALTER ADD，
   * 無回填正式資料）；應用層每筆新寫入之列於交易提交前恆補上（見 §A.4 交易一致性）。migration 前之
   * 遺留舊列（若有）為 null → §B 重建視為「無可用快照的更早紀錄」，優雅降級為空圖。
   */
  snapshotId?: string | null;
}

export interface LifecycleChangeLogStore {
  append(row: LifecycleChangeLogRow): Promise<void>;
  listAll(): Promise<LifecycleChangeLogRow[]>;
  listByLifecycle(lifecycleId: string): Promise<LifecycleChangeLogRow[]>;
  /** F038 §B 重建：依 id 取單筆變更日誌列；查無回 null。 */
  findById(id: string): Promise<LifecycleChangeLogRow | null>;
  /**
   * F038 §B 重建：取同 lifecycleId、occurredAt 嚴格早於 before 之最近一筆（「變更前」端點錨定）；
   * 無更早紀錄回 null（循環第一筆事件 → 重建視為空 DAG）。
   */
  findPredecessor(lifecycleId: string, before: Date): Promise<LifecycleChangeLogRow | null>;
}

export const LIFECYCLE_CHANGE_LOG_STORE = Symbol('LIFECYCLE_CHANGE_LOG_STORE');
