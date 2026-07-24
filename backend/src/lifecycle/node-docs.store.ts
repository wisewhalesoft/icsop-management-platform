/**
 * F009 節點抽屜之資料存取邊界。文件「所屬節點」＝ICSOP_DOCUMENT.nodeId（一份文件僅屬一節點）。
 * 跨 LIFECYCLE_NODE（節點名）與 ICSOP_DOCUMENT（nodeId）。
 */
export const NODE_DOCS_STORE = Symbol('NODE_DOCS_STORE');

export interface NodeInfo {
  id: string;
  lifecycleId: string;
  name: string | null;
}

export interface DocRef {
  id: string;
  documentNumber: string;
  documentName: string;
  nodeId: string | null;
}

export interface DocLite {
  id: string;
  lifecycleId: string;
  nodeId: string | null;
}

export interface NodeDocsStore {
  getNode(lifecycleId: string, nodeId: string): Promise<NodeInfo | null>;
  /** 該循環全部文件（含其現行 nodeId），供掛載/候選判定（後端以 lifecycleId 過濾，F009 定案）。 */
  listLifecycleDocs(lifecycleId: string): Promise<DocRef[]>;
  getDoc(docId: string): Promise<DocLite | null>;
  setDocNode(docId: string, nodeId: string | null): Promise<void>;
  /** 節點 id → 名稱（供候選文件顯示「已掛載於 {節點}」）。 */
  nodeNames(nodeIds: string[]): Promise<Map<string, string | null>>;
  /**
   * F038 交易一致性（選填能力，architecture-spec §5.9）：於**同一 DB 交易**內執行掛載/改派/移除 ＋
   * `tx.recordStructuralChange(event)`（LIFECYCLE_CHANGE_LOG ＋ LIFECYCLE_SNAPSHOT），任一失敗整批回滾。
   */
  runStructuralChange?<T>(
    work: (tx: import('./lifecycle-structural-change').NodeDocsStructuralTx) => Promise<T>,
  ): Promise<T>;
}
