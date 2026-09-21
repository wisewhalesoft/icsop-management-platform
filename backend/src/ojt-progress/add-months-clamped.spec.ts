import { addMonthsClamped } from './add-months-clamped';

/**
 * F044 `AC-G8` — `addMonthsClamped` 之**後端**孿生實作。
 *
 * 🔴 **孿生檔（向量陣列逐字相同，兩側須同步維護）**：
 *    `frontend/src/pages/ojt-progress-view.f044.test.ts` 之
 *    `describe('addMonthsClamped（AC-G8 · 孿生向量表）')`。
 *    （`AC-G8` 執行要求 1 原文指名 `frontend/src/pages/ojt-progress-view.test.ts` 之新增
 *    describe；本輪改置於同目錄之姊妹檔 `ojt-progress-view.f044.test.ts`，理由＝該既有檔為
 *    F042 之綠燈測試，於其中 import 一個尚不存在的符號會使**整份既有檔**在建環當下翻紅，
 *    違反 `AC-G21`／§庚「既有測試全數維持綠燈」。向量陣列與互指註解之要求逐項滿足。）
 *
 * 🔴 **本檔對實作全盲**：`./add-months-clamped` 於建環當下尚不存在 ⇒ 預期紅燈為
 *    `Cannot find module './add-months-clamped'`，而非斷言失敗。
 *
 * 契約（`architecture-spec` §15.2 逐字）：
 *   `addMonthsClamped(isoDate: string, delta: number): string | null`
 *   輸入輸出皆為 `YYYY-MM-DD`；不可解析之輸入回 `null`。
 */

/**
 * 🔒 `AC-G8` 之 8 列固定向量表（architecture-spec §15.2 逐列確認並鎖定）。
 * 🔴 本陣列與孿生檔之同名陣列**逐字相同**，任何一側調整必須同步另一側。
 */
const VECTORS: readonly { no: string; input: string; delta: number; expected: string; guards: string }[] = [
  { no: '①', input: '2026-01-15', delta: +1, expected: '2026-02-15', guards: '一般情形' },
  { no: '②', input: '2026-01-31', delta: +1, expected: '2026-02-28', guards: '月底溢位未夾回（天真 setMonth 得 2026-03-03）' },
  { no: '③', input: '2024-01-31', delta: +1, expected: '2024-02-29', guards: '閏年之夾回點' },
  { no: '④', input: '2026-12-31', delta: +1, expected: '2027-01-31', guards: '跨年' },
  { no: '⑤', input: '2026-03-31', delta: -1, expected: '2026-02-28', guards: '反向之月底夾回' },
  { no: '⑥', input: '2024-03-31', delta: -1, expected: '2024-02-29', guards: '反向＋閏年' },
  { no: '⑦', input: '2026-01-01', delta: -1, expected: '2025-12-01', guards: '反向跨年' },
  { no: '⑧', input: '2026-05-31', delta: -1, expected: '2026-04-30', guards: '反向 31→30' },
];

describe('addMonthsClamped（AC-G8 · 孿生向量表）', () => {
  it('向量表恰 8 列（與孿生檔逐字相同）——自我守護：表被刪空則 it.each 零案例恆綠', () => {
    expect(VECTORS).toHaveLength(8);
  });

  it.each(VECTORS)(
    '$no addMonthsClamped($input, $delta) === $expected — 防：$guards',
    ({ input, delta, expected }) => {
      expect(addMonthsClamped(input, delta)).toBe(expected);
    },
  );

  /**
   * 🔴 §癸 自證（②）：把實作改為天真之 `d.setMonth(d.getMonth() + delta)`（不夾回），
   * 向量 ② 得 `2026-03-03`、③ 得 `2024-03-02`、⑤ 得 `2026-03-03`、⑧ 得 `2026-05-01` ⇒ 四列翻紅。
   * 若只保留 ①④⑦ 三列，天真實作**全綠** ⇒ 該表對本缺陷零鑑別力。
   */
  it('不可解析之輸入 → null（不得拋例外、不得回 "Invalid Date"）', () => {
    expect(addMonthsClamped('', +1)).toBeNull();
    expect(addMonthsClamped('not-a-date', +1)).toBeNull();
  });

  /**
   * 🔴 `AC-G8` 之「一律以 `Date.UTC` 拆組」在行為上的載體：行程時區被改成 UTC+8 時，
   * 月底夾回之結果**不得**改變（本 repo 已記錄「讀寫對稱故容器一路正確、天真測試兩種設定都會過」
   * 之時區陷阱 ⇒ 只鎖 UTC 下的輸出等於沒鎖）。
   * ⚠ `test/jest-setup-tz.ts` 預設把行程釘為 UTC；本案刻意於 `it` 內覆寫再還原（比照
   * `test/int/timezone-date-semantics.itest.ts` 之既有作法）。
   */
  it('行程時區改為 Asia/Taipei 時輸出不變（證明是 Date.UTC 拆組，不是本地時區方法）', () => {
    const original = process.env.TZ;
    try {
      process.env.TZ = 'Asia/Taipei';
      for (const v of VECTORS) {
        expect(addMonthsClamped(v.input, v.delta)).toBe(v.expected);
      }
    } finally {
      process.env.TZ = original;
    }
  });
});
