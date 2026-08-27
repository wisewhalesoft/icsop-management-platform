/**
 * 「最近活動」之時間標籤（prototypes/07-admin-shell.html 之 ACTIVITY 右側時間欄）。
 * prototype 示範值同時出現「2 小時前」與「今日 06:00」「昨日 22:14」 ⇒ 近期用相對、稍遠用時刻。
 *
 * 規則（由近而遠）：<1 分＝剛剛／<1 小時＝N 分鐘前／同日且 <6 小時＝N 小時前／
 * 同日＝今日 HH:mm／前一日＝昨日 HH:mm／其餘＝YYYY-MM-DD HH:mm。
 *
 * 後端回傳 UTC ISO，本函式一律以**瀏覽器本地時區**推導日界與時刻（+8 由執行環境決定，不寫死位移）。
 * 純函式；now 可注入以利測試。無效時間戳 → 「—」（與各頁缺值佔位一致，不輸出 Invalid Date）。
 */
const two = (n: number): string => String(n).padStart(2, '0');
const hhmm = (d: Date): string => `${two(d.getHours())}:${two(d.getMinutes())}`;
const startOfDay = (d: Date): number =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function activityTimeLabel(occurredAt: string, now: Date = new Date()): string {
  const t = Date.parse(occurredAt);
  if (!Number.isFinite(t)) return '—';
  const d = new Date(t);
  const diff = now.getTime() - t;
  // 未來時間（時鐘偏差）一併收斂為「剛剛」，不輸出負數。
  if (diff < MINUTE) return '剛剛';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} 分鐘前`;
  const dayDiff = Math.round((startOfDay(now) - startOfDay(d)) / DAY);
  if (dayDiff === 0) {
    return diff < 6 * HOUR ? `${Math.floor(diff / HOUR)} 小時前` : `今日 ${hhmm(d)}`;
  }
  if (dayDiff === 1) return `昨日 ${hhmm(d)}`;
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${hhmm(d)}`;
}
