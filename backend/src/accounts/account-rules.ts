import { ROLE_CODES } from '../rbac/function-matrix';

/** 帳號身分（主鍵 companyCode + loginId）。 */
export interface AccountIdentity {
  companyCode: string;
  loginId: string;
}

/** 角色字串是否為 5 種固定角色之一（大小寫敏感）。非法 → 呼叫端回 ROLE_INVALID(400)。 */
export function isValidRole(code: string): boolean {
  return (ROLE_CODES as readonly string[]).includes(code);
}

function sameAccount(a: AccountIdentity, b: AccountIdentity): boolean {
  return a.companyCode === b.companyCode && a.loginId === b.loginId;
}

/**
 * 是否為「系統管理員降級自身」而須阻擋（OQ-E01-05：避免系統無管理員可操作）。
 * 條件：目標＝操作者本人，且目前角色為 SysAdmin，且新角色非 SysAdmin。
 * （角色指派端點僅 SysAdmin 可呼叫，故操作者恆為 SysAdmin；此處以目標現行角色判定。）
 * true → 呼叫端回 ROLE_SELF_DOWNGRADE_BLOCKED。
 */
export function isSelfRoleLockout(
  actor: AccountIdentity,
  target: AccountIdentity,
  targetCurrentRole: string,
  newRole: string,
): boolean {
  return (
    sameAccount(actor, target) &&
    targetCurrentRole === 'SysAdmin' &&
    newRole !== 'SysAdmin'
  );
}
