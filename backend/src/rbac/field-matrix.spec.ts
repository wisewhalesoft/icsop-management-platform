import {
  FIELD_MATRIX,
  FieldKey,
  canWriteField,
  type FieldKeyValue,
  type FieldWriteOutcome,
} from './field-matrix';
import { ROLE_CODES, type RoleCode } from './function-matrix';

/**
 * F026 角色×欄位矩陣：資料逐格對照 + 純判定 canWriteField。
 * 權威來源：docs/specs/features/F026-role-field-matrix.md（角色×欄位矩陣即權威值）。
 * 定案：ICSOP管理員為唯一可寫；系統管理員／主管／部門窗口／一般使用者對所有欄位皆唯讀（＝拒寫）。
 * 系統產生欄位（系統 UUID）：一律忽略傳入值（IGNORE），不論角色、不報錯（F026 Main Flow 3、error-handling #permission）。
 *
 * enforcement（於文件 CRUD 端點阻擋唯讀欄位寫入）待 F010/F011 端點存在時再接；本 pass 僅資料＋純判定＋測試。
 */

const BUSINESS_FIELDS: FieldKeyValue[] = [
  FieldKey.DOCUMENT_STATUS,
  FieldKey.ESTABLISH_COMPANY,
  FieldKey.ESTABLISH_DEPT,
  FieldKey.ESTABLISH_SECTION,
  FieldKey.DOCUMENT_NUMBER,
  FieldKey.CHIEF_PRIMARY,
  FieldKey.CHIEF_SECONDARY,
  FieldKey.USING_DEPTS,
  FieldKey.REVISION,
  FieldKey.LIFECYCLE,
  FieldKey.NODE,
  FieldKey.LINKED_DOCS,
  FieldKey.ICSOP_PDF,
  FieldKey.USAGE_FORMS,
  FieldKey.ANNOUNCE_DATE,
  FieldKey.OJT_SIGNIN,
  FieldKey.DOCUMENT_NAME,
  FieldKey.CONTENT_SUMMARY,
  FieldKey.APPENDICES,
];

describe('F026 FIELD_MATRIX 逐格對照 spec', () => {
  it('矩陣恰含 20 欄位（1 系統欄位 + 19 業務欄位，F039 新增「附錄」）', () => {
    expect(Object.keys(FIELD_MATRIX)).toHaveLength(20);
    expect(BUSINESS_FIELDS).toHaveLength(19);
  });

  it('F039 附錄：欄位鍵字面值鎖定為「附錄」（矩陣列名顯示「附錄（多）」，鍵值去括號補述，比照「使用表單」慣例）', () => {
    expect(FieldKey.APPENDICES).toBe('附錄');
  });

  it('系統 UUID：五角色皆 IGNORE（系統產生、一律忽略傳入值）', () => {
    for (const role of ROLE_CODES) {
      expect(FIELD_MATRIX[FieldKey.SYSTEM_UUID][role]).toBe('IGNORE');
    }
  });

  it.each(BUSINESS_FIELDS)(
    '業務欄位 %s：僅 ICSOPAdmin=WRITABLE，其餘（含 SysAdmin）=FORBIDDEN',
    (field) => {
      const expectedRow: Record<RoleCode, FieldWriteOutcome> = {
        SysAdmin: 'FORBIDDEN',
        ICSOPAdmin: 'WRITABLE',
        Supervisor: 'FORBIDDEN',
        DeptContact: 'FORBIDDEN',
        User: 'FORBIDDEN',
      };
      expect(FIELD_MATRIX[field]).toEqual(expectedRow);
    },
  );
});

describe('F026 canWriteField 純判定', () => {
  it('ICSOP管理員 文件狀態 = WRITABLE', () => {
    expect(canWriteField('ICSOPAdmin', FieldKey.DOCUMENT_STATUS)).toBe('WRITABLE');
  });

  it('系統管理員 文件狀態 = FORBIDDEN（唯讀）', () => {
    expect(canWriteField('SysAdmin', FieldKey.DOCUMENT_STATUS)).toBe('FORBIDDEN');
  });

  it('主管 文件編號 = FORBIDDEN（唯讀，寫入應回 FIELD_WRITE_FORBIDDEN）', () => {
    expect(canWriteField('Supervisor', FieldKey.DOCUMENT_NUMBER)).toBe('FORBIDDEN');
  });

  it('部門窗口 / 一般使用者 對業務欄位皆 FORBIDDEN', () => {
    expect(canWriteField('DeptContact', FieldKey.DOCUMENT_NAME)).toBe('FORBIDDEN');
    expect(canWriteField('User', FieldKey.CONTENT_SUMMARY)).toBe('FORBIDDEN');
  });

  it('ICSOP管理員 所屬節點 = WRITABLE（惟維護入口為 F009 節點抽屜）', () => {
    expect(canWriteField('ICSOPAdmin', FieldKey.NODE)).toBe('WRITABLE');
  });

  it('ICSOP管理員 附件（ICSOP PDF / 使用表單）= WRITABLE；主管唯讀＝FORBIDDEN（可下載屬另一機制）', () => {
    expect(canWriteField('ICSOPAdmin', FieldKey.ICSOP_PDF)).toBe('WRITABLE');
    expect(canWriteField('ICSOPAdmin', FieldKey.USAGE_FORMS)).toBe('WRITABLE');
    expect(canWriteField('Supervisor', FieldKey.ICSOP_PDF)).toBe('FORBIDDEN');
  });

  it('系統 UUID：不論角色皆 IGNORE（含 ICSOPAdmin，系統產生不可外部覆寫）', () => {
    expect(canWriteField('SysAdmin', FieldKey.SYSTEM_UUID)).toBe('IGNORE');
    expect(canWriteField('ICSOPAdmin', FieldKey.SYSTEM_UUID)).toBe('IGNORE');
    expect(canWriteField('User', FieldKey.SYSTEM_UUID)).toBe('IGNORE');
  });

  it('未知欄位 / 未知角色 → FORBIDDEN（fail-closed）', () => {
    expect(canWriteField('ICSOPAdmin', '不存在的欄位')).toBe('FORBIDDEN');
    expect(canWriteField('Ghost', FieldKey.DOCUMENT_STATUS)).toBe('FORBIDDEN');
    expect(canWriteField(undefined, FieldKey.DOCUMENT_STATUS)).toBe('FORBIDDEN');
  });
});

/**
 * F041 AC-38（F026 delta AC-U1／AC-U2／AC-U3）：一般使用者子分類不新增欄位鍵、不改變任一格值，
 * 欄位權限解析函式簽章不接受 userSubtype 參數。矩陣不變已由本檔既有「20 欄位」「逐格對照」測試
 * 覆蓋（本次未新增任何列）。AC-U3（isWithinSubtree／isUsingDeptMatched 重用鎖定）之機器可驗證斷言
 * 見 backend/src/org-sync/org-hierarchy.spec.ts（TS-PS-ORG-001～007，未經修改）＋
 * backend/src/rbac/viewer-scope.spec.ts（AC-10：isUsingDeptMatched 與 isPinned 逐案相等），不於本檔重工。
 */
describe('F041 AC-38：canWriteField 不受一般使用者子分類影響', () => {
  it('AC-U2 簽章不含 userSubtype 參數（arity=2：roleCode/fieldKey）——結構性保證兩子分類帳號結果必然相同', () => {
    expect(canWriteField.length).toBe(2);
  });
});
