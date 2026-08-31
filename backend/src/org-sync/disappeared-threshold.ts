/**
 * 消失筆數閾值保護（純邏輯，無 IO）
 * upstream-hr-source-contract.md §7.3 / F004 Edge Cases / US-010 AC5。
 *
 * 目的：防止上游來源異常（如 join 條件變動、連線問題）導致「在職者憑空消失」而被誤停用。
 * prevActiveIds＝上次同步時仍在職之帳號穩定鍵集合；
 * currActiveIds＝本次來源回報之在職帳號穩定鍵集合。
 * 消失比例 > 閾值（**10%**，2026-08-31 使用者裁定；原草案 5%）→ 中止同步、不執行任何停用。
 */

export interface DisappearedResult {
  missingIds: string[];
  missingCount: number;
  prevCount: number;
  ratio: number;
}

/**
 * 預設消失筆數閾值。
 *
 * 🔵 **2026-08-31 由 5% 調整為 10%（使用者裁定）**。背景：AS 有 **74 筆永久性「消失」帳號**
 * ——16 人轉調他家（新公司帳號已啟用）、6 人他家亦離職、52 筆為 v1.0 `VW_HPMUSER` 污染殘留
 * （RPA 機器人／外部事務所／保留號／測試帳號，全部從未登入）。這 74 筆**永遠不會自我消解**：
 * 依 US-010 AC4「絕不以來源消失逕行判定為離職」，同步不會停用它們，故消失比例恆為 6.6%
 * （74/1124），5% 閾值使 AS 每次同步必然中止——2026-08-24 起連續失敗 11 次、7 天未同步。
 * 「每次都擋」等於沒有護欄，故放寬至 10% 讓常態同步得以進行。
 *
 * ⚠ **代價要記住**：AS 的觸發點為 112 人，其中 74 個名額已被上述幽靈帳號長期佔用，
 * 真實的上游異常需再多消失 **39 人**才會被擋下。若日後那 74 筆被清理，
 * 應一併考慮把本值調回較嚴格的水準。
 */
export const DEFAULT_DISAPPEARED_THRESHOLD = 0.1;

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
