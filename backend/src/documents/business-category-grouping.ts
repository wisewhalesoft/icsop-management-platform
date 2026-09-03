/**
 * F017 delta `AC-B3`／`AC-B7`（＋architecture-spec §14.6.4 決策 E5）——第 16 欄／CSV 第 15 欄之
 * **依 `businessCategoryId` 去重**核心邏輯，純函式化以供防 N+1 之
 * `BusinessCategoryDocsStore.listCategoriesByDocumentIds()` 與畫面／CSV 富化共用。
 *
 * 🔴 **去重規則（本檔之核心）**：同一份文件若掛在**同一類別之多個節點**（F043 `AC-21`），
 * 該類別**只呈現一顆 pill**；`N` 為**相異類別數**，**非掛載列數**。
 * 📌 只按列數計算之實作在「一類別一節點」之語料下與正解**輸出完全相同**——那正是本 repo 記錄過
 * 的「語料無鑑別力」形狀；鑑別案必須含一份掛在同一類別 2 個節點 ＋ 另一類別 1 個節點之文件。
 */

/** 掛載列 join 節點/類別後之扁平列（＝store 之單一 JOIN 查詢回傳形狀）。 */
export interface DocumentBusinessCategoryRow {
  documentId: string;
  nodeId: string;
  businessCategoryId: string;
  businessCategoryDisplayName: string;
}

/** 每份文件之相異業務/功能類別（`id` ＋顯示名稱）。 */
export interface DocumentBusinessCategory {
  id: string;
  displayName: string;
}

/**
 * 依 `documentId` 分組，並於組內依 `businessCategoryId` 去重。
 *
 * 🔒 未掛載任何類別之文件**不出現於 Map 中**（呼叫端以 `?? []` 取值）——刻意不塞空陣列，
 * 使「查無」與「有掛載但為空」兩種狀態不會被同一個值抹平。
 * 組內順序＝輸入順序中各類別**首次出現**之順序；CSV 之碼位序排序另由
 * `formatBusinessCategoriesForExport()` 負責（兩者是不同層的規則，不得互相取代）。
 */
export function groupBusinessCategoriesByDocument(
  rows: DocumentBusinessCategoryRow[],
): Map<string, DocumentBusinessCategory[]> {
  const out = new Map<string, DocumentBusinessCategory[]>();
  const seen = new Map<string, Set<string>>();
  for (const r of rows) {
    const bucket = out.get(r.documentId) ?? out.set(r.documentId, []).get(r.documentId)!;
    const ids = seen.get(r.documentId) ?? seen.set(r.documentId, new Set()).get(r.documentId)!;
    // 🔴 去重鍵＝`businessCategoryId`（非 `nodeId`、非列本身）。
    if (ids.has(r.businessCategoryId)) continue;
    ids.add(r.businessCategoryId);
    bucket.push({ id: r.businessCategoryId, displayName: r.businessCategoryDisplayName });
  }
  return out;
}
