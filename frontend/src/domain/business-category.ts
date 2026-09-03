/**
 * F043 業務/功能類別 — 前端純函式（規格權威：docs/specs/features/F043-business-function-category.md）。
 *
 * 🔒 `AC-05`：正規化**直接重用** [F040](./lifecycle-subcategory.ts) 之既有 `normalizeSubcategory`
 *    （trim → 空值收斂為 `null`），該函式與循環領域零耦合。**明文禁止**複製一份
 *    `normalizeBusinessCategorySubcategory`——兩份初始碰巧相同，漂移之前兩份都會綠。
 *
 * 🔒 `AC-06`／架構決策 E6（architecture-spec §14.6.5）：`businessCategoryDisplayName` 之組合規則
 *    與 `lifecycleDisplayName` **逐字相同**，且比對邏輯完全不含 LIFECYCLE 字面值 ⇒ 裁定
 *    **不複製第二份函式體**，改以**別名重新匯出**。`AC-06` 之固定向量測試因此自動恆成立
 *    （同一支函式對自己恆等，如該 AC 自身之後設宣告），其保留價值＝「本檔確實重新匯出了
 *    正確的那一支函式」之回歸鎖，防止日後有人在此誤植另一份實作。
 *
 * ⚠ 本檔刻意**只做重新匯出**：任何屬於本功能自己的邏輯（如唯一性比對）住在後端服務層
 *    （`AC-03`／`AC-07`～`AC-09`／`AC-13` 之比對範圍涵蓋全池，唯後端持有權威）。
 */
export { normalizeSubcategory } from './lifecycle-subcategory';
export { lifecycleDisplayName as businessCategoryDisplayName } from './lifecycle-subcategory';
