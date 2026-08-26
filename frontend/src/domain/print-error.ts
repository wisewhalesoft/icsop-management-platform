import { ApiError } from '../api/client';

/**
 * 「新視窗開不起來」之**全站唯一**文案（後台入口 `AppShell`、前台詳情與檢視器之列印共用）。
 * 各處各寫一版時，同一件事會出現三種說法，且日後調整措辭必漏改其中一處。
 */
export const POPUP_BLOCKED_TEXT = '新視窗被瀏覽器封鎖，請允許彈出視窗後再試。';

/**
 * 前台列印失敗訊息（詳情頁與檢視器共用）。
 * `POPUP_BLOCKED` 是本前端自造之錯誤碼（`openPdfViaBlob`），非後端穩定碼——它代表分頁根本沒開成，
 * 對使用者而言是「允許彈出視窗」而非「列印失敗」，故獨立成句、不套一般錯誤碼格式。
 */
export function printErrorMessage(e: unknown): string {
  if (e instanceof ApiError && e.code === 'POPUP_BLOCKED') return POPUP_BLOCKED_TEXT;
  const detail = e instanceof ApiError ? e.code : e instanceof Error ? e.message : '未知錯誤';
  return `列印失敗：${detail}`;
}
