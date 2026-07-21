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
      !eqDate(source.resignDate, local.resignDate) ||
      !eqDate(source.hireDate, local.hireDate);
    return changed ? 'update' : 'noop';
  }

  // EMPSTS ≠ 'A'（離職/非在職）
  if (local === null) return 'noop'; // 不建立離職帳號
  if (local.status === 'active') return 'disable';
  return 'noop'; // 已停用，不重複停用
}
