/**
 * F044 `AC-G8` — 月份位移（月底溢位夾回當月最後一日、一律以 `Date.UTC` 拆組）。
 *
 * 🔴 **與 `frontend/src/pages/ojt-progress-view.ts#addMonthsClamped` 為同一演算法之兩份實作**
 * （跨 package 無法共用原始碼，比照 `org-directory/org-path.ts` 檔頭之既有紀律）。
 * 兩側之測試逐列引用**同一張 8 列固定向量表**：
 *   · 後端 `backend/src/ojt-progress/add-months-clamped.spec.ts`
 *   · 前端 `frontend/src/pages/ojt-progress-view.f044.test.ts`
 * ⚠ 任一側調整演算法或向量表，另一側必須同步——否則兩份實作只有一半被比對，
 *   反向夾回可以在後端漂移而前端全綠。
 *
 * 🔴 **明文禁止** `setMonth(...)`／`getMonth() ± 1` 之就地運算（`AC-G8` 末段）：天真作法在
 * 來源日超過目標月天數時會自動跨到下個月（`2026-01-31 + 1 月` 得 `2026-03-03`），
 * 而那個錯誤一年只有月底那幾天看得出來。
 *
 * 🔴 **`addMonthsClamped` 不可逆**（architecture-spec §15.2 之明文否決）：`2026-01-29`／
 * `2026-01-30`／`2026-01-31` 在 `+1` 之後**同為** `2026-02-28`，故「窗口反推成 `announcedDate`
 * 之區間」之等價不成立。母體判定必須正向計算每一列之應完成日。
 */

/** `YYYY-MM-DD` 之前綴（容許後端送來之完整 ISO 字串，例 `2026-01-15T00:00:00.000Z`）。 */
const ISO_DATE_PREFIX = /^(\d{4})-(\d{2})-(\d{2})/;

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

/**
 * `isoDate` 位移 `delta` 個月；輸入輸出皆為 `YYYY-MM-DD`。
 * 不可解析之輸入（空字串、非日期、不存在之日期）→ `null`（不拋例外、不回 `Invalid Date`）。
 */
export function addMonthsClamped(
  isoDate: string | null | undefined,
  delta: number,
): string | null {
  const m = ISO_DATE_PREFIX.exec(String(isoDate ?? ''));
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  // 不存在之日期（`2026-02-30`）一律 null——比照既有 `trainingDueDate()` 之 `Invalid Date` 分支。
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  const totalMonths = year * 12 + (month - 1) + delta;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = ((totalMonths % 12) + 12) % 12;
  // 目標月之最後一日（下個月的第 0 天 ＝ 本月最後一天）。
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const targetDay = day < lastDay ? day : lastDay;
  return `${pad(targetYear, 4)}-${pad(targetMonth + 1, 2)}-${pad(targetDay, 2)}`;
}
