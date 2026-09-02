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

  /**
   * 🔴 2026-08-28 F042 delta（AC-27／AC-J16）：新增功能鍵「OJT 進度管理」，矩陣列數 13→14。
   * 就地改寫（非回歸）——前端鏡射須與 backend/src/rbac/function-matrix.ts 逐格一致同步更新。
   */
  it('矩陣含 14 功能，每列涵蓋全部 5 角色（F042 新增「OJT 進度管理」）', () => {
    const keys = Object.keys(FUNCTION_MATRIX);
    expect(keys).toHaveLength(14);
    for (const key of keys) {
      expect(Object.keys(FUNCTION_MATRIX[key]).sort()).toEqual(
        [...ROLE_CODES].sort(),
      );
    }
  });

  /**
   * AC-27（`OQ-E11-05`→A 定值）：五角色格值逐字——
   * 系統管理員 `唯讀`｜ICSOP管理員 `CRUD`｜主管 `受限CRUD`｜部門窗口 `受限CRUD`｜一般使用者 `無`。
   */
  it('AC-27 OJT 進度管理：五角色格值逐字正確', () => {
    expect(FUNCTION_MATRIX[FunctionKey.OJT_PROGRESS_MANAGEMENT]).toEqual({
      SysAdmin: 'READ',
      ICSOPAdmin: 'CRUD',
      Supervisor: 'RESTRICTED_CRUD',
      DeptContact: 'RESTRICTED_CRUD',
      User: 'NONE',
    });
  });

  /**
   * AC-J18（🔒 既有 13 列之回歸鎖定）：新增一列時最可能的失誤是順手把相鄰列一起改寬——
   * 逐格硬編碼既有 13 列之期望值（非動態衍生自當前 FUNCTION_MATRIX，避免斷言隨實作一起漂移
   * 而失去鑑別力）。特別是 `ICSOP文件管理` 列對主管／部門窗口仍為 `READ`（唯讀），不得因本功能
   * 對兩者可寫而順手一併放寬。
   */
  it('AC-J18 既有 13 列逐格不變（本 delta 之「鬆一片牆」偵測器）', () => {
    expect(FUNCTION_MATRIX[FunctionKey.ACCOUNT_MANAGEMENT]).toEqual({
      SysAdmin: 'CRUD', ICSOPAdmin: 'CRUD', Supervisor: 'NONE', DeptContact: 'NONE', User: 'NONE',
    });
    expect(FUNCTION_MATRIX[FunctionKey.ROLE_ASSIGNMENT]).toEqual({
      SysAdmin: 'CRUD', ICSOPAdmin: 'RESTRICTED_CRUD', Supervisor: 'NONE', DeptContact: 'NONE', User: 'NONE',
    });
    // 🔴 2026-09-02 人類裁決：主管 'READ' → 'NONE'（循環管理自主管權限移除）。
    // 📝 原期望值逐字保留供追溯：OLD> Supervisor: 'READ'
    expect(FUNCTION_MATRIX[FunctionKey.LIFECYCLE_MANAGEMENT]).toEqual({
      SysAdmin: 'READ', ICSOPAdmin: 'CRUD', Supervisor: 'NONE', DeptContact: 'NONE', User: 'NONE',
    });
    // 🔴 本列為本 delta 最易「順手一併放寬」之處：主管／部門窗口對 ICSOP 文件管理仍唯讀。
    expect(FUNCTION_MATRIX[FunctionKey.ICSOP_DOCUMENT_MANAGEMENT]).toEqual({
      SysAdmin: 'READ', ICSOPAdmin: 'CRUD', Supervisor: 'READ', DeptContact: 'READ', User: 'NONE',
    });
    expect(FUNCTION_MATRIX[FunctionKey.USAGE_FORM_MANAGEMENT]).toEqual({
      SysAdmin: 'READ', ICSOPAdmin: 'CRUD', Supervisor: 'NONE', DeptContact: 'NONE', User: 'NONE',
    });
    expect(FUNCTION_MATRIX[FunctionKey.APPENDIX_MANAGEMENT]).toEqual({
      SysAdmin: 'READ', ICSOPAdmin: 'CRUD', Supervisor: 'NONE', DeptContact: 'NONE', User: 'NONE',
    });
    expect(FUNCTION_MATRIX[FunctionKey.DOCUMENT_INDEX_MANAGEMENT]).toEqual({
      SysAdmin: 'READ', ICSOPAdmin: 'CRUD', Supervisor: 'NONE', DeptContact: 'NONE', User: 'NONE',
    });
    expect(FUNCTION_MATRIX[FunctionKey.DOCUMENT_ACCESS_HISTORY]).toEqual({
      SysAdmin: 'READ', ICSOPAdmin: 'READ', Supervisor: 'NONE', DeptContact: 'NONE', User: 'NONE',
    });
    expect(FUNCTION_MATRIX[FunctionKey.DOCUMENT_CHANGE_HISTORY]).toEqual({
      SysAdmin: 'READ', ICSOPAdmin: 'READ', Supervisor: 'NONE', DeptContact: 'NONE', User: 'NONE',
    });
    expect(FUNCTION_MATRIX[FunctionKey.ORG_SYNC_MANAGEMENT]).toEqual({
      SysAdmin: 'CRUD', ICSOPAdmin: 'READ', Supervisor: 'NONE', DeptContact: 'NONE', User: 'NONE',
    });
    expect(FUNCTION_MATRIX[FunctionKey.PUBLIC_BROWSING]).toEqual({
      SysAdmin: 'READ', ICSOPAdmin: 'READ', Supervisor: 'READ', DeptContact: 'READ', User: 'READ',
    });
    expect(FUNCTION_MATRIX[FunctionKey.DOCUMENT_DOWNLOAD_PRINT]).toEqual({
      SysAdmin: 'READ', ICSOPAdmin: 'READ', Supervisor: 'READ', DeptContact: 'READ', User: 'READ',
    });
    expect(FUNCTION_MATRIX[FunctionKey.SYSTEM_PARAMETER]).toEqual({
      SysAdmin: 'CRUD', ICSOPAdmin: 'NONE', Supervisor: 'NONE', DeptContact: 'NONE', User: 'NONE',
    });
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
    // 🔴 2026-08-25 角色自動化 delta（Q4.1）。原斷言逐字保留供追溯：
    //   OLD> it('帳號管理：SysAdmin 可寫、ICSOPAdmin 僅讀')
    //   OLD> expect(canPerform('ICSOPAdmin', ACCOUNT_MANAGEMENT, 'write')).toBe(false);
    it('帳號管理：SysAdmin 與 ICSOPAdmin 皆可寫（ICSOPAdmin 由唯讀升為 CRUD）', () => {
      expect(canPerform('SysAdmin', FunctionKey.ACCOUNT_MANAGEMENT, 'write')).toBe(true);
      expect(canPerform('ICSOPAdmin', FunctionKey.ACCOUNT_MANAGEMENT, 'write')).toBe(true);
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

    /**
     * AC-27／AC-19：`受限CRUD` 於**功能層**（canPerform）等同 CRUD——Supervisor／DeptContact
     * 對 OJT 進度管理之 write 通過（可新增場次）。「不可刪除」之限制**不在此層**表達
     * （矩陣格值本身擋不住刪除，端點層另加角色檢查，屬 OjtProgressPage/後端測試之範圍，非本檔）。
     */
    it('OJT 進度管理：SysAdmin 唯讀、ICSOPAdmin／Supervisor／DeptContact 可寫（write 通過）、User 無權', () => {
      expect(canPerform('SysAdmin', FunctionKey.OJT_PROGRESS_MANAGEMENT, 'read')).toBe(true);
      expect(canPerform('SysAdmin', FunctionKey.OJT_PROGRESS_MANAGEMENT, 'write')).toBe(false);
      expect(canPerform('ICSOPAdmin', FunctionKey.OJT_PROGRESS_MANAGEMENT, 'write')).toBe(true);
      expect(canPerform('Supervisor', FunctionKey.OJT_PROGRESS_MANAGEMENT, 'write')).toBe(true);
      expect(canPerform('DeptContact', FunctionKey.OJT_PROGRESS_MANAGEMENT, 'write')).toBe(true);
      expect(canPerform('User', FunctionKey.OJT_PROGRESS_MANAGEMENT, 'read')).toBe(false);
      expect(canPerform('User', FunctionKey.OJT_PROGRESS_MANAGEMENT, 'write')).toBe(false);
    });
  });
});

/** F041 AC-37（前端鏡射，F025 delta AC-U2）：矩陣不新增列已由上方既有測試覆蓋（未新增列）；
 * 本區塊補簽章鎖定。 */
describe('F041 AC-37：canPerform 前端鏡射不受一般使用者子分類影響', () => {
  it('AC-U2 簽章不含 userSubtype 參數（arity=3）', () => {
    expect(canPerform.length).toBe(3);
  });
});
