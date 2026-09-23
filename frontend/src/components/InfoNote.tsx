import { useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Icon } from './Icon';
import { infoNotePopoverShift, INFO_NOTE_EDGE_MARGIN } from '../domain/info-note-position';

/**
 * 全站共用之 ⓘ 說明（hover／focus／點擊展開）。
 *
 * 🔴 **原生於 `DashboardHome`（F044 `AC-G95`），2026-09-23 抽出為共用元件**——起因是使用者裁決
 * 「實作邏輯和技術細節不需要出現在 UI 上給使用者看，如果要留也應該用 hover 的方式保留」
 * 必須套用到**全站**（前台檢視器安全帶、樹狀圖預覽、OJT 口徑說明……）。
 * ⚠ 元件行為與 DOM 契約**逐字不變**（`data-info-for`／`data-info-content`／`role="note"`
 * ／`aria-expanded`／`aria-describedby`），既有儀表板斷言不得因搬家而改寫。
 */

/** 🔒 §命名鎖定第 17 前列：ⓘ 觸發器之無障礙名稱（全站多個 ⓘ 共用，以 `data-info-for` 區辨）。 */
export const INFO_LABEL = '說明';

/**
 * ⓘ 說明（`AC-G95`）—— 把「這個數字為什麼這樣算」移出常駐文案。
 *
 * 🔴 `LESSON-G2`：**「不變式需要可驗證的載體」≠「不變式需要可見的文案」**。載體可以是 `data-*`、
 * `aria-label` 或 popover 內的文字；把不變式的**理由**寫成畫面上的常駐說明，
 * 等於**把驗收標準洩漏給使用者**。
 *
 * 🔴 **內容恆在 DOM**（未展開時僅以視覺方式隱藏），🔴 **明文禁止以 `title` 屬性實作**
 * ——`title` 在觸控裝置不可達、螢幕閱讀器支援不一致、且難以穩定斷言。
 * 🔒 觸發器本身**不承載任何資訊**（只是一個 ⓘ），資訊全數在內容裡。
 *
 * 🔴 **hover／focus／點擊三者皆為「開啟」，不是「切換」**：`user-event.click()` 會**先 focus
 * 再點擊**；若 focus 開啟、click 再切換，一次點擊後就會回到收合狀態——看起來完全合理，
 * 卻讓「`false` → `true`」永遠不成立。
 * 🔒 **收合路徑恰三條**：移開游標／`Tab` 離開／`Esc`。
 */
