/**
 * 業務/功能類別之排序（🟢 零 IO 純函式；`ARCH-UX5`／architecture-spec §16.5）。
 *
 * `sortOrder` 相同時之次要排序鍵（`AC-UX31` ③／`OQ-UX16-35`：UTF-16 碼位序，
 * 逐字比照 F017 `AC-B9` ②／F019 `AC-UX19` 之既有禁令——**不得使用 `localeCompare()`**
 * 或 `Intl.Collator`，兩者皆與 ICU 版本相依）。
 *
 * 🔴 **為何 SQL 之 `ORDER BY name` 不能替代本函式**：`BUSINESS_CATEGORY.name` 無欄位級
 * `COLLATE` 覆寫，故 SQL 排序遵循資料庫預設 `Chinese_Taiwan_Stroke_BIN`——`_BIN`（非
 * `_BIN2`）之第一字元比較採 locale 排序權重（本 locale＝**筆畫序**），並非碼位序；SQL 端
 * 若讓 `name` 參與 `ORDER BY`，得到的會是筆畫序，與本函式之輸出**不保證一致**。
 * ⇒ 三處消費者（後台類別池清單／前台類別切換下拉／F017 第 14 項篩選下拉）一律
 * **SQL 只 `ORDER BY sortOrder ASC`**，取回後套用本函式。
 *
 * ⚠ 本函式**不改動輸入陣列**（先複製再排序）——呼叫端常直接持有 store 回傳之列，
 * 就地排序會讓「取一份清單」這個動作帶上看不見的副作用。
 */
export function sortByOrderThenName<T extends { sortOrder: number; name: string }>(
  rows: readonly T[],
): T[] {
  return [...rows].sort(
    (a, b) => a.sortOrder - b.sortOrder || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
  );
}
