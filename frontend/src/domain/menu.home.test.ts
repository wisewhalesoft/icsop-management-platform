import { describe, it, expect } from 'vitest';
import { MENU, visibleMenu } from './menu';
import { FunctionKey, FUNCTION_MATRIX } from './function-matrix';

/**
 * L1 · F002 `AC-D5`（🔒 F025 矩陣回歸鎖定）— 缺失 delta 第 1 項之副作用邊界。
 *
 * 權威＝`docs/specs/features/F002-role-based-routing.md` `AC-D5`：
 *   「**未新增「首頁」列**；F025 之全部既有測試維持綠燈且期望值未經修改。
 *    側欄「首頁」項之 `MenuItem` **不得**帶 `functionKey`，`visibleMenu()` 亦不得對其套用 `canPerform`。」
 *   ＋ `prototypes/07-admin-shell.html:118-120`（`HOME_ITEM` 刻意**不放進 `MENU`**）。
 *
 * 🔴 本檔是「新增功能不得污染權限矩陣」的機器化保證。若實作圖方便把「首頁」塞進
 *    `MENU`／`FUNCTION_MATRIX`，AC-D1 的畫面結果會一模一樣（首頁照樣顯示），
 *    **只有本檔會紅**——這正是它存在的理由。
 *
 * 「首頁」確實出現於側欄之正面驗證見 `AppShell.home.test.tsx`（AC-D1）。
 */
const ALL_ROLES = ['SysAdmin', 'ICSOPAdmin', 'Supervisor', 'DeptContact', 'User'] as const;

describe('F002 AC-D5 — 「首頁」不得進入 F025 功能矩陣', () => {
  it('TS-D1-010 FUNCTION_MATRIX 之功能鍵集合仍為 13 個，且不含「首頁」', () => {
    const keys = Object.values(FunctionKey);
    expect(keys).toHaveLength(13);
    expect(keys).not.toContain('首頁');
    expect(Object.keys(FUNCTION_MATRIX)).toHaveLength(13);
    expect(Object.keys(FUNCTION_MATRIX).sort()).toEqual([...keys].sort());
  });

  it('TS-D1-011 MENU 每一項皆帶 functionKey（「首頁」不得以無 functionKey 之項混入 MENU）', () => {
    for (const item of MENU) {
      expect(item.functionKey, `MENU 項「${item.label}」缺 functionKey`).toBeTruthy();
    }
  });

  it('TS-D1-012 MENU 不含 id=home／label=首頁／route=/admin 之項', () => {
    expect(MENU.map((m) => m.id)).not.toContain('home');
    expect(MENU.map((m) => m.label)).not.toContain('首頁');
    expect(MENU.map((m) => m.route)).not.toContain('/admin');
  });

  it.each(ALL_ROLES)('TS-D1-013 visibleMenu(%s) 不回傳「首頁」（它不經 canPerform 過濾）', (role) => {
    expect(visibleMenu(role).map((m) => m.label)).not.toContain('首頁');
  });
});
