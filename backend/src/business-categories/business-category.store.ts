/**
 * F043 §甲 業務/功能類別池之資料存取邊界（比照 `../lifecycle/lifecycle.store.ts`）。
 * 介面草案權威＝docs/specs/architecture-spec.md §14.3。
 */
export const BUSINESS_CATEGORY_STORE = Symbol('BUSINESS_CATEGORY_STORE');

export type BusinessCategoryStatus = 'active' | 'inactive';

export interface BusinessCategoryView {
  id: string;
  name: string;
  /** 恆為 `null` 或非空 trim 字串（INV-B3；不得落地空字串）。 */
  subcategory: string | null;
  description: string | null;
  status: BusinessCategoryStatus;
  nodeCount: number;
  /**
   * 去重後之**相異掛載文件數**（`AC` 甲-3）。
   * 🔴 SQL `COUNT(DISTINCT documentId)` 下推，**非** JS 去重——同一份文件可掛在同一類別之多個
   * 節點（`AC-21`），數列數會得到比實際文件數大的值。
   */
  mountedDocCount: number;
  updatedAt: Date;
}

export interface CreateBusinessCategoryInput {
  name: string;
  /** 服務層已以 `normalizeSubcategory` 正規化（無值＝`null`）。 */
  subcategory: string | null;
  description: string | null;
}

export interface UpdateBusinessCategoryPatch {
  name?: string;
  /** **三態**：`undefined`＝不修改／`null`＝清空／字串＝設定（服務層已正規化）。 */
  subcategory?: string | null;
  description?: string | null;
  status?: BusinessCategoryStatus;
}

export interface BusinessCategoryStore {
  list(): Promise<BusinessCategoryView[]>;
  findById(id: string): Promise<BusinessCategoryView | null>;
  create(input: CreateBusinessCategoryInput): Promise<BusinessCategoryView>;
  update(id: string, patch: UpdateBusinessCategoryPatch): Promise<BusinessCategoryView>;
  /**
   * 刪除保護（`AC-12`）：該類別仍掛載之**相異文件數**。
   * `ICSOP_DOCUMENT`／`BUSINESS_CATEGORY_DOC` 未建時回 0（容錯，比照既有 store）。
   */
  countMountedDocuments(id: string): Promise<number>;
  /** 清單富化：全類別之掛載文件數（**單次** GROUP BY，比照 `countMountedByLifecycle`；無 N+1）。 */
  countMountedByCategory(): Promise<Map<string, number>>;
  /** 刪除類別（含其節點／邊；掛載列已由呼叫端事前檢查為 0，見 `AC-12`）。 */
  delete(id: string): Promise<void>;
}
