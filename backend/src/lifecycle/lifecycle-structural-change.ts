import { NodeView, EdgeRow, CreateNodeInput } from './dag.store';
import { DocLite, DocRef, NodeInfo } from './node-docs.store';
import { LifecycleChangedEvent } from './lifecycle-change-event';

/**
 * F038 交易一致性（architecture-spec §5.9）：結構變更（F008/F009）與其 LIFECYCLE_CHANGE_LOG 事件 ＋
 * LIFECYCLE_SNAPSHOT 快照，三者於**同一 DB 交易**內提交；任一失敗整批回滾（不留孤兒快照、不留與結構
 * 不同步之日誌）。
 *
 * store 以選填能力 `runStructuralChange` 暴露交易邊界（見 dag.store / node-docs.store）：
 *  - 生產（TypeOrm* store）提供之 → DagService/NodeDocsService 走原子路徑（真實交易）；
 *  - 既有純單元測試之 fake store 未提供 → 退化為「結構寫入 + publisher.publish」之循序路徑（行為不變，
 *    僅不含快照；那些測試不驗證快照）。
 *
 * `recordStructuralChange(event)` 由交易內以當下 manager 重新查詢節點/邊/掛載文件，組出自足快照，並將
 * changeLog 列與 snapshot 列以預先產生之 UUID 交叉回指、於同一交易落地（見 lifecycle-structural-recorder）。
 */

/** 交易內之結構變更記錄能力（DagStructuralTx / NodeDocsStructuralTx 共用）。 */
export interface RecordsStructuralChange {
  recordStructuralChange(
    event: LifecycleChangedEvent,
  ): Promise<{ changeLogId: string; snapshotId: string }>;
}

/** DAG（F008）結構交易之操作面（manager-bound 版本；語意同 DagStore 對應方法）。 */
export interface DagStructuralTx extends RecordsStructuralChange {
  createNode(lifecycleId: string, input: CreateNodeInput): Promise<NodeView>;
  updateNode(
    nodeId: string,
    patch: { name?: string | null; positionX?: number; positionY?: number },
  ): Promise<NodeView>;
  deleteNodeWithEdges(nodeId: string): Promise<void>;
  /** 解除該節點之全部文件掛載，回傳筆數（選填能力；語意同 DagStore.unmountNodeDocs）。 */
  unmountNodeDocs?(nodeId: string): Promise<number>;
  createEdge(lifecycleId: string, source: string, target: string): Promise<EdgeRow>;
  deleteEdge(edgeId: string): Promise<void>;
  listNodes(lifecycleId: string): Promise<NodeView[]>;
  listEdges(lifecycleId: string): Promise<EdgeRow[]>;
  nodeExists(lifecycleId: string, nodeId: string): Promise<boolean>;
}

/** 節點抽屜（F009）結構交易之操作面（manager-bound 版本；語意同 NodeDocsStore 對應方法）。 */
export interface NodeDocsStructuralTx extends RecordsStructuralChange {
  getNode(lifecycleId: string, nodeId: string): Promise<NodeInfo | null>;
  getDoc(docId: string): Promise<DocLite | null>;
  listLifecycleDocs(lifecycleId: string): Promise<DocRef[]>;
  setDocNode(docId: string, nodeId: string | null): Promise<void>;
}
