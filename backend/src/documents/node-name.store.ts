/**
 * 節點名稱讀取邊界（G-DOC-205/301）。文件之 nodeId 屬 LIFECYCLE_NODE（lifecycle 領域）；
 * 為讓單筆文件檢視顯示「所屬節點」名而非裸 nodeId，於 documents 模組自建窄口徑讀取埠。
 *
 * 反循環：documents 不 import LifecycleModule；以 store-token + AppDataSource 單例自建 TypeOrm adapter
 * （比照 DocumentEditionReader / ATTACHMENT_STORE 之既定作法）。
 */
export const NODE_NAME_STORE = Symbol('NODE_NAME_STORE');

export interface NodeNameStore {
  /** 依節點 id 取節點名（未命名節點→null；查無→null，不拋錯）。 */
  findNameById(nodeId: string): Promise<string | null>;
}
