import { MENU, visibleMenu, accessLabelFor } from './menu';
import { FunctionKey } from './function-matrix';

/**
 * 後台側選單角色過濾單測（F002 步驟 4：僅顯示該角色有權限的功能選單）。
 * 結構權威＝prototypes/07-admin-shell.html 之 MENU；權限值來自鏡射 FUNCTION_MATRIX。
 */
describe('menu — 後台選單角色過濾', () => {
  it('MENU 10 項，每項對映一個功能鍵與路由（F039 新增「附錄管理」）', () => {
    expect(MENU).toHaveLength(10);
    for (const item of MENU) {
      expect(item.functionKey).toBeTruthy();
      expect(item.route).toMatch(/^\/admin\//);
      expect(item.icon).toBeTruthy();
    }
  });

  it('SysAdmin 見全部 10 項（含插於 usageform 之後、docindex 之前的 appendix）', () => {
    expect(visibleMenu('SysAdmin').map((m) => m.id)).toEqual([
      'account', 'lifecycle', 'document', 'usageform', 'appendix', 'docindex',
      'audit', 'changehistory', 'orgsync', 'settings',
    ]);
  });

  it('ICSOPAdmin 見 9 項（無系統參數設定）', () => {
    const ids = visibleMenu('ICSOPAdmin').map((m) => m.id);
    expect(ids).toContain('lifecycle');
    expect(ids).toContain('orgsync');
    expect(ids).toContain('appendix');
    expect(ids).not.toContain('settings');
    expect(ids).toHaveLength(9);
  });

  it('Supervisor 僅見循環管理與 ICSOP 文件管理', () => {
    expect(visibleMenu('Supervisor').map((m) => m.id)).toEqual(['lifecycle', 'document']);
  });

  it('DeptContact 僅見 ICSOP 文件管理', () => {
    expect(visibleMenu('DeptContact').map((m) => m.id)).toEqual(['document']);
  });

  it('User 無任何後台選單（分流至前台）', () => {
    expect(visibleMenu('User')).toEqual([]);
    expect(visibleMenu(undefined)).toEqual([]);
  });

  describe('accessLabelFor — 側欄唯讀徽章', () => {
    it('可寫 → CRUD、僅讀 → 唯讀、無權 → null', () => {
      expect(accessLabelFor('SysAdmin', FunctionKey.ACCOUNT_MANAGEMENT)).toBe('CRUD');
      expect(accessLabelFor('ICSOPAdmin', FunctionKey.ACCOUNT_MANAGEMENT)).toBe('唯讀');
      expect(accessLabelFor('User', FunctionKey.ACCOUNT_MANAGEMENT)).toBeNull();
    });
  });
});
