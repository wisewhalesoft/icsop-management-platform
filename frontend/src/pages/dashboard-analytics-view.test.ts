import { describe, it, expect } from 'vitest';
import {
  CATEGORY_LIMIT,
  DONUT_CIRCUMFERENCE,
  DONUT_TOP_N,
  SEG_OTHER,
  barWidths,
  donutSegments,
  normalizeDefaultDimension,
  ojtOnTimeArc,
  topNWithOther,
} from './dashboard-analytics-view';
import { coveragePercent } from './ojt-progress-view';

/**
 * F044 — 前端**版面純函式**建環（`frontend/src/pages/dashboard-analytics-view.ts`）。
 *
 * 涵蓋：`AC-G40`／`AC-G41`（Top N ＋ `其他` 合併段，🔴 圖例不受限）、
 * `AC-G49`（環之弧長抽為純函式）、`AC-G67`（長條寬度抽為純函式）、
 * `AC-G65`（`CATEGORY_LIMIT` 之單一定義點）、`AC-G90` ①（`normalizeDefaultDimension` 七個向量）。
 *
 * 🔴 **本檔對實作全盲**：`./dashboard-analytics-view` 於建環當下尚不存在 ⇒ 預期紅燈為
 *    模組解析失敗（`Failed to resolve import`）。
 *
 * 🔒 **契約**（`architecture-spec` §15.9 之 `pages/dashboard-analytics-view.ts` 一列
 *    ＋ prototype 07 之 `donutSegments`／`barWidths`／`normalizeDefaultDimension` 逐字同名）：
 * ```
 * export const DONUT_TOP_N = 8;            // 🔒 ui-ux-designer 定案（§命名鎖定第 11 列）
 * export const CATEGORY_LIMIT = 10;        // 🔒 ui-ux-designer 定案（AC-G65）
 * export const SEG_OTHER = '其他';          // 🔒 §命名鎖定第 11 列
 * export const DONUT_CIRCUMFERENCE: number; // 2πr，供 stroke-dasharray
 * export type OrgDimension = 'company' | 'division' | 'department';
 * export function normalizeDefaultDimension(v: unknown): OrgDimension;
 * export interface DonutSliceView { key: string; label: string; announced: number; inProgress: number }
 * export interface DonutArc { label: string; value: number; merged: number }
 * export function topNWithOther(slices: readonly DonutSliceView[], n: number): DonutArc[];
 * export function donutSegments(values: readonly number[]): { offset: number; length: number }[];
 * export function barWidths(
 *   announced: number, inProgress: number, max: number,
 * ): { announced: number; inProgress: number };
 * ```
 *
 * ⚠ **本輪之明文盲區（architecture-spec §15.10 #7，逐字轉述）**：弧長／長條寬度**是否真的被接到
 *    `<svg>` 上**，本輪無視覺回歸可驗——純函式只驗幾何計算之輸出。
 *    ⇒ 🔴 本檔**不得**被下游說成「已驗證圖形正確」。
 */

const slice = (key: string, announced: number, inProgress = 0) => ({
  key,
  label: `標籤 ${key}`,
  announced,
  inProgress,
});

describe('normalizeDefaultDimension — AC-G90 ① 七個向量', () => {
  it.each(['company', 'division', 'department'] as const)('合法值 %s 原樣採用', (v) => {
    expect(normalizeDefaultDimension(v)).toBe(v);
  });

  /**
   * 🔴 **沒有下列四種非法向量，「靜默退回」與「原樣採用」在三個合法值之下輸出完全相同，
   *    該條恆真、零鑑別力**（`AC-G90` 逐字）。
   */
  it.each([
    ['undefined（端點降級而省略該鍵，AC-G23）', undefined],
    ['null', null],
    ['空字串', ''],
    ['合法字串但非三值之一：帶尾空白', 'division '],
    ['合法字串但非三值之一：大寫', 'COMPANY'],
  ])('非法向量 %s → 靜默退回 department', (_label, v) => {
    expect(normalizeDefaultDimension(v)).toBe('department');
  });

  it('🔴 不得因此丟錯（頁籤本身可自行切換，退回預設對使用者無感）', () => {
    expect(() => normalizeDefaultDimension({ nope: 1 })).not.toThrow();
    expect(normalizeDefaultDimension({ nope: 1 })).toBe('department');
  });
});

