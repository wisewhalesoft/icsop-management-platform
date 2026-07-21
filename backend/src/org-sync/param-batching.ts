/**
 * MSSQL 參數上限切批（純邏輯，無 IO）
 *
 * 根因：MSSQL 單一陳述式最多 2100 個參數（"The server supports a maximum of 2100 parameters"）。
 * 多列 INSERT 之參數量 = 列數 × 每列欄位數 —— 於大量來源資料（AS 2771 帳號、303 部門）會超限。
 * 帳號存在性比對已改為「一次載入全公司帳號」而非 loginId IN (…)，杜絕 SELECT 端超限；
 * 寫入端之批次 INSERT 則以本函式依「每列欄位數」切批，確保每批 列數×欄位數 ≤ 預算。
 */

/** MSSQL 單一陳述式參數硬上限。 */
export const MSSQL_MAX_PARAMS = 2100;

/** 保守預算（< 硬上限，留餘裕）。 */
export const DEFAULT_PARAM_BUDGET = 2000;

/**
 * 依參數預算將 rows 切成多批，使每批 (列數 × fieldsPerRow) ≤ maxParams。
 * fieldsPerRow 大於預算時，每批至少 1 列（避免無限迴圈）。
 */
export function chunkByParamBudget<T>(
  rows: readonly T[],
  fieldsPerRow: number,
  maxParams: number = DEFAULT_PARAM_BUDGET,
): T[][] {
  if (!Number.isFinite(fieldsPerRow) || fieldsPerRow <= 0) {
    throw new RangeError(`fieldsPerRow 必須為正整數：${String(fieldsPerRow)}`);
  }
  const rowsPerChunk = Math.max(1, Math.floor(maxParams / fieldsPerRow));
  const batches: T[][] = [];
  for (let i = 0; i < rows.length; i += rowsPerChunk) {
    batches.push(rows.slice(i, i + rowsPerChunk));
  }
  return batches;
}
