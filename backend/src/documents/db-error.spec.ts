import { isUniqueConstraintViolation } from './db-error';

/**
 * F013：驅動層唯一鍵/唯一索引違反之精確判定（TS-F013-001/002/003 之判斷式本身）。
 * mssql/tedious：2601（duplicate key row，唯一索引）、2627（violation of unique constraint）。
 */
describe('isUniqueConstraintViolation（F013 DB 錯誤映射判斷式）', () => {
  it('QueryFailedError 包 driverError.number=2601（唯一索引違反）→ true', () => {
    expect(
      isUniqueConstraintViolation({ name: 'QueryFailedError', driverError: { number: 2601 } }),
    ).toBe(true);
  });

  it('QueryFailedError 包 driverError.number=2627（唯一約束違反）→ true', () => {
    expect(
      isUniqueConstraintViolation({ name: 'QueryFailedError', driverError: { number: 2627 } }),
    ).toBe(true);
  });

  it('原始 mssql 錯誤直接帶 number=2601（未經 TypeORM 包裝）→ true', () => {
    expect(isUniqueConstraintViolation({ number: 2601 })).toBe(true);
  });

  it('外鍵違反 547 → false（不得誤判為編號重複）', () => {
    expect(
      isUniqueConstraintViolation({ name: 'QueryFailedError', driverError: { number: 547 } }),
    ).toBe(false);
  });

  it('連線逾時等無 number 之一般錯誤 → false', () => {
    expect(isUniqueConstraintViolation(new Error('ETIMEDOUT'))).toBe(false);
  });

  it('null / undefined / 非物件 → false（防禦）', () => {
    expect(isUniqueConstraintViolation(null)).toBe(false);
    expect(isUniqueConstraintViolation(undefined)).toBe(false);
    expect(isUniqueConstraintViolation('2601')).toBe(false);
  });
});
