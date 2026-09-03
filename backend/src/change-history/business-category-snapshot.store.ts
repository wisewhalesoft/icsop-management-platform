import { SnapshotGraph } from '../lifecycle/lifecycle-snapshot-builder';

/**
 * F043 §戊 業務/功能類別結構快照（`BUSINESS_CATEGORY_SNAPSHOT`）store 契約。
 *
 * 每筆 `BUSINESS_CATEGORY_CHANGE_LOG` 於同一交易內產生一份自足結構快照（1:1，`changeLogId`
 * 回指）。供新舊樹重建（`AC-41`）唯讀查詢；寫入路徑於結構交易內以 `EntityManager` 直接落地
 * （見 `business-category-structural-recorder.ts`），故本 store **僅暴露讀取**
 * （append-only，結構上不暴露 update/delete）。
 */
export interface BusinessCategorySnapshotRecord {
  id: string;
  businessCategoryId: string;
  /** 1:1 回指之變更日誌列 id。 */
  changeLogId: string;
  /** 反序列化後之完整結構快照（`nodesJson`／`edgesJson` parse 之結果）。 */
  graph: SnapshotGraph;
  capturedAt: Date;
}

export interface BusinessCategorySnapshotStore {
  /** 依變更日誌列 id 取其快照（1:1）；查無回 `null`。 */
  findByChangeLogId(changeLogId: string): Promise<BusinessCategorySnapshotRecord | null>;
  /** 依快照 id 取快照；查無回 `null`。 */
  findById(id: string): Promise<BusinessCategorySnapshotRecord | null>;
}

export const BUSINESS_CATEGORY_SNAPSHOT_STORE = Symbol('BUSINESS_CATEGORY_SNAPSHOT_STORE');
