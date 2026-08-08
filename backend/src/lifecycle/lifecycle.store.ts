/** 循環資料存取邊界（F007）。 */
export const LIFECYCLE_STORE = Symbol('LIFECYCLE_STORE');

export type LifecycleStatus = 'active' | 'inactive';

export interface LifecycleView {
  id: string;
  name: string;
  /**
   * F040 子分類（非必填）。無值恆為 `null`（不得為空字串，INV-3）。
   * 循環之業務身分＝`(name, subcategory)` 組合；顯示一律經 `lifecycleDisplayName`。
   * 選填宣告以免既有 fixture／呼叫端需大改（缺鍵＝無子分類）。
   */
  subcategory?: string | null;
  description: string | null;
  status: LifecycleStatus;
  nodeCount: number;
  updatedAt: Date;
  /** G-LC-002 掛載文件數（該循環之 ICSOP_DOCUMENT 數）。清單頁「掛載文件」欄；由服務層批次填入。 */
  mountedDocCount?: number;
}

export interface CreateLifecycleInput {
  name: string;
  /** F040 子分類；服務層以 normalizeSubcategory 正規化後傳入（無值＝`null`）。 */
  subcategory?: string | null;
  description: string | null;
}

export interface UpdateLifecyclePatch {
  name?: string;
  /**
   * F040 子分類（**三態**）：`undefined`＝不修改該欄位、`null`＝清空、字串＝設定。
   * 服務層已於此前正規化（空白字串 → `null`）。
   */
  subcategory?: string | null;
  description?: string | null;
  status?: LifecycleStatus;
}

export interface LifecycleStore {
  list(): Promise<LifecycleView[]>;
  findById(id: string): Promise<LifecycleView | null>;
  create(input: CreateLifecycleInput): Promise<LifecycleView>;
  update(id: string, patch: UpdateLifecyclePatch): Promise<LifecycleView>;
  /** 該循環仍掛載之文件數（刪除保護，OQ-E03-03）。ICSOP_DOCUMENT 未建時回 0。 */
  countMountedDocuments(id: string): Promise<number>;
  /** G-LC-002 清單富化：全循環之掛載文件數（單次 GROUP BY；ICSOP_DOCUMENT 未建→空 Map）。 */
  countMountedByLifecycle(): Promise<Map<string, number>>;
  /** 刪除循環（含其節點/連線）。 */
  delete(id: string): Promise<void>;
}
