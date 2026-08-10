import { normalizeUserSubtype, userSubtypeLabel, isSubtypeApplicable } from './user-subtype';
import type { RoleCode } from './function-matrix';

/**
 * F041 一般使用者子分類——前端純函式。
 * 規格權威：docs/specs/features/F041-user-subtype-business-scope.md（AC-01／AC-02／AC-31／AC-32）
 * ＋ 命名鎖定表（函式名逐字：normalizeUserSubtype／userSubtypeLabel／isSubtypeApplicable）。
 *
 * ⚠ 本專案無前後端共用 package，與 backend/src/rbac/viewer-scope.ts 之 normalizeUserSubtype 各自一份
 *   實作（比照 F040 lifecycle-subcategory.ts 先例）；語意須逐字一致，兩份各有各自的約束環。
 * ⚠ 儲存值為小寫 'business'／'other'；'業務'／'其他' 僅為顯示標籤，不得用於任何判定
 *   （prototypes/08-account-management.html 明文註解）。
 *
 * blind-to-implementation：`frontend/src/domain/user-subtype.ts` 尚不存在，本檔未讀取任何實作。
 */

describe('normalizeUserSubtype（AC-01／AC-02）', () => {
  it('AC-01 合法值原值回傳', () => {
    expect(normalizeUserSubtype('business')).toBe('business');
    expect(normalizeUserSubtype('other')).toBe('other');
  });

  it.each([null, undefined, '', '   ', 'Business', 'BUSINESS', '業務', 'unknown', 123])(
    'AC-02 未知值 %p → 收斂為 other（fail-open，大小寫敏感、不模糊比對，須與後端逐字一致）',
    (v) => {
      expect(normalizeUserSubtype(v as unknown)).toBe('other');
    },
  );
});

describe('userSubtypeLabel（AC-31，顯示標籤逐字）', () => {
  it.each([
    ['business', '業務'],
    ['other', '其他'],
    [null, '其他'],
    [undefined, '其他'],
    ['unknown', '其他'],
  ])('輸入 %p → %p', (v, expected) => {
    expect(userSubtypeLabel(v as unknown)).toBe(expected);
  });
});

describe('isSubtypeApplicable（AC-32，僅 User 適用）', () => {
  it.each<[RoleCode, boolean]>([
    ['User', true],
    ['SysAdmin', false],
    ['ICSOPAdmin', false],
    ['Supervisor', false],
    ['DeptContact', false],
  ])('roleCode=%s → %s', (roleCode, expected) => {
    expect(isSubtypeApplicable(roleCode)).toBe(expected);
  });
});
