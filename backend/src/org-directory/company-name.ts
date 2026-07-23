/**
 * 公司全稱（COMPFULLNM）— 靜態 COMPID→全稱 對映（純邏輯，無 IO）。
 *
 * 定案依據（docs/specs/upstream-person-org-source.md §COMPFULLNM）：
 *  - 上游 HR（portalapp-sp 全專案）無公司全稱來源；COMPID 僅 2 碼。
 *  - 採靜態對映；AS＝和潤企業股份有限公司（與 prototype 14 COMPANY_NAME 常數一致）。
 *  - 供 F020 浮水印「公司名稱」欄。
 *
 * TODO（多公司）：改為設定表／上游同步（VW_HRCOMF 目前僅 3 筆且無全稱欄）。屆時本模組改讀 store。
 */
export const COMPANY_FULL_NAMES: Readonly<Record<string, string>> = {
  AS: '和潤企業股份有限公司',
};

/** COMPID → 公司全稱；查無 / 空值 → null（不拋錯，供 F020 組裝端寬容處理）。 */
export function resolveCompanyName(
  companyCode: string | null | undefined,
): string | null {
  if (companyCode == null) return null;
  const code = companyCode.trim();
  if (code.length === 0) return null;
  return COMPANY_FULL_NAMES[code] ?? null;
}
