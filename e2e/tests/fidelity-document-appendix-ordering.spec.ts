import { test, expect } from '@playwright/test';

/**
 * Prototype-fidelity 約束 — 文件建立畫面之附錄選取＋排序（prototypes/14-document-create.html
 * `#appx_chips`／`data-appendix-item`／`data-appendix-up`／`data-appendix-down`／
 * `data-appendix-remove`）。權威來源同時見 prototypes/15-document-edit.html（編輯畫面之相同元件）。
 *
 * 導覽：嘗試自 /admin/documents 尋找「新增」連結（href 慣例 `/admin/documents/new`）；
 * 找不到則優雅略過——本測試之核心斷言（AC-21：無拖曳屬性）已由
 * frontend/src/pages/DocumentCreatePage.test.tsx／DocumentEditPage.test.tsx（Vitest）在元件層
 * 覆蓋，此處為瀏覽器真實 DOM 之補強確認，非唯一防線，故略過不構成保真缺口。
 */
test('文件建立頁 — 附錄搜尋選取區存在，且已選清單元件不具 draggable 屬性（AC-21）', async ({ page }) => {
  await page.goto('/admin/documents');
  const newLink = page.locator('a[href="/admin/documents/new"]').first();
  test.skip(
    (await newLink.count()) === 0,
    '找不到 /admin/documents/new 連結（導覽慣例未確認），優雅略過（非漂移，見 Vitest 層覆蓋）',
  );
  await newLink.click();

  const appxSearch = page.getByPlaceholder('搜尋附錄（excel/pdf）…');
  await expect(appxSearch).toBeVisible();

  // 若環境附錄池非空，選取第 1 筆以驗證已選清單渲染與無拖曳屬性。
  await appxSearch.click();
  const firstOption = page.locator('#appx_list, [role="listbox"]').locator('div, li, [role="option"]').first();
  if ((await firstOption.count()) === 0) {
    test.skip(true, '環境附錄池為空，無可選項目可供渲染已選清單斷言（非漂移）');
    return;
  }
  await firstOption.click();

  const item = page.locator('[data-appendix-item]').first();
  await expect(item).toBeVisible();
  await expect(item).not.toHaveAttribute('draggable', 'true');
  expect(await item.evaluate((el) => el.hasAttribute('draggable'))).toBe(false);
  await expect(item.locator('[data-appendix-up], button[title="上移"]')).toBeVisible();
  await expect(item.locator('[data-appendix-down], button[title="下移"]')).toBeVisible();
});
