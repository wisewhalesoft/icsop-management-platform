import { OjtOnTimeRow, ojtOnTimeRate } from './ojt-ontime';

/**
 * F044 卡④「OJT 準時完成率(1個月內)」之**純函式層**建環
 * （`backend/src/ojt-progress/ojt-ontime.ts`；`ARCH-G1` 裁定聚合落後端）。
 *
 * 涵蓋：`AC-G7`（時間窗口）、`AC-G9`（分母＝相異 `(companyCode, orgCode)`）、
 * `AC-G10`（分子＝全部應完成皆已完成）、`AC-G11`（完成判定沿用 F042）、
 * `AC-G12`（三類排除與其計數）、`AC-G14`（分母為 0 省略 `rate` 鍵）。
 * 語料要求＝§癸 (g)（正向計算 vs 反推區間之鑑別語料）。
 *
 * 🔴 **本檔對實作全盲**：`./ojt-ontime` 於建環當下尚不存在 ⇒ 預期紅燈為
 *    `Cannot find module './ojt-ontime'`。
 *
 * 🔒 **契約**（`AC-G10` 之「可測形狀」＋ `architecture-spec` §15.5 ③）：
 * ```
 * export interface OjtOnTimeRow {
 *   companyCode: string; orgCode: string; documentId: string;
 *   announcedDate: string | null;      // 'YYYY-MM-DD'
 *   completed: boolean;                // = F042 `AC-03` 之判定結果（版次相符之場次存在）
 *   isActive: boolean;                 // = 該單位是否未裁撤
 * }
 * export interface OjtOnTimeStats {
 *   numerator: number; denominator: number; rate?: number;
 *   excludedInactive: number; excludedOrphaned: number; excludedNoAnnouncedDate: number;
 * }
 * export function ojtOnTimeRate(
 *   rows: readonly OjtOnTimeRow[], today: string, orphanedCount?: number,
 * ): OjtOnTimeStats;
 * ```
 * ⚠ **為何 `orphanedCount` 是第三個參數而不是自 `rows` 算出來的**（`ARCH-G1` ① 逐字）：
 *    孤兒依定義**已不在 `DOC_USING_DEPT` 集合內** ⇒ `aggregate()` 之列裡**結構性地不含孤兒**。
 *    該數字之唯一來源是後端既有之 `countOrphanedRows()`，由服務層傳入。
 *
 * ⚠ **`rate` 之計算落點**：`AC-G13` 之「委派既有 `coveragePercent`」指的是**前端卡面字串**
 *    （`coveragePercent` 只存在於 `frontend/src/pages/ojt-progress-view.ts`，跨 package 無法 import）。
 *    後端之 `rate` 鍵其首要職責是 `AC-G14` 之**在／不在**（分母為 0 時省略），其值須與前端之
 *    `coveragePercent(numerator, denominator)` 同值 ⇒ 本檔以 `Math.round(n / d * 100)` 之期望值
 *    逐列鎖住，孿生鎖在 `frontend/src/pages/ojt-progress-view.f044.test.ts`。
 */

function row(
  companyCode: string,
  orgCode: string,
  documentId: string,
  announcedDate: string | null,
  completed: boolean,
  isActive = true,
): OjtOnTimeRow {
  return { companyCode, orgCode, documentId, announcedDate, completed, isActive };
}

/** 🔒 凍結之「今日」。窗口 ＝ `[addMonthsClamped(today, -1), today]` ＝ `[2026-01-28, 2026-02-28]`。 */
const TODAY = '2026-02-28';

/**
 * 主語料。
 *  · u1 `AS|B1000`：兩份皆已完成 ⇒ 進分子
 *  · u2 `AD|B1000`：🔴 **與 u1 同 orgCode、不同公司**（`AC-G9` 之複合鍵鑑別向量）
 *  · u3 `AS|C1000`：兩份中完成一份 ⇒ **不進分子**（`AC-G10` 部分完成不算）
 *  · u4 `AS|C5000`：應完成日恰為窗口下界 `2026-01-28`（閉區間之邊界）
 *  · 窗口外之列（r7／r8）：🔴 **不排除、也不計入**——它們不是「被排除」，不得進任何一個排除計數
 *  · r9 裁撤單位／r10 無公告日：`AC-G12` 之兩類排除
 */
const ROWS: readonly OjtOnTimeRow[] = [
  row('AS', 'B1000', 'D1', '2026-01-29', true),
  row('AS', 'B1000', 'D2', '2026-01-30', true),
  row('AD', 'B1000', 'D1', '2026-01-31', false),
  row('AS', 'C1000', 'D1', '2026-01-29', true),
  row('AS', 'C1000', 'D3', '2026-01-30', false),
  row('AS', 'C5000', 'D4', '2025-12-28', true),
  // 窗口外（應完成日 2026-03-01，未到期）
  row('AS', 'D1000', 'D5', '2026-02-01', false),
  // 窗口外（應完成日 2026-01-01，早於下界）
  row('AS', 'D2000', 'D6', '2025-12-01', false),
  // 排除：裁撤單位
  row('AS', 'E1000', 'D7', '2026-01-29', false, false),
  // 排除：無公告日期
  row('AS', 'F1000', 'D8', null, false),
];

