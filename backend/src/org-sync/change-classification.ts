/**
 * 異動分類（純邏輯，無 IO）——冪等核心。
 *
 * upstream-hr-source-contract.md §6（EMPSTS 權威）／US-010 AC2（無異動不寫）／AC4（三類異動）。
 * ⚠ 離職停用一律以 EMPSTS≠'A'（source.empActive=false）觸發；
 *   絕不以「來源消失」逕行判定為離職（US-010 AC4）——消失僅作為 disappeared 閾值之保護訊號，
 *   不在本分類函式內產生 disable。
 */

import { NormalizedOrgUnit, NormalizedAccount } from './normalization';

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
   * 職稱代碼。⚠ 選填（`?`）以相容既有測試替身之物件字面值；比對時以 `?? null` 收斂，
   * 使 undefined 與 null 視為相等，不致讓省略此欄的替身誤觸 update。
   */
  jobTitleCode?: string | null;
}

/** 本地既有職稱對照列（僅上游擁有欄位）。 */
export interface ExistingJobTitle {
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
      !eqDate(source.resignDate, local.resignDate) ||
      !eqDate(source.hireDate, local.hireDate);
    return changed ? 'update' : 'noop';
  }

  // EMPSTS ≠ 'A'（離職/非在職）
  if (local === null) return 'noop'; // 不建立離職帳號
  if (local.status === 'active') return 'disable';
  return 'noop'; // 已停用，不重複停用
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
