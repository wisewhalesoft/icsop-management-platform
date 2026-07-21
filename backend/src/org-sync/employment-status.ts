/**
 * 在職 / 部門有效判定（純邏輯，無 IO）
 * upstream-hr-source-contract.md §4（哨兵）／§6（EMPSTS 權威）。
 */

/** 哨兵：未結束／無期限。多數日期欄為 NOT NULL，以 9999-12-31 表示而非 NULL。 */
export const DEPT_SENTINEL_CLOSE_DATE = new Date('9999-12-31T00:00:00Z');

/**
 * 在職判定權威欄位＝EMPSTS='A'（優於 RESIGNDT）。
 * 大小寫敏感：上游值域為大寫 A/B/C（§6）。
 */
export function isEmploymentActive(empsts: string | null | undefined): boolean {
  return empsts === 'A';
}

/**
 * 部門有效 ⇔ CLOSE_DATE > now（嚴格大於；哨兵 9999-12-31 恆為有效）。
 * 接受 Date 或可解析之日期字串。
 */
export function isDeptActive(closeDate: Date | string, now: Date): boolean {
  const d = closeDate instanceof Date ? closeDate : new Date(closeDate);
  if (Number.isNaN(d.getTime())) {
    throw new RangeError(`INVALID_CLOSE_DATE: ${String(closeDate)}`);
  }
  return d.getTime() > now.getTime();
}
