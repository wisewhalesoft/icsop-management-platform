import {
  ROLE_CODES,
  FUNCTION_MATRIX,
  FunctionKey,
  canPerform,
} from './function-matrix';

/**
 * 前端鏡射之 F025 角色×功能矩陣單測。
 * 權威值＝backend/src/rbac/function-matrix.ts（本檔須與其逐格一致；後端更新時同步）。
 */
describe('function-matrix（前端鏡射）', () => {
  it('固定 5 角色、順序與後端一致', () => {
    expect(ROLE_CODES).toEqual([
      'SysAdmin',
      'ICSOPAdmin',
      'Supervisor',
      'DeptContact',
      'User',
    ]);
  });

  it('矩陣含 12 功能，每列涵蓋全部 5 角色', () => {
    const keys = Object.keys(FUNCTION_MATRIX);
    expect(keys).toHaveLength(12);
    for (const key of keys) {
      expect(Object.keys(FUNCTION_MATRIX[key]).sort()).toEqual(
        [...ROLE_CODES].sort(),
      );
    }
  });

  describe('canPerform — fail-closed', () => {
    it('未提供角色 → false', () => {
      expect(canPerform(undefined, FunctionKey.ACCOUNT_MANAGEMENT, 'read')).toBe(
        false,
      );
    });
    it('未知功能鍵 → false', () => {
      expect(canPerform('SysAdmin', '不存在的功能', 'read')).toBe(false);
    });
    it('未知角色 → false', () => {
      expect(canPerform('Ghost', FunctionKey.PUBLIC_BROWSING, 'read')).toBe(
        false,
      );
    });
  });

  describe('canPerform — 代表性格位', () => {
    it('帳號管理：SysAdmin 可寫、ICSOPAdmin 僅讀', () => {
      expect(canPerform('SysAdmin', FunctionKey.ACCOUNT_MANAGEMENT, 'write')).toBe(true);
      expect(canPerform('ICSOPAdmin', FunctionKey.ACCOUNT_MANAGEMENT, 'write')).toBe(false);
      expect(canPerform('ICSOPAdmin', FunctionKey.ACCOUNT_MANAGEMENT, 'read')).toBe(true);
    });
    it('組織同步：SysAdmin 可寫、ICSOPAdmin 讀不可寫、Supervisor 無', () => {
      expect(canPerform('SysAdmin', FunctionKey.ORG_SYNC_MANAGEMENT, 'write')).toBe(true);
      expect(canPerform('ICSOPAdmin', FunctionKey.ORG_SYNC_MANAGEMENT, 'write')).toBe(false);
      expect(canPerform('ICSOPAdmin', FunctionKey.ORG_SYNC_MANAGEMENT, 'read')).toBe(true);
      expect(canPerform('Supervisor', FunctionKey.ORG_SYNC_MANAGEMENT, 'read')).toBe(false);
    });
    it('前台瀏覽：五角色皆可讀', () => {
      for (const r of ROLE_CODES) {
        expect(canPerform(r, FunctionKey.PUBLIC_BROWSING, 'read')).toBe(true);
      }
    });
    it('一般使用者對後台功能一律無權', () => {
      expect(canPerform('User', FunctionKey.ICSOP_DOCUMENT_MANAGEMENT, 'read')).toBe(false);
      expect(canPerform('User', FunctionKey.SYSTEM_PARAMETER, 'read')).toBe(false);
    });
  });
});
