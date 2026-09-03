import { UsingDeptRef } from '../rbac/viewer-scope';

/**
 * F043 §己 前台業務/功能類別瀏覽之資料存取邊界（決策 E4，architecture-spec §14.6.3／§14.7）。
 *
 * 🔴 **deny-by-default 之唯一施加點在查詢層**（`AC-B22`）：本 store 只負責把**過濾所需之原料**
 * 一次撈齊（單一 JOIN），可見性判定則由服務層以既有純函式
 * `isDocVisibleToViewer()`／已公告條件完成——**不得**先取全量再由前端隱藏。
 *
 * 🔴 **不得 N+1**：`listCategoryMountsForVisibility()` 為**單一類別之全量掛載明細**（一次查詢），
 * 服務層於記憶體 `GROUP BY nodeId` 計數；總查詢次數**與節點數無關**。
 */
export const PUBLIC_BUSINESS_CATEGORY_STORE = Symbol('PUBLIC_BUSINESS_CATEGORY_STORE');

/** 前台類別切換器之選項原料（`AC-B18`：僅 `active`；可見性由服務層再篩）。 */
export interface BusinessCategoryOption {
  id: string;
  name: string;
  subcategory: string | null;
  status: string;
}

/** 前台樹狀圖之節點（🔴 不含掛載數——那必須是**過濾後**之數字，由服務層算，`AC-B21`）。 */
export interface PublicCategoryNodeInfo {
  id: string;
  name: string | null;
  /** 畫布座標（選填；未提供之 store 一律降級為 0，佈局仍由 `buildTreeLayout()` 計算）。 */
  positionX?: number;
  positionY?: number;
}

/** 前台樹狀圖之邊。 */
export interface PublicCategoryEdgeInfo {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
}

/**
 * 決策 E4 之可見性過濾原料：`BUSINESS_CATEGORY_DOC ⋈ BUSINESS_CATEGORY_NODE ⋈ ICSOP_DOCUMENT`
 * ＋批次反查 `DOC_USING_DEPT`（固定 2 次查詢，與節點數無關）。
 */
export interface CategoryMountVisibilityRow {
  nodeId: string;
  documentId: string;
  /** 已公告判定之結果（`status = 有效 AND 公告日期 ≤ 今日`；由 store 以既有規則算出）。 */
  announced: boolean;
  usingDepts: UsingDeptRef[];
}

/** 前台節點抽屜之文件列（🔴 不含 `status`——前台只呈現已公告文件）。 */
export interface PublicMountedDoc {
  id: string;
  documentNumber: string;
  documentName: string;
  edition: string | null;
  announcedDate: string | null;
}

export interface PublicBusinessCategoryStore {
  /** `AC-B18`：`status = 'active'` 之全部類別（可見性由服務層再篩）。 */
  listActiveCategories(): Promise<BusinessCategoryOption[]>;
  /** 類別是否存在（不分 status；查無 → 服務層拋 `BUSINESS_CATEGORY_NOT_FOUND`）。 */
  categoryExists(id: string): Promise<boolean>;
  listNodes(businessCategoryId: string): Promise<PublicCategoryNodeInfo[]>;
  /** 決策 E4：單一類別之全量掛載明細（單一 JOIN；服務層據此套用可見性並計數）。 */
  listCategoryMountsForVisibility(
    businessCategoryId: string,
  ): Promise<CategoryMountVisibilityRow[]>;
  /** 取單一文件之前台呈現欄位；查無回 `null`。 */
  getMountedDoc(documentId: string): Promise<PublicMountedDoc | null>;
  /**
   * 樹狀圖之邊集合。**選填能力**——未提供之 fake store 一律降級為空陣列
   * （既有純單元測試只驗證節點與掛載數之過濾，不驗證連線）。
   */
  listEdges?(businessCategoryId: string): Promise<PublicCategoryEdgeInfo[]>;
}
