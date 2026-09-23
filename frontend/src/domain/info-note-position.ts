/**
 * ⓘ popover 之水平夾制（2026-09-23 瀏覽器實機覆核揪出）。
 *
 * 🔴 **實機缺陷**：`InfoNote` 原生於儀表板，那裡每個 ⓘ 都落在寬卡片的左半部，`left-0` 從來沒有
 * 越界過。2026-09-23 把它推到全站之後，多數 ⓘ 改為**接在一句話的尾巴**——句子有多長，
 * 觸發器就被推多遠。實測前台檢視器：390px 版面下觸發器落在 x=240，256px 寬的 popover
 * 右緣到 496，**溢出 106px**（產生水平捲軸或被裁掉）。
 *
 * 🔒 **單元測試看不到這個形狀**：jsdom 的 `getBoundingClientRect()` 一律回 0，任何以它為前提的
 * 斷言在 jsdom 下都恆真；故本模組刻意抽成**純函式**，讓「夾制邏輯」本身可被機器驗證，
 * 而不是把它留在只有真瀏覽器才跑得到的量測路徑上。
 */

/** popover 距視窗左右緣之最小留白。 */
export const INFO_NOTE_EDGE_MARGIN = 8;

/** popover 之設計寬度（對應 Tailwind `w-64`）。 */
export const INFO_NOTE_WIDTH = 256;

/**
 * 算出 popover 需要的水平位移（px）。
 *
 * @param anchorLeft 觸發器（錨點）之視窗座標左緣——popover 預設即對齊於此（`left-0`）。
 * @param viewportWidth 視窗可用寬度。
 * @param popoverWidth popover 實際寬度（窄視窗下會被 `max-width` 縮小）。
 * @returns 位移量：負值＝往左拉回、正值＝往右推開、`0`＝原位即可。
 *
 * 🔒 **左緣優先**：兩邊同時放不下時（視窗比 popover 還窄）回傳「貼左緣」之位移——
 * 寧可讓右邊被視窗裁掉，也不能讓開頭的字跑到畫面外，否則整段讀不到第一個字。
 */
export function infoNotePopoverShift(
  anchorLeft: number,
  viewportWidth: number,
  popoverWidth: number = INFO_NOTE_WIDTH,
  margin: number = INFO_NOTE_EDGE_MARGIN,
): number {
  const overflowRight = anchorLeft + popoverWidth - (viewportWidth - margin);
  const overflowLeft = margin - anchorLeft;
  if (overflowLeft > 0) return overflowLeft;
  if (overflowRight > 0) {
    // 往左拉回，但不得把左緣拉到 margin 之外（窄視窗時以貼左緣為準）。
    return -Math.min(overflowRight, anchorLeft - margin);
  }
  return 0;
}
