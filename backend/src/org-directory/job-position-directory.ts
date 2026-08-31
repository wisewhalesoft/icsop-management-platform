/**
 * 職位對照解析（org-directory；純邏輯，無 IO）。
 *
 * `JOB_POSITION` 已由 F004 同步攝入（← `VW_JOB_FUN`，見 org-sync）；本模組提供**讀取端**之
 * 介面與解析規則，供帳號管理清單之「職位」欄（prototype 08 第 6 欄，G-ADM-001）。
 *
 * 🔴 **單段精確解析，無跨公司 fallback**——這是與 [job-title-directory](./job-title-directory.ts)
 *   （資位，兩段式含 fallback）之**刻意差異**，不是遺漏：
 *   同一代碼跨公司語意可**相反**（2026-08-31 正式契約實查，四家 73 列中 7 碼歧義）：
 *     `D04` 在 AS＝營業經理、在 AD＝科長；`C04` 在 AD＝部長、在他家＝處長。
 *   資位之 fallback 最壞情況是顯示他公司的同義職稱；職位之 fallback 會顯示**錯誤的職位**
 *   （把科長顯示成營業經理），比顯示「—」嚴重得多。
 *
 * 查無 → `null`（呼叫端顯示「—」，AC-P18）。實測未命中僅 AS 之 `B20`（6 人），
 * 該代碼於四家 `VW_JOB_FUN` 皆不存在，故縱使開放 fallback 亦無從命中。
 */

export interface JobPositionRecord {
  companyCode: string;
  code: string;
  name: string;
}

export interface JobPositionReadStore {
  /** 全量取回（實測四家 73 列，無分頁必要）。 */
  listAll(): Promise<JobPositionRecord[]>;
}

export const JOB_POSITION_READ_STORE = Symbol('JOB_POSITION_READ_STORE');

/** 複合鍵字串化。以 `|` 分隔——上游 COMPID／CODE 皆為英數代碼，不含此字元（同 jobTitleKey）。 */
export function jobPositionKey(companyCode: string, code: string): string {
  return `${companyCode}|${code}`;
}

/** 代碼 → 名稱之解析函式（本公司精確命中，查無即 null）。 */
export type JobPositionResolver = (
  companyCode: string | null | undefined,
  code: string | null | undefined,
) => string | null;

/**
 * 由對照列建立解析器（單次 O(n) 建表，之後每次解析 O(1)；n≈73）。
 * 空代碼／空公司／查無 → null（不拋錯）。
 */
export function buildJobPositionResolver(
  records: readonly JobPositionRecord[],
): JobPositionResolver {
  const exact = new Map<string, string>();
  for (const r of records) {
    const code = r.code?.trim();
    const companyCode = r.companyCode?.trim();
    if (!code || !companyCode || !r.name) continue;
    exact.set(jobPositionKey(companyCode, code), r.name);
  }

  return (companyCode, code) => {
    const c = code?.trim();
    const cc = companyCode?.trim();
    // 🔴 公司缺失時一律 null——**不得**退化為「任一公司同代碼」，見檔頭。
    if (!c || !cc) return null;
    return exact.get(jobPositionKey(cc, c)) ?? null;
  };
}
