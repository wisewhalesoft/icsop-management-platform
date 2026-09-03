/**
 * F017 delta `AC-B9`／`AC-B10` —— 匯出 CSV「業務/功能類別」欄之**欄內格式化**純函式。
 *
 * 規則（逐字取自 `AC-B9` ②③④）：
 *  · 多值以**全形頓號 `、`** 相接，前後**無空白**；🔴 **明文禁止半形逗號**——逗號會觸發
 *    RFC 4180 之引號包覆，使欄內逗號與欄間逗號在肉眼上無從分辨。
 *  · 順序**恆依 `businessCategoryDisplayName` 之 UTF-16 碼位序遞增**（＝JavaScript `<`／`>` 與
 *    `Array.prototype.sort()` 不帶 comparator 之預設行為）。
 *  · `N = 0` → **空字串**（🔴 非 `—`、非 `0`——`—` 是畫面之空值佔位符，不是資料）。
 *
 * 🔴🔴 **明文禁止 `localeCompare()`**（含任何帶 locale／`Intl.Collator` 之定序）：中文之 locale
 * 定序由**執行環境的 ICU 版本**決定，同一組類別名在不同機器會排出不同順序 ⇒ 期望值隨環境漂移，
 * 產生「在某台機器綠、在另一台紅」之不穩定測試（CI 容器與開發機的 ICU 幾乎必然不同）。
 * 碼位序無外部相依，是目前唯一能寫死成固定期望值的排序。
 * 📌 **已接受之代價（明列，非缺陷）**：碼位序對中文而言不是筆劃序、注音序或任何人類直覺順序。
 * CSV 為存查用途，**可預測性優先於閱讀順序**；日後若要求人類可讀之排序，須改為由後端持有一份
 * **顯式的排序鍵**，而不是改用 `localeCompare`。
 *
 * ⚠ 注入前綴（`=`／`+`／`-`／`@`／Tab／CR 開頭者前置 `'`）屬 CSV **通則層**之另一道處理
 * （`storage/csv-export.ts` 之 `cell()`），本函式**忠實輸出原字面**、不重複實作。
 */

/** `AC-B9` ②：全形頓號。🔒 與第 12 欄之半形分號**刻意不同、不得統一**（該欄之值是編號）。 */
const BUSINESS_CATEGORY_SEPARATOR = '、';

/**
 * 相異類別（已由 `groupBusinessCategoriesByDocument()` 依 `businessCategoryId` 去重）→
 * 單一儲存格字串。
 *
 * 🔒 **純函式**：不就地改動傳入之陣列（先複製再排序）。
 */
export function formatBusinessCategoriesForExport(
  categories: ReadonlyArray<{ id: string; displayName: string }>,
): string {
  return [...categories]
    .map((c) => c.displayName)
    // 🔴 UTF-16 碼位序；不得改用 localeCompare（見檔頭）。
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .join(BUSINESS_CATEGORY_SEPARATOR);
}
