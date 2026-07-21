import {
  FUNCTION_MATRIX,
  FunctionKey,
  canPerform,
  type Permission,
  type RoleCode,
} from './function-matrix';

/**
 * F025 角色×功能矩陣：資料逐格對照 + 純判定 canPerform。
 * 權威來源：docs/specs/features/F025-role-function-matrix.md（角色×功能矩陣即權威值）。
 * 中文權限值對映：CRUD→'CRUD'、唯讀/全部唯讀→'READ'、無→'NONE'、可/可（浮水印）→'READ'（普遍可存取列，僅讀取型動作）。
 */

const R = (
  sysAdmin: Permission,
  icsopAdmin: Permission,
  supervisor: Permission,
  deptContact: Permission,
  user: Permission,
): Record<RoleCode, Permission> => ({
  SysAdmin: sysAdmin,
  ICSOPAdmin: icsopAdmin,
  Supervisor: supervisor,
  DeptContact: deptContact,
  User: user,
});

describe('F025 FUNCTION_MATRIX 逐格對照 spec', () => {
  // 逐列對照 F025 spec「角色×功能矩陣」表格（順序：系統管理員/ICSOP管理員/主管/部門窗口/一般使用者）
  const expected: Record<string, Record<RoleCode, Permission>> = {
    [FunctionKey.ACCOUNT_MANAGEMENT]: R('CRUD', 'READ', 'NONE', 'NONE', 'NONE'),
    [FunctionKey.ROLE_ASSIGNMENT]: R('CRUD', 'NONE', 'NONE', 'NONE', 'NONE'),
    [FunctionKey.LIFECYCLE_MANAGEMENT]: R('READ', 'CRUD', 'READ', 'NONE', 'NONE'),
    [FunctionKey.ICSOP_DOCUMENT_MANAGEMENT]: R('READ', 'CRUD', 'READ', 'READ', 'NONE'),
    [FunctionKey.USAGE_FORM_MANAGEMENT]: R('READ', 'CRUD', 'NONE', 'NONE', 'NONE'),
    [FunctionKey.DOCUMENT_INDEX_MANAGEMENT]: R('READ', 'CRUD', 'NONE', 'NONE', 'NONE'),
    [FunctionKey.DOCUMENT_ACCESS_HISTORY]: R('READ', 'READ', 'NONE', 'NONE', 'NONE'),
    [FunctionKey.DOCUMENT_CHANGE_HISTORY]: R('READ', 'READ', 'NONE', 'NONE', 'NONE'),
    [FunctionKey.ORG_SYNC_MANAGEMENT]: R('CRUD', 'READ', 'NONE', 'NONE', 'NONE'),
    [FunctionKey.PUBLIC_BROWSING]: R('READ', 'READ', 'READ', 'READ', 'READ'),
    [FunctionKey.DOCUMENT_DOWNLOAD_PRINT]: R('READ', 'READ', 'READ', 'READ', 'READ'),
    [FunctionKey.SYSTEM_PARAMETER]: R('CRUD', 'NONE', 'NONE', 'NONE', 'NONE'),
  };

  it('矩陣恰含 12 個功能列，且鍵集合與 spec 一致', () => {
    expect(Object.keys(FUNCTION_MATRIX).sort()).toEqual(
      Object.keys(expected).sort(),
    );
    expect(Object.keys(FUNCTION_MATRIX)).toHaveLength(12);
  });

  it.each(Object.keys(expected))('功能列 %s 之五角色權限值與 spec 完全一致', (fn) => {
    expect(FUNCTION_MATRIX[fn]).toEqual(expected[fn]);
  });

  it('org-sync 端點使用之 functionKey 常數值＝「組織人員異動管理」', () => {
    expect(FunctionKey.ORG_SYNC_MANAGEMENT).toBe('組織人員異動管理');
  });
});