describe('topNWithOther — AC-G40／AC-G41（Top N 合併段）', () => {
  it('🔒 DONUT_TOP_N ＝ 8（ui-ux-designer 定案，§命名鎖定第 11 列）', () => {
    expect(DONUT_TOP_N).toBe(8);
  });

  it('段數未達上限 ⇒ 不產生 `其他` 段', () => {
    const arcs = topNWithOther([slice('a', 5), slice('b', 3)], DONUT_TOP_N);
    expect(arcs).toHaveLength(2);
    expect(arcs.some((a) => a.label === SEG_OTHER)).toBe(false);
  });

  /**
   * 🔴 `AC-G40`：`其他` 段之值 ＝ 被合併之各組織已公告數之**總和**（不得四捨五入、不得省略）。
   * 🔴 `AC-G41`：上限只保護**圖形**版面，不得隱藏資料 ⇒ 圖例仍列出全部（本函式只作用於圖形）。
   */
  it('超過上限 ⇒ 前 N 段照原樣，其餘合併為逐字 `其他`，其值為總和', () => {
    const slices = Array.from({ length: 11 }, (_, i) => slice(`k${i}`, 11 - i));
    const arcs = topNWithOther(slices, DONUT_TOP_N);
    expect(arcs).toHaveLength(DONUT_TOP_N + 1);
    const other = arcs[arcs.length - 1];
    expect(other.label).toBe(SEG_OTHER);
    // 被合併者＝第 9、10、11 段（announced 3、2、1）
    expect(other.value).toBe(6);
    expect(other.merged).toBe(3);
  });

  it('🔴 合併不得改變總和（AC-G40 末句：不得四捨五入、不得省略）', () => {
    const slices = Array.from({ length: 11 }, (_, i) => slice(`k${i}`, 11 - i));
    const total = slices.reduce((a, s) => a + s.announced, 0);
    const arcs = topNWithOther(slices, DONUT_TOP_N);
    expect(arcs.reduce((a, x) => a + x.value, 0)).toBe(total);
  });

  it('恰等於上限 ⇒ 不產生 `其他`（邊界）', () => {
    const slices = Array.from({ length: DONUT_TOP_N }, (_, i) => slice(`k${i}`, 8 - i));
    const arcs = topNWithOther(slices, DONUT_TOP_N);
    expect(arcs).toHaveLength(DONUT_TOP_N);
    expect(arcs.some((a) => a.label === SEG_OTHER)).toBe(false);
  });

  it('空輸入 ⇒ 空輸出（環圖空狀態由元件層承載，AC-G46）', () => {
    expect(topNWithOther([], DONUT_TOP_N)).toEqual([]);
  });
});

describe('donutSegments — AC-G49（弧長之固定向量）', () => {
  it('向量①：各段長度總和恆為周長', () => {
    const segs = donutSegments([3, 2, 1]);
    const total = segs.reduce((a, s) => a + s.length, 0);
    expect(total).toBeCloseTo(DONUT_CIRCUMFERENCE, 6);
  });

  it('向量②：單一值佔滿整圈', () => {
    const segs = donutSegments([7]);
    expect(segs).toHaveLength(1);
    expect(segs[0].length).toBeCloseTo(DONUT_CIRCUMFERENCE, 6);
    expect(segs[0].offset).toBe(0);
  });

  it('向量③：零值不產生可見段（長度 0），且不打亂其後各段之 offset', () => {
    const segs = donutSegments([1, 0, 1]);
    expect(segs[1].length).toBe(0);
    expect(segs[2].offset).toBeCloseTo(segs[0].length, 6);
    expect(segs[0].length + segs[2].length).toBeCloseTo(DONUT_CIRCUMFERENCE, 6);
  });

  it('全零（總和 0）⇒ 每段長度皆 0，不得除以 0 產生 NaN', () => {
    const segs = donutSegments([0, 0]);
    for (const s of segs) {
      expect(Number.isFinite(s.length)).toBe(true);
      expect(s.length).toBe(0);
    }
  });

  it('offset 為前面各段長度之累加（相鄰不重疊）', () => {
    const segs = donutSegments([2, 3, 5]);
    expect(segs[0].offset).toBe(0);
    expect(segs[1].offset).toBeCloseTo(segs[0].length, 6);
    expect(segs[2].offset).toBeCloseTo(segs[0].length + segs[1].length, 6);
  });

  it('弧長與數值成比例（5 : 3 之比在長度上成立）', () => {
    const segs = donutSegments([5, 3]);
    expect(segs[0].length / segs[1].length).toBeCloseTo(5 / 3, 6);
  });
});

