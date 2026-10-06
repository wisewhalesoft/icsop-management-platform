/**
 * 異動分類（純邏輯，無 IO）——冪等核心。
 *
 * upstream-hr-source-contract.md §6（在職判定權威）／US-010 AC2（無異動不寫）／AC4（三類異動）。
 * ⚠ 離職停用一律以 `source.empActive=false` 觸發；v2.0 該旗標由 `RESIGN_DATE` 與基準日比較
 *   導出（契約 §6），v1.0 之 `EMPSTS≠'A'` 已停用。
 *   絕不以「來源消失」逕行判定為離職（US-010 AC4）——消失僅作為 disappeared 閾值之保護訊號，
 *   不在本分類函式內產生 disable。
 */

import { NormalizedOrgUnit, NormalizedAccount } from './normalization';
import { isEmploymentActive } from './employment-status';

export type OrgChangeKind = 'create' | 'update' | 'noop';
export type AccountChangeKind = 'create' | 'update' | 'disable' | 'noop';

/** 本地既有組織單位（用於 create/update/noop 比對；僅上游擁有欄位）。 */
export interface ExistingOrgUnit {
  orgCode: string;
  codePrefix: string;
  tier: string;
  parentCode: string | null;
  name: string;
  descFull: string | null;
  managerEmpNo: string | null;
  isActive: boolean;
}

/** 本地既有帳號（上游擁有欄位 + status；roleCode/passwordHash/source 為本地擁有，不參與比對）。 */
export interface ExistingAccount {
  companyCode: string;
  loginId: string;
  employeeNo: string | null;
  name: string | null;
  email: string | null;
  orgCode: string | null;
  status: 'active' | 'disabled';
  resignDate: Date | null;
  hireDate: Date | null;
  managerEmpNo: string | null;
  /**
   * 職稱（畫面「資位」）代碼。⚠ 選填（`?`）以相容既有測試替身之物件字面值；比對時以 `?? null`
   * 收斂，使 undefined 與 null 視為相等，不致讓省略此欄的替身誤觸 update。
   */
  jobTitleCode?: string | null;
  /** 職位代碼。選填之理由同 `jobTitleCode`。 */
  jobPositionCode?: string | null;
}

/** 本地既有職稱（資位）對照列（僅上游擁有欄位）。 */
export interface ExistingJobTitle {
  companyCode: string;
  code: string;
  name: string;
}

/** 本地既有職位對照列（僅上游擁有欄位）。 */
export interface ExistingJobPosition {
  companyCode: string;
  code: string;
  name: string;
}

function eqDate(a: Date | null, b: Date | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return a.getTime() === b.getTime();
}

export function classifyOrgUnit(
  source: NormalizedOrgUnit,
  local: ExistingOrgUnit | null,
): OrgChangeKind {
  if (local === null) return 'create';
  const changed =
    source.tier !== local.tier ||
    source.codePrefix !== local.codePrefix ||
    source.parentCode !== local.parentCode ||
    source.name !== local.name ||
    // descFull 納入比對：否則既有列（descFull=null）之回填永遠不觸發（誤判 noop，OQ-DESCFULL-1）。
    // (?? null) 使 undefined 與 null 視為相等，避免既有測試替身省略此欄時誤觸 update。
    (source.descFull ?? null) !== (local.descFull ?? null) ||
    source.managerEmpNo !== local.managerEmpNo ||
    source.isActive !== local.isActive;
  return changed ? 'update' : 'noop';
}

export function classifyAccount(
  source: NormalizedAccount,
  local: ExistingAccount | null,
): AccountChangeKind {
  if (source.empActive) {
    if (local === null) return 'create';
    // 誤判恢復：本地停用但上游回報在職 → 需更新為 active。
    if (local.status === 'disabled') return 'update';
    const changed =
      source.employeeNo !== local.employeeNo ||
      source.name !== local.name ||
      source.email !== local.email ||
      source.orgCode !== local.orgCode ||
      source.managerEmpNo !== local.managerEmpNo ||
      // jobTitleCode 納入比對：否則加欄後既有列（NULL）之回填永遠不觸發（誤判 noop），
      // 與 descFull 於 classifyOrgUnit 之處置同理。
      (source.jobTitleCode ?? null) !== (local.jobTitleCode ?? null) ||
      // jobPositionCode 同理（2026-08-31 加欄）。漏列＝全部既有列判 noop，
      // 連 SYNC_FULL_RESYNC=1 之全量重同步都回填不了。
      (source.jobPositionCode ?? null) !== (local.jobPositionCode ?? null) ||
      !eqDate(source.resignDate, local.resignDate) ||
      !eqDate(source.hireDate, local.hireDate);
    return changed ? 'update' : 'noop';
  }

  // 非在職（v2.0：RESIGN_DATE 早於基準日）
  if (local === null) return 'noop'; // 不建立離職帳號
  if (local.status === 'active') return 'disable';
  return 'noop'; // 已停用，不重複停用
}

/**
 * 🔴 F004 `AC-RS2`：本地已知離職日、卻仍在職之帳號（補停用掃描之對象）。
 *
 * **為何需要**：`classifyAccount` 只看得到**本次被增量取回**之帳號（上游 `MTDT` 前進者）。
 * 人資預先輸入未來離職日時，取回當下確實在職、只寫入 `resignDate`；日期過後上游 `MTDT`
 * 不再變動 ⇒ 該帳號永不再被取回 ⇒ 永不停用。本函式改以**本地已落地之 `resignDate`** 補判。
 *
 * - `fetchedLoginIds`＝本次自上游取回之全部穩定鍵（含髒資料略過者）——取回者一律以上游分類
 *   為準（`AC-RS2` ①：上游若已改回在職，不得依本地舊值停用；亦避免同帳號兩筆停用）。
 * - 判定與 `classifyAccount` 同一函式、同一基準時刻（`isEmploymentActive`，台北日曆日）。
 * - 不以「來源消失」判定離職之原則不變：本函式只依**上游曾明確給過的離職日**，不依缺席。
 * - 呼叫端傳入之 `existing` 須僅含 `source='upstream'` 帳號（`findExistingAccounts` 已保證；`AC-RS2` ③）。
 */
export function findLapsedResignations(
  existing: Iterable<ExistingAccount>,
  fetchedLoginIds: ReadonlySet<string>,
  basis: Date,
): ExistingAccount[] {
  const out: ExistingAccount[] = [];
  for (const a of existing) {
    if (a.status !== 'active') continue;
    if (a.resignDate === null) continue;
    if (fetchedLoginIds.has(a.loginId)) continue;
    if (isEmploymentActive(a.resignDate, basis)) continue;
    out.push(a);
  }
  return out;
}

/**
 * 職稱對照列分類。對照主檔無「停用」語意（上游移除某代碼時，既有帳號仍可能引用它），
 * 故僅 create/update/noop —— 刻意不刪除本地已無對應之列，避免歷史帳號之職位顯示驟失。
 */
export function classifyJobTitle(
  source: { companyCode: string; code: string; name: string },
  local: ExistingJobTitle | null,
): OrgChangeKind {
  if (local === null) return 'create';
  return source.name !== local.name ? 'update' : 'noop';
}

/** 職位對照列分類。語意與處置與 `classifyJobTitle` 完全相同（含刻意不刪除）。 */
export function classifyJobPosition(
  source: { companyCode: string; code: string; name: string },
  local: ExistingJobPosition | null,
): OrgChangeKind {
  if (local === null) return 'create';
  return source.name !== local.name ? 'update' : 'noop';
}
