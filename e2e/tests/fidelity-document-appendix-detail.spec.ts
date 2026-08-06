import { test, expect, type Page } from '@playwright/test';

/**
 * Prototype-fidelity 約束 — 附錄於文件詳情頁之呈現（後台唯讀 prototypes/16-document-readonly.html、
 * 前台 prototypes/04-public-document-detail.html）。權威 DOM 標記（機械衍生自 prototype 逐字
 * class/attribute）：`[data-appendix-item]`（含 `data-appendix-order` 序號徽章）、
 * `[data-appendix-name]`、`[data-appendix-empty]`（無附錄提示）。
 *
 * 資料相依：需環境至少一份「有附錄關聯」或「有文件」之資料；查無則優雅略過（非漂移，比照既有
 * fidelity-doc-index.spec.ts 之 test.skip 慣例）。導覽刻意採「尋找符合 href pattern 的連結並點擊」
 * 而非猜測特定 CSS selector／row-click 慣例，降低「因猜錯導覽方式而紅、而非因附錄功能缺失而紅」
 * 之偽陽性風險；若實作以 onClick（非 <a href>）導覽，測試將優雅略過並在 skip 訊息中說明——
 * 此為刻意的分層取捨，記錄於 docs/test-specs/features/F039-test.md。
 */

async function firstDetailLink(page: Page, hrefPrefix: string) {
  const link = page.locator(`a[href^="${hrefPrefix}"]`).first();
  return (await link.count()) > 0 ? link : null;
}

test('後台文件唯讀頁 — 附錄依序列出（sortOrder 徽章遞增）或顯示「無附錄」', async ({ page }) => {
  await page.goto('/admin/documents');
  const table = page.locator('table');
  await expect(table).toBeVisible();
  await expect(
    table.locator('tbody tr').first().or(page.getByText('查無符合的文件')),
  ).toBeVisible({ timeout: 15000 });

  const link = await firstDetailLink(page, '/admin/documents/');
  test.skip(link === null, '找不到可辨識之文件詳情連結（非 <a href> 導覽慣例），優雅略過（非漂移）');
  await link!.click();

  const items = page.locator('[data-appendix-item]');
  const empty = page.locator('[data-appendix-empty]');
  await expect(items.first().or(empty)).toBeVisible({ timeout: 10000 });

  const n = await items.count();
  if (n === 0) {
    await expect(empty).toContainText('無附錄');
    return;
  }
  // sortOrder 徽章 1..N 連續且遞增（AC-25 不變式之 DOM 層佐證）。
  for (let i = 0; i < n; i++) {
    await expect(items.nth(i)).toHaveAttribute('data-appendix-order', String(i + 1));
    await expect(items.nth(i).locator('[data-appendix-name]')).toBeVisible();
  }
});

test('前台公開文件詳情頁 — 附錄依序列出，與後台順序一致（AC-25 前後台一致性）', async ({ page }) => {
  await page.goto('/public');
  const link = await firstDetailLink(page, '/public/documents/');
  test.skip(link === null, '前台清單查無可辨識之文件詳情連結，優雅略過（非漂移）');
  await link!.click();

  const items = page.locator('[data-appendix-item]');
  const empty = page.locator('[data-appendix-empty]');
  await expect(items.first().or(empty)).toBeVisible({ timeout: 10000 });

  const n = await items.count();
  if (n === 0) {
    await expect(empty).toContainText('無附錄');
    return;
  }
  for (let i = 0; i < n; i++) {
    await expect(items.nth(i)).toHaveAttribute('data-appendix-order', String(i + 1));
  }
});
