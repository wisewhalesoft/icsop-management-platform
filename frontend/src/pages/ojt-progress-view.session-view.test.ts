import { describe, it, expect } from 'vitest';
import {
  VIEW_BTN_TEXT,
  VIEW_TITLE_TEXT,
  VIEW_FAILED_TEXT,
  viewSessionAria,
  viewPendingAria,
  downloadPendingAria,
  isViewableSignin,
  isPdfFileName,
} from './ojt-progress-view';

/**
 * F042 簽到表線上檢視 delta（`AC-OV1`／`AC-OV2`／`AC-OV7`）——逐字文案之唯一鎖定點。
 * 頁面層測試一律 import 本檔所鎖之常數／函式，不另寫中文字面。
 */
describe('逐字文案', () => {
  it('檢視鈕與失敗訊息', () => {
    expect(VIEW_BTN_TEXT).toBe('檢視');
    expect(VIEW_TITLE_TEXT).toBe('檢視簽到表');
    expect(VIEW_FAILED_TEXT).toBe('檢視失敗，請稍後再試。');
  });
  it('aria-label', () => {
    expect(viewSessionAria('2026-08-20', 'a.pdf')).toBe('檢視簽到表（2026-08-20 · a.pdf）');
    expect(viewPendingAria('舊.pdf')).toBe('檢視舊資料簽到表（舊.pdf）');
    expect(downloadPendingAria('舊.pdf')).toBe('下載舊資料簽到表（舊.pdf）');
  });
});

describe('isViewableSignin（AC-OV1 ④：OJT_SIGNIN 白名單，不分大小寫）', () => {
  it.each([
    ['a.pdf', true], ['a.PDF', true], ['a.jpg', true], ['a.JPEG', true], ['a.png', true],
    ['a.doc', false], ['a.pdf.exe', false], ['noext', false], ['a.', false], ['a.xlsx', false],
  ])('%s → %s', (name, expected) => {
    expect(isViewableSignin(name)).toBe(expected);
  });
});

describe('isPdfFileName（AC-OV6：浮水印註記之判定）', () => {
  it.each([['a.pdf', true], ['a.PDF', true], ['a.jpg', false], ['pdf', false]])('%s → %s', (name, expected) => {
    expect(isPdfFileName(name)).toBe(expected);
  });
});
