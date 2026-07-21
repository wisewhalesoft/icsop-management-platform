import {
  normalizeUpstreamDate,
  MSSQL_DATETIME_MIN_YEAR,
  UPSTREAM_SENTINEL_YEAR,
} from './upstream-date';

/**
 * 上游日期正規化（純函式，無 IO）——第三個只有真實資料才現形之 bug 修正。
 *
 * 根因：MSSQL `datetime` 範圍僅 1753-01-01 ～ 9999-12-31；上游（遮罩 dev）日期值可能
 * 低於 1753、為 Invalid Date（遮罩破壞）、或哨兵 9999-12-31 之邊界 → tedious 綁定「Out of range」。
 * 策略：
 *  - 哨兵 9999-12-31（未離職/未結束，契約 §4）→ null（語意乾淨，勝過存 magic date）。
 *  - Invalid Date → null。
 *  - 低於可儲存範圍（< 1753）或明顯異常 → null。
 *  - 正常日期 → 原樣（passthrough，getTime 不變）。
 */

describe('normalizeUpstreamDate', () => {
  it('null / undefined / 空字串 / 純空白 → null', () => {
    expect(normalizeUpstreamDate(null)).toBeNull();
    expect(normalizeUpstreamDate(undefined)).toBeNull();
    expect(normalizeUpstreamDate('')).toBeNull();
    expect(normalizeUpstreamDate('   ')).toBeNull();
  });

  it('Invalid Date（字串或 Date 物件）→ null', () => {
    expect(normalizeUpstreamDate('not-a-date')).toBeNull();
    expect(normalizeUpstreamDate(new Date('bad'))).toBeNull();
  });

  it('哨兵 9999-12-31（字串/Date）→ null（未離職/未結束）', () => {
    expect(normalizeUpstreamDate('9999-12-31')).toBeNull();
    expect(normalizeUpstreamDate(new Date('9999-12-31T00:00:00Z'))).toBeNull();
  });

  it('年份 >= 9999（含溢位邊界 9999-12-31 23:59:59.999）→ null', () => {
    expect(normalizeUpstreamDate('9999-12-31T23:59:59.999Z')).toBeNull();
  });

  it('低於 MSSQL datetime 可儲存範圍（< 1753）→ null', () => {
    expect(normalizeUpstreamDate('1600-01-01')).toBeNull();
    expect(normalizeUpstreamDate('1752-12-31')).toBeNull();
  });

  it('邊界 1753-01-01（datetime 下界）→ 保留', () => {
    const d = normalizeUpstreamDate('1753-01-01T00:00:00Z');
    expect(d).not.toBeNull();
    expect(d?.getUTCFullYear()).toBe(1753);
  });

  it('正常日期（字串/Date）→ 原樣 passthrough（getTime 不變）', () => {
    const t = new Date('2026-07-09T08:00:00Z').getTime();
    expect(normalizeUpstreamDate('2026-07-09T08:00:00Z')?.getTime()).toBe(t);
    expect(normalizeUpstreamDate(new Date(t))?.getTime()).toBe(t);
  });

  it('匯出之範圍常數', () => {
    expect(MSSQL_DATETIME_MIN_YEAR).toBe(1753);
    expect(UPSTREAM_SENTINEL_YEAR).toBe(9999);
  });
});
