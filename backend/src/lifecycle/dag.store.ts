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
