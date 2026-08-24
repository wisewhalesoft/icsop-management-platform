import { describe, it, expect, afterEach, vi } from 'vitest';
import { openedAsPopup } from './opened-as-popup';

/**
 * F036 §抽屜擴為子樹 delta（2026-08-21 三項裁決第 2／3 項）—— `AC-T19`（`openedAsPopup()` ＝
 * 全檔唯一之 opener 述詞）＋ `AC-T23`（⚠ 只能在 jsdom 建的分支——test-generator 不得漏掉）。
 *
 * 權威＝`docs/specs/features/F036-lifecycle-tree-preview.md#subtree-drawer-delta` `AC-T19`／`AC-T23`
 *      ＋ `docs/ui-ux-design-overview.md` §A.7.3（`openedAsPopup(): boolean`）。
 *
 * 🔴 落點為 test-generator 之命名決定（規格未指名檔名）：`frontend/src/pages/opened-as-popup.ts`，
 * 匯出單一具名述詞 `openedAsPopup(): boolean`。若 tdd-implementation 之實際落點不同，
 * 請走 mailbox 申訴——本檔只需改 import 路徑即可調整，不影響斷言本身。
 *
 * 🔴 AC-T23（本 delta 六個點名項目之第 1 項）：Chromium 在來源分頁關閉後會把 `window.opener`
 * 直接設為 `null`，所以「opener 已被關閉」這個分支在真實瀏覽器**永遠量不到**——本檔以
 * `{ closed: true }` 之 opener 替身**明確建一個獨立案例**（見下方「② opener.closed === true」），
 * 不指望 e2e 或瀏覽器煙霧測試會覆蓋到它。
 *
 * ⚠ 對實作全盲：本檔預期一開始為紅——`./opened-as-popup` 模組尚不存在。
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('openedAsPopup（AC-T19：全檔唯一之 opener 偵測，四種替身）', () => {
  it('① window.opener 為 null（直連進入）→ false', () => {
    vi.stubGlobal('opener', null);
    expect(openedAsPopup()).toBe(false);
  });

  it('① window.opener 為 undefined（jsdom 未設定）→ false', () => {
    vi.stubGlobal('opener', undefined);
    expect(openedAsPopup()).toBe(false);
  });

  it('有效 opener（存在且 closed=false）→ true', () => {
    vi.stubGlobal('opener', { closed: false, location: { href: '' }, focus: vi.fn() });
    expect(openedAsPopup()).toBe(true);
  });

  /**
   * 🔴 AC-T23：本案為六個點名項目之一，務必獨立存在——真實 Chromium 下量不到這個分支
   * （opener 已關閉時 window.opener 會被瀏覽器直接設為 null，落在情形①而非②）。
   */
  it('🔴 ② opener.closed === true（來源分頁已被關閉；只能在 jsdom 以替身建案例，Chromium 量不到）→ false', () => {
    vi.stubGlobal('opener', { closed: true });
    expect(openedAsPopup()).toBe(false);
  });

  it('③ 存取 window.opener 或其屬性時擲例外（跨源／被瀏覽器切斷）→ false（不得向外拋錯）', () => {
    const throwing = new Proxy(
      {},
      {
        get() {
          throw new DOMException('Blocked a frame with origin from accessing a cross-origin frame.');
        },
      },
    );
    vi.stubGlobal('opener', throwing);
    expect(() => openedAsPopup()).not.toThrow();
    expect(openedAsPopup()).toBe(false);
  });
});
