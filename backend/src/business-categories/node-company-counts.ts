import { SEG_UNSPECIFIED_KEY } from '../dashboard/division-resolver';

/**
 * F043 UX16 delta 項 12（`AC-UX33`～`AC-UX35`／`ARCH-UX6`，architecture-spec §16.6）：
 * 節點之「各制定公司計數」之**分類、排序與 sentinel 注入**（🟢 零 IO 純函式）。
 *
 * 🔒 `__unspecified__` 之字面**逐字沿用** F044 既有之 `SEG_UNSPECIFIED_KEY`（`AC-UX35`）——
 * 該常數已為「解析不出來的桶」而存在，**不另立第二套詞彙**。
 *
 * 🔴 **回應為陣列、不是 map**：JSON 物件之鍵序非規格保證之行為，把「`companyCode` 昇冪」這條
 * 排序契約押在鍵序上等同押在 JS 引擎實作細節上；且 TypeORM raw 查詢之 `COUNT` 回傳為**字串**，
 * 散落各處的二次轉型遲早漏一處（`'3' + '2' === '32'`）。
 */
export interface NodeCompanyCount {
  companyCode: string;
  count: number;
}

/** store 端之原始分組列（`GROUP BY nodeId, companyCode` 之投影；`companyCode` 可為 NULL）。 */
export interface RawCompanyCount {
  companyCode: string | null;
  count: number;
}

/**
 * 原始分組列 → 呈現用之計數列。
 *
 * ① **順序恆依 `companyCode` 昇冪**（`AC-UX34` ①）——🔴 **不是** `COMPANY_FULL_NAMES` 之登錄
 *    順序（`AS` 排第一），🔴 **也不是**計數大小（會讓列序隨資料變動而跳動）。
 * ② **`companyCode` 為 NULL 或空字串之列一律收斂為單一 sentinel 桶**（`AC-UX35`），其位置
 *    **恆為最後一列**且**不參與昇冪比較**——`_` 在 `localeCompare` 定序下排在字母**之前**、
 *    在 UTF-16 碼位序下（`0x5F` > `Z`）卻排在字母**之後**；🔴 **兩種比較法給出相反的位置**，
 *    把它排除在比較之外，殿後這件事才不再取決於採用哪一種字串比較法。
 * ③ 🔴 **明文禁止靜默丟棄 sentinel**：丟棄會使 `INV-UX1`（Σ 明細 ＝ `data-mounted-doc-count`）
 *    之總和**短少**，而徽章走的是另一支查詢、**仍然正確** ⇒ 畫面上出現「5 份程序書」但明細
 *    只加到 4，且沒有任何斷言會紅。
 *
 * 🔵 **本函式不過濾 `count === 0`**（`AC-UX34` ②）：`GROUP BY nodeId, companyCode` 只會為
 * **存在至少一筆**的組合產生一列，「某公司在某節點之計數為 0」結構上不會出現在輸入裡——
 * 「0 不顯示」是 SQL 層之結構性保證，不是本函式之職責；真收到一筆 `count: 0`（不應發生）時
 * 保留它反而更忠實地呈現「上游給了什麼」。
 */
export function classifyCompanyCounts(rows: readonly RawCompanyCount[]): NodeCompanyCount[] {
  const real = rows
    .filter((r): r is { companyCode: string; count: number } => !!r.companyCode)
    .map((r) => ({ companyCode: r.companyCode, count: r.count }))
    .sort((a, b) => (a.companyCode < b.companyCode ? -1 : a.companyCode > b.companyCode ? 1 : 0));
  const unspecifiedCount = rows
    .filter((r) => !r.companyCode)
    .reduce((sum, r) => sum + r.count, 0);
  return unspecifiedCount > 0
    ? [...real, { companyCode: SEG_UNSPECIFIED_KEY, count: unspecifiedCount }]
    : real;
}