describe('barWidths — AC-G67（長條寬度之固定向量）', () => {
  it('向量①：max === 0 ⇒ 兩段皆 0（不得 NaN／Infinity）', () => {
    expect(barWidths(0, 0, 0)).toEqual({ announced: 0, inProgress: 0 });
    expect(barWidths(3, 2, 0)).toEqual({ announced: 0, inProgress: 0 });
  });

  it('向量②：單邊為 0', () => {
    expect(barWidths(4, 0, 4)).toEqual({ announced: 100, inProgress: 0 });
    expect(barWidths(0, 4, 4)).toEqual({ announced: 0, inProgress: 100 });
  });

  it('向量③：兩邊皆為 0（但 max > 0）', () => {
    expect(barWidths(0, 0, 10)).toEqual({ announced: 0, inProgress: 0 });
  });

  it('寬度與數值成比例，且兩段相加不超過 100%', () => {
    const w = barWidths(3, 2, 10);
    expect(w.announced).toBeCloseTo(30, 6);
    expect(w.inProgress).toBeCloseTo(20, 6);
    expect(w.announced + w.inProgress).toBeLessThanOrEqual(100);
  });
});

describe('CATEGORY_LIMIT — AC-G65 之單一定義點', () => {
  /**
   * ⚠ `AC-G65`：`僅顯示前 {CATEGORY_LIMIT} 類` 之 `10` 隨常數而動
   * ⇒ 🔒 **測試須由同一個常數推導該字串，不得寫死 `'僅顯示前 10 類'` 字面**
   *    （寫死時調整上限會同時改壞實作與測試的期望值，而那一改是「改測試期望值」——§庚 明文禁止）。
   */
  it('🔒 CATEGORY_LIMIT ＝ 10（ui-ux-designer 定案）', () => {
    expect(CATEGORY_LIMIT).toBe(10);
  });
});

// ══════════════════ AC-G97 · ojtOnTimeArc（卡④ 環圖之幾何純函式）══════════════════

/**
 * 🔒 **權威**：`prototypes/07-admin-shell.html:342-348`（`OJT_DONUT_R` ／ `ojtOnTimeArc`）
 *    ＋ `docs/ui-ux-design-overview.md` §A.16 之「幾何純函式」段。
 *
 * 🔴 **為何這一層非有不可**（`AC-G97` 逐字）：本輪之簡化環**無視覺回歸**
 *    ⇒ **弧長畫得對不對，機器只在這一層驗得到**。元件層只驗得到「有沒有畫」，驗不到「畫多長」。
 *
 * 🔒 **契約**（比照 `AC-G49` 之 `donutSegments`）：
 * ```
 * export function ojtOnTimeArc(numerator: number, denominator: number): { length: number; rest: number };
 * ```
 */
