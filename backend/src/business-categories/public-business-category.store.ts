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

/**
 * 🔵 2026-09-22 UX16 delta（F019 `AC-UX18`，項 9）：前台詳情頁「業務/功能類別」欄之對外形狀。
 *
 * 🔴 **刻意不含 `nodeId`**：後台之同型查詢（`listCategoriesByDocumentIds()`）回傳掛載列層級
 * （含 `nodeId`）供欄位富化再去重；本方法回傳的**已經是**去重後之對外 DTO 形狀。兩者若共用
 * 一支函式，那支函式就得同時滿足兩種回傳形狀——那才是真正會漂移的介面（架構 §16.10 ②）。
 */
export interface PublicDocumentBusinessCategory {
  id: string;
  /** `businessCategoryDisplayName()` 之輸出（含子分類時為 `名稱（子分類）`）；前端不自行組字。 */
  displayName: string;
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
  /**
   * 🔵 2026-09-22 UX16 delta（F019 `AC-UX18`／架構 §16.10 `ARCH-UX10`，項 9）：
   * 單一文件掛載之**相異**業務/功能類別（依 `businessCategoryId` 去重，去重規則逐字同
   * [F017] `AC-B3`）。
   *
   * 🔴 **`status` 不過濾**：停用（`inactive`）類別之**既有掛載仍顯示**——逐字比照 F017 `AC-B7`
   * ⚠ 段之既有裁決（顯示歷史事實 vs 不引導新篩選是兩件事）。後台之
   * `listCategoriesByDocumentIds()` 之 SQL 亦無 `WHERE c.status = 'active'`，兩者同構。
   *
   * 🔴 **選填能力**：既有測試替身（`public-business-category.service.spec.ts` 之 `FakeStore`）
   * 以 `implements PublicBusinessCategoryStore` 宣告，加必要方法會把一個 additive 欄位變成
   * 那些檔案的編譯錯誤。未提供者 ⇒ 消費端一律降級為空陣列（`AC-UX19` ① 之 `—`），不拋錯。
   */
  listCategoriesForDocument?(documentId: string): Promise<PublicDocumentBusinessCategory[]>;
}
