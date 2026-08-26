/** DAG 節點/邊資料存取邊界（F008）。 */
export const DAG_STORE = Symbol('DAG_STORE');

export interface NodeView {
  id: string;
  lifecycleId: string;
  name: string | null;
  positionX: number;
  positionY: number;
  /** 掛載於此節點之文件數（F009；listNodes 填入，其餘情境省略）。 */
  docCount?: number;
}

export interface EdgeRow {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
}

export interface DagGraph {
  nodes: NodeView[];
  edges: EdgeRow[];
}

export interface CreateNodeInput {
  name: string | null;
  positionX: number;
  positionY: number;
}

export interface DagStore {
  lifecycleExists(lifecycleId: string): Promise<boolean>;
  listNodes(lifecycleId: string): Promise<NodeView[]>;
  listEdges(lifecycleId: string): Promise<EdgeRow[]>;
  nodeExists(lifecycleId: string, nodeId: string): Promise<boolean>;
  createNode(lifecycleId: string, input: CreateNodeInput): Promise<NodeView>;
  updateNode(
    nodeId: string,
    patch: { name?: string | null; positionX?: number; positionY?: number },
  ): Promise<NodeView>;
  /** 刪除節點並連動刪除觸及該節點之所有邊（單一交易）。 */
  deleteNodeWithEdges(nodeId: string): Promise<void>;
  /**
   * 解除掛載於該節點之全部文件（`ICSOP_DOCUMENT.nodeId` → NULL），回傳受影響筆數（選填能力）。
   *
   * 🔴 `ICSOP_DOCUMENT.nodeId` 對 `LIFECYCLE_NODE` **無 FK**（見 1721865600000-icsop-document），刪節點
   * 若不一併解除掛載會留下懸空 nodeId ——「孤兒掛載」：文件在畫布/樹狀圖上完全看不見，卻仍被判為
   * 「已掛載於其他節點」而在他節點抽屜觸發空白節點名之改派警示。
   *
   * TypeOrmDagStore 之 `deleteNodeWithEdges` 於**同一交易內**自行解除（不可繞過之不變式）；本方法供
   * 服務層事前取得筆數以寫入變更歷程摘要。未提供之 fake → DagService 跳過（行為不變）。
   */
  unmountNodeDocs?(nodeId: string): Promise<number>;
  /** 建立邊（TypeORM 實作於交易內再驗成環，防跨請求競態）。 */
  createEdge(lifecycleId: string, source: string, target: string): Promise<EdgeRow>;
  deleteEdge(edgeId: string): Promise<void>;
  /**
   * F038 交易一致性（選填能力，architecture-spec §5.9）：於**同一 DB 交易**內執行結構寫入 ＋
   * `tx.recordStructuralChange(event)`（LIFECYCLE_CHANGE_LOG ＋ LIFECYCLE_SNAPSHOT），任一失敗整批回滾。
   * 生產（TypeOrmDagStore）提供之 → DagService 走原子路徑；未提供之 fake → 退化循序路徑（見
   * lifecycle-structural-change.ts）。
   */
  runStructuralChange?<T>(
    work: (tx: import('./lifecycle-structural-change').DagStructuralTx) => Promise<T>,
  ): Promise<T>;
}
