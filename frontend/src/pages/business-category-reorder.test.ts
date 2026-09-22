/**
 * F043 UX16 delta — `moveUp`／`moveDown`（`AC-UX29` ④，人類裁決『數值輸入框 ＋ 上下移動鈕』；
 * `OQ-UX16-34`）。
 *
 * 權威：docs/specs/features/F043-business-function-category.md#ux16-delta `AC-UX29`（七條固定
 * 向量之逐字表，2026-09-22 第四輪已將標籤自 `甲/乙/丙` 就地改為 `A/B/C`——`甲/乙/丙` 之碼位序
 * 與筆畫序／`localeCompare` 三種比較器互不一致，`A/B/C` 則在三者下皆遞增，故本檔期望值與
 * 比較器選擇無關）。
 *
 * ⚠ 對實作全盲：`./business-category-reorder` 尚不存在——import 失敗即本環之預期紅燈。
 * 🔵 `moveUp(rows, id)`／`moveDown(rows, id) → rows'` 之純函式簽章為 `AC-UX29` 本文明訂之
 * 可測形狀，非本檔臆造；落點（本檔路徑）由 test-generator 依本 repo「頁面專屬純邏輯緊鄰頁面」
 * 之既有慣例（如 `ojt-progress-view.ts`）決定，若與 tdd-implementation 之實際切分不同，
 * 屬合理 test-dispute，仲裁時改介面形狀、不弱化行為斷言本身。
 *
 * 🔴 明文禁止「單純互換兩列的 sortOrder」：平手時互換是 no-op，這正是 ⓑⓔ 兩條存在的理由。
 */
import { moveUp, moveDown } from './business-category-reorder';

interface Row {
  id: string;
  sortOrder: number;
  name: string;
}

const row = (id: string, sortOrder: number): Row => ({ id, sortOrder, name: id });

/** 依 sortOrder 昇冪排出目前次序（id 陣列），供各案比對「結果次序」而非只比對單列新值。 */
function orderOf(rows: Row[]): string[] {
  return [...rows].sort((a, b) => a.sortOrder - b.sortOrder).map((r) => r.id);
}

describe('moveUp — AC-UX29 ④ 固定向量（標籤 A/B/C，2026-09-22 第四輪已就地改寫）', () => {
  it('ⓐ 一般：10(A),20(B),30(C) 上移 C → C=15，次序 A,C,B', () => {
    const input = [row('A', 10), row('B', 20), row('C', 30)];
    const out = moveUp(input, 'C');
    expect(out.find((r) => r.id === 'C')?.sortOrder).toBe(15);
    expect(orderOf(out)).toEqual(['A', 'C', 'B']);
    // 🔴 斷言「結果次序」而非只斷言該列的新值——其餘各列之 sortOrder 未被改動。
    expect(out.find((r) => r.id === 'A')?.sortOrder).toBe(10);
    expect(out.find((r) => r.id === 'B')?.sortOrder).toBe(20);
  });

  it('ⓑ 平手（🔴 互換實作在此為 no-op，本條專門排除該錯誤實作）：10(A),20(B),20(C) 上移 C → C=15，次序 A,C,B', () => {
    const input = [row('A', 10), row('B', 20), row('C', 20)];
    const out = moveUp(input, 'C');
    expect(out.find((r) => r.id === 'C')?.sortOrder).toBe(15);
    expect(orderOf(out)).toEqual(['A', 'C', 'B']);
  });

  it('ⓒ 首位：10(A),20(B) 上移 A → 無任何寫入（結果與輸入之 sortOrder 集合相同）', () => {
    const input = [row('A', 10), row('B', 20)];
    const out = moveUp(input, 'A');
    expect(out.find((r) => r.id === 'A')?.sortOrder).toBe(10);
    expect(out.find((r) => r.id === 'B')?.sortOrder).toBe(20);
    expect(orderOf(out)).toEqual(['A', 'B']);
  });

  it('ⓓ 間距用盡：10(A),11(B),12(C) 上移 C → 全表重編號 10,20,30 後 C=15，次序 A,C,B', () => {
    const input = [row('A', 10), row('B', 11), row('C', 12)];
    const out = moveUp(input, 'C');
    expect(orderOf(out)).toEqual(['A', 'C', 'B']);
    expect(out.find((r) => r.id === 'C')?.sortOrder).toBe(15);
    // 🔴 重編號分支：斷言「相對次序保持不變」（A 仍在 B/C 之前之相對關係，經重編號後）。
    expect(out.find((r) => r.id === 'A')!.sortOrder).toBeLessThan(out.find((r) => r.id === 'C')!.sortOrder);
  });

  it('ⓔ 三方平手（🔴 ⓓ 之退化形）：20(A),20(B),20(C) 上移 C → 同 ⓓ，重編號後 C=15、次序 A,C,B', () => {
    const input = [row('A', 20), row('B', 20), row('C', 20)];
    const out = moveUp(input, 'C');
    expect(orderOf(out)).toEqual(['A', 'C', 'B']);
    expect(out.find((r) => r.id === 'C')?.sortOrder).toBe(15);
  });
});

describe('moveDown — AC-UX29 ④ 鏡像向量（🔴 ⓕⓖ 非有不可——鏡像中唯一不對稱的就是 (b)，是複製貼上最容易寫錯之處）', () => {
  it('ⓕ 末位之前一步：10(A),20(B),30(C) 下移 A → A=⌊(30+20)/2⌋=25，次序 B,A,C', () => {
    const input = [row('A', 10), row('B', 20), row('C', 30)];
    const out = moveDown(input, 'A');
    expect(out.find((r) => r.id === 'A')?.sortOrder).toBe(25);
    expect(orderOf(out)).toEqual(['B', 'A', 'C']);
    expect(out.find((r) => r.id === 'B')?.sortOrder).toBe(20);
    expect(out.find((r) => r.id === 'C')?.sortOrder).toBe(30);
  });

  it('🔴 ⓖ 移到末位：10(A),20(B) 下移 A → A = N.sortOrder + 10 = 30（非 −10），次序 B,A', () => {
    const input = [row('A', 10), row('B', 20)];
    const out = moveDown(input, 'A');
    expect(out.find((r) => r.id === 'A')?.sortOrder).toBe(30);
    expect(orderOf(out)).toEqual(['B', 'A']);
  });

  it('已在末位 → 鈕之鏡像禁用語意：無任何寫入', () => {
    const input = [row('A', 10), row('B', 20)];
    const out = moveDown(input, 'B');
    expect(out.find((r) => r.id === 'A')?.sortOrder).toBe(10);
    expect(out.find((r) => r.id === 'B')?.sortOrder).toBe(20);
  });
});

describe('moveUp／moveDown — 兩套寫入路徑等價性之前提（`AC-UX29` ⑤：與使用者自行改數值須產生相同資料狀態）', () => {
  it('moveUp 之結果為單純之 sortOrder 指派，不改變 id／name 等其餘欄位', () => {
    const input = [row('A', 10), row('B', 20), row('C', 30)];
    const out = moveUp(input, 'C');
    const c = out.find((r) => r.id === 'C');
    expect(c?.name).toBe('C');
  });
});
