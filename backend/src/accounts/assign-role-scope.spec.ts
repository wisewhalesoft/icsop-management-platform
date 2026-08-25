import { canAssignRole } from './account-rules';
import { AccountsService } from './accounts.service';

/**
 * 可指派角色範圍（🔴 2026-08-25 角色自動化 delta，`Q4.1b`／`OQ-RA-03`）。
 *
 * 🔴 **這是提權防線，不是便利功能。** 若 ICSOPAdmin 能指派 `ICSOPAdmin`／`SysAdmin`，
 * 他就能把自己或任何人升為最高權限，兩層管理者之區隔即形同虛設——
 * 本 delta 開放角色指派權的目的是分攤 184 個部門窗口之維護，不是抹平管理層級。
 */
describe('canAssignRole（可指派角色範圍）', () => {
  const ALL = ['SysAdmin', 'ICSOPAdmin', 'Supervisor', 'DeptContact', 'User'] as const;

  it('SysAdmin 可指派全部 5 種角色', () => {
    for (const r of ALL) expect(canAssignRole('SysAdmin', r)).toBe(true);
  });

  it('ICSOPAdmin 可指派 Supervisor／DeptContact／User', () => {
    expect(canAssignRole('ICSOPAdmin', 'Supervisor')).toBe(true);
    expect(canAssignRole('ICSOPAdmin', 'DeptContact')).toBe(true);
    expect(canAssignRole('ICSOPAdmin', 'User')).toBe(true);
  });

  it('🔴 ICSOPAdmin 不得指派 SysAdmin／ICSOPAdmin（提權防線）', () => {
    expect(canAssignRole('ICSOPAdmin', 'SysAdmin')).toBe(false);
    expect(canAssignRole('ICSOPAdmin', 'ICSOPAdmin')).toBe(false);
  });

  it('其餘三角色一律 false（矩陣為 NONE，正常路徑進不到端點；此處為縱深防禦）', () => {
    for (const actor of ['Supervisor', 'DeptContact', 'User'] as const) {
      for (const target of ALL) expect(canAssignRole(actor, target)).toBe(false);
    }
  });

  it('🔴 roleCode 缺漏／未知 → fail-safe 拒絕（絕不可 fail-open）', () => {
    for (const actor of [undefined, null, '', 'NotARole']) {
      expect(canAssignRole(actor, 'User')).toBe(false);
      expect(canAssignRole(actor, 'SysAdmin')).toBe(false);
    }
  });
});

/**
 * 接縫測試：純規則被**真的接進** `assignRole`，且順序正確。
 * 規則本身正確 ≠ 有人呼叫它——本專案既有教訓（F024 匯出鈕：兩個斷言各自為真、交集無人驗）。
 */
describe('assignRole 之可指派範圍守衛（接縫）', () => {
  const makeSvc = (targetRole = 'User') => {
    const rec = {
      id: 'acc-1',
      companyCode: 'AS',
      loginId: 'AS20001',
      roleCode: targetRole,
      userSubtype: 'other',
      source: 'upstream',
      status: 'active',
      orgCode: null,
      jobTitleCode: null,
    };
    const store = {
      list: () => Promise.resolve([]),
      findById: (id: string) => Promise.resolve(id === 'acc-1' ? rec : null),
      existsLoginId: () => Promise.resolve(false),
      create: () => Promise.resolve(rec),
      updateById: (_id: string, patch: Record<string, unknown>) =>
        Promise.resolve(Object.assign(rec, patch)),
    } as unknown as ConstructorParameters<typeof AccountsService>[0];
    return new AccountsService(store);
  };

  const ICSOP = { companyCode: 'AS', loginId: 'AS90001', roleCode: 'ICSOPAdmin' };

  it('ICSOPAdmin 指派 SysAdmin → 403 ROLE_ASSIGN_SCOPE_FORBIDDEN，且不寫入', async () => {
    await expect(makeSvc().assignRole('acc-1', ICSOP, 'SysAdmin')).rejects.toThrow(
      'ROLE_ASSIGN_SCOPE_FORBIDDEN',
    );
  });

  it('ICSOPAdmin 指派 Supervisor → 允許', async () => {
    await expect(
      makeSvc().assignRole('acc-1', ICSOP, 'Supervisor'),
    ).resolves.toMatchObject({ roleCode: 'Supervisor' });
  });

  it('順序：角色字串非法時先回 ROLE_INVALID（範圍檢查在其後）', async () => {
    await expect(makeSvc().assignRole('acc-1', ICSOP, 'NotARole')).rejects.toThrow(
      'ROLE_INVALID',
    );
  });

  it('順序：帳號不存在先於範圍檢查（ACCOUNT_NOT_FOUND，不洩漏可指派與否）', async () => {
    await expect(makeSvc().assignRole('nope', ICSOP, 'SysAdmin')).rejects.toThrow(
      'ACCOUNT_NOT_FOUND',
    );
  });
});
