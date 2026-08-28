import {
  FUNCTION_MATRIX,
  FunctionKey,
  canPerform,
  type Permission,
  type RoleCode,
} from './function-matrix';

/**
 * 🔴 F042 仲裁修正（test-generator 仲裁 2026-08-28，申訴 1）：本檔頂層 `expected`／
 * `toHaveLength(13)` 原與下方「F042 AC-27／AC-J16～AC-J18」區塊之 `toHaveLength(14)`
 * 互斥——同一個 `FUNCTION_MATRIX` 不可能恰有 13 個鍵又恰有 14 個鍵，其中一方永遠為紅，
 * 且非因缺實作而紅（`OJT_PROGRESS_MANAGEMENT` 一旦補上，本區塊反而轉紅）。
 * 補上第 14 列（`AC-J16` 定值格值）＋改 13→14，使兩區塊收斂為同一組事實。
 */

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
    // 🔴 2026-08-25 角色自動化 delta（Q4.1）：ICSOPAdmin 'READ' → 'CRUD'。
    [FunctionKey.ACCOUNT_MANAGEMENT]: R('CRUD', 'CRUD', 'NONE', 'NONE', 'NONE'),
    // 🔴 2026-08-25 角色自動化 delta（Q4.1b／OQ-RA-03）：ICSOPAdmin 'NONE' → 'RESTRICTED_CRUD'。
    [FunctionKey.ROLE_ASSIGNMENT]: R('CRUD', 'RESTRICTED_CRUD', 'NONE', 'NONE', 'NONE'),
    [FunctionKey.LIFECYCLE_MANAGEMENT]: R('READ', 'CRUD', 'READ', 'NONE', 'NONE'),
    [FunctionKey.ICSOP_DOCUMENT_MANAGEMENT]: R('READ', 'CRUD', 'READ', 'READ', 'NONE'),
    [FunctionKey.USAGE_FORM_MANAGEMENT]: R('READ', 'CRUD', 'NONE', 'NONE', 'NONE'),
    [FunctionKey.APPENDIX_MANAGEMENT]: R('READ', 'CRUD', 'NONE', 'NONE', 'NONE'),
    [FunctionKey.DOCUMENT_INDEX_MANAGEMENT]: R('READ', 'CRUD', 'NONE', 'NONE', 'NONE'),
    [FunctionKey.DOCUMENT_ACCESS_HISTORY]: R('READ', 'READ', 'NONE', 'NONE', 'NONE'),
    [FunctionKey.DOCUMENT_CHANGE_HISTORY]: R('READ', 'READ', 'NONE', 'NONE', 'NONE'),
    [FunctionKey.ORG_SYNC_MANAGEMENT]: R('CRUD', 'READ', 'NONE', 'NONE', 'NONE'),
    [FunctionKey.PUBLIC_BROWSING]: R('READ', 'READ', 'READ', 'READ', 'READ'),
    [FunctionKey.DOCUMENT_DOWNLOAD_PRINT]: R('READ', 'READ', 'READ', 'READ', 'READ'),
    [FunctionKey.SYSTEM_PARAMETER]: R('CRUD', 'NONE', 'NONE', 'NONE', 'NONE'),
    // 🔴 F042 AC-27／AC-J16：新增獨立功能列「OJT 進度管理」，置於既有 13 列之後（14→14）。
    [FunctionKey.OJT_PROGRESS_MANAGEMENT]: R('READ', 'CRUD', 'RESTRICTED_CRUD', 'RESTRICTED_CRUD', 'NONE'),
  };

  it('矩陣恰含 14 個功能列，且鍵集合與 spec 一致（F039 新增「附錄管理」／F042 新增「OJT 進度管理」）', () => {
    expect(Object.keys(FUNCTION_MATRIX).sort()).toEqual(
      Object.keys(expected).sort(),
    );
    expect(Object.keys(FUNCTION_MATRIX)).toHaveLength(14);
  });

  it('F039 附錄管理：功能鍵字面值鎖定為「附錄管理」（spec 命名鎖定表，逐字不得改寫）', () => {
    expect(FunctionKey.APPENDIX_MANAGEMENT).toBe('附錄管理');
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

  // 🔴 2026-08-25 角色自動化 delta（Q4.1b／OQ-RA-03）。原斷言逐字保留供追溯：
  //   OLD> '角色指派：僅系統管理員；ICSOP管理員亦無'
  //   OLD> expect(canPerform('ICSOPAdmin', ROLE_ASSIGNMENT, 'read')).toBe(false);
  // ICSOPAdmin 改為 'RESTRICTED_CRUD'——**功能層等同 CRUD**（進得了端點），
  // 「受限」發生於端點內部之 canAssignRole（見 accounts/account-rules.ts）。
  it('角色指派：SysAdmin 全權；ICSOPAdmin 於功能層可進入（受限發生在端點內部）', () => {
    expect(canPerform('SysAdmin', FunctionKey.ROLE_ASSIGNMENT, 'write')).toBe(true);
    expect(canPerform('ICSOPAdmin', FunctionKey.ROLE_ASSIGNMENT, 'read')).toBe(true);
    expect(canPerform('ICSOPAdmin', FunctionKey.ROLE_ASSIGNMENT, 'write')).toBe(true);
    // 其餘三角色維持 'NONE'——本 delta 未動它們。
    expect(canPerform('Supervisor', FunctionKey.ROLE_ASSIGNMENT, 'read')).toBe(false);
    expect(canPerform('DeptContact', FunctionKey.ROLE_ASSIGNMENT, 'read')).toBe(false);
    expect(canPerform('User', FunctionKey.ROLE_ASSIGNMENT, 'read')).toBe(false);
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

/**
 * F041 AC-37（F025 delta AC-U1／AC-U2）：一般使用者子分類不新增功能鍵、不改變任一格值，
 * 且權限解析函式簽章不接受 userSubtype 參數。矩陣不變已由本檔既有「13 功能列」「逐格對照」測試
 * 覆蓋（本次未新增任何列，故上方既有測試即為 AC-U1 之回歸鎖定）；本區塊僅補簽章與行為兩條。
 */
describe('F041 AC-37：canPerform 不受一般使用者子分類影響', () => {
  it('AC-U2 簽章不含 userSubtype 參數（arity=3：roleCode/functionKey/action）——結構性保證兩子分類帳號結果必然相同', () => {
    expect(canPerform.length).toBe(3);
  });

  it('F025 AC-U3：業務子分類使用者呼叫任一後台管理功能 API → 與「其他」子分類完全一致（皆為 NONE，非放寬亦非加嚴）', () => {
    const backendOnlyKeys = Object.keys(FUNCTION_MATRIX).filter(
      (k) => k !== FunctionKey.PUBLIC_BROWSING && k !== FunctionKey.DOCUMENT_DOWNLOAD_PRINT,
    );
    for (const key of backendOnlyKeys) {
      expect(canPerform('User', key, 'read')).toBe(false);
      expect(canPerform('User', key, 'write')).toBe(false);
    }
  });
});

/**
 * F042 OJT 進度管理 — 新增獨立功能列（`AC-27`／`OQ-E11-05=A`）；
 * `AC-N36`（2026-08-20「不新增功能列」鎖定）之明文打破，見
 * F025 §OJT 進度管理功能列 delta `AC-J16`／`AC-J17`／`AC-J18`。
 *
 * ⚠ 對實作全盲：`FunctionKey.OJT_PROGRESS_MANAGEMENT` 尚不存在——本區塊之 import 使用即
 * 本環之預期紅燈（`FunctionKey` 物件目前無此鍵，TS 會於編譯期報錯）。
 *
 * 🔒 既有 13 列之期望值於此逐字硬寫（不動態衍生自 FUNCTION_MATRIX 本身），
 * 避免「新列加入後基準跟著變動」使回歸檢查失去鑑別力（AC-J18 之核心防線）。
 */
describe('F042 AC-27／AC-J16～AC-J18：新增功能列「OJT 進度管理」', () => {
  const PRE_EXISTING_13: Record<string, Record<RoleCode, Permission>> = {
    [FunctionKey.ACCOUNT_MANAGEMENT]: R('CRUD', 'CRUD', 'NONE', 'NONE', 'NONE'),
    [FunctionKey.ROLE_ASSIGNMENT]: R('CRUD', 'RESTRICTED_CRUD', 'NONE', 'NONE', 'NONE'),
    [FunctionKey.LIFECYCLE_MANAGEMENT]: R('READ', 'CRUD', 'READ', 'NONE', 'NONE'),
    [FunctionKey.ICSOP_DOCUMENT_MANAGEMENT]: R('READ', 'CRUD', 'READ', 'READ', 'NONE'),
    [FunctionKey.USAGE_FORM_MANAGEMENT]: R('READ', 'CRUD', 'NONE', 'NONE', 'NONE'),
    [FunctionKey.APPENDIX_MANAGEMENT]: R('READ', 'CRUD', 'NONE', 'NONE', 'NONE'),
    [FunctionKey.DOCUMENT_INDEX_MANAGEMENT]: R('READ', 'CRUD', 'NONE', 'NONE', 'NONE'),
    [FunctionKey.DOCUMENT_ACCESS_HISTORY]: R('READ', 'READ', 'NONE', 'NONE', 'NONE'),
    [FunctionKey.DOCUMENT_CHANGE_HISTORY]: R('READ', 'READ', 'NONE', 'NONE', 'NONE'),
    [FunctionKey.ORG_SYNC_MANAGEMENT]: R('CRUD', 'READ', 'NONE', 'NONE', 'NONE'),
    [FunctionKey.PUBLIC_BROWSING]: R('READ', 'READ', 'READ', 'READ', 'READ'),
    [FunctionKey.DOCUMENT_DOWNLOAD_PRINT]: R('READ', 'READ', 'READ', 'READ', 'READ'),
    [FunctionKey.SYSTEM_PARAMETER]: R('CRUD', 'NONE', 'NONE', 'NONE', 'NONE'),
  };

  it('AC-J16 功能鍵字面值鎖定為「OJT 進度管理」', () => {
    expect(FunctionKey.OJT_PROGRESS_MANAGEMENT).toBe('OJT 進度管理');
  });

  it('AC-27 功能鍵集合恰新增 1 個，總數 13→14', () => {
    expect(Object.keys(FUNCTION_MATRIX)).toHaveLength(14);
    expect(Object.keys(FUNCTION_MATRIX)).toContain(FunctionKey.OJT_PROGRESS_MANAGEMENT);
  });

  it('AC-27 新列之五角色格值逐字為：SysAdmin=READ／ICSOPAdmin=CRUD／Supervisor=RESTRICTED_CRUD／DeptContact=RESTRICTED_CRUD／User=NONE', () => {
    expect(FUNCTION_MATRIX[FunctionKey.OJT_PROGRESS_MANAGEMENT]).toEqual(
      R('READ', 'CRUD', 'RESTRICTED_CRUD', 'RESTRICTED_CRUD', 'NONE'),
    );
  });

  it('AC-J16 canPerform：Supervisor／DeptContact 於功能層之 write 判定為允許（受限CRUD 於 canPerform 語意等同 CRUD，「僅可新增不可刪除」由端點層另行把關，非本函式職責）', () => {
    expect(canPerform('Supervisor', FunctionKey.OJT_PROGRESS_MANAGEMENT, 'write')).toBe(true);
    expect(canPerform('DeptContact', FunctionKey.OJT_PROGRESS_MANAGEMENT, 'write')).toBe(true);
  });

  it('AC-06 canPerform：SysAdmin 唯讀（read=true, write=false）', () => {
    expect(canPerform('SysAdmin', FunctionKey.OJT_PROGRESS_MANAGEMENT, 'read')).toBe(true);
    expect(canPerform('SysAdmin', FunctionKey.OJT_PROGRESS_MANAGEMENT, 'write')).toBe(false);
  });

  it('AC-07 canPerform：User 全無（read=false, write=false）', () => {
    expect(canPerform('User', FunctionKey.OJT_PROGRESS_MANAGEMENT, 'read')).toBe(false);
    expect(canPerform('User', FunctionKey.OJT_PROGRESS_MANAGEMENT, 'write')).toBe(false);
  });

  it.each(Object.keys(PRE_EXISTING_13))(
    'AC-J18 既有 13 列之回歸鎖定：%s 之五角色格值與新列導入前逐字相同（不得因新增一列而順手鬆動相鄰列，特別是 ICSOP 文件管理列對主管/部門窗口仍為唯讀）',
    (fn) => {
      expect(FUNCTION_MATRIX[fn]).toEqual(PRE_EXISTING_13[fn]);
    },
  );

  it('AC-J17 可測形狀：新增者恰為「OJT 進度管理」，不得出現任何名為「OJT 上傳」「OJT 附件」之列', () => {
    const keys = Object.keys(FUNCTION_MATRIX);
    expect(keys).not.toContain('OJT 上傳');
    expect(keys).not.toContain('OJT 附件');
  });
});
