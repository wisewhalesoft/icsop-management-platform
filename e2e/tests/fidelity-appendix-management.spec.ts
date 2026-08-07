import { test, expect } from '@playwright/test';

/**
 * Prototype-fidelity 約束 — 權威來源：prototypes/24-appendix-management.html（附錄池管理頁）。
 * 由 prototype 機械衍生、對 implementation 全盲。路由依 architecture-spec.md §3.6 決策五
 * （AppendixManagementPage，路由 /admin/appendices）。
 *
 * storageState 為 ICSOPAdmin（見 e2e/global-setup.ts）；RBAC 唯讀/封鎖狀態（SysAdmin/Supervisor
 * 等）之視覺呈現另於 frontend/src/pages/AppendixManagementPage.test.tsx（Vitest，mock useAuth）
 * 覆蓋——單一 storageState 之 Playwright 環無法在不新增第二組登入 fixture 前提下切換角色，
 * 此為刻意的分層取捨（見 docs/test-specs/features/F039-test.md 測試層級分配），非遺漏。
 */
const EXPECTED_COLUMNS = ['附錄名稱', '格式', '大小', '上傳者 / 上傳時間', '關聯文件數', '操作'] as const;

test('附錄管理頁 — 六欄表頭與 prototype 24 完整一致', async ({ page }) => {
  await page.goto('/admin/appendices');
  const headerRow = page.locator('table thead tr').first();
  await expect(headerRow).toBeVisible();
  for (const col of EXPECTED_COLUMNS) {
    await expect(
      headerRow.getByText(col, { exact: true }),
      `缺少欄位表頭「${col}」（對 prototype 24 之漂移）`,
    ).toBeVisible();
  }
});

test('附錄管理頁 — 搜尋框與格式篩選（所有格式/excel/pdf）之文案與 prototype 24 一致', async ({ page }) => {
  await page.goto('/admin/appendices');
  await expect(page.getByPlaceholder('搜尋附錄名稱…')).toBeVisible();
  const fmt = page.locator('select').filter({ has: page.locator('option', { hasText: '所有格式' }) });
  await expect(fmt).toBeVisible();
  await expect(fmt.locator('option', { hasText: 'excel' })).toHaveCount(1);
  await expect(fmt.locator('option', { hasText: 'pdf' })).toHaveCount(1);
});

test('附錄管理頁 — ICSOPAdmin 可見「上傳附錄」寫入操作（write-only 區塊）', async ({ page }) => {
  await page.goto('/admin/appendices');
  await expect(page.getByRole('button', { name: '上傳附錄' })).toBeVisible();
});

test('附錄管理頁 — 搜尋不存在之關鍵字 → 顯示空狀態文案（prototype 24 emptyState）', async ({ page }) => {
  await page.goto('/admin/appendices');
  await page.getByPlaceholder('搜尋附錄名稱…').fill('查無此附錄之關鍵字zzz999');
  await expect(page.getByText('查無符合的附錄')).toBeVisible();
});

test('附錄管理頁 — 側欄選單含「附錄管理」項且指向本頁（admin shell 一致性）', async ({ page }) => {
  await page.goto('/admin/appendices');
  const nav = page.locator('aside nav, nav').filter({ hasText: '附錄管理' }).first();
  await expect(nav).toBeVisible();
});
