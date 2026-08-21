/**
 * F036 `AC-T22`：子樹抽屜導向鈕之**可觀測 seam**。
 *
 * 每次派送（主路徑／退化路徑皆然）恰新增一筆 `{ mode, href, appHref, closedSelf }`，使 jsdom 下
 * **不必真的導覽**即可斷言走了哪一條路徑；`closedSelf` 明確記錄該次有無呼叫 `window.close()`
 * （退化路徑必為 `false`）。
 *
 * 🔴 **不得沿用 `window.__subtreeJumpCalls` 全域**（`prototypes/22:508-509` 為本模組之權威參考形狀，
 * 非移植對象）：把診斷用序列掛上 `window` 會在正式版洩漏內部狀態，且無法在測試間隔離。比照
 * F020 `AC-N73` 對 `window.__pdfRenderCalls` 之既有處置，改以**模組級 seam** 暴露同一序列。
 *
 * 🔴 **不得以渲染時之 `data-*` 模式旗標取代本 seam**（如 `data-subtree-jump-mode`）：那是渲染當下
 * 之投影，opener 若在渲染後才被關掉，屬性會與實際行為不符 ⇒ 製造一條**會說謊的斷言**。本 seam
 * 記錄的是「點擊當下判定 ＋ 派送後」真正發生的事。
 */
export interface SubtreeJumpCall {
  /** `'opener'`＝導回來源分頁並自關；`'self'`＝同分頁導覽（退化路徑）。 */
  mode: 'opener' | 'self';
  /** 該次實際導覽之目標；實作端恆等於 `appHref`（原型端因無應用路由而為同參數之原型檔名）。 */
  href: string;
  /** 實作端路由（`AC-T17` ④ 之字串）。 */
  appHref: string;
  /** 該次有無呼叫 `window.close()`；退化路徑必為 `false`（`AC-T21`）。 */
  closedSelf: boolean;
}

const calls: SubtreeJumpCall[] = [];

/** 記錄一次派送（順序即派送順序）。 */
export function recordSubtreeJump(call: SubtreeJumpCall): void {
  calls.push(call);
}

/** 讀取已記錄之派送序列（回複本，呼叫端不得經由回傳值變更內部狀態）。 */
export function getSubtreeJumpCalls(): SubtreeJumpCall[] {
  return [...calls];
}

/** 清空序列（測試間隔離用）。 */
export function resetSubtreeJumpCalls(): void {
  calls.length = 0;
}