export function InfoNote({
  infoKey,
  paragraphs,
}: {
  infoKey: string;
  paragraphs: readonly string[];
}): JSX.Element {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinned, setPinned] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const noteRef = useRef<HTMLSpanElement>(null);
  const [shiftX, setShiftX] = useState(0);
  const id = `info-${infoKey}`;
  const open = hovered || focused || pinned;

  /**
   * 🔴 **2026-09-23 實機覆核修正**：popover 以 `left-0` 對齊觸發器，而全站的 ⓘ 多數**接在一句話
   * 的尾巴**——句子越長，觸發器越靠右，256px 的 popover 就越容易衝出視窗右緣（實測前台檢視器
   * 390px 下溢出 106px）。這裡在展開當下量一次並夾回視窗內。
   *
   * 🔒 夾制的**算法**住在 `infoNotePopoverShift()`（純函式、有單元測試）；本處只負責量測與套用
   * ——`getBoundingClientRect()` 在 jsdom 恆為 0，任何寫在這裡的邏輯都測不到。
   * ⚠ 量測必須在 popover **已可見**之後（`useLayoutEffect` 於同一次 commit 之後、paint 之前跑），
   *   否則 `width` 會是 0、夾制量算成滿版位移。
   */
  useLayoutEffect(() => {
    if (!open) {
      setShiftX(0);
      return;
    }
    const anchor = wrapRef.current;
    const note = noteRef.current;
    if (!anchor || !note) return;
    const vw = document.documentElement.clientWidth;
    if (!vw) return;
    const width = note.getBoundingClientRect().width || 0;
    if (!width) return;
    setShiftX(infoNotePopoverShift(anchor.getBoundingClientRect().left, vw, width));
  }, [open]);
  return (
    <span
      ref={wrapRef}
      className="relative inline-flex align-middle shrink-0"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        ref={btnRef}
        type="button"
        data-testid="info-trigger"
        data-info-for={infoKey}
        aria-label={INFO_LABEL}
        aria-expanded={open}
        aria-describedby={id}
        onClick={() => setPinned(true)}
        /**
         * 🔴 **`flushSync` 守的是「可見狀態與 ARIA 狀態必須同一拍落地」——不是為了讓某條測試過。**
         * ⚠ **它的防線很薄，動它之前請先讀完下面三句**：目前有一條**同步**斷言守著它
         *   （`DashboardHome.f044.rationale.test.tsx` 之「`Tab` 進入（focus）⇒ 開啟」，
         *   `trigger.focus()` 後**不經 `waitFor`／`await`** 直接讀 `aria-expanded`）。
         * 🔴 **那條斷言一旦被放寬成 `waitFor`，本修正就完全失去測試防護**——`waitFor` 會等到下一拍，
         *   屆時「同步正確」與「慢一拍」兩種實作**都會綠**。⇒ 🔒 **若哪天看到那條變成 `waitFor`，
         *   本段註解就是唯一還站著的東西；此時要拿掉 `flushSync`，請先回答下面三句。**
         *
         * ① 焦點可以**完全不經過任何 React 事件**而改變：瀏覽器原生 `Tab`、程式碼直接呼叫
         *    `element.focus()`、以及輔助技術移動焦點，走的都是原生路徑。
         * ② React 18 把 focus 歸在 **continuous** 車道、**非同步**排程。
         * ③ ⇒ popover 的可見性由 CSS **立刻**改變，`aria-expanded` 卻**慢一拍**：那一拍之間，
         *    焦點已經在按鈕上、畫面已經展開，屬性卻還說 `"false"`
         *    ——對螢幕閱讀器與任何同步讀取屬性的程式來說，那是一個**說謊的中間狀態**。
         *
         * 🔒 其餘三條路徑（hover／click／`Esc`）**不需要** `flushSync`：它們必定經由 React 事件，
         *   且不存在「原生已改變、React 還沒跟上」的中間狀態。
         */
        onFocus={() => flushSync(() => setFocused(true))}
        onBlur={() =>
          flushSync(() => {
            setFocused(false);
            setPinned(false);
          })
        }
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return;
          e.preventDefault();
          setHovered(false);
          setFocused(false);
          setPinned(false);
          btnRef.current?.blur();
        }}
        className="w-4 h-4 rounded-full border border-slate-300 text-slate-400 hover:text-primary-600 hover:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-600 flex items-center justify-center shrink-0"
      >
        <Icon name="info" className="w-3 h-3" />
      </button>
      <span
        id={id}
        data-testid="info-content"
        data-info-content={infoKey}
        role="note"
        ref={noteRef}
        /**
         * 🔒 `max-w` 由固定的 `16rem` 改為「`16rem` 與視窗寬減兩側留白取小」——視窗比 popover
         * 還窄時（極窄手機、桌機視窗被拖很小）先縮寬度，再由 `shiftX` 夾位置。
         */
        style={{
          maxWidth: `min(16rem, calc(100vw - ${INFO_NOTE_EDGE_MARGIN * 2}px))`,
          ...(shiftX ? { transform: `translateX(${shiftX}px)` } : {}),
        }}
        className={`${open ? '' : 'hidden '}absolute left-0 top-full mt-1 z-50 w-64 rounded-lg border border-slate-200 bg-white shadow-lg p-3 text-[11px] leading-relaxed text-slate-600 text-left font-normal whitespace-normal`}
      >
        {paragraphs.map((p, i) => (
          <span key={p} className={i > 0 ? 'block mt-1.5' : 'block'}>
            {p}
          </span>
        ))}
      </span>
    </span>
  );
}