describe('ojtOnTimeRate — 分母／分子／比率（AC-G9／AC-G10／AC-G13）', () => {
  it('分母＝窗口內之相異 (companyCode, orgCode)；分子＝全部應完成皆已完成之單位', () => {
    const s = ojtOnTimeRate(ROWS, TODAY);
    expect(s.denominator).toBe(4); // AS|B1000, AD|B1000, AS|C1000, AS|C5000
    expect(s.numerator).toBe(2); // AS|B1000, AS|C5000
  });

  /**
   * 🔴 `AC-G9` 之鑑別力：若以 `orgCode` **單鍵**分組，`AS|B1000` 與 `AD|B1000` 會併成一組
   * ⇒ 分母 3、且該合併組因含未完成之列而不進分子 ⇒ 分子 1。兩個數字同時翻紅。
   * 🔴 語料若只有一家公司，本條恆真。
   */
  it('AC-G9 負向鎖：跨公司同碼之兩個單位不得併為一組', () => {
    const sameOrgCode = ROWS.filter((r) => r.orgCode === 'B1000');
    expect(new Set(sameOrgCode.map((r) => r.companyCode)).size).toBe(2); // 語料自我守護
    const s = ojtOnTimeRate(sameOrgCode, TODAY);
    expect(s.denominator).toBe(2);
    expect(s.numerator).toBe(1);
  });

  it('AC-G10：某單位在窗口內有 2 份、完成 1 份 ⇒ 不計入分子（部分完成不算）', () => {
    const partial = ROWS.filter((r) => r.orgCode === 'C1000');
    const s = ojtOnTimeRate(partial, TODAY);
    expect(s.denominator).toBe(1);
    expect(s.numerator).toBe(0);
  });

  it('AC-G13：rate ＝ Math.round(分子 / 分母 × 100)（與前端 coveragePercent 同值）', () => {
    const s = ojtOnTimeRate(ROWS, TODAY);
    expect(s.rate).toBe(50);
  });

  it('AC-G13：非整除之比率四捨五入（3/7 → 43，非 42、非 42.857）', () => {
    const rows: OjtOnTimeRow[] = [];
    for (let i = 0; i < 7; i += 1) {
      rows.push(row('AS', `X${i}000`, `D${i}`, '2026-01-29', i < 3));
    }
    const s = ojtOnTimeRate(rows, TODAY);
    expect(s.denominator).toBe(7);
    expect(s.numerator).toBe(3);
    expect(s.rate).toBe(43);
  });
});

describe('ojtOnTimeRate — 窗口（AC-G7）', () => {
  it('窗口為閉區間 [今日 − 1 個月, 今日]：下界之列計入', () => {
    const s = ojtOnTimeRate([row('AS', 'C5000', 'D4', '2025-12-28', true)], TODAY);
    expect(s.denominator).toBe(1); // due = 2026-01-28 ＝ 下界
  });

  it('下界之前一日（due 2026-01-27）不計入', () => {
    const s = ojtOnTimeRate([row('AS', 'C5000', 'D4', '2025-12-27', true)], TODAY);
    expect(s.denominator).toBe(0);
  });

  it('上界（due ＝ 今日）計入；上界之後一日不計入', () => {
    expect(ojtOnTimeRate([row('AS', 'A1000', 'D', '2026-01-28', true)], TODAY).denominator).toBe(1);
    expect(ojtOnTimeRate([row('AS', 'A1000', 'D', '2026-01-29', true)], '2026-02-27').denominator).toBe(
      0,
    );
  });

  /**
   * 🔴 `AC-G7` 之負向鎖（丙案已被否決）：母體**不得**改為「`announcedDate` 落在近一個月」。
   * 本語料下兩者輸出不同：`2026-02-01` 之列（`announcedDate` 落在近一個月內，但應完成日
   * 2026-03-01 尚未到）在正確作法下**不計入**；`2025-12-28` 之列（`announcedDate` 不在近一個月
   * 內，但應完成日恰為下界）在正確作法下**計入**。
   */
  it('AC-G7 負向鎖：不得以 announcedDate 落在近一個月作為母體條件', () => {
    const notYetDue = ojtOnTimeRate([row('AS', 'D1000', 'D5', '2026-02-01', false)], TODAY);
    expect(notYetDue.denominator).toBe(0); // announcedDate 在近一個月內，但尚未到期
    const dueAtLowerBound = ojtOnTimeRate([row('AS', 'C5000', 'D4', '2025-12-28', true)], TODAY);
    expect(dueAtLowerBound.denominator).toBe(1); // announcedDate 不在近一個月內，但已到期
  });

  it('窗口外之列既不計入母體、也不進任何一個排除計數', () => {
    const outside = ROWS.filter((r) => r.orgCode === 'D1000' || r.orgCode === 'D2000');
    const s = ojtOnTimeRate(outside, TODAY);
    expect(s.denominator).toBe(0);
    expect(s.excludedInactive).toBe(0);
    expect(s.excludedOrphaned).toBe(0);
    expect(s.excludedNoAnnouncedDate).toBe(0);
  });
});

