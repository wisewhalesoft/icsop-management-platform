import { normalizeReason } from './status-reason';

/**
 * F012 切換原因（OQ-E04-02，選填）之正規化。空字串/純空白視同未填（TS-F012-003/004）。
 */
describe('normalizeReason（F012 切換原因正規化）', () => {
  it('一般文字 → 去頭尾空白後回傳', () => {
    expect(normalizeReason('內容已過時')).toBe('內容已過時');
    expect(normalizeReason('  依法規更新  ')).toBe('依法規更新');
  });

  it('TS-F012-003 空字串 → undefined（視同未填）', () => {
    expect(normalizeReason('')).toBeUndefined();
  });

  it('TS-F012-004 純空白字元 → undefined（視同未填）', () => {
    expect(normalizeReason('   ')).toBeUndefined();
  });

  it('undefined / null → undefined（未帶 reason 鍵）', () => {
    expect(normalizeReason(undefined)).toBeUndefined();
    expect(normalizeReason(null)).toBeUndefined();
  });
});
