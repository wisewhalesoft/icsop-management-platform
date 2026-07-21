import {
  isEmploymentActive,
  isDeptActive,
  DEPT_SENTINEL_CLOSE_DATE,
} from './employment-status';

/**
 * 在職 / 部門有效判定（upstream-hr-source-contract.md §4 / §6）。
 *  - 在職權威欄位＝EMPSTS='A'（優於 RESIGNDT）
 *  - 部門有效 ⇔ CLOSE_DATE > now（哨兵 9999-12-31）
 */

describe('isEmploymentActive（EMPSTS=A）', () => {
  it('EMPSTS=A → true', () => {
    expect(isEmploymentActive('A')).toBe(true);
  });
  it('EMPSTS=B（離職）/ C / 其他 / 空 → false', () => {
    expect(isEmploymentActive('B')).toBe(false);
    expect(isEmploymentActive('C')).toBe(false);
    expect(isEmploymentActive('')).toBe(false);
    expect(isEmploymentActive(null)).toBe(false);
    expect(isEmploymentActive(undefined)).toBe(false);
  });
  it('大小寫敏感：小寫 a 不算在職（上游值域為大寫 A）', () => {
    expect(isEmploymentActive('a')).toBe(false);
  });
});

describe('isDeptActive（CLOSE_DATE > now）', () => {
  const now = new Date('2026-07-21T00:00:00Z');

  it('哨兵 9999-12-31 → 有效（true）', () => {
    expect(isDeptActive(DEPT_SENTINEL_CLOSE_DATE, now)).toBe(true);
    expect(isDeptActive(new Date('9999-12-31T00:00:00Z'), now)).toBe(true);
  });

  it('CLOSE_DATE 在未來 → 有效', () => {
    expect(isDeptActive(new Date('2026-08-01T00:00:00Z'), now)).toBe(true);
  });

  it('CLOSE_DATE 已過 → 無效（false）', () => {
    expect(isDeptActive(new Date('2020-01-01T00:00:00Z'), now)).toBe(false);
  });

  it('CLOSE_DATE 等於 now → 無效（非嚴格大於）', () => {
    expect(isDeptActive(new Date('2026-07-21T00:00:00Z'), now)).toBe(false);
  });

  it('接受可解析之日期字串', () => {
    expect(isDeptActive('9999-12-31', now)).toBe(true);
    expect(isDeptActive('2020-01-01', now)).toBe(false);
  });
});
