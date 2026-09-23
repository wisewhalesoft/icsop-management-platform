/**
 * 錯誤代碼之 ⓘ 文案（2026-09-23 全站文案稽核）。
 *
 * 🔴 使用者裁決：**實作邏輯與技術細節不得常駐於 UI；如需保留一律改以 hover（ⓘ）承載。**
 * 錯誤代碼對使用者沒有意義，但**回報問題時對客服／維運有意義** ⇒ 不刪除，改為只在 ⓘ 內出現。
 *
 * ⚠ 可見文字一律回答「我接下來該做什麼」（洽誰、去哪裡），代碼只活在 ⓘ 裡。
 */

/** 無權限遮罩之可見引導句（取代原先常駐之 `PERMISSION_DENIED · 403` 小字）。 */
export const BLOCKED_ACTION_HINT = '需要存取權請洽系統管理員。';

/** 唯讀橫幅之可見引導句（取代原先寫在句尾括號內之 `FIELD_WRITE_FORBIDDEN`）。 */
export const READONLY_ACTION_HINT = '需要編輯權請洽系統管理員。';

/** ⓘ 內容：回報用的錯誤代碼。 */
export function errorCodeNote(code: string): string {
  return `回報問題時請提供錯誤代碼：${code}`;
}

/** 無權限遮罩（全站 21 處）之 ⓘ 內容。 */
export const BLOCKED_CODE_NOTE = errorCodeNote('PERMISSION_DENIED · 403');

/** 唯讀角色觸發寫入時之 ⓘ 內容。 */
export const FIELD_WRITE_CODE_NOTE = errorCodeNote('FIELD_WRITE_FORBIDDEN · 403');

/** 前台／後台共用之通用失敗句（可見），代碼一律另走 ⓘ 或 toast 之 `code` 小字欄。 */
export const LOAD_FAILED_TEXT = '載入失敗，請稍後再試。';
export const DOWNLOAD_FAILED_TEXT = '下載失敗，請稍後再試。';
