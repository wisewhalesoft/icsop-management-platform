import { describe, it, expect } from 'vitest';
import {
  CATEGORY_LIMIT,
  DONUT_CIRCUMFERENCE,
  DONUT_TOP_N,
  SEG_OTHER,
  barWidths,
  donutSegments,
  normalizeDefaultDimension,
  topNWithOther,
} from './dashboard-analytics-view';

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
