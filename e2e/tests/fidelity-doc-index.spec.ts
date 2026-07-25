import { test, expect } from '@playwright/test';

/**
 * Prototype-fidelity 約束 — 權威來源：prototypes/21-document-index-management.html。
 * 守門本 session 之 GAP-21-1：清單列須以「文件編號」（ICSOP-…）呈現，非裸文件 UUID。
 * 資料相依：需環境至少一份文件（seed 之 ICSOP-CIPS-… 即可）；查無文件則跳過（非漂移）。
 */
const UUID_RE = /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/;

test('文件索引清單 — 列以文件編號呈現，非裸 UUID（GAP-21-1）', async ({ page }) => {
  await page.goto('/admin/doc-index');
  const table = page.locator('table');
  await expect(table).toBeVisible();

  // 等待非同步總覽載入「落定」：直到出現資料列或空狀態，避免載入中把 0 列誤判為「無資料」而 skip。
  await expect(
    table.locator('tbody tr').first().or(page.getByText('查無符合的文件')),
  ).toBeVisible({ timeout: 15000 });

  const bodyRows = table.locator('tbody tr');
  const count = await bodyRows.count();
  test.skip(count === 0, '環境確為空狀態（查無符合的文件），略過（非漂移）');

  // 至少一列以 ICSOP- 編號呈現。
  await expect(table.getByText(/ICSOP-/).first()).toBeVisible();

  // 首列之主要標籤不得是裸 UUID（回歸 GAP-21-1）。
  const firstRowText = (await bodyRows.first().innerText()).trim();
  expect(
    UUID_RE.test(firstRowText.split('\n')[0]),
    '文件索引列以裸 UUID 呈現（GAP-21-1 回歸）',
  ).toBe(false);
});
