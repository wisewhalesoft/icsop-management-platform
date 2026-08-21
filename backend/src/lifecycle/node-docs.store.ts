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

/**
 * F036 樹狀圖節點雙擊之唯讀文件清單列（architecture-spec §10.5）。
 * 五欄全落在 ICSOP_DOCUMENT 單表 ⇒ 一次 WHERE 即取全，無 N+1。
 * 🔴 回原始 `status`／`announcedDate`，**不回**已衍生之中文徽章字串——徽章由前端以與後台
 * 同一份 `display-status` 純函式衍生，前後台顯示規則因此不可能分歧。
 */
export interface NodeMountedDoc {
  id: string;
  documentNumber: string;
  documentName: string;
  edition: string | null;
  status: string;
  announcedDate: string | null;
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
   * G-LC-015：掛載於**其他循環**（nodeId 非空且 lifecycleId≠本循環）之文件數。
   * 供抽屜候選過濾註記「另有 N 份掛載於其他循環（已排除）」。選填能力——未提供之 fake → excludedCount=0。
   */
  countDocsMountedInOtherLifecycles?(lifecycleId: string): Promise<number>;
  /**
   * F038 交易一致性（選填能力，architecture-spec §5.9）：於**同一 DB 交易**內執行掛載/改派/移除 ＋
   * `tx.recordStructuralChange(event)`（LIFECYCLE_CHANGE_LOG ＋ LIFECYCLE_SNAPSHOT），任一失敗整批回滾。
   */
  runStructuralChange?<T>(
    work: (tx: import('./lifecycle-structural-change').NodeDocsStructuralTx) => Promise<T>,
  ): Promise<T>;
  /**
   * F036 delta：該節點掛載之程序書（含版次／狀態／公告日期）。選填能力——未提供之既有 fake
   * 一律降級為空清單（不新增必填方法以免打爆既有 store 實作者）。
   */
  listNodeMountedDocs?(lifecycleId: string, nodeId: string): Promise<NodeMountedDoc[]>;
  /**
   * F036 子樹抽屜 delta（架構決策 C2，architecture-spec §12.2）：`listNodeMountedDocs` 之批次版，
   * 避免對子樹逐節點各發一次查詢。回傳 nodeId → 該節點掛載之程序書（`NodeMountedDoc` 既有形狀）。
   * 選填能力——未提供時，服務層 fallback 為對子樹每個節點各呼叫一次既有 `listNodeMountedDocs()`。
   */
  listNodesMountedDocs?(
    lifecycleId: string,
    nodeIds: string[],
  ): Promise<Map<string, NodeMountedDoc[]>>;
}
