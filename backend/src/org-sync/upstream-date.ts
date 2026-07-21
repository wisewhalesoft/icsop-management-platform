/**
 * 上游日期正規化（純函式，無 IO）
 *
 * 根因（2026-07-21 真實 dev 資料實跑）：MSSQL `datetime` 範圍僅 1753-01-01 ～ 9999-12-31；
 * 上游（遮罩 dev）之日期值可能低於 1753、為 Invalid Date（遮罩破壞）、或哨兵 9999-12-31 之
 * 溢位邊界（9999-12-31 23:59:59.999 進位即超出），tedious 綁定時拋 "Out of range"。
 *
 * 對 RESIGNDT / HIREDT / MTDT 一律套用本函式，將不可寫入/無意義之值收斂為 null：
 *  - 哨兵年份 >= 9999（未離職/未結束，契約 §4）→ null（語意乾淨，勝過存 magic date）。
 *  - Invalid Date → null。
 *  - 低於 datetime 下界（< 1753）或明顯異常 → null。
 *  - 正常日期 → 原樣（passthrough）。
 * ⚠ 欄位型別另改為 datetime2（範圍 0001–9999）作為第二道防線（見 account/sync-run entity 與 migration）。
 */

/** MSSQL `datetime` 下界年份。 */
export const MSSQL_DATETIME_MIN_YEAR = 1753;

/** 哨兵年份：>= 此值一律視為「未結束/無期限」→ null（同時避開 datetime 上界溢位）。 */
export const UPSTREAM_SENTINEL_YEAR = 9999;

export function normalizeUpstreamDate(
  raw: Date | string | null | undefined,
): Date | null {
  if (raw == null) return null;
  if (typeof raw === 'string' && raw.trim() === '') return null;

  const d = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(d.getTime())) return null; // Invalid Date（遮罩破壞等）

  const year = d.getUTCFullYear();
  if (year >= UPSTREAM_SENTINEL_YEAR) return null; // 哨兵 / 溢位邊界
  if (year < MSSQL_DATETIME_MIN_YEAR) return null; // 低於可儲存範圍 / 明顯異常

  return d;
}
