/**
 * 消失筆數閾值保護（純邏輯，無 IO）
 * upstream-hr-source-contract.md §7.3 / F004 Edge Cases / US-010 AC5。
 *
 * 目的：防止上游來源異常（如 join 條件變動、連線問題）導致「在職者憑空消失」而被誤停用。
 * prevActiveIds＝上次同步時仍在職之帳號穩定鍵集合；
 * currActiveIds＝本次來源回報之在職帳號穩定鍵集合。
 * 消失比例 > 閾值（草案 5%）→ 中止同步、不執行任何停用。
 */

export interface DisappearedResult {
  missingIds: string[];
  missingCount: number;
  prevCount: number;
  ratio: number;
}

export const DEFAULT_DISAPPEARED_THRESHOLD = 0.05;

export function computeDisappeared(
  prevActiveIds: readonly string[],
  currActiveIds: readonly string[],
): DisappearedResult {
  const curr = new Set(currActiveIds);
  const missingIds = [...new Set(prevActiveIds)].filter((id) => !curr.has(id));
  const prevCount = new Set(prevActiveIds).size;
  const missingCount = missingIds.length;
  const ratio = prevCount === 0 ? 0 : missingCount / prevCount;
  return { missingIds, missingCount, prevCount, ratio };
}

/** 消失比例是否 > 閾值（嚴格大於；恰等於閾值＝放行）。 */
export function disappearedRatioExceeded(
  prevActiveIds: readonly string[],
  currActiveIds: readonly string[],
  threshold: number = DEFAULT_DISAPPEARED_THRESHOLD,
): boolean {
  return computeDisappeared(prevActiveIds, currActiveIds).ratio > threshold;
}
