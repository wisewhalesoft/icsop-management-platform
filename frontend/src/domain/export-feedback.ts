import { ApiError } from '../api/client';

/**
 * 匯出（CSV）之使用者可見回饋輔助（`error-handling.md#export`）。
 *
 * 三處匯出共用**同一錯誤碼與同一碼標記**；逐字**訊息句式**則由各 feature 各自定義
 * （F039 之量詞為「筆數」／限定詞為「篩選條件」；F037／F038 為「事件」／「查詢條件」），
 * 兩者刻意不同，故本模組只共用「碼標記」與「筆數解析」，不共用句子本體。
 */

/** 匯出筆數上限（與後端 `storage/csv-export.ts` 之 `EXPORT_ROW_LIMIT` 同值）。 */
export const EXPORT_ROW_LIMIT = 10000;

/** 錯誤回饋之碼標記（與訊息同時可見，供使用者回報問題時定位）。 */
export const EXPORT_LIMIT_BADGE = 'EXPORT_ROW_LIMIT_EXCEEDED · 400';

/** 是否為匯出超限錯誤（後端之 code 可能為「碼: 說明」之完整訊息，故以 includes 判定）。 */
export function isExportLimitError(e: unknown): e is ApiError {
  return e instanceof ApiError && `${e.code} ${e.message}`.includes('EXPORT_ROW_LIMIT_EXCEEDED');
}

/**
 * 自後端訊息取出「符合條件之筆數」。後端訊息形如
 * `EXPORT_ROW_LIMIT_EXCEEDED: 符合條件之筆數為 10001 筆，超過匯出上限 10000 筆…`
 * ⇒ 取第一個數字。解析不到時回上限＋1（至少不顯示 `NaN`／`undefined`）。
 */
export function countFromLimitError(e: ApiError): number {
  const n = `${e.message ?? ''} ${e.code ?? ''}`.match(/\d+/);
  return n ? Number(n[0]) : EXPORT_ROW_LIMIT + 1;
}
