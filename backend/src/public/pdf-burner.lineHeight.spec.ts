import {
  WATERMARK_LINE_HEIGHT,
  WATERMARK_FONT_SIZE,
  WATERMARK_LINE_STEP,
  WATERMARK_TILE_PAD_X,
  WATERMARK_TILE_PAD_Y,
  watermarkTileLayout,
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
   * 🔴 2026-08-27 第二輪就地改寫（比照 `reference/企金撥款作業調整.pdf` 之量測值）：字級 `14` → `24`。
   * 該文件浮水印疊圖之全形字進距為 24px，且 595×841px 貼滿 595.2×841.8pt ⇒ 1px ＝ 1pt ⇒ 字級 24pt。
   * 📝 已作廢（⚠ 不得用於斷言）：OLD> `12`｜OLD> `14`。
   */
  it('WATERMARK_FONT_SIZE 逐字為 24（OLD> 12、14）', () => {
    expect(WATERMARK_FONT_SIZE).toBe(24);
  });

  it('WATERMARK_LINE_HEIGHT 逐字為 2（無單位倍數）', () => {
    expect(WATERMARK_LINE_HEIGHT).toBe(2);
  });

  it('WATERMARK_LINE_STEP 逐字為 48（＝ WATERMARK_FONT_SIZE(24) × WATERMARK_LINE_HEIGHT(2)）', () => {
    expect(WATERMARK_LINE_STEP).toBe(48);
  });

  /**
   * 🔴 負向回歸鎖：兩個作廢值都要鎖（AC-T4 本文明文點名，第 3 項點名重點）。
   * `15` ＝ delta 前之原始值（`size + 3`）；`20` ＝ 2026-08-21 第一輪之定稿值（`size + 8`），
   * 曾一度進入 `AC-T4`，其算術失誤（於 size=12 僅 1.667 倍、非 2.0 倍）已於第三輪就地改寫。
   * 只鎖 `15` 的話，實作者若照第一輪 AC 寫出 `20` 一樣會綠——這正是本條要防的事。
   */
  it('🔴 負向回歸鎖：WATERMARK_LINE_STEP 不等於 15／20／24／28（歷次已作廢定稿值）', () => {
    expect(WATERMARK_LINE_STEP).not.toBe(15);
    expect(WATERMARK_LINE_STEP).not.toBe(20);
    expect(WATERMARK_LINE_STEP).not.toBe(24);
    expect(WATERMARK_LINE_STEP).not.toBe(28);
  });

  /**
   * 🔴 **2026-08-27 第三輪：`WATERMARK_TILE_STEP_X`／`_Y` 整組作廢**，平鋪改於旋轉框內鋪排。
   * 📝 已作廢（⚠ 不得用於斷言、不得復原）：OLD> `stepX` 260／325；OLD> `stepY` 180／198／208／357；
   *    OLD> 間隙不變式 `=== 138` / `=== 237`。作廢理由見 `pdf-burner.ts` 之 `WATERMARK_TILE_PAD_X` 註解
   *    （舊格點於對角鄰居處垂距僅 22.6pt < 字級 24pt ⇒ 必然疊字）。
   */
  it('WATERMARK_TILE_PAD_X 逐字為 45（沿文字方向之左右留白）', () => {
    expect(WATERMARK_TILE_PAD_X).toBe(45);
  });

  /**
   * 🔴 `105` 之由來（不是挑一個看起來差不多的數）：使**每行之平均垂距** ＝ `tileH / 行數`
   * ＝ `153pt`，逐字對齊 `reference/企金撥款作業調整.pdf` 量測到的列距。
   * 兩行式 tile ⇒ `tileH = 2 × 48 + 2 × 105 = 306`，`306 / 2 = 153` ✓。
   */
  it('WATERMARK_TILE_PAD_Y 逐字為 105，且使兩行式 tile 之平均行垂距 ＝ 參考文件之 153pt', () => {
    expect(WATERMARK_TILE_PAD_Y).toBe(105);
    const tileH = 2 * WATERMARK_LINE_STEP + WATERMARK_TILE_PAD_Y * 2;
    expect(tileH).toBe(306);
    expect(tileH / 2).toBe(153);
  });

  /**
   * 🔴 **本輪之核心回歸鎖：旋轉框內任兩條文字線之垂距不得小於字級**（＝疊字之充要條件）。
   *
   * 這條刻意**不**斷言某個 step 數值，而是斷言「不會撞在一起」這個性質本身——舊實作壞掉的方式
   * 正是「每個數值單看都合理，組合起來卻在對角線方向撞上」。垂距在旋轉框內就是 `v` 之差，
   * 故只需檢查同 tile 內相鄰行（`LINE_STEP`）與跨 tile（`tileH − (行數−1) × LINE_STEP`）兩種最小值。
   */
  it('🔴 旋轉框內任兩條文字線之垂距 ≥ 字級（結構上不可能疊字）', () => {
    const lines = ['身分列', '時間戳'];
    const lay = watermarkTileLayout(595.28, 841.89, lines, () => 600);
    const withinTile = WATERMARK_LINE_STEP;
    const acrossTiles = lay.tileH - (lines.length - 1) * WATERMARK_LINE_STEP;
    expect(withinTile).toBeGreaterThanOrEqual(WATERMARK_FONT_SIZE);
    expect(acrossTiles).toBeGreaterThanOrEqual(WATERMARK_FONT_SIZE);
  });

  it('🔴 沿文字方向亦不得相撞：相鄰 tile 之文字間隔 ＝ 2 × PAD_X > 0', () => {
    const lay = watermarkTileLayout(595.28, 841.89, ['x'], (t) => t.length * 10);
    expect(lay.tileW - 10).toBe(WATERMARK_TILE_PAD_X * 2);
  });

  it('旋轉框為正方形且邊長 ≥ (W + H) × cos45°（旋轉後恆覆蓋整頁）', () => {
    const lay = watermarkTileLayout(595.28, 841.89, ['x'], () => 100);
    expect(lay.size).toBeGreaterThanOrEqual((595.28 + 841.89) * Math.SQRT1_2);
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
