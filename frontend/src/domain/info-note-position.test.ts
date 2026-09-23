import { describe, it, expect } from 'vitest';
import {
  infoNotePopoverShift,
  INFO_NOTE_EDGE_MARGIN,
  INFO_NOTE_WIDTH,
} from './info-note-position';

/**
 * ⓘ popover 之水平夾制（2026-09-23 瀏覽器實機覆核揪出之缺陷）。
 *
 * 🔴 **本檔存在的理由＝這個缺陷單元測試原本看不到**：jsdom 的 `getBoundingClientRect()` 一律回 0，
 * 所以「popover 有沒有衝出視窗」在 jsdom 下**沒有任何可觀測差異**——任何直接斷言座標的測試都恆真。
 * 把夾制算法抽成純函式之後，它才變成機器驗得到的東西。
 *
 * 🔒 每一案都用**實機量到的真實數字**當語料（前台檢視器 390px：錨點 x=240、popover 256px），
 * 而不是自己編一組剛好會過的數字。
 */
describe('infoNotePopoverShift — ⓘ popover 不得溢出視窗', () => {
  it('🔴 實機回歸：390px 視窗、錨點 x=240、寬 256 ⇒ 往左拉回，右緣不得越界', () => {
    const shift = infoNotePopoverShift(240, 390, 256);
    expect(shift).toBeLessThan(0);
    // 夾制後之右緣必須落在視窗內（留白 8px）。
    expect(240 + shift + 256).toBeLessThanOrEqual(390 - INFO_NOTE_EDGE_MARGIN);
    // 且左緣不得被拉出畫面。
    expect(240 + shift).toBeGreaterThanOrEqual(INFO_NOTE_EDGE_MARGIN);
  });

  it('空間足夠時不位移（桌機：1905px 視窗、錨點 x=636）', () => {
    expect(infoNotePopoverShift(636, 1905, 256)).toBe(0);
  });

  it('恰好放得下時不位移（邊界：anchor + 寬 == 視窗 - 留白）', () => {
    const anchor = 390 - INFO_NOTE_EDGE_MARGIN - 256;
    expect(infoNotePopoverShift(anchor, 390, 256)).toBe(0);
  });

  it('只差 1px 時位移 1px（off-by-one：越界判定不得用 >=）', () => {
    const anchor = 390 - INFO_NOTE_EDGE_MARGIN - 256 + 1;
    expect(infoNotePopoverShift(anchor, 390, 256)).toBe(-1);
  });

  it('錨點本身太靠左時往右推開（左緣留白優先）', () => {
    expect(infoNotePopoverShift(2, 1905, 256)).toBe(INFO_NOTE_EDGE_MARGIN - 2);
  });

  /**
   * 🔴 **左緣優先**：視窗比 popover 還窄時兩邊都放不下。此時必須貼左緣——
   * 若改成「無論如何都把右緣拉進來」，開頭的字會被推出畫面左側，整段讀不到第一個字。
   * ⚠ 這一案是本檔唯一會咬住「拉回量未設上限」之實作的斷言。
   */
  it('視窗比 popover 還窄 ⇒ 貼左緣，不得把左緣拉出畫面', () => {
    const shift = infoNotePopoverShift(120, 200, 256);
    expect(120 + shift).toBe(INFO_NOTE_EDGE_MARGIN);
  });

  it('預設參數＝設計寬度與留白（呼叫端不傳時之行為與傳入常數一致）', () => {
    expect(infoNotePopoverShift(240, 390)).toBe(
      infoNotePopoverShift(240, 390, INFO_NOTE_WIDTH, INFO_NOTE_EDGE_MARGIN),
    );
    expect(INFO_NOTE_WIDTH).toBe(256);
  });
});