/**
 * 🔴 §癸 (g) — **正向計算 vs 反推 `announcedDate` 區間**之鑑別語料。
 *
 * 實作者最可能自作聰明的捷徑：把母體條件由「應完成日 ＝ `announcedDate + 1 月` 落在
 * `[今日 − 1 月, 今日]`」反推成「`announcedDate ∈ [今日 − 2 月, 今日 − 1 月]`」。
 * 🔴 該等價**不成立**——`addMonthsClamped` 因月底夾擠而不可逆：`2026-01-29`／`2026-01-30`／
 *    `2026-01-31` 三個不同的公告日在 `+1` 之後**同為** `2026-02-28`。
 *   · 正向（正確）：三份**全部**落入窗口 `[2026-01-28, 2026-02-28]` ⇒ 分母 3。
 *   · 反推（錯誤）：窗口為 `announcedDate ∈ [2025-12-28, 2026-01-28]` ⇒ 三份**全部落空** ⇒ 分母 0。
 * 🔴 **少了這三列，該負向鎖定只是一段註解。**
 */
describe('🔴 §癸 (g) — 月底夾擠使反推不可逆（AC-G7／AC-G8 之負向鎖）', () => {
  const CLAMP_ROWS: readonly OjtOnTimeRow[] = [
    row('AS', 'M1000', 'D1', '2026-01-29', true),
    row('AS', 'M2000', 'D2', '2026-01-30', true),
    row('AS', 'M3000', 'D3', '2026-01-31', false),
  ];

  it('三個不同公告日 +1 月後同為 2026-02-28 ⇒ 正向計算之分母為 3（反推作法得 0）', () => {
    const s = ojtOnTimeRate(CLAMP_ROWS, '2026-02-28');
    expect(s.denominator).toBe(3);
    expect(s.numerator).toBe(2);
  });

  it('自我守護：反推區間 [2025-12-28, 2026-01-28] 確實不涵蓋這三個公告日', () => {
    for (const r of CLAMP_ROWS) {
      const d = r.announcedDate as string;
      expect(d >= '2025-12-28' && d <= '2026-01-28').toBe(false);
    }
  });
});

describe('ojtOnTimeRate — 排除規則與其計數（AC-G12／AC-G15）', () => {
  it('三類排除自分子與分母同時排除，且計數各自可取得', () => {
    const s = ojtOnTimeRate(ROWS, TODAY, 3);
    expect(s.excludedInactive).toBe(1);
    expect(s.excludedNoAnnouncedDate).toBe(1);
    expect(s.excludedOrphaned).toBe(3); // 由服務層（countOrphanedRows）傳入
    // 被排除之單位不得出現在分母
    expect(s.denominator).toBe(4);
  });

  it('未傳 orphanedCount 時 excludedOrphaned 為 0（而非 undefined）', () => {
    expect(ojtOnTimeRate(ROWS, TODAY).excludedOrphaned).toBe(0);
  });

  /**
   * 🔴 `AC-G12` ① 之鑑別力：裁撤單位之列若未被排除，它會成為第 5 個單位（未完成）
   * ⇒ 分母 5、分子 2 ⇒ 本案翻紅。
   */
  it('AC-G12 ①：裁撤單位（isActive === false）不得成為母體之一員', () => {
    const withInactive = ROWS.filter((r) => r.orgCode === 'E1000');
    const s = ojtOnTimeRate(withInactive, TODAY);
    expect(s.denominator).toBe(0);
    expect(s.excludedInactive).toBe(1);
  });

  it('AC-G12 ③：announcedDate 為 null 之列被排除並計數（不得靜默忽略）', () => {
    const s = ojtOnTimeRate([row('AS', 'F1000', 'D8', null, false)], TODAY);
    expect(s.denominator).toBe(0);
    expect(s.excludedNoAnnouncedDate).toBe(1);
  });
});

describe('🔒 AC-G14 — 分母為 0 時**省略** rate 鍵（不是回 0）', () => {
  it('denominator === 0 ⇒ 回應中不存在 rate 鍵', () => {
    const s = ojtOnTimeRate([], TODAY);
    expect(s.denominator).toBe(0);
    expect(s.numerator).toBe(0);
    // 🔴 `0%`／`100%`／`NaN%` 三種謊報都是「有一個數字可以渲染」才發生的。
    expect('rate' in s).toBe(false);
    expect(s.rate).toBeUndefined();
  });

  it('denominator > 0 ⇒ rate 鍵存在（證明上一條不是「永遠沒有 rate」）', () => {
    const s = ojtOnTimeRate(ROWS, TODAY);
    expect('rate' in s).toBe(true);
    expect(typeof s.rate).toBe('number');
  });

  it('母體全部落在窗口外時亦省略 rate 鍵（正式站之常態分支）', () => {
    const s = ojtOnTimeRate(ROWS.filter((r) => r.orgCode === 'D1000'), TODAY);
    expect('rate' in s).toBe(false);
  });
});
