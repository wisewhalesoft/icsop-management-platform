import {
  WATERMARK_LINE_HEIGHT,
  WATERMARK_FONT_SIZE,
  WATERMARK_LINE_STEP,
  WATERMARK_TILE_STEP_Y,
  WATERMARK_TILE_STEP_X,
} from './pdf-burner';

/**
 * F020 §三行式浮水印行高 delta（2026-08-21 三項裁決第 1 項）—— 後端半（`AC-T1`／`AC-T2`／`AC-T3` ③／`AC-T4`）。
 *
 * 權威＝`docs/specs/features/F020-watermark.md#line-height-delta`。
 *
 * 🔴 本輪約束環為簡易版（人類指定）：僅 backend jest／frontend vitest 單元測試，
 * 無 Playwright／Stryker／metric gate。
 *
 * 📌 落點沿用既有 `WATERMARK_RGB`／`WATERMARK_OPACITY`（`AC-N2`／`AC-N3`）同檔之慣例——
 * 本檔（`pdf-burner.ts`）為 PDF 燒錄内容層（檢視器所見位元組之唯一來源）之載體，
 * `AC-T1` 明文要求後端常數與既有色值/不透明度常數「同檔」。
 *
 * ⚠ 對實作全盲：本檔預期一開始為紅——`WATERMARK_LINE_HEIGHT`／`WATERMARK_FONT_SIZE`／
 * `WATERMARK_LINE_STEP`／`WATERMARK_TILE_STEP_Y`／`WATERMARK_TILE_STEP_X` 五個具名匯出目前均不存在。
 */

describe('AC-T1 單一定稿常數（後端半）', () => {
  it('WATERMARK_LINE_HEIGHT／WATERMARK_FONT_SIZE／WATERMARK_LINE_STEP 皆為具名匯出常數（可測性前提）', () => {
    expect(WATERMARK_LINE_HEIGHT).toBeDefined();
    expect(WATERMARK_FONT_SIZE).toBeDefined();
    expect(WATERMARK_LINE_STEP).toBeDefined();
  });

  it('🔴 WATERMARK_LINE_STEP 必須由 WATERMARK_FONT_SIZE × WATERMARK_LINE_HEIGHT 推導（不僅是 === 24）', () => {
    // 本條之存在理由（AC-T1 本文）：24 不得是魔術數字——若日後行高由 2.0 調為其他值，
    // 這條推導關係斷言必須跟著紅，而不是靜靜地讓 24 與行高脫鉤。
    expect(WATERMARK_LINE_STEP).toBe(WATERMARK_FONT_SIZE * WATERMARK_LINE_HEIGHT);
  });
});

describe('AC-T2／AC-T4 各載體逐字定稿值（後端 PDF 燒錄）', () => {
  /**
   * 🔴 2026-08-27 就地改寫（使用者裁決 UX ①「浮水印文字字放大一點點」）：字級 `12` → `14`。
   * 📝 已作廢（⚠ 不得用於斷言）：OLD> `12`。
   */
  it('WATERMARK_FONT_SIZE 逐字為 14（OLD> 12）', () => {
    expect(WATERMARK_FONT_SIZE).toBe(14);
  });

  it('WATERMARK_LINE_HEIGHT 逐字為 2（無單位倍數）', () => {
    expect(WATERMARK_LINE_HEIGHT).toBe(2);
  });

  it('WATERMARK_LINE_STEP 逐字為 28（＝ WATERMARK_FONT_SIZE(14) × WATERMARK_LINE_HEIGHT(2)）', () => {
    expect(WATERMARK_LINE_STEP).toBe(28);
  });

  /**
   * 🔴 負向回歸鎖：兩個作廢值都要鎖（AC-T4 本文明文點名，第 3 項點名重點）。
   * `15` ＝ delta 前之原始值（`size + 3`）；`20` ＝ 2026-08-21 第一輪之定稿值（`size + 8`），
   * 曾一度進入 `AC-T4`，其算術失誤（於 size=12 僅 1.667 倍、非 2.0 倍）已於第三輪就地改寫。
   * 只鎖 `15` 的話，實作者若照第一輪 AC 寫出 `20` 一樣會綠——這正是本條要防的事。
   */
  it('🔴 負向回歸鎖：WATERMARK_LINE_STEP 不等於 15（delta 前原始值）、20（第一輪已作廢定稿值）、24（字級 12 之已作廢值）', () => {
    expect(WATERMARK_LINE_STEP).not.toBe(15);
    expect(WATERMARK_LINE_STEP).not.toBe(20);
    expect(WATERMARK_LINE_STEP).not.toBe(24);
  });

  /**
   * 🔴 不變式（跨歷次調整恆真）：tile 間隙 ＝ `stepY − (2 × LINE_STEP + FONT_SIZE)` ＝ **138**。
   * 180−42、198−60、208−70 三者皆為 138——這條比「等於某個字面值」更能擋住「重新挑一個
   * 看起來差不多的密度」之退化。
   * 📝 已作廢（⚠ 不得用於斷言）：OLD> 180；OLD> 198。
   */
  it('WATERMARK_TILE_STEP_Y 逐字為 208（OLD> 198，因字級 12→14 使三行區塊 +10 而需維持 tile 間隙不變）', () => {
    expect(WATERMARK_TILE_STEP_Y).toBe(208);
  });

  it('🔴 tile 間隙不變式：stepY − (2 × LINE_STEP + FONT_SIZE) 恆為 138', () => {
    expect(WATERMARK_TILE_STEP_Y - (2 * WATERMARK_LINE_STEP + WATERMARK_FONT_SIZE)).toBe(138);
  });

  it('WATERMARK_TILE_STEP_X 逐字維持 260（水平方向未受行距影響）', () => {
    expect(WATERMARK_TILE_STEP_X).toBe(260);
  });
});

describe('AC-T3 ③ 跨側行高常數等值（後端半——不得與前端合併為單一測試）', () => {
  /**
   * ⚠ 本條刻意獨立於前端對應斷言之外：前後端為兩個獨立 TS 專案、兩個 runner、
   * 無共用 package ⇒ 沒有任何一個測試 import 得到兩側的常數。
   * 前端半見 `frontend/src/pages/WatermarkLineHeight.crossPage.test.tsx`「AC-T3 ③」。
   */
  it('後端 WATERMARK_LINE_HEIGHT 之值為 2（本檔即為該側之單一權威）', () => {
    expect(WATERMARK_LINE_HEIGHT).toBe(2);
  });
});
