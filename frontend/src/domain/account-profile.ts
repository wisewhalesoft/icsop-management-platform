/**
 * F003 手動帳號基本資料（公司／部門／資位／職位）— 前端純函式與逐字文案常數。
 *
 * 規格權威：docs/specs/features/F003-account-role-management.md#manual-account-profile
 *          （AC-P13／AC-P14／AC-P16／AC-P17／AC-P23b／AC-P26）
 * 文案權威：prototypes/08-account-management.html 之具名常數
 *          `COMPANY_ALL_LABEL`（:335）／`ORG_EMPTY_NOTICE`（:339）／`PROFILE_UNSET_LABEL`（:330）。
 *
 * ⚠ 部門／資位／職位之解析鍵一律為 **(companyCode, code) 複合鍵**（AC-P23d／AC-P23e／AC-P28）
 *   ——不同公司可有相同 `orgCode`／`code` 但不同單位/名稱（如 AE 之 `C01`＝高級協理 vs AS 之
 *   `C01`＝協理），僅以代碼比對會解析出他公司的名稱。本檔全部候選函式皆以 `companyCode` 為第一
 *   過濾條件。🔴 職位尤甚：跨公司同代碼語意可**相反**（`D04` 在 AS＝營業經理、在 AD＝科長）。
 * ⚠ 部門顯示字串**不在本檔產生**：一律由 `domain/org-path.ts` 之 `buildOrgPath` 負責（AC-P17，
 *   全站唯一之組織路徑算法）。呼叫端須先以 `unitsOf` 取該公司之 units 再傳入——`buildOrgPath`
 *   之簽章刻意不變（prototype :372-376 同一處置），複合鍵由呼叫端負責。
 */

import type {
  JobPositionRecord,
  JobTitleRecord,
  OrgUnitRecord,
} from '../api/types';

/**
 * AC-P19：`orgCode`／`jobTitleCode`／`jobPositionCode` 為 `null` 時，部門／資位／職位下拉
 * 所選之空選項文字。
 * 選項 value 為空字串，送出前經 `normalizeProfileCode` 收斂為 `null`（AC-P2）。
 */
export const PROFILE_UNSET_LABEL = '未設定';

/**
 * AC-P23b：清單「公司」篩選器之不限縮預設項，逐字為「所有公司」。
 * ⚠ **刻意不是「全部」**——同列既有三個篩選器為「所有來源／所有角色／所有狀態」，
 *   混一個「全部」屬無理由之不一致。規格初稿之「全部」已於 2026-08-14 裁定改為本字串。
 */
export const COMPANY_ALL_LABEL = '所有公司';

/**
 * AC-P26：所選公司無任何 `ORG_UNIT` 時，部門下拉旁之逐字空狀態說明。
 * 邏輯本身與公司代碼無關（任一公司之 `ORG_UNIT` 若為空即觸發）——B 階段（2026-08-24）開放
 * AD／AE／AJ 同步後，四家公司皆有真實組織資料，此狀態不再是常態，但仍保留為通用防禦：
 * 若上游某公司之部門主檔異常清空，畫面仍需優雅處理，**非錯誤，不得阻擋建立**
 * （`orgCode` 送出為 `null`，清單顯示「—」）。
 */
export const ORG_EMPTY_NOTICE =
  '此公司尚未同步組織主檔，暫無部門可選；可留空建立，清單顯示「—」。';

/** 某公司之組織單位子集（供 `buildOrgPath` 之呼叫端先行收斂，AC-P23d）。 */
export function unitsOf(
  units: readonly OrgUnitRecord[],
  companyCode: string | null | undefined,
): OrgUnitRecord[] {
  if (!companyCode) return [];
  return units.filter((u) => u.companyCode === companyCode);
}

/**
 * 部門下拉之候選（AC-P13／AC-P16）：該公司之 `ORG_UNIT` 中 `tier ≠ 'ROOT'` 之**全部**列，
 * 依 `orgCode` 昇冪。⚠ **不得**再限縮 tier——上游帳號之 `orgCode` 實測分布於
 * DIVISION／DEPARTMENT／SECTION／SUBSECTION 多層，限縮將使手動帳號無法與上游帳號同層對齊。
 */
export function orgOptionsFor(
  units: readonly OrgUnitRecord[],
  companyCode: string | null | undefined,
): OrgUnitRecord[] {
  return unitsOf(units, companyCode)
    .filter((u) => u.tier !== 'ROOT')
    .sort((a, b) => a.orgCode.localeCompare(b.orgCode));
}

/**
 * 資位下拉之候選（AC-P14／AC-P16）：該公司之 `JOB_TITLE`，依 `code` 昇冪。
 * ⚠ 以 `companyCode` **精確**過濾，不做顯示端之兩段式跨公司 fallback（與 AC-P7 之寫入驗證同一集合）。
 */
export function jobOptionsFor(
  titles: readonly JobTitleRecord[],
  companyCode: string | null | undefined,
): JobTitleRecord[] {
  if (!companyCode) return [];
  return titles
    .filter((j) => j.companyCode === companyCode)
    .sort((a, b) => a.code.localeCompare(b.code));
}

/**
 * 累積多次 `GET /job-titles?companyCode=` 之結果（各公司一次），以 (companyCode, code) 複合鍵去重。
 * 去重為必要：重複列會使同一職稱在下拉出現兩次。
 */
export function mergeJobTitles(
  prev: readonly JobTitleRecord[],
  next: readonly JobTitleRecord[],
): JobTitleRecord[] {
  const byKey = new Map(prev.map((j) => [`${j.companyCode}\0${j.code}`, j]));
  for (const j of next) byKey.set(`${j.companyCode}\0${j.code}`, j);
  return Array.from(byKey.values());
}

/**
 * 職位下拉之候選（AC-P29／AC-P31）：該公司之 `JOB_POSITION`，依 `code` 昇冪。
 * 🔴 以 `companyCode` **精確**過濾——此處不只是「與寫入驗證同一集合」（AC-P30），
 * 更因跨公司同代碼語意可相反，混入他公司候選會讓人選到語意完全不同的職位。
 */
export function jobPositionOptionsFor(
  positions: readonly JobPositionRecord[],
  companyCode: string | null | undefined,
): JobPositionRecord[] {
  if (!companyCode) return [];
  return positions
    .filter((p) => p.companyCode === companyCode)
    .sort((a, b) => a.code.localeCompare(b.code));
}

/** 累積多次 `GET /job-positions?companyCode=` 之結果，去重規則同 `mergeJobTitles`。 */
export function mergeJobPositions(
  prev: readonly JobPositionRecord[],
  next: readonly JobPositionRecord[],
): JobPositionRecord[] {
  const byKey = new Map(prev.map((p) => [`${p.companyCode}\0${p.code}`, p]));
  for (const p of next) byKey.set(`${p.companyCode}\0${p.code}`, p);
  return Array.from(byKey.values());
}

/**
 * AC-P2：`orgCode`／`jobTitleCode`／`jobPositionCode` 之送出正規化——trim 後為空字串者一律收斂為 `null`
 * （**空字串不得落地**，比照 F040 `normalizeSubcategory` 之慣例）。
 */
export function normalizeProfileCode(v: string | null | undefined): string | null {
  const s = (v ?? '').trim();
  return s === '' ? null : s;
}
