import { SnapshotGraph } from '../lifecycle/lifecycle-snapshot-builder';

/**
 * F038 循環樹狀圖變更快照（LIFECYCLE_SNAPSHOT）store 契約。
 *
 * 每筆 LIFECYCLE_CHANGE_LOG 於同一交易內產生一份自足結構快照（1:1，changeLogId 回指）。
 * 供新舊樹重建（§B）唯讀查詢；寫入路徑於結構交易內以 EntityManager 直接落地（見
 * lifecycle-structural-recorder.ts），故本 store 僅暴露讀取（append-only，結構上不暴露 update/delete）。
 */

export interface LifecycleSnapshotRecord {
  id: string;
  lifecycleId: string;
  /** 1:1 回指之變更日誌列 id。 */
  changeLogId: string;
  /** 反序列化後之完整結構快照（nodesJson/edgesJson parse 之結果）。 */
  graph: SnapshotGraph;
  capturedAt: Date;
}

export interface LifecycleSnapshotStore {
  /** 依變更日誌列 id 取其快照（1:1）；查無回 null。 */
  findByChangeLogId(changeLogId: string): Promise<LifecycleSnapshotRecord | null>;
  /** 依快照 id 取快照；查無回 null。 */
  findById(id: string): Promise<LifecycleSnapshotRecord | null>;
}

export const LIFECYCLE_SNAPSHOT_STORE = Symbol('LIFECYCLE_SNAPSHOT_STORE');
