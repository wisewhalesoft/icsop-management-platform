/**
 * F043 UX16 delta 項 8 — 上移／下移之寫入規則（`AC-UX29` ④，🟢 零 IO 純函式）。
 *
 * 🔴 **明文禁止「單純互換兩列的 `sortOrder`」**（本檔存在的全部理由）：兩列 `sortOrder` 相等時
 * 互換是 **no-op** ⇒ 使用者連按無反應、畫面毫無說明。而平手是**可達狀態**——同一列另有數值
 * 輸入框，使用者隨時可以把兩列打成同值（`AC-UX31` ③）⇒ 這不是理論情形。
 *
 * **三步規則**：在**當前完整清單之排序**（`sortOrder` 昇冪、同值時 `name` 昇冪）中，設目標列為
 * `T`、其前一列為 `P`、`P` 的前一列為 `PP`——
 *  - (a) `P` 不存在（`T` 已在首位）⇒ **不寫入**（鈕亦 `disabled`）；
 *  - (b) `PP` 不存在 ⇒ `T.sortOrder = P.sortOrder − 10`；
 *  - (c) 否則 ⇒ `T.sortOrder = ⌊(PP.sortOrder + P.sortOrder) / 2⌋`；🔴 該結果等於 `PP` 或 `P` 之值
 *        時（間距已用盡，**含 `PP` 與 `P` 平手**）⇒ **先對全表依當前排序重編號為 10, 20, 30, …，
 *        再重跑本規則一次**。
 *  - **下移為其鏡像**（`P` → 後一列 `N`、`PP` → `N` 的後一列 `NN`）；🔴 **鏡像中唯一不對稱的就是
 *    (b)**：`N.sortOrder + 10` 而非 `−10`——那正是複製貼上最容易寫錯的一行。
 *
 * 🔒 **只改目標列一欄**（id／name 等其餘欄位一格不動）；唯有 (c) 之重編號分支會動到全表，
 * 且該分支**保持相對次序不變**。
 *
 * 🔒 **與數值輸入框共用同一套值域規則**（`AC-UX29` ⑤）：兩套入口最終都只是對 `sortOrder` 指派，
 * 🔴 明文禁止為鈕另開一套「只給鈕用」的旁路規則。
 */

/** 調序所需之最小列形狀（`name` 為平手時之次要排序鍵）。 */
export interface BusinessCategoryReorderRow {
  id: string;
  sortOrder: number;
  name: string;
}

/** 間距（`AC-UX30`：間距 10 讓日後插入不必重寫整張表）。 */
const SORT_ORDER_GAP = 10;

/**
 * `sortOrder` 昇冪、同值時 `name` 昇冪之比較器。
 *
 * 🔴 `name` 之「昇冪」＝ **UTF-16 碼位序**（`AC-UX31` ③／`OQ-UX16-35`），即 JS `<`／`>` 之預設
 * 行為；🔴 **明文禁止 `localeCompare()`**（含任何帶 locale／`Intl.Collator` 之定序）——本 repo
 * 已有「`localeCompare` 定序隨環境漂移」之既有血訓，而本欄有三處消費者，任一處挑了不同比較器
 * 就會出現「同一批類別在同一套系統裡兩種順序」。
 */
function compareBySortOrder(
  a: BusinessCategoryReorderRow,
  b: BusinessCategoryReorderRow,
): number {
  return a.sortOrder - b.sortOrder || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
}

/**
 * 依當前排序取出完整清單之次序。
 * ⚠ **不就地排序**（先複製）——呼叫端持有的是 React state 之列陣列，就地排序會讓「讀一次順序」
 * 這個動作帶上看不見的副作用。
 */
export function sortByOrderThenName<T extends BusinessCategoryReorderRow>(
  rows: readonly T[],
): T[] {
  return [...rows].sort(compareBySortOrder);
}

/** 依當前排序把全表重編號為 `10, 20, 30, …`（`AC-UX29` ④ (c) 之 🔴 分支；相對次序不變）。 */
function renumberAll<T extends BusinessCategoryReorderRow>(rows: readonly T[]): T[] {
  const next = new Map<string, number>();
  sortByOrderThenName(rows).forEach((r, i) => next.set(r.id, (i + 1) * SORT_ORDER_GAP));
  return rows.map((r) => ({ ...r, sortOrder: next.get(r.id) ?? r.sortOrder }));
}

/** `dir = -1` 上移／`+1` 下移。`retried` 僅為重編號後之終止保證（重編號後不可能再用盡）。 */
function moveByOne<T extends BusinessCategoryReorderRow>(
  rows: readonly T[],
  id: string,
  dir: -1 | 1,
  retried: boolean,
): T[] {
  const ordered = sortByOrderThenName(rows);
  const i = ordered.findIndex((r) => r.id === id);
  if (i < 0) return rows.map((r) => ({ ...r }));
  const pIdx = i + dir;
  const ppIdx = i + dir * 2;
  // (a) 已在該方向之邊界 ⇒ 無任何寫入。
  if (pIdx < 0 || pIdx >= ordered.length) return rows.map((r) => ({ ...r }));
  const p = ordered[pIdx];
  const pp = ppIdx >= 0 && ppIdx < ordered.length ? ordered[ppIdx] : null;
  let next: number;
  if (!pp) {
    // (b) 🔴 鏡像中唯一不對稱之處：下移為 `+10`，上移為 `−10`。
    next = p.sortOrder + dir * SORT_ORDER_GAP;
  } else {
    next = Math.floor((pp.sortOrder + p.sortOrder) / 2);
    if (next === pp.sortOrder || next === p.sortOrder) {
      if (retried) return rows.map((r) => ({ ...r }));
      return moveByOne(renumberAll(rows), id, dir, true);
    }
  }
  return rows.map((r) => (r.id === id ? { ...r, sortOrder: next } : { ...r }));
}

/** 上移一位（`AC-UX29` ④）。已在首位 ⇒ 回傳之各列 `sortOrder` 與輸入相同（無寫入）。 */
export function moveUp<T extends BusinessCategoryReorderRow>(
  rows: readonly T[],
  id: string,
): T[] {
  return moveByOne(rows, id, -1, false);
}

/** 下移一位（`AC-UX29` ④ 之鏡像）。已在末位 ⇒ 無寫入。 */
export function moveDown<T extends BusinessCategoryReorderRow>(
  rows: readonly T[],
  id: string,
): T[] {
  return moveByOne(rows, id, 1, false);
}

/**
 * 該列在**完整清單**（🔴 不是被篩過的檢視）中是否已位於該方向之邊界。
 * 🔒 `AC-UX29` ③ 之「篩選生效時停用」由呼叫端另行判定——兩者是兩個不同的停用理由。
 */
export function atReorderBoundary(
  rows: readonly BusinessCategoryReorderRow[],
  id: string,
  dir: -1 | 1,
): boolean {
  const ordered = sortByOrderThenName(rows);
  const i = ordered.findIndex((r) => r.id === id);
  if (i < 0) return true;
  return dir < 0 ? i <= 0 : i >= ordered.length - 1;
}
