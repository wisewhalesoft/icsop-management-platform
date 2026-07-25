import { test, expect } from '@playwright/test';

/**
 * Prototype-fidelity 約束 — 權威來源：prototypes/13-document-list.html（後台程序書清單）。
 * 由 prototype 機械衍生、對 implementation 全盲。這正是本 session 原始漂移（欄位被刪）之守門：
 * 若任一欄消失（如當初掉的「制定公司/檔案/樹狀圖」），此測試立即紅燈。
 */
const EXPECTED_COLUMNS = [
  '制定公司',
  '制定部門',
  '制定室別',
  '當責室長',
  '狀態',
  '檔案',
  '樹狀圖',
  '程序書編號',
  '程序書書名',
  '版次',
  '內容摘要',
] as const;

test('文件清單 — 11 欄表頭與 prototype 13 完整一致', async ({ page }) => {
  await page.goto('/admin/documents');
  // 僅在表頭列斷言，避開篩選面板同名標籤（狀態/程序書編號… 於篩選區亦出現）。
  const headerRow = page.locator('table thead tr').first();
  await expect(headerRow).toBeVisible();
  for (const col of EXPECTED_COLUMNS) {
    await expect(
      headerRow.getByText(col, { exact: true }),
      `缺少欄位表頭「${col}」（對 prototype 13 之漂移）`,
    ).toBeVisible();
  }
});
