import { test, expect } from '@playwright/test';

/**
 * 登出（bug 修復契約，見任務交接）：GET /auth/logout 現況回一頁後端測試用 HTML
 * （「已清除 session。」＋「重新登入」連結），並未轉址回登入頁。對執行中的整合環境跑
 * （同 fidelity-*.spec.ts，能揪出 nginx/proxy 類 deploy drift，unit/int 測不到）。
 *  - AC-1：session cookie（icsop_session）被清除。
 *  - AC-2：轉址離開 /auth/logout、最終落於登入頁，不得停留於後端 HTML 頁面。
 * 本 storageState 為已登入之 ICSOPAdmin（global-setup.ts，途徑 B 帳密登入）。
 * 對應 backend/src/auth/auth.controller.logout.spec.ts（AC-1~AC-4，controller 層邊界）。
 */
test('登出 — 點擊後轉址回登入頁，不得停留於後端「已登出」HTML 頁', async ({ page, context }) => {
  await page.goto('/admin/');
  await expect(page.getByRole('button', { name: '登出' })).toBeVisible();

  await page.getByRole('button', { name: '登出' }).click();

  // AC-2：轉址離開 /auth/logout（不得停留於後端測試用 HTML 頁），最終落於登入頁。
  await expect(page).not.toHaveURL(/\/auth\/logout/);
  await expect(page.getByRole('heading', { name: '登入' })).toBeVisible();
  await expect(page.getByText('已清除 session')).toHaveCount(0);

  // AC-1：session cookie 已被清除（非僅 UI 表象——httpOnly cookie 需後端 clearCookie 才會消失）。
  const cookies = await context.cookies();
  expect(cookies.find((c) => c.name === 'icsop_session')).toBeUndefined();
});
