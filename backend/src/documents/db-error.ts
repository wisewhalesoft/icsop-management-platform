/**
 * F013：判定驅動層錯誤是否為唯一鍵/唯一索引違反（mssql/tedious）。
 *
 * 併發下應用層預查（isNumberAvailable）與 DB filtered unique index 為雙保險；
 * 當兩交易競態使預查放行、由 DB 攔下時，底層拋出 TypeORM `QueryFailedError`，
 * 其 `driverError.number` 對 mssql 為：
 *   - 2601 = Cannot insert duplicate key row（唯一索引）
 *   - 2627 = Violation of UNIQUE KEY constraint
 * 精確比對此二碼，避免把外鍵違反(547)、逾時、死結等**不相關** DB 錯誤誤判為編號重複
 * （TS-F013-003：過寬映射之負向防護）。同時容忍未經 TypeORM 包裝之原始 mssql 錯誤（頂層 `number`）。
 */
export function isUniqueConstraintViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { driverError?: { number?: unknown }; number?: unknown };
  const num = e.driverError?.number ?? e.number;
  return num === 2601 || num === 2627;
}
