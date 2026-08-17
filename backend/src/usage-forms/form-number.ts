import { BadRequestException } from '@nestjs/common';

/**
 * 使用表單編號（`USAGE_FORM_POOL.formNumber`）之正規化與驗證純函式。
 *
 * 權威＝`docs/specs/error-handling.md#usage-form-number`。
 *
 * 🔴 為何是**共用**純函式：上傳建立與「編輯編號」端點是兩條寫入路徑，各寫一份
 * trim／lowercase 正是「上傳擋得住、編輯擋不住」這類分歧的溫床（architecture-spec §10.7 A14）。
 */

/** `USAGE_FORM_POOL.formNumber` 之欄寬（nvarchar(100)）。 */
export const FORM_NUMBER_MAX_LENGTH = 100;

/**
 * 正規化（先於一切驗證）：一律 trim；trim 後為空字串／純空白／未提供 → `null`。
 * 🔴 大小寫**不改寫**——不分大小寫僅用於「比對」，不用於落地值（使用者輸入什麼就存什麼）。
 */
export function normalizeFormNumber(input: string | null | undefined): string | null {
  const trimmed = (input ?? '').trim();
  return trimmed === '' ? null : trimmed;
}

/** 長度上限（以 trim 後之值計算）。超出 → 400 `USAGE_FORM_NUMBER_TOO_LONG`，不寫入任何記錄。 */
export function assertFormNumberValid(formNumber: string | null): void {
  if (formNumber !== null && formNumber.length > FORM_NUMBER_MAX_LENGTH) {
    throw new BadRequestException(
      `USAGE_FORM_NUMBER_TOO_LONG: 表單編號長度上限為 ${FORM_NUMBER_MAX_LENGTH} 字元`,
    );
  }
}

/** 唯一性比對鍵：trim 後轉小寫。`null` 不參與比對（多筆空編號可並存）。 */
export function formNumberCompareKey(formNumber: string | null): string | null {
  return formNumber === null ? null : formNumber.toLowerCase();
}
