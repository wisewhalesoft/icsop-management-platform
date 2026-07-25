import { test, expect } from '@playwright/test';

/**
 * Prototype-fidelity 約束 — 權威來源：prototypes/07-admin-shell.html 之 TODOS（角色過濾 KPI 列）。
 * 由 prototype 機械衍生、對 implementation 全盲。守門本 session 之 GAP-07-1（整排 KPI 卡被省略）。
 * 本 storageState 為 ICSOPAdmin → 應見其 4 張；SysAdmin 專屬「停用帳號待覆核」不得出現。
 */
const ICSOP_ADMIN_CARDS = [
  '待確認組織異動',
  '未指派節點文件',
  '調閱紀錄（近7日）',
  '待公布的文件',
] as const;

const SYSADMIN_ONLY_CARD = '停用帳號待覆核';

test('儀表板 — ICSOPAdmin 見其 4 張角色過濾 KPI 卡', async ({ page }) => {
  await page.goto('/admin/');
  for (const card of ICSOP_ADMIN_CARDS) {
    await expect(
      page.getByText(card, { exact: true }),
      `儀表板缺 KPI 卡「${card}」（GAP-07-1 漂移）`,
    ).toBeVisible();
  }
  // 角色過濾正確性：SysAdmin 專屬卡不得洩漏至 ICSOPAdmin 視圖。
  await expect(page.getByText(SYSADMIN_ONLY_CARD)).toHaveCount(0);
});
