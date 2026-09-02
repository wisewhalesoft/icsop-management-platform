import { MENU, visibleMenu, accessLabelFor } from './menu';
import { FunctionKey } from './function-matrix';

/**
 * 後台側選單角色過濾單測（F002 步驟 4：僅顯示該角色有權限的功能選單）。
 * 結構權威＝prototypes/07-admin-shell.html 之 MENU；權限值來自鏡射 FUNCTION_MATRIX。
 */
describe('menu — 後台選單角色過濾', () => {
  /**
   * 🔴 2026-08-28 F042 delta（AC-27／AC-J16）：新增獨立側選單項「OJT 進度管理」
   * （FunctionKey.OJT_PROGRESS_MANAGEMENT，五角色格值 唯讀/CRUD/受限CRUD/受限CRUD/無）。
   * MENU 項數與下方兩則既有計數/清單斷言隨之由 10→11、ICSOPAdmin 由 9→10 項，
   * 屬本 delta 之直接連帶（非回歸），就地改寫、不得刪除既有斷言之精神。
   * 位置＝prototype 25 明文置於「文件索引管理」（docindex）之後、「文件調閱歷程」（audit）之前
   * （設計裁量，AC-27 只鎖「恰新增一項」不鎖排列位置——本檔仍以 prototype 之實際順序斷言，
   * 若日後裁量改變順序，本斷言可能連帶調整，不影響其鎖定之「恰 1 項」本質）。
   * 📝 OLD> 原逐字 10 項與 9 項計數/清單保留於本次修訂歷史（git blame），不再重打於此。
   */
  it('MENU 11 項，每項對映一個功能鍵與路由（F042 新增「OJT 進度管理」）', () => {
    expect(MENU).toHaveLength(11);
    for (const item of MENU) {
      expect(item.functionKey).toBeTruthy();
      expect(item.route).toMatch(/^\/admin\//);
      expect(item.icon).toBeTruthy();
    }
  });

  it('MENU 恰新增一項「OJT 進度管理」，functionKey/route/icon 逐字正確（AC-27／AC-J16）', () => {
    const items = MENU.filter((m) => m.id === 'ojtprogress');
    expect(items).toHaveLength(1);
    const item = items[0];
    expect(item.label).toBe('OJT 進度管理'); // 🔒 命名鎖定表逐字，不得改寫為「OJT 管理」等同義詞
    expect(item.functionKey).toBe(FunctionKey.OJT_PROGRESS_MANAGEMENT);
    expect(item.route).toBe('/admin/ojt-progress');
    expect(item.icon).toBe('graduation-cap'); // prototype 25 建議圖示鍵（設計裁量，非 AC 鎖定，取自 prototype 逐字）
  });

  it('SysAdmin 見全部 11 項，OJT 進度管理置於 docindex 之後、audit 之前（prototype 25 之實際順序）', () => {
    expect(visibleMenu('SysAdmin').map((m) => m.id)).toEqual([
      'account', 'lifecycle', 'document', 'usageform', 'appendix', 'docindex',
      'ojtprogress', 'audit', 'changehistory', 'orgsync', 'settings',
    ]);
  });

  it('ICSOPAdmin 見 10 項（無系統參數設定；OJT 進度管理對其為 CRUD）', () => {
    const ids = visibleMenu('ICSOPAdmin').map((m) => m.id);
    expect(ids).toContain('lifecycle');
    expect(ids).toContain('orgsync');
    expect(ids).toContain('appendix');
    expect(ids).toContain('ojtprogress');
    expect(ids).not.toContain('settings');
    expect(ids).toHaveLength(10);
  });

  /**
   * 🔴 AC-27／AC-05=A：Supervisor／DeptContact 對「OJT 進度管理」為 受限CRUD（功能層等同可寫，
   * read 通過）⇒ 側選單須新增可見；既有唯二可見項（循環管理／ICSOP 文件管理，或 DeptContact
   * 之 ICSOP 文件管理）維持不變，只新增這一項。
   */
  /**
   * 🔴 2026-09-02 人類裁決：主管之循環管理由「唯讀」改為「無」⇒ 側選單少掉 `lifecycle`。
   * 📝 原案逐字保留供追溯：
   *   it('Supervisor 見循環管理／ICSOP 文件管理／OJT 進度管理（AC-27 新增）', ...)
   *     expect(visibleMenu('Supervisor').map((m) => m.id)).toEqual(['lifecycle', 'document', 'ojtprogress']);
   * 🔒 斷言形狀維持 `toEqual` 之**有序全等**（非 `toContain`）：主管少一項的同時若多長出
   * 別的項目，仍必須翻紅。
   */
  it('Supervisor 見 ICSOP 文件管理／OJT 進度管理（循環管理已移除）', () => {
    expect(visibleMenu('Supervisor').map((m) => m.id)).toEqual([
      'document', 'ojtprogress',
    ]);
  });

  it('DeptContact 見 ICSOP 文件管理／OJT 進度管理（AC-27 新增）', () => {
    expect(visibleMenu('DeptContact').map((m) => m.id)).toEqual([
      'document', 'ojtprogress',
    ]);
  });

  it('User 無任何後台選單（分流至前台）', () => {
    expect(visibleMenu('User')).toEqual([]);
    expect(visibleMenu(undefined)).toEqual([]);
  });

  describe('accessLabelFor — 側欄唯讀徽章', () => {
    // 🔴 2026-08-25 角色自動化 delta：ICSOPAdmin 之帳號管理徽章由「唯讀」改為 CRUD。
    //   「僅讀」之代表格位改用 ORG_SYNC_MANAGEMENT（該列 ICSOPAdmin 仍為唯讀、本 delta 未動）。
    it('可寫 → CRUD、僅讀 → 唯讀、無權 → null', () => {
      expect(accessLabelFor('SysAdmin', FunctionKey.ACCOUNT_MANAGEMENT)).toBe('CRUD');
      expect(accessLabelFor('ICSOPAdmin', FunctionKey.ACCOUNT_MANAGEMENT)).toBe('CRUD');
      expect(accessLabelFor('ICSOPAdmin', FunctionKey.ORG_SYNC_MANAGEMENT)).toBe('唯讀');
      expect(accessLabelFor('User', FunctionKey.ACCOUNT_MANAGEMENT)).toBeNull();
    });

    /**
     * 🔴 2026-08-28 F042 delta（AC-28⑮）：prototype 25 之側欄徽章對 Supervisor／DeptContact
     * 顯示逐字 `受限CRUD`（比照 `18-permission-matrix.html` 之「角色指派」列既有呈現）——這是
     * `accessLabelFor` 目前**沒有**的分支，非既有行為之延伸。現況：`RESTRICTED_CRUD` 於
     * `canPerform(...,'write')` 恆為 true ⇒ `accessLabelFor` 目前會把它收斂回 `'CRUD'`，
     * 與「角色指派」列之徽章字面（該列徽章由 `PermissionMatrixPage.tsx` 之 `FUNC_DISPLAY`
     * 硬編碼字面呈現，並非透過 `accessLabelFor()`，故該既有呈現**不構成**本函式已支援 `受限CRUD`
     * 之前例）不一致。本測試要求 `accessLabelFor` 新增第三種可能回傳值 `'受限CRUD'`，
     * 於權限值為 `RESTRICTED_CRUD` 時回傳，而非落入既有 `CRUD` 分支。
     */
    it('AC-28⑮ 受限CRUD → accessLabelFor 回傳逐字「受限CRUD」（非收斂為 CRUD）', () => {
      expect(accessLabelFor('Supervisor', FunctionKey.OJT_PROGRESS_MANAGEMENT)).toBe('受限CRUD');
      expect(accessLabelFor('DeptContact', FunctionKey.OJT_PROGRESS_MANAGEMENT)).toBe('受限CRUD');
      // 對照組：ICSOPAdmin 對本功能為真正的 CRUD（非 RESTRICTED_CRUD），徽章仍為 'CRUD'。
      expect(accessLabelFor('ICSOPAdmin', FunctionKey.OJT_PROGRESS_MANAGEMENT)).toBe('CRUD');
      // 對照組：SysAdmin 為 READ，徽章為既有之「唯讀」。
      expect(accessLabelFor('SysAdmin', FunctionKey.OJT_PROGRESS_MANAGEMENT)).toBe('唯讀');
    });
  });
});
