import {
  computeDisappeared,
  disappearedRatioExceeded,
} from './disappeared-threshold';

/**
 * 消失筆數閾值保護（upstream-hr-source-contract.md §7.3 / F004 AC / US-010 AC5）。
 * prevActiveIds＝上次同步之在職帳號；currActiveIds＝本次來源之在職帳號集合。
 * 「上次存在、本次消失」比例 > 閾值（草案 5%）→ 中止同步、不停用任何帳號。
 */

function ids(prefix: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => `${prefix}${i}`);
}

describe('computeDisappeared', () => {
  it('回傳消失清單、筆數、母數與比例', () => {
    const prev = ['a', 'b', 'c', 'd'];
    const curr = ['a', 'c']; // b, d 消失
    const r = computeDisappeared(prev, curr);
    expect(r.missingIds.sort()).toEqual(['b', 'd']);
    expect(r.missingCount).toBe(2);
    expect(r.prevCount).toBe(4);
    expect(r.ratio).toBeCloseTo(0.5);
  });

  it('prev 為空 → 比例 0（避免除以 0）', () => {
    const r = computeDisappeared([], ['a', 'b']);
    expect(r.prevCount).toBe(0);
    expect(r.missingCount).toBe(0);
    expect(r.ratio).toBe(0);
  });

  it('全部仍在 → 消失 0', () => {
    const r = computeDisappeared(['a', 'b'], ['a', 'b', 'c']);
    expect(r.missingCount).toBe(0);
    expect(r.ratio).toBe(0);
  });
});

describe('disappearedRatioExceeded（閾值 0.05）', () => {
  it('AC：60 / 1000 = 6% > 5% → true（中止）', () => {
    const prev = ids('p', 1000);
    const curr = prev.slice(60); // 前 60 筆消失
    expect(disappearedRatioExceeded(prev, curr, 0.05)).toBe(true);
  });

  it('AC：20 / 1000 = 2% ≤ 5% → false（放行）', () => {
    const prev = ids('p', 1000);
    const curr = prev.slice(20); // 前 20 筆消失
    expect(disappearedRatioExceeded(prev, curr, 0.05)).toBe(false);
  });

  it('恰為 5%（50/1000）→ false（非嚴格大於，＝放行）', () => {
    const prev = ids('p', 1000);
    const curr = prev.slice(50);
    expect(disappearedRatioExceeded(prev, curr, 0.05)).toBe(false);
  });

  it('prev 為空 → false（無可誤停用者）', () => {
    expect(disappearedRatioExceeded([], [], 0.05)).toBe(false);
  });

  it('預設閾值＝0.05', () => {
    const prev = ids('p', 1000);
    expect(disappearedRatioExceeded(prev, prev.slice(60))).toBe(true);
    expect(disappearedRatioExceeded(prev, prev.slice(20))).toBe(false);
  });
});
