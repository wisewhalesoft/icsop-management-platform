/**
 * 在職 / 部門有效判定（純邏輯，無 IO）
 * upstream-hr-source-contract.md §4（哨兵）／§6（在職判定，v2.0 改寫）。
 */

/** 哨兵：未結束／無期限。多數日期欄為 NOT NULL，以 9999-12-31 表示而非 NULL。 */
export const DEPT_SENTINEL_CLOSE_DATE = new Date('9999-12-31T00:00:00Z');

/**
 * 取日期部分（UTC）之毫秒值，供「以日為單位」之比較。
 *
 * ⚠ 一律走 UTC：容器以 `TZ=UTC` 釘死、TypeORM 之 tedious `useUTC:true`（見 nfr.md#deployment），
 * 故本地時間與 UTC 同義；改用 `getFullYear()` 等本地方法會在非 UTC 開發機上得到不同結果，
 * 而**兩種設定下天真的單元測試都會過**，屬不可見漂移。
 */
function utcDateOnly(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * 在職判定權威＝**`RESIGN_DATE >= 判定基準日（當日零時）`**（契約 §6，v2.0）。
 *
 * `RESIGN_DATE` 之語意經上游確認為**「最後在職日」** ⇒ 當日仍屬在職，故比較須**以日為單位**，
 * 不得直接比時間戳：`RESIGN_DATE` 為日期（00:00:00），而同步執行於當日稍晚，
 * 天真的 `resign >= now` 會使「最後在職日為今天」者自 00:00:01 起即被判離職。
 *
 * 🔴 **v1.0 之 `EMPSTS='A'` 已停用**——該欄僅存在於已停用的 `VW_HPMUSER`（契約 §3.7）。
 *
 * @param resignDate 上游 `RESIGN_DATE`；`null`／`undefined`（哨兵 9999-12-31 經
 *   `normalizeUpstreamDate` 收斂）視為**未離職 ⇒ 在職**。
 * @param now 判定基準時刻（同步執行時刻）。
 */
export function isEmploymentActive(
  resignDate: Date | string | null | undefined,
  now: Date,
): boolean {
  if (resignDate === null || resignDate === undefined) return true;
  const d = resignDate instanceof Date ? resignDate : new Date(resignDate);
  if (Number.isNaN(d.getTime())) {
    throw new RangeError(`INVALID_RESIGN_DATE: ${String(resignDate)}`);
  }
  return utcDateOnly(d) >= utcDateOnly(now);
}

/**
 * 部門有效 ⇔ CLOSE_DATE > now（嚴格大於；哨兵 9999-12-31 恆為有效）。
 * 接受 Date 或可解析之日期字串。
 *
 * ⚠ 刻意與 `isEmploymentActive` 之「以日比較」不同：部門關閉採**時間戳嚴格大於**，
 * 係 v1.0 既有且已驗收之語意（`CLOSE_DATE > GETDATE()`，契約 §4），不隨 v2.0 換來源而變動。
 */
export function isDeptActive(closeDate: Date | string, now: Date): boolean {
  const d = closeDate instanceof Date ? closeDate : new Date(closeDate);
  if (Number.isNaN(d.getTime())) {
    throw new RangeError(`INVALID_CLOSE_DATE: ${String(closeDate)}`);
  }
  return d.getTime() > now.getTime();
}