describe('F025 canPerform 純判定', () => {
  // 代表性格子（任務指定）
  it('主管 循環管理 read=true / write=false（唯讀）', () => {
    expect(canPerform('Supervisor', FunctionKey.LIFECYCLE_MANAGEMENT, 'read')).toBe(true);
    expect(canPerform('Supervisor', FunctionKey.LIFECYCLE_MANAGEMENT, 'write')).toBe(false);
  });

  it('一般使用者 帳號管理 read=false / write=false（無）', () => {
    expect(canPerform('User', FunctionKey.ACCOUNT_MANAGEMENT, 'read')).toBe(false);
    expect(canPerform('User', FunctionKey.ACCOUNT_MANAGEMENT, 'write')).toBe(false);
  });

  it('系統管理員 ICSOP文件管理 read=true / write=false（唯讀）', () => {
    expect(canPerform('SysAdmin', FunctionKey.ICSOP_DOCUMENT_MANAGEMENT, 'read')).toBe(true);
    expect(canPerform('SysAdmin', FunctionKey.ICSOP_DOCUMENT_MANAGEMENT, 'write')).toBe(false);
  });

  it('ICSOP管理員 ICSOP文件管理 write=true（CRUD）', () => {
    expect(canPerform('ICSOPAdmin', FunctionKey.ICSOP_DOCUMENT_MANAGEMENT, 'write')).toBe(true);
    expect(canPerform('ICSOPAdmin', FunctionKey.ICSOP_DOCUMENT_MANAGEMENT, 'read')).toBe(true);
  });

  it('系統管理員 文件索引管理 read=true / write=false（唯讀）', () => {
    expect(canPerform('SysAdmin', FunctionKey.DOCUMENT_INDEX_MANAGEMENT, 'read')).toBe(true);
    expect(canPerform('SysAdmin', FunctionKey.DOCUMENT_INDEX_MANAGEMENT, 'write')).toBe(false);
  });

  it('組織人員異動管理：僅系統管理員可 write；ICSOP管理員唯讀、其餘無', () => {
    expect(canPerform('SysAdmin', FunctionKey.ORG_SYNC_MANAGEMENT, 'write')).toBe(true);
    expect(canPerform('ICSOPAdmin', FunctionKey.ORG_SYNC_MANAGEMENT, 'write')).toBe(false);
    expect(canPerform('ICSOPAdmin', FunctionKey.ORG_SYNC_MANAGEMENT, 'read')).toBe(true);
    expect(canPerform('Supervisor', FunctionKey.ORG_SYNC_MANAGEMENT, 'read')).toBe(false);
    expect(canPerform('DeptContact', FunctionKey.ORG_SYNC_MANAGEMENT, 'write')).toBe(false);
    expect(canPerform('User', FunctionKey.ORG_SYNC_MANAGEMENT, 'write')).toBe(false);
  });

  it('系統管理員 系統參數設定 CRUD；ICSOP管理員無', () => {
    expect(canPerform('SysAdmin', FunctionKey.SYSTEM_PARAMETER, 'write')).toBe(true);
    expect(canPerform('ICSOPAdmin', FunctionKey.SYSTEM_PARAMETER, 'read')).toBe(false);
  });

  it('角色指派：僅系統管理員；ICSOP管理員亦無', () => {
    expect(canPerform('SysAdmin', FunctionKey.ROLE_ASSIGNMENT, 'write')).toBe(true);
    expect(canPerform('ICSOPAdmin', FunctionKey.ROLE_ASSIGNMENT, 'read')).toBe(false);
  });

  it('部門窗口 循環管理＝無 → read/write 皆 false', () => {
    expect(canPerform('DeptContact', FunctionKey.LIFECYCLE_MANAGEMENT, 'read')).toBe(false);
    expect(canPerform('DeptContact', FunctionKey.LIFECYCLE_MANAGEMENT, 'write')).toBe(false);
  });

  it('前台瀏覽／下載列印：所有角色 read 皆允許（可）', () => {
    for (const role of ['SysAdmin', 'ICSOPAdmin', 'Supervisor', 'DeptContact', 'User']) {
      expect(canPerform(role, FunctionKey.PUBLIC_BROWSING, 'read')).toBe(true);
      expect(canPerform(role, FunctionKey.DOCUMENT_DOWNLOAD_PRINT, 'read')).toBe(true);
    }
  });

  it('未知角色 / 未知功能 → 一律 false（fail-closed）', () => {
    expect(canPerform('Ghost', FunctionKey.ACCOUNT_MANAGEMENT, 'read')).toBe(false);
    expect(canPerform(undefined, FunctionKey.ACCOUNT_MANAGEMENT, 'read')).toBe(false);
    expect(canPerform('SysAdmin', '不存在的功能', 'read')).toBe(false);
  });
});