describe('ojtOnTimeArc — AC-G97 之固定向量', () => {
  /**
   * 🔒 周長**由函式自己導出**（`length + rest`），不從模組 import 任何 OJT 常數。
   * 🔴 理由：若改成 import 一個常數再拿它當期望值，該常數寫錯時**兩邊會一起錯、斷言恆真**。
   *    半徑本身另以一條獨立的 `it` 鎖住（見下），紅燈才分得出「半徑錯」與「比例算錯」。
   */
  const circumference = () => {
    const a = ojtOnTimeArc(1, 2);
    return a.length + a.rest;
  };

  it('🔒 length + rest 恆等於周長（與 X／Y 無關）', () => {
    const C = circumference();
    for (const [x, y] of [[0, 4], [1, 4], [3, 4], [4, 4], [1, 3], [0, 0], [7, 3]]) {
      const a = ojtOnTimeArc(x, y);
      expect(a.length + a.rest).toBeCloseTo(C, 9);
    }
  });

  it('① X === 0 ⇒ 空環（length 0、rest 為整個周長）', () => {
    const C = circumference();
    const a = ojtOnTimeArc(0, 4);
    expect(a.length).toBe(0);
    expect(a.rest).toBeCloseTo(C, 9);
  });

  it('② X === Y ⇒ 滿環（length ＝ 周長、rest 0）', () => {
    const C = circumference();
    const a = ojtOnTimeArc(4, 4);
    expect(a.length).toBeCloseTo(C, 9);
    expect(a.rest).toBeCloseTo(0, 9);
  });

  it('③ 中間值 3/4 ⇒ 0.75 × 周長', () => {
    const C = circumference();
    expect(ojtOnTimeArc(3, 4).length).toBeCloseTo(0.75 * C, 9);
  });

  it('④ denominator === 0 ⇒ length 0（🔴 不得 NaN、不得負數）', () => {
    const C = circumference();
    const a = ojtOnTimeArc(0, 0);
    expect(a.length).toBe(0);
    expect(a.rest).toBeCloseTo(C, 9);
    expect(Number.isNaN(a.length)).toBe(false);
    expect(Number.isNaN(a.rest)).toBe(false);
  });

  /** 🔒 prototype `:345` 之 `Math.max(0, Math.min(1, …))`——兩端皆夾。 */
  it('⑤ 比值夾在 [0, 1]：X > Y ⇒ 滿環（不得溢出周長）；X < 0 ⇒ 空環', () => {
    const C = circumference();
    const over = ojtOnTimeArc(7, 3);
    expect(over.length).toBeCloseTo(C, 9);
    expect(over.rest).toBeCloseTo(0, 9);
    expect(ojtOnTimeArc(-2, 4).length).toBe(0);
  });

  /**
   * 🔒 `prototypes/07-admin-shell.html:342` 逐字：`const OJT_DONUT_R = 26`。
   * 🔴 **刻意與兩張大環圖之 `DONUT_RADIUS`（54）不同**——卡④ 之環是 64×64 的小環。
   *    ⇒ 本條若紅而上面幾條綠，代表**比例算對了、半徑取錯了**（很可能誤用了大環的常數）。
   */
  it('🔒 半徑 ＝ 26（prototype `OJT_DONUT_R`），刻意不等於大環圖之 54', () => {
    expect(circumference()).toBeCloseTo(2 * Math.PI * 26, 9);
    expect(circumference()).not.toBeCloseTo(DONUT_CIRCUMFERENCE, 3);
  });

  /**
   * 🔴 **本 describe 最重要的一條**（`G44-30` 之同型應用：裁決的**理由**要有載體）：
   *
   * 設計裁決逐字：「**弧長採未四捨五入之比值，中央文字採 `coveragePercent()` 之整數
   * ——兩者刻意不同源**：文字要可讀（整數），弧長要準（`1/3` 應畫 33.33% 而非 33%）。
   * 差距恆 < 1%，不影響判讀；**這是刻意的，不要『修』成同源**。」
   *
   * ⚠ **沒有這一條，那句話只是一行註解、沒有任何防線**——下一個人「順手統一」成同源時，
   *    上面五條向量**全部照樣綠**（`0`／`3/4`／`4/4` 的整數百分比與未捨入比值恰好相等，
   *    🔴 **既有向量對這個改動零鑑別力**）。本條刻意挑一個**會讓兩者不等**的分數。
   */
  it('🔴 弧長採未捨入比值、與 coveragePercent() 之整數刻意不同源（1/3）', () => {
    const C = circumference();
    // 🔒 自證：語料真的能鑑別——`coveragePercent(1,3)` 為整數 33，而真比值為 0.3333…
    expect(coveragePercent(1, 3)).toBe(33);

    const arc = ojtOnTimeArc(1, 3);
    // ① 弧長 ＝ **未捨入**比值 × 周長
    expect(arc.length).toBeCloseTo((1 / 3) * C, 9);
    // ② 🔴 因此**不得**等於「整數百分比之弧長」（若被改成同源，本行翻紅）
    const roundedArcLength = (33 / 100) * C;
    expect(Math.abs(arc.length - roundedArcLength)).toBeGreaterThan(1e-6);
    // ③ 🔒 但差距恆 < 1% 之周長（設計裁決逐字）——證明它是「更準」而不是「算錯」
    expect(Math.abs(arc.length - roundedArcLength)).toBeLessThan(C * 0.01);
  });

  /**
   * 🔒 **反向對照**：在整數百分比與真比值**相等**的向量下，兩者本來就該相等。
   * 🔴 用意＝證明上一條的不等**來自 1/3 這個分數**，而不是來自「弧長恆不等於百分比弧長」
   *    這種寫壞的實作（那種實作在本條會翻紅）。
   */
  it('🔒 反向對照：3/4（整數百分比恰等於真比值）⇒ 兩者必須相等', () => {
    const C = circumference();
    expect(coveragePercent(3, 4)).toBe(75);
    expect(ojtOnTimeArc(3, 4).length).toBeCloseTo((75 / 100) * C, 9);
  });
});
