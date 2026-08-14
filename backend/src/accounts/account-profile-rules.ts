/**
 * 手動帳號基本資料（姓名／公司／部門／職位）之正規化與長度規則（F003 delta，純邏輯無 IO）。
 *
 * 規格權威：docs/specs/features/F003-account-role-management.md#manual-account-profile
 *  - AC-P2：四欄一律先 trim；`orgCode`／`jobTitleCode` 於 trim 後為空字串／純空白／未提供
 *    一律收斂為 `null`（**空字串不得落地**，比照 error-handling.md 之 `normalizeSubcategory` 慣例）。
 *  - AC-P4：trim 後長度上限對齊 `ACCOUNT` entity——`name` nvarchar(30)、`companyCode`／
 *    `orgCode`／`jobTitleCode` varchar(10)。
 *
 * 抽為獨立模組（而非塞在 service）：建立與編輯兩條路徑共用同一份正規化與長度規則，
 * 避免兩處各自漂移（AC-P4 明載「建立或編輯」皆適用）。
 */

export const ACCOUNT_NAME_MAX_LENGTH = 30;
export const ACCOUNT_CODE_MAX_LENGTH = 10;

/**
 * 代碼欄之正規化（AC-P2）：trim 後為空 → `null`。
 * `undefined`／`null` 亦回 `null`（呼叫端另以「鍵是否出現」區分「缺席不變更」與「明確清空」）。
 */
export function normalizeAccountCode(
  value: string | null | undefined,
): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/** 姓名之正規化（AC-P2）：僅 trim；是否為空之判定交由 AC-P3 必填檢查。 */
export function normalizeAccountName(
  value: string | null | undefined,
): string | null {
  if (value === null || value === undefined) return null;
  return value.trim();
}

/** trim 後長度是否超過上限（`null` 視為未提供、恆不超限）。 */
export function exceedsLength(value: string | null, max: number): boolean {
  return value !== null && value.length > max;
}
