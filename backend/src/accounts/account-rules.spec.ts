import { isValidRole, isSelfRoleLockout, AccountIdentity } from './account-rules';

describe('account-rules — 角色與自我降級規則', () => {
  describe('isValidRole', () => {
    it('5 種固定角色皆有效', () => {
      for (const r of ['SysAdmin', 'ICSOPAdmin', 'Supervisor', 'DeptContact', 'User']) {
        expect(isValidRole(r)).toBe(true);
      }
    });
    it('非固定角色字串無效（ROLE_INVALID 依據）', () => {
      expect(isValidRole('Root')).toBe(false);
      expect(isValidRole('')).toBe(false);
      expect(isValidRole('sysadmin')).toBe(false); // 大小寫敏感
    });
  });

  describe('isSelfRoleLockout — 阻擋系統管理員降級自身（OQ-E01-05）', () => {
    const actor: AccountIdentity = { companyCode: 'AS', loginId: 'AS22455' };
    it('系統管理員將自己改為非 SysAdmin → 鎖定（阻擋）', () => {
      expect(
        isSelfRoleLockout(actor, { companyCode: 'AS', loginId: 'AS22455' }, 'SysAdmin', 'User'),
      ).toBe(true);
      expect(
        isSelfRoleLockout(actor, { companyCode: 'AS', loginId: 'AS22455' }, 'SysAdmin', 'ICSOPAdmin'),
      ).toBe(true);
    });
    it('系統管理員維持自己為 SysAdmin → 不鎖定', () => {
      expect(
        isSelfRoleLockout(actor, { companyCode: 'AS', loginId: 'AS22455' }, 'SysAdmin', 'SysAdmin'),
      ).toBe(false);
    });
    it('降級他人（非自身）→ 不鎖定', () => {
      expect(
        isSelfRoleLockout(actor, { companyCode: 'AS', loginId: 'OTHER' }, 'SysAdmin', 'User'),
      ).toBe(false);
    });
    it('不同公司同 loginId → 視為不同帳號、不鎖定', () => {
      expect(
        isSelfRoleLockout(actor, { companyCode: 'XX', loginId: 'AS22455' }, 'SysAdmin', 'User'),
      ).toBe(false);
    });
  });
});
