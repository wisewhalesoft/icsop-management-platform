/**
 * F043 §丙 M:N 掛載之資料存取邊界。
 *
 * 🔴 **語意與 `../lifecycle/node-docs.store.ts` 刻意相反**（error-handling.md#business-category
 * 第四小節之逐條對照表）：
 *  · 候選＝**全部 ICSOP 文件**，不施加任何循環條件（`AC-20`）；
 *  · 掛載為 **M:N**：掛在別的節點／別的類別／已有 `ICSOP_DOCUMENT.nodeId` 者，一律允許、
 *    無警示、無二次確認、**無改派**（`AC-21`～`AC-23`／`AC-30`）；
 *  · 唯一之衝突是「同一節點重複掛同一份文件」（INV-B6 → `BUSINESS_CATEGORY_DOC_ALREADY_MOUNTED`）。
 *
 * 🔴 INV-B4：本介面**結構上沒有任何寫入 `ICSOP_DOCUMENT` 之方法**——`mount`／`unmount` 僅操作
 * `BUSINESS_CATEGORY_DOC` 列，型別系統本身即保證文件之循環掛載不受影響。
 */
export const BUSINESS_CATEGORY_DOCS_STORE = Symbol('BUSINESS_CATEGORY_DOCS_STORE');

export interface BusinessCategoryNodeInfo {
  id: string;
  businessCategoryId: string;
  name: string | null;
}

/**
 * 候選文件列（`AC-20`）。
 *
 * 🔴 **查詢型別上不存在任何循環過濾鍵**（見 `listCandidateDocs` 之簽章）——本功能之候選
 * **不以循環過濾**。
 * ⚠ 下列 `lifecycleId`／`lifecycleName`／`otherMounts` 為**純資訊欄位**（供抽屜呈現
 * 「這份文件目前掛在哪裡」），**不參與任何過濾**；把它們讀成過濾條件即違反 `AC-20`。
 * 皆宣告為選填——未提供之 store 一律降級為「不呈現該資訊」，既有測試零漣漪。
 */
export interface CandidateDocRef {
  id: string;
  documentNumber: string;
  documentName: string;
  /** 純資訊：該文件之循環歸屬（`AC-20`：**不參與過濾**）。 */
  lifecycleId?: string | null;
  lifecycleName?: string | null;
  /** 純資訊：該文件已掛在哪些其他類別／節點（`AC-21`～`AC-23`；`[]`＝未掛在別處）。 */
  otherMounts?: CandidateOtherMount[];
}

/** 候選文件之「已掛在他處」資訊（🔴 純資訊，**不觸發任何警示或二次確認**，`AC-21`～`AC-23`）。 */
export interface CandidateOtherMount {
  /** 他處類別之顯示名稱（`businessCategoryDisplayName()` 之輸出）。 */
  businessCategoryDisplayName: string;
  nodeName: string | null;
}

/** 節點掛載之文件列（比照 `NodeMountedDoc`，逐字同形狀；不同來源表）。 */
export interface CategoryMountedDoc {
  id: string;
  documentNumber: string;
  documentName: string;
  edition: string | null;
  status: string;
  announcedDate: string | null;
}

/**
 * 決策 E5（architecture-spec §14.6.4）：某份文件掛載之**相異**業務/功能類別。
 * 🔴 **去重責任在 store 層**——本型別已是「依 `businessCategoryId` 去重後」之結果
 * （同一份文件掛在同類別之多個節點只留一筆，F017 `AC-B3`）；呼叫端不得再數列數。
 */
export interface DocumentBusinessCategoryRef {
  id: string;
  displayName: string;
}

export interface BusinessCategoryDocsStore {
  getNode(businessCategoryId: string, nodeId: string): Promise<BusinessCategoryNodeInfo | null>;
  /**
   * 🔴 `AC-20` 之落地：候選＝全部 ICSOP 文件（分頁＋關鍵字）。簽章**不接受** `lifecycleId`／
   * `businessCategoryId` 之類的過濾參數——這不是「傳了但沒用」，而是介面上根本不存在該參數。
   */
  listCandidateDocs(query: {
    keyword?: string;
    page: number;
    pageSize: number;
  }): Promise<{ items: CandidateDocRef[]; total: number }>;
  /**
   * 掛載一筆。INV-B6 由 DB 唯一鍵 ＋ 服務層之應用層預檢**雙保險**；底層唯一鍵違反時本方法
   * 拋出驅動層原始錯誤，由服務層轉譯為 `BUSINESS_CATEGORY_DOC_ALREADY_MOUNTED`。
   */
  mount(
    nodeId: string,
    documentId: string,
    mountedByAccountId: string,
    mountedAt: Date,
  ): Promise<void>;
  /** 移除一筆；不存在回 `false`（服務層轉 404 `BUSINESS_CATEGORY_MOUNT_NOT_FOUND`，🔴 不採靜默 200）。 */
  unmount(nodeId: string, documentId: string): Promise<boolean>;
  listNodeMountedDocs(
    businessCategoryId: string,
    nodeId: string,
  ): Promise<CategoryMountedDoc[]>;
  /** 子樹抽屜批次版（比照 `listNodesMountedDocs`，避免逐節點查詢；`AC-35`）。 */
  listNodesMountedDocs(
    businessCategoryId: string,
    nodeIds: string[],
  ): Promise<Map<string, CategoryMountedDoc[]>>;
  /**
   * 決策 E5：F017 第 16 欄／CSV 第 15 欄之防 N+1 批次反查（**單一 JOIN**；空 ids → 空 Map）。
   * 🔴 回傳值**已依 `businessCategoryId` 去重**（`AC-B3`）——去重責任在本層，
   * 呼叫端拿到的就是「相異類別」之陣列，`N` 即其長度。
   * **選填能力**——未提供之 fake store 一律降級為「無類別」，既有測試零漣漪。
   */
  listCategoriesByDocumentIds?(
    documentIds: string[],
  ): Promise<Map<string, DocumentBusinessCategoryRef[]>>;
  /** 選填能力，語意同 `NodeDocsStore.runStructuralChange`。 */
  runStructuralChange?<T>(
    work: (
      tx: import('./business-category-structural-change').BusinessCategoryDocsStructuralTx,
    ) => Promise<T>,
  ): Promise<T>;
}
