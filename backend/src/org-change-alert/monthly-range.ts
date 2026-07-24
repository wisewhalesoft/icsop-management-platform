/**
 * KPI「本月」範圍計算（純函式，注入 now）。
 *
 * 「本月」＝ Asia/Taipei（UTC+8）當月 1 日 00:00 起，至次月 1 日 00:00 止（含頭不含尾）。
 * 台灣無日光節約，固定 +8 小時位移即為正確換算（比照 org-sync-view.formatDateTime 之時區慣例）。
 */

const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;

export interface MonthRange {
  /** 顯示標籤 YYYY-MM（台北時區）。 */
  month: string;
  /** 區間起（含），UTC 時刻。 */
  from: Date;
  /** 區間迄（不含），UTC 時刻。 */
  to: Date;
}

export function taipeiMonthRange(now: Date): MonthRange {
  const taipei = new Date(now.getTime() + TAIPEI_OFFSET_MS);
  const y = taipei.getUTCFullYear();
  const m = taipei.getUTCMonth(); // 0-based
  const from = new Date(Date.UTC(y, m, 1) - TAIPEI_OFFSET_MS);
  const to = new Date(Date.UTC(y, m + 1, 1) - TAIPEI_OFFSET_MS);
  return { month: `${y}-${String(m + 1).padStart(2, '0')}`, from, to };
}
