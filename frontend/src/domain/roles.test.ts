import { ROLE_META, roleMeta } from './roles';
import { ROLE_CODES } from './function-matrix';

/**
 * 角色顯示 meta 單測。值（label/color/icon）權威來源：
 * prototypes/02-role-landing.html 與 07-admin-shell.html 之 ROLE_META。
 */
describe('roles — 角色顯示 meta', () => {
  it('五角色皆有 label/color/icon', () => {
    for (const code of ROLE_CODES) {
      const m = ROLE_META[code];
      expect(m.label).toBeTruthy();
      expect(m.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(m.icon).toBeTruthy();
    }
  });

  it('逐值對照 prototype', () => {
    expect(ROLE_META.SysAdmin).toMatchObject({ label: '系統管理員', color: '#4338CA', icon: 'shield-check' });
    expect(ROLE_META.ICSOPAdmin).toMatchObject({ label: 'ICSOP 管理員', color: '#7C3AED', icon: 'file-cog' });
    expect(ROLE_META.Supervisor).toMatchObject({ label: '主管', color: '#0891B2', icon: 'user-cog' });
    expect(ROLE_META.DeptContact).toMatchObject({ label: '部門窗口', color: '#475569', icon: 'contact' });
    expect(ROLE_META.User).toMatchObject({ label: '一般使用者', color: '#64748B', icon: 'user' });
  });

  it('roleMeta 安全查找：已知回 meta、未知回 undefined', () => {
    expect(roleMeta('SysAdmin')?.label).toBe('系統管理員');
    expect(roleMeta(undefined)).toBeUndefined();
    expect(roleMeta('Ghost')).toBeUndefined();
  });
});
