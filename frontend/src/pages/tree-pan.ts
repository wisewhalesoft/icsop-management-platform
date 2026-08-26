/**
 * F036 樹狀圖檢視器之「按住拖曳平移」— 純函式（無 React／無 DOM）。
 *
 * 🔴 為何抽成模組而非寫在元件內：jsdom **沒有版面**，`element.scrollLeft` 的設值不會生效、
 * 讀回恆為 0——把位移算式留在元件裡等於它永遠沒有測試載體（改錯方向、少乘一次都不會有人發現）。
 * 元件只負責「把事件座標餵進來、把結果寫回 scrollLeft/scrollTop」，算式本身在此被釘住。
 *
 * 座標語意：拖曳是**抓住畫布本身**移動 ⇒ 指標往右移，內容跟著往右，捲動位置要往**左**（減）。
 */

/** 按下當下之取樣點：指標座標＋容器捲動位置。 */
export interface PanOrigin {
  pointerX: number;
  pointerY: number;
  scrollLeft: number;
  scrollTop: number;
}

/**
 * 超過此位移（CSS px）才算「拖曳」，未超過則仍視為點擊。
 * 🔴 有門檻才不會把「手指微抖的點擊」判成拖曳而把節點標示功能整個吃掉。
 */
export const PAN_CLICK_THRESHOLD = 4;

export function beginPan(
  pointerX: number,
  pointerY: number,
  scrollLeft: number,
  scrollTop: number,
): PanOrigin {
  return { pointerX, pointerY, scrollLeft, scrollTop };
}

/**
 * 自起點推得新的捲動位置。負值一律夾回 0——瀏覽器雖然也會自己夾，但夾在這裡才有辦法斷言
 * 「往左拖到底不會累積出負債」（不夾時繼續往左拖會讓 scrollLeft 越來越負，放手後要往回拖同樣多下才會動）。
 */
export function panScroll(
  origin: PanOrigin,
  pointerX: number,
  pointerY: number,
): { scrollLeft: number; scrollTop: number } {
  return {
    scrollLeft: Math.max(0, origin.scrollLeft - (pointerX - origin.pointerX)),
    scrollTop: Math.max(0, origin.scrollTop - (pointerY - origin.pointerY)),
  };
}

/** 是否已超過門檻（任一軸超過即算）＝這一次互動是拖曳，其後的 click 應被抑制。 */
export function panExceeded(origin: PanOrigin, pointerX: number, pointerY: number): boolean {
  return (
    Math.abs(pointerX - origin.pointerX) > PAN_CLICK_THRESHOLD ||
    Math.abs(pointerY - origin.pointerY) > PAN_CLICK_THRESHOLD
  );
}
