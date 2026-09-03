/**
 * F043 §乙 DAG 節點／邊之資料存取邊界（比照 `../lifecycle/dag.store.ts`）。
 *
 * 🔴 **防環演算法「不」在本檔**（決策 E2，architecture-spec §14.6.1）：`classifyEdge`／
 * `isReachable` 直接 import 既有 `../lifecycle/dag-cycle`，**不複製第二份**；錯誤碼之對映
 * 完全在 `BusinessCategoryDagService` 內部完成（共用的是演算法、不是錯誤碼，`AC-16`）。
 */
export const BUSINESS_CATEGORY_DAG_STORE = Symbol('BUSINESS_CATEGORY_DAG_STORE');

export interface BusinessCategoryNodeView {
  id: string;
  businessCategoryId: string;
  name: string | null;
  positionX: number;
  positionY: number;
  /** 掛載於此節點之**相異文件數**（`listNodes` 填入；比照 `NodeView.docCount`）。 */
  docCount?: number;
}

export interface BusinessCategoryEdgeRow {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
}

export interface BusinessCategoryGraph {
  nodes: BusinessCategoryNodeView[];
  edges: BusinessCategoryEdgeRow[];
}

export interface CreateBusinessCategoryNodeInput {
  name: string | null;
  positionX: number;
  positionY: number;
}

export interface BusinessCategoryDagStore {
  businessCategoryExists(businessCategoryId: string): Promise<boolean>;
  listNodes(businessCategoryId: string): Promise<BusinessCategoryNodeView[]>;
  listEdges(businessCategoryId: string): Promise<BusinessCategoryEdgeRow[]>;
  nodeExists(businessCategoryId: string, nodeId: string): Promise<boolean>;
  createNode(
    businessCategoryId: string,
    input: CreateBusinessCategoryNodeInput,
  ): Promise<BusinessCategoryNodeView>;
  updateNode(
    nodeId: string,
    patch: { name?: string | null; positionX?: number; positionY?: number },
  ): Promise<BusinessCategoryNodeView>;
  /**
   * 刪除節點（`AC-18`）。
   *
   * 🔴 與 `DagStore.deleteNodeWithEdges` 之關鍵差異（決策 E8，architecture-spec §14.6.7）：
   * 本方法之 TypeORM 實作於**同一交易內**額外刪除該節點之全部 `BUSINESS_CATEGORY_DOC` 列
   * ——`nodeId` 側刻意**不**用 DB FK CASCADE，因為 `AC-18` 需要**刪除前**之計數以驅動二次確認
   * （FK CASCADE 無法提供這個時序），且顯式 SQL 在交易邊界之可見性與可測試性優於隱式觸發。
   */
  deleteNodeWithEdges(nodeId: string): Promise<void>;
  /** `AC-18` 刪除前確認提示所需之「將移除 N 筆掛載關係」計數（**單次 COUNT**，非事後比對）。 */
  countNodeMounts(nodeId: string): Promise<number>;
  createEdge(
    businessCategoryId: string,
    source: string,
    target: string,
  ): Promise<BusinessCategoryEdgeRow>;
  deleteEdge(edgeId: string): Promise<void>;
  /**
   * 選填能力，語意同 `DagStore.runStructuralChange`：未提供之 fake → service 走
   * 「結構寫入 ＋ publisher.publish（no snapshot）」之退化路徑（既有純單元測試不驗證快照）。
   */
  runStructuralChange?<T>(
    work: (
      tx: import('./business-category-structural-change').BusinessCategoryDagStructuralTx,
    ) => Promise<T>,
  ): Promise<T>;
}
