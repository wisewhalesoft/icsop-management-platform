/**
 * 循環結構變更事件 seam（F008/F009 → F038）。
 *
 * 比照 documents/document-change-event.ts（F037）之設計：本檔定義並「發出」DAG 結構變更事件契約；
 * 預設綁定為 no-op（lifecycle.module），changehistory 併回後由真實 publisher（LifecycleChangeLogPublisher）
 * 覆寫，持久化為 append-only 之 LIFECYCLE_CHANGE_LOG（F038）。
 *
 * 事件粒度＝逐原子操作（草案；OQ-E07-05 之「完整快照 vs diff 重放／聚合策略」屬架構決策，
 * 本輪落地逐事件日誌，新舊樹狀圖之並列重建待 system-architect，見 impl log flag）。
 */

/** DAG 結構變更類型（逐字沿用 F038 spec 草案列舉）。 */
export type LifecycleChangeType =
  | 'NODE_ADDED'
  | 'NODE_REMOVED'
  | 'NODE_RENAMED'
  | 'EDGE_ADDED'
  | 'EDGE_REMOVED'
  | 'DOCUMENT_MOUNTED'
  | 'DOCUMENT_UNMOUNTED'
  | 'DOCUMENT_REASSIGNED';

export interface LifecycleChangedEvent {
  lifecycleId: string;
  changeType: LifecycleChangeType;
  /** 人類可讀之變更摘要（供清單「變更摘要」欄，例：新增節點『撥款核准作業』）。 */
  summary: string;
  /** 舊值快照（節點舊名／來源節點等；無則 null）。 */
  oldValue?: string | null;
  /** 新值快照（節點新名／目標節點等；無則 null）。 */
  newValue?: string | null;
  /** 相關節點 id（供日後新舊樹重建定位；選填）。 */
  nodeId?: string | null;
  /** 操作者帳號 UUID（= SessionUser.accountId）。 */
  actorId?: string | null;
  actorName?: string | null;
  actorEmployeeNo?: string | null;
  occurredAt: Date;
}

export interface LifecycleChangePublisher {
  publish(event: LifecycleChangedEvent): Promise<void>;
}

/** 操作者身分快照（F038；由 controller 自 SessionUser 帶入）。 */
export interface LifecycleActor {
  accountId?: string | null;
  name?: string | null;
  employeeNo?: string | null;
}

/** 結構變更發射情境：lifecycleId（供摘要重建 old 值）＋操作者快照。皆選填以免破壞既有純建構單測。 */
export interface LifecycleEmitContext {
  lifecycleId?: string;
  actor?: LifecycleActor;
}

/** DI token；lifecycle.module 預設綁 Noop，changehistory 併回後覆寫為 LifecycleChangeLogPublisher。 */
export const LIFECYCLE_CHANGE_PUBLISHER = Symbol('LIFECYCLE_CHANGE_PUBLISHER');

/** 預設 no-op 綁定：接受事件但不做任何事（不阻斷來源交易）。 */
export class NoopLifecycleChangePublisher implements LifecycleChangePublisher {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async publish(_event: LifecycleChangedEvent): Promise<void> {
    // 預設不落地；F038 到位後由真實 publisher 覆寫此綁定。
  }
}
