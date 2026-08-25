import { ROLE_CODES } from '../rbac/function-matrix';

/** 帳號身分（主鍵 companyCode + loginId）。 */
export interface AccountIdentity {
  companyCode: string;
  loginId: string;
  /**
   * 🔴 2026-08-25 角色自動化 delta：操作者身分快照，供角色變更稽核（裁定 `Q4.5`）。
   * **全部選填**——`sameAccount()` 之比對僅用 `companyCode`／`loginId`，既有呼叫端與測試替身不受影響。
   * 缺漏一律落 null（`accountId` 例外：稽核之操作者鍵，缺漏時 adapter 落空字串，比照既有慣例）。
   */
  accountId?: string | null;
  name?: string | null;
  employeeNo?: string | null;
  orgCode?: string | null;
  roleCode?: string | null;
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

/**
 * 管理者角色——**不得由 `RESTRICTED_CRUD` 之操作者指派**（🔴 2026-08-25 角色自動化 delta，`OQ-RA-03`）。
 *
 * 🔴 提權防線：若 ICSOPAdmin 能指派 `ICSOPAdmin`／`SysAdmin`，他就能把自己或任何人升為
 * 最高權限，`SysAdmin` 與 `ICSOPAdmin` 之兩層區隔即形同虛設——本 delta 開放角色指派權
 * 的目的是分攤 184 個部門窗口之維護，不是抹平管理層級。
 */
const ADMIN_ROLE_CODES = ['SysAdmin', 'ICSOPAdmin'] as const;

/**
 * 操作者是否有權將目標帳號指派為 `targetRole`（F025 `角色指派` 列之「受限」語意落地）。
 *
 * - `SysAdmin`：可指派全部 5 種角色（不受限）。
 * - `ICSOPAdmin`（矩陣值 `RESTRICTED_CRUD`）：可指派 `Supervisor`／`DeptContact`／`User`，
 *   **不得**指派 `SysAdmin`／`ICSOPAdmin`。
 * - 其餘角色：矩陣值為 `NONE`，根本進不到端點（guard 先擋），故此處一律 false 為保守預設。
 *
 * ⚠ 純函式、無 IO——本規則是安全性判定，必須可被單測釘死，且不得與 `canPerform` 混為一談：
 * `canPerform` 只知道「能不能進這個端點」，本函式才知道「能指派成什麼」。
 */
export function canAssignRole(
  actorRoleCode: string | null | undefined,
  targetRole: string,
): boolean {
  if (actorRoleCode === 'SysAdmin') return true;
  if (actorRoleCode === 'ICSOPAdmin') {
    return !(ADMIN_ROLE_CODES as readonly string[]).includes(targetRole);
  }
  return false;
}
