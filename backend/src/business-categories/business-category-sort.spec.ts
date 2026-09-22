/**
 * F043 UX16 delta — `sortByOrderThenName()`（`AC-UX31` ③／`AC-UX32`／`OQ-UX16-35`）。
 *
 * 權威：docs/specs/features/F043-business-function-category.md `AC-UX31` ③、`AC-UX32`；
 * docs/specs/architecture-spec.md §16.5（`ARCH-UX5` 第二輪修正——SQL 只留 `ORDER BY sortOrder`，
 * `name` 次鍵改由本檔之應用層純函式施加，三處消費者共用同一支）。
 *
 * ⚠ 對實作全盲：`./business-category-sort` 尚不存在——import 失敗即本環之預期紅燈。
 *
 * 🔴 本檔只證明「純函式本身」之排序行為（`sortOrder` 昇冪、同值時 `name` 之 UTF-16 碼位序、
 * 明文禁用 `localeCompare()`）。它**不證明**三處消費者（後台清單／前台下拉／F017 第 14 項篩選）
 * 是否真的呼叫了它、也不證明 SQL 端是否仍偷偷把 `name` 留在 `ORDER BY` 裡——那是
 * architecture-spec §16.12 #11 明文列出之盲區（本輪 jest 以記憶體 fixture 驅動，連不上真庫，
 * 偵測不到「TypeORM `order` 物件裡多留了一個 `name` 鍵」這種缺陷），須部署後人工覆核。
 */
import { sortByOrderThenName as sortByOrderThenNameImpl } from './business-category-sort';

interface Row {
  id: string;
  sortOrder: number;
  name: string;
}

const row = (id: string, sortOrder: number, name: string): Row => ({ id, sortOrder, name });

/** 型別輔助（非行為變更）：見 node-company-counts.spec.ts 檔頭同型註解。 */
function sortByOrderThenName(rows: readonly Row[]): Row[] {
  return (sortByOrderThenNameImpl as (rows: readonly Row[]) => Row[])(rows);
}

describe('sortByOrderThenName — sortOrder 昇冪為主序', () => {
  it('依 sortOrder 昇冪排序（本身互異時，name 完全不影響結果）', () => {
    const input = [row('c', 30, 'A'), row('a', 10, 'Z'), row('b', 20, 'M')];
    expect(sortByOrderThenName(input).map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('不改動原陣列（回傳新陣列）', () => {
    const input = [row('b', 20, 'B'), row('a', 10, 'A')];
    const out = sortByOrderThenName(input);
    expect(out).not.toBe(input);
    expect(input.map((r) => r.id)).toEqual(['b', 'a']); // 原陣列順序不變
  });
});

describe('sortByOrderThenName — sortOrder 相同時之次要鍵：name 之 UTF-16 碼位序（`AC-UX31` ③）', () => {
  /**
   * 🔴 本輪之核心鑑別語料——中文字串在「碼位序」與「筆畫序 / localeCompare」下給出不同答案：
   * `丙`(U+4E19) < `乙`(U+4E59) < `甲`(U+7532) 為碼位序；筆畫序與 `localeCompare('zh-Hant')`
   * 皆給出 `乙 < 丙 < 甲`（見 F043 UX16 delta `AC-UX29` ④ 之實測記錄）。
   * 若實作誤用 `localeCompare()` 或誤讓 SQL 的 `ORDER BY name`（筆畫序）滲入，本條會翻紅
   * （因為期望的是 `丙, 乙, 甲`，而 localeCompare／筆畫序給出 `乙, 丙, 甲`）。
   */
  it('sortOrder 相同 → 依 name 之 UTF-16 碼位序（丙 < 乙 < 甲），非 localeCompare／筆畫序（乙 < 丙 < 甲）', () => {
    const input = [row('甲', 10, '甲'), row('乙', 10, '乙'), row('丙', 10, '丙')];
    expect(sortByOrderThenName(input).map((r) => r.id)).toEqual(['丙', '乙', '甲']);
  });

  it('sortOrder 部分相同、部分互異 → 主序仍為 sortOrder，平手段落內再依碼位序', () => {
    const input = [
      row('x', 20, 'X'),
      row('乙', 10, '乙'),
      row('甲', 10, '甲'),
      row('丙', 10, '丙'),
    ];
    expect(sortByOrderThenName(input).map((r) => r.id)).toEqual(['丙', '乙', '甲', 'x']);
  });

  it('name 完全相同（合法但邊界）→ 穩定即可，兩筆皆須出現、不得遺漏', () => {
    const input = [row('a', 10, '同名'), row('b', 10, '同名')];
    const out = sortByOrderThenName(input);
    expect(out.map((r) => r.id).sort()).toEqual(['a', 'b']);
  });

  /**
   * 🔴 明文禁止 localeCompare：以英文大小寫混合驗證——ASCII 下 `'B' < 'a'`（碼位序，B=66 < a=97）
   * 而 `'B'.localeCompare('a')` 在多數 locale 下為正（'a' < 'B'，因大小寫不敏感權重）。
   * 這是比中文更不受 ICU 版本漂移影響的鑑別向量（見本 repo 既有紀律：ICU 獨立之定序鑑別點）。
   */
  it('🔴 明文禁用 localeCompare：ASCII 混合大小寫下亦為碼位序（B < a，非 a < B）', () => {
    const input = [row('a-row', 10, 'a'), row('B-row', 10, 'B')];
    expect(sortByOrderThenName(input).map((r) => r.id)).toEqual(['B-row', 'a-row']);
  });
});
