import { BusinessCategoryNodeView, BusinessCategoryEdgeRow } from './business-category-dag.store';
import { BusinessCategoryNodeInfo } from './business-category-docs.store';
import { BusinessCategoryChangedEvent } from './business-category-change-event';

/**
 * F043 §戊 交易一致性（比照 `../lifecycle/lifecycle-structural-change.ts`，語意逐字對等）：
 * 結構變更（§乙／§丙）與其 `BUSINESS_CATEGORY_CHANGE_LOG` 事件 ＋ `BUSINESS_CATEGORY_SNAPSHOT`
 * 快照，三者於**同一 DB 交易**內提交；任一失敗整批回滾（不留孤兒快照、不留與結構不同步之日誌）。
 *
 * store 以**選填能力** `runStructuralChange` 暴露交易邊界：
 *  - 生產（TypeOrm* store）提供之 → service 走原子路徑（真實交易）；
 *  - 純單元測試之 fake store 未提供 → 退化為「結構寫入 ＋ publisher.publish」之循序路徑
 *    （行為不變，僅不含快照；那些測試不驗證快照）。
 */

/** 交易內之結構變更記錄能力（兩個 Tx 介面共用）。 */
export interface RecordsBusinessCategoryStructuralChange {
  recordStructuralChange(
    event: BusinessCategoryChangedEvent,
  ): Promise<{ changeLogId: string; snapshotId: string }>;
}

/** DAG（§乙）結構交易之操作面（manager-bound 版本；語意同 `BusinessCategoryDagStore` 對應方法）。 */
export interface BusinessCategoryDagStructuralTx
  extends RecordsBusinessCategoryStructuralChange {
  createNode(
    businessCategoryId: string,
    input: { name: string | null; positionX: number; positionY: number },
  ): Promise<BusinessCategoryNodeView>;
  updateNode(
    nodeId: string,
    patch: { name?: string | null; positionX?: number; positionY?: number },
  ): Promise<BusinessCategoryNodeView>;
  /** 🔴 同交易內另刪該節點之全部 `BUSINESS_CATEGORY_DOC` 列（決策 E8）。 */
  deleteNodeWithEdges(nodeId: string): Promise<void>;
  /** `AC-18` 之「將移除 N 筆掛載關係」計數（刪除**之前**取得，供二次確認提示）。 */
  countNodeMounts(nodeId: string): Promise<number>;
  createEdge(
    businessCategoryId: string,
    source: string,
    target: string,
  ): Promise<BusinessCategoryEdgeRow>;
  deleteEdge(edgeId: string): Promise<void>;
  listNodes(businessCategoryId: string): Promise<BusinessCategoryNodeView[]>;
  listEdges(businessCategoryId: string): Promise<BusinessCategoryEdgeRow[]>;
  nodeExists(businessCategoryId: string, nodeId: string): Promise<boolean>;
}

/** 節點掛載（§丙）結構交易之操作面（manager-bound 版本；語意同 `BusinessCategoryDocsStore`）。 */
export interface BusinessCategoryDocsStructuralTx
  extends RecordsBusinessCategoryStructuralChange {
  getNode(
    businessCategoryId: string,
    nodeId: string,
  ): Promise<BusinessCategoryNodeInfo | null>;
  mount(
    nodeId: string,
    documentId: string,
    mountedByAccountId: string,
    mountedAt: Date,
  ): Promise<void>;
  unmount(nodeId: string, documentId: string): Promise<boolean>;
}
