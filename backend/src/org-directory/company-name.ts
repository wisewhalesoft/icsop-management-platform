/**
 * 公司全稱（COMPFULLNM）— 靜態 COMPID→全稱 對映（純邏輯，無 IO）。
 *
 * 定案依據（docs/specs/upstream-person-org-source.md §COMPFULLNM）：
 *  - 上游 HR（portalapp-sp 全專案）無公司全稱來源；COMPID 僅 2 碼。
 *  - 採靜態對映；AS＝和潤企業股份有限公司（與 prototype 14 COMPANY_NAME 常數一致）。
 *  - 供 F020 浮水印「公司名稱」欄。
 *
 * F003 AC-P15（2026-08-14）：本表同時作為「可選公司集合」之**唯一**來源——手動帳號建立／編輯
 * 之公司下拉、寫入驗證（AC-P5／AC-P10）、清單公司欄（AC-P23c）、F020 浮水印公司名稱四處
 * 一律由此導出。新增公司＝只改本表一處。
 *  - AE＝和潤電能〔[ASSUMPTION] 全稱待覆核，見 F003 AC-P15 之矛盾註記〕。
 *  - 刻意排除 AC（COMPENDDT=1900-01-01，測試資料且已結束）與 AD／AJ／ILS（VW_HRCOMF 無該筆、
 *    部門主檔嚴重不完整，契約明載補齊前不具納入條件）。
 *
 * TODO（多公司）：改為設定表／上游同步（VW_HRCOMF 目前僅 3 筆且無全稱欄）。屆時本模組改讀 store。
 */
export const COMPANY_FULL_NAMES: Readonly<Record<string, string>> = {
  AS: '和潤企業股份有限公司',
  AE: '和潤電能',
};

/**
 * 可選公司代碼集合（F003 AC-P15 之具名常數）。
 *
 * **INV-C1（不變式）**：`SELECTABLE_COMPANIES ≡ Object.keys(COMPANY_FULL_NAMES)`——刻意以
 * `Object.keys` **導出**而非另寫一份陣列，使兩者在結構上不可能漂移（否則會出現「下拉可選但
 * 清單／浮水印顯示 —」之不一致）。
 */
export const SELECTABLE_COMPANIES: readonly string[] =
  Object.keys(COMPANY_FULL_NAMES);

/** 代碼是否為有效（可選）公司。空字串／未知代碼／已結束之公司 → false（AC-P5／AC-P10）。 */
export function isSelectableCompany(companyCode: string): boolean {
  return SELECTABLE_COMPANIES.includes(companyCode);
}

/** 公司主檔列（GET /companies 之回應形狀，AC-P15）；依 companyCode 昇冪。 */
export interface CompanyOption {
  companyCode: string;
  companyName: string;
}

/** 由 COMPANY_FULL_NAMES 產生公司主檔清單（依 companyCode 昇冪，AC-P15）。 */
export function listSelectableCompanies(): CompanyOption[] {
  return SELECTABLE_COMPANIES.map((companyCode) => ({
    companyCode,
    companyName: COMPANY_FULL_NAMES[companyCode],
  })).sort((a, b) => a.companyCode.localeCompare(b.companyCode));
}

/** COMPID → 公司全稱；查無 / 空值 → null（不拋錯，供 F020 組裝端寬容處理）。 */
export function resolveCompanyName(
  companyCode: string | null | undefined,
): string | null {
  if (companyCode == null) return null;
  const code = companyCode.trim();
  if (code.length === 0) return null;
  return COMPANY_FULL_NAMES[code] ?? null;
}
