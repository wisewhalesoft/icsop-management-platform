import { taipeiMonthRange } from './monthly-range';

/**
 * KPI「本月」＝ Asia/Taipei（UTC+8）當月 1 日 00:00 起、次月 1 日 00:00 止（含頭不含尾）。
 * 比照 OQ-NFR007b／OQ-E02-02 既有 UTC+8 慣例；注入固定 now 避免跨月 flaky。
 */
describe('taipeiMonthRange', () => {
  it('月中時刻 → 回傳當月起訖與 YYYY-MM 標籤（UTC+8）', () => {
    const r = taipeiMonthRange(new Date('2026-07-24T02:00:00.000Z')); // 台北 07-24 10:00
    expect(r.month).toBe('2026-07');
    expect(r.from.toISOString()).toBe('2026-06-30T16:00:00.000Z'); // 台北 07-01 00:00
    expect(r.to.toISOString()).toBe('2026-07-31T16:00:00.000Z'); // 台北 08-01 00:00
  });

  it('TS-F006-039 邊界含頭：台北當月 1 日 00:00:00 落在區間起點', () => {
    const r = taipeiMonthRange(new Date('2026-06-30T16:00:00.000Z')); // 台北 07-01 00:00:00
    expect(r.month).toBe('2026-07');
    expect(r.from.getTime()).toBe(new Date('2026-06-30T16:00:00.000Z').getTime());
  });

  it('UTC 已跨月但台北仍在上月末 → 以台北時區判定（不誤跨月）', () => {
    const r = taipeiMonthRange(new Date('2026-06-30T15:59:59.000Z')); // 台北 06-30 23:59:59
    expect(r.month).toBe('2026-06');
    expect(r.from.toISOString()).toBe('2026-05-31T16:00:00.000Z');
    expect(r.to.toISOString()).toBe('2026-06-30T16:00:00.000Z');
  });

  it('跨年：12 月 → 次月為隔年 1 月', () => {
    const r = taipeiMonthRange(new Date('2026-12-15T00:00:00.000Z'));
    expect(r.month).toBe('2026-12');
    expect(r.to.toISOString()).toBe('2026-12-31T16:00:00.000Z'); // 台北 2027-01-01 00:00
  });
});
