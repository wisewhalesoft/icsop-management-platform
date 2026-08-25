/**
 * 公司全稱（COMPFULLNM）— 靜態 COMPID→全稱 對映（純邏輯，無 IO）。
 *
 * 定案依據（docs/specs/upstream-person-org-source.md §COMPFULLNM；
 * upstream-hr-source-contract.md §10.1，2026-08-24 v2.0 實測）：
 *  - 上游 `VW_HRCOMF.COMPFULLNM` 四家俱全（v1.0 曾誤判「無來源」，已於契約 v2.0 更正）。
 *  - 供 F020 浮水印「公司名稱」欄。
 *
 * F003 AC-P15（2026-08-14）：本表同時作為「可選公司集合」之**唯一**來源——手動帳號建立／編輯
 * 之公司下拉、寫入驗證（AC-P5／AC-P10）、清單公司欄（AC-P23c）、F020 浮水印公司名稱四處
 * 一律由此導出。新增公司＝只改本表一處。
 *
 * B 階段（2026-08-24，開放 AD／AE／AJ）：
 *  - 新增 AD＝和潤興業、AJ＝和勁企業（皆取自 `VW_HRCOMF.COMPFULLNM` 實測值）。
 *  - 🔴 **修正 AE 全稱缺字**：v1.0 誤植為「和潤電能」，漏了「股份有限公司」；契約 §10.1
 *    實測值為「和潤電能股份有限公司」。此前所有以 AE 建立之手動帳號、浮水印皆顯示不完整全稱。
 *  - 刻意排除 **ILS**（`VW_HRCOMF` 無此公司代碼，來源不明，契約 §11 #5 待上游確認）。
 *    契約 v1.0 曾一併排除 AD／AJ（理由「部門主檔嚴重不完整」），該理由已於 v2.0 更正為
 *    「量到的是舊來源 `VW_HPMUSER` 之母體污染，非真實缺漏」，四家組織資料實測皆完整。
 */
const COMPANY_FULL_NAME_ENTRIES = {
  AS: '和潤企業股份有限公司',
  AD: '和潤興業股份有限公司',
  AE: '和潤電能股份有限公司',
  AJ: '和勁企業股份有限公司',
} as const;

export const COMPANY_FULL_NAMES: Readonly<Record<string, string>> =
  COMPANY_FULL_NAME_ENTRIES;

/** 有效公司代碼（`COMPANY_FULL_NAMES` 之鍵集合；供 INV-C2 之型別層防漂移）。 */
export type CompanyCode = keyof typeof COMPANY_FULL_NAME_ENTRIES;

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

/**
 * 浮水印專用公司**簡稱**（F020 `AC-N10`，2026-08-20 D9 delta；`OQ-D9-06` 選項 A／`OQ-D9-07`）。
 *
 * 🔴 為何另立一張表而不直接改短 `COMPANY_FULL_NAMES`：全稱另有**三處**消費點（F003 帳號管理
 * 之公司下拉與清單公司欄、`GET /companies`、F024 調閱歷程之公司欄與其 CSV），使用者已明確否決
 * 「連帶改變已驗收功能」之作法（`AC-N13` 為該否決之回歸鎖定）。
 *
 * 🔴 **INV-C2**：本表之鍵集合恆等於 `COMPANY_FULL_NAMES`。以 `Record<CompanyCode, string>` 承載
 * ⇒ 新增公司到全稱表卻漏登短稱時 **`tsc` 直接編譯失敗**（缺鍵）。此為第一道（編譯期）防線；
 * 第二道（執行期）為 `assertCompanyShortNamesComplete()`——型別在 build 產物中不存在，故
 * `AC-N11` 明訂仍須保留執行期載體。
 *
 * ⚠ 漏登之後果為何值得兩道防線：浮水印公司欄會靜默退化為空字串，而 §8.4 之分隔符收合規則
 * 會讓它**看起來像正常留空**（不是 `null`、不是亂碼），沒有人會發現。
 *
 * ⚠ **不得回接上游 `COMPSIMPNM`**：上游簡稱（AS＝「和潤」）與本表既有慣例（AS＝「和潤企業」，
 * 即全稱去掉「股份有限公司」）不同源，改接會變更已驗收之 AS 浮水印（使用者已明確否決此類變更，
 * 見上方 INV-C2 段落）。B 階段新增之 AD／AJ 短稱依**既有慣例**（全稱去尾「股份有限公司」）產生，
 * 與上游簡稱無關。
 */
export const COMPANY_SHORT_NAMES: Readonly<Record<CompanyCode, string>> = {
  AS: '和潤企業',
  AD: '和潤興業',
  AE: '和潤電能',
  AJ: '和勁企業',
};

/** INV-C2 之執行期斷言（`AC-N11`）：鍵集合不相等即拋錯。型別層防護見上方 `Record<CompanyCode, …>`。 */
export function assertCompanyShortNamesComplete(): void {
  const full = Object.keys(COMPANY_FULL_NAMES).sort();
  const short = Object.keys(COMPANY_SHORT_NAMES).sort();
  if (full.join(',') !== short.join(',')) {
    throw new Error(
      `INV-C2 violated: COMPANY_SHORT_NAMES keys ${short.join(',')} != COMPANY_FULL_NAMES keys ${full.join(',')}`,
    );
  }
}

/**
 * COMPID → 浮水印公司簡稱（`AC-N12`）；查無／空值 → `null`（比照 `resolveCompanyName` 之寬容處置，
 * 由呼叫端套 §8.4 分隔符收合）。🔒 **不得回退為全稱**——那會讓漏登在畫面上完全看不出來。
 */
export function resolveCompanyShortName(
  companyCode: string | null | undefined,
): string | null {
  if (companyCode == null) return null;
  const code = companyCode.trim();
  if (code.length === 0) return null;
  return COMPANY_SHORT_NAMES[code as CompanyCode] ?? null;
}
