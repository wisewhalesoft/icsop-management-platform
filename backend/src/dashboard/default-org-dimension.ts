/**
 * F044 `AC-G42`／`AC-G43`／`AC-G87` — 環圖之**預設制定組織維度**（零 IO 純函式）。
 *
 * 🔴 判定鏈之上游（`architecture-spec` §15.3／`ARCH-G2`）：
 *   `sessionUser.companyCode` ＋ `loginId` → `ACCOUNT.jobPositionCode`
 *   → `buildJobPositionResolver(JOB_POSITION 全表)`（🔴 單段精確、**禁跨公司 fallback**）
 *   → 本函式之逐字白名單。
 * ⇒ 本函式只收**職位名**，故「解析不到」與「職位不在白名單」在此收斂為同一個結果
 *   （`'department'`），呼叫端不需要分辨。
 *
 * 🔴 **比對方式＝trim 後完整字串相等**，明文禁止 `includes`／`startsWith`／正則部分比對：
 *   `副總經理` 在 `includes('總經理')` 之下會被誤判為 `'company'`，而它是一個**部門層**職位。
 *
 * ⚠ `副本部長`／`副總經理` 皆**不存在**於上游已記錄之 `VW_JOB_FUN` 名稱清單（正式環境四家共
 *   75 列，全 repo grep `副本部` 零命中）⇒ 🔴 它們只有人工 fixture 之測試載體，
 *   **不得**在交付報告中宣稱「已於實機驗證」（architecture-spec §15.10 #8）。
 *
 * 🔴 **本判定只住在後端**（`AC-G90` ③）：前端不得出現任何職位名白名單、不得解析
 *   `jobPositionCode`、不得向 `/job-positions` 取資料——端點直接回 `defaultDimension`。
 */

/** 🔒 值域恰三值（＝ `DashboardAnalytics.defaultDimension` 與環圖頁籤之值域）。 */
export type OrgDimension = 'company' | 'division' | 'department';

/** 🔒 逐字白名單（`OQ-D44-20` b：`副本部長` 逐字保留為前瞻條目）。 */
const COMPANY_TITLES: readonly string[] = ['董事長', '總經理'];
const DIVISION_TITLES: readonly string[] = ['本部長', '副本部長'];

/**
 * 職位名 → 預設維度。查無職位（`null`）或不在白名單者一律 `'department'`
 * ——部門維度是資訊量最高、對多數使用者最有用的預設，且它是唯一不需要額外解析就成立的答案。
 */
export function defaultOrgDimension(jobPositionName: string | null | undefined): OrgDimension {
  const name = String(jobPositionName ?? '').trim();
  if (COMPANY_TITLES.includes(name)) return 'company';
  if (DIVISION_TITLES.includes(name)) return 'division';
  return 'department';
}
