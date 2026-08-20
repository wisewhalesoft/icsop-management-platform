/**
 * F018「表單編號」（`formNumber`）之逐字文案、欄寬與正規化——**新增頁與編輯頁共用之單一來源**。
 *
 * 🔴 為何抽為模組而非各頁各寫一次：`AC-N44`／`AC-N48` 明訂新增頁與編輯頁之 placeholder、
 * `maxlength`、兩則錯誤訊息**逐字相同、不另造**。兩處各寫一份字面字串時，兩條 AC 各自綠燈
 * 但字串可獨立漂移——本 repo 已於「上傳 modal ↔ 編號 modal」踩過同一形狀。
 *
 * 📝 **搬遷來源逐字保留供追溯**：OLD> `UsageFormManagementPage.tsx` 之
 * `FORM_NUMBER_PLACEHOLDER`／`FORM_NUMBER_MAX_LENGTH`／`editNumberErrorMessage()`
 * （兩個 modal 已由 `AC-N41` 整頁化取代，該檔不再持有這些常數）。
 *
 * 規則權威＝`docs/specs/error-handling.md#usage-form-number`（`AC-N44` 明訂一字不改）。
 */

/** 上傳／編輯兩處共用之 placeholder（`AC-D15` ②／`AC-D16`／`AC-N48`）。 */
export const FORM_NUMBER_PLACEHOLDER = '例：FM-001（不填則留空）';

/** `USAGE_FORM_POOL.formNumber` 之欄寬（與後端 form-number.ts 同值）。 */
export const FORM_NUMBER_MAX_LENGTH = 100;

/** 409 `USAGE_FORM_NUMBER_DUPLICATE` 之逐字訊息（`AC-D15` ③／`AC-N44`）。 */
export const FORM_NUMBER_DUPLICATE_MESSAGE = '表單編號已存在（比對前 trim、不分大小寫）。';

/** 400 `USAGE_FORM_NUMBER_TOO_LONG` 之逐字訊息（`AC-N44`）。 */
export const FORM_NUMBER_TOO_LONG_MESSAGE = '表單編號超過長度上限（100 字元）。';

/**
 * 輸入正規化先於一切驗證：一律 trim；trim 後為空／純空白／未提供者**收斂為 `null`**
 * （空字串不得落地，`AC-D19`）。
 */
export function normalizeFormNumber(v: string | null | undefined): string | null {
  const s = (v ?? '').trim();
  return s === '' ? null : s;
}

/**
 * 自任意錯誤值取出 `code`。
 *
 * ⚠ **刻意不用 `instanceof ApiError`**：本專案之錯誤可能來自 `ApiError`，亦可能為帶 `code`
 * 之一般物件（測試替身、或未來換掉 client 實作時）。以結構取值涵蓋兩者，
 * 不會因為錯誤來源換了型別就悄悄落入「未預期錯誤」分支。
 */
export function errorCodeOf(e: unknown): string | undefined {
  if (e && typeof e === 'object' && 'code' in e) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return undefined;
}

/**
 * 編號相關錯誤 → 就地顯示於編號欄之逐字訊息；**非編號錯誤回 `null`**
 * （呼叫端改以 toast 呈現，避免把不相干的失敗塞進編號欄之錯誤區而誤導使用者）。
 */
export function formNumberErrorMessage(e: unknown): string | null {
  switch (errorCodeOf(e)) {
    case 'USAGE_FORM_NUMBER_DUPLICATE':
      return FORM_NUMBER_DUPLICATE_MESSAGE;
    case 'USAGE_FORM_NUMBER_TOO_LONG':
      return FORM_NUMBER_TOO_LONG_MESSAGE;
    default:
      return null;
  }
}
