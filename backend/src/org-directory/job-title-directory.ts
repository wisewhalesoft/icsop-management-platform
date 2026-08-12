/**
 * 職稱對照解析（org-directory；純邏輯，無 IO）。
 *
 * JOB_TITLE 已由 F004 同步攝入（← VW_PERSONAL_JOB，見 org-sync）；本模組提供**讀取端**之
 * 介面與解析規則，供帳號管理清單之「職位」欄（prototype 08 第 5 欄，G-ADM-001）。
 *
 * 解析為兩段式（實測依據見 upstream-hr-source-contract.md §5.4）：
 *  1. 本公司優先 —— 單一公司內 `code → name` 為 1:1（AS：54 組 pair / 54 種代碼，零歧義）。
 *  2. 查無再跨公司 fallback —— AS 在職 1,115 筆中 `I10`(9)／`G03`(1) 兩碼不在 AS 對照列內，
 *     僅第 1 段時命中率 99.1%，加入 fallback 後為 100%。
 *
 * ⚠ fallback 需為**確定性**：跨公司同代碼可能多名（全公司 71 組 pair / 63 種代碼，8 種歧義），
 *   故固定取 companyCode 字典序最小者。若改為「任取」，同一帳號在不同次同步/不同程序可能
 *   解析出不同職稱，造成無意義的畫面跳動。
 */

export interface JobTitleRecord {
  companyCode: string;
  code: string;
  name: string;
}

export interface JobTitleReadStore {
  /** 全量取回（實測 109 列，無分頁必要）。 */
  listAll(): Promise<JobTitleRecord[]>;
}

export const JOB_TITLE_READ_STORE = Symbol('JOB_TITLE_READ_STORE');

/** 複合鍵字串化。以 `|` 分隔——上游 COMPID／JTITLE_ID 皆為英數代碼，不含此字元。 */
export function jobTitleKey(companyCode: string, code: string): string {
  return `${companyCode}|${code}`;
}

/** 代碼 → 名稱之解析函式（見本檔頭部之兩段式規則）。 */
export type JobTitleResolver = (
  companyCode: string | null | undefined,
  code: string | null | undefined,
) => string | null;

/**
 * 由對照列建立解析器（單次 O(n) 建表，之後每次解析 O(1)；n≈109）。
 * 空代碼／查無 → null（呼叫端顯示為「—」，不拋錯）。
 */
export function buildJobTitleResolver(
  records: readonly JobTitleRecord[],
): JobTitleResolver {
  const exact = new Map<string, string>();
  // 跨公司 fallback 表：同代碼取 companyCode 字典序最小者之名稱（確定性）。
  const anyCompany = new Map<string, { companyCode: string; name: string }>();

  for (const r of records) {
    const code = r.code?.trim();
    const companyCode = r.companyCode?.trim();
    if (!code || !companyCode || !r.name) continue;
    exact.set(jobTitleKey(companyCode, code), r.name);
    const prev = anyCompany.get(code);
    if (prev === undefined || companyCode < prev.companyCode) {
      anyCompany.set(code, { companyCode, name: r.name });
    }
  }

  return (companyCode, code) => {
    const c = code?.trim();
    if (!c) return null;
    const cc = companyCode?.trim();
    if (cc) {
      const hit = exact.get(jobTitleKey(cc, c));
      if (hit !== undefined) return hit;
    }
    return anyCompany.get(c)?.name ?? null;
  };
}
