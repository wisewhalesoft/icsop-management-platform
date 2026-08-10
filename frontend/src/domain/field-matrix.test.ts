import { FIELD_MATRIX, FieldKey, canWriteField } from './field-matrix';
import { ROLE_CODES } from './function-matrix';

/**
 * 前端鏡射之 F026 角色×欄位矩陣單測。
 * 權威值＝backend/src/rbac/field-matrix.ts（逐格一致；後端更新時同步）。
 */
describe('field-matrix（前端鏡射）', () => {
  it('20 欄位，每列涵蓋全部 5 角色（F039 新增「附錄」）', () => {
    const keys = Object.keys(FIELD_MATRIX);
    expect(keys).toHaveLength(20);
    for (const key of keys) {
      expect(Object.keys(FIELD_MATRIX[key]).sort()).toEqual([...ROLE_CODES].sort());
    }
  });

  it('系統 UUID：全角色 IGNORE（系統產生）', () => {
    for (const r of ROLE_CODES) {
      expect(canWriteField(r, FieldKey.SYSTEM_UUID)).toBe('IGNORE');
    }
  });

  it('業務欄位：僅 ICSOPAdmin 可寫、其餘（含 SysAdmin）拒寫', () => {
    expect(canWriteField('ICSOPAdmin', FieldKey.DOCUMENT_STATUS)).toBe('WRITABLE');
    expect(canWriteField('SysAdmin', FieldKey.DOCUMENT_STATUS)).toBe('FORBIDDEN');
    expect(canWriteField('Supervisor', FieldKey.CONTENT_SUMMARY)).toBe('FORBIDDEN');
    expect(canWriteField('User', FieldKey.DOCUMENT_NAME)).toBe('FORBIDDEN');
  });

  it('canWriteField fail-closed：未知欄位/未提供角色 → FORBIDDEN', () => {
    expect(canWriteField('ICSOPAdmin', '不存在欄位')).toBe('FORBIDDEN');
    expect(canWriteField(undefined, FieldKey.DOCUMENT_STATUS)).toBe('FORBIDDEN');
  });
});

/** F041 AC-38（前端鏡射，F026 delta AC-U2）：矩陣不新增列已由上方既有測試覆蓋（未新增列）；
 * 本區塊補簽章鎖定。 */
describe('F041 AC-38：canWriteField 前端鏡射不受一般使用者子分類影響', () => {
  it('AC-U2 簽章不含 userSubtype 參數（arity=2）', () => {
    expect(canWriteField.length).toBe(2);
  });
});
