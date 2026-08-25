/**
 * 角色降級待審告警偵測 —— 純邏輯，無 IO
 * （🔴 2026-08-25 角色自動化 delta，裁定 `Q1.3`）。
 *
 * **為何降級不自動執行**：主管交接期間，上游 `ORG_UNIT.managerEmpNo` 可能暫時空白或仍指向前任。
 * 升級誤判之代價是「多看到唯讀資料」；降級誤判之代價是「該看的看不到、工作停擺」。
 * 兩者不對稱，故只自動升、降級一律轉為告警待人工確認。
 *
 * ⚠ **本函式不寫入任何帳號欄位**——它只產生告警列。角色維持原值，
 *   直到管理員於 F003 手動指派（該操作會把 `roleSource` 翻為 `'manual'`，
 *   使該帳號自此脫離推導範圍、不再每日重複浮現）。
 *
 * ⚠ **未處理前每日重新浮現屬刻意行為**（與 `ACCOUNT_DISAPPEARED` 同理）：
 *   推導每次都會重算出同一筆降級，去重集合使其不重複插入，但 pending 列會一直在。
 *   這正是「待審」該有的行為——它不會自己消失。
 */

import { AlertCreateCommand } from './org-change-alert.types';
import type { ExistingAccount } from '../org-sync/change-classification';
import type { RoleChange } from '../org-sync/role-derivation';

/** 角色代碼 → 顯示名稱（僅供告警文案；權威為 `ROLE` 表）。 */
const ROLE_LABEL: Readonly<Record<string, string>> = {
  SysAdmin: '系統管理員',
  ICSOPAdmin: 'ICSOP 管理員',
  Supervisor: '主管',
  DeptContact: '部門窗口',
  User: '一般使用者',
};

function roleLabel(code: string): string {
  return ROLE_LABEL[code] ?? code;
}

export interface RoleDowngradeDetectionInput {
  /** 本次推導判定為降級之變更（**尚未套用**，來自 `RoleDerivationPlan.roleDowngradeAlerts`）。 */
  roleDowngrades: readonly RoleChange[];
  /** 同步前帳號快照（key=loginId），供員編/姓名/部門快照。 */
  existingAcc: Map<string, ExistingAccount>;
  /** 既有 pending 之 `ROLE_DOWNGRADE_PENDING` loginId 集合（去重，不以 EMPNO 連坐）。 */
  existingPendingLoginIds: Set<string>;
  createdAt: Date;
  sourceSyncRunId: string | null;
}

export function detectRoleDowngradeAlerts(
  input: RoleDowngradeDetectionInput,
): AlertCreateCommand[] {
  const out: AlertCreateCommand[] = [];
  const emitted = new Set<string>();

  for (const change of input.roleDowngrades) {
    const loginId = change.loginId;
    if (input.existingPendingLoginIds.has(loginId) || emitted.has(loginId)) continue;
    emitted.add(loginId);

    // 快照（防禦性：查無則以最低限度資訊產生，不臆測）。
    const acc = input.existingAcc.get(loginId);

    out.push({
      alertKind: 'ROLE_DOWNGRADE_PENDING',
      documentId: null,
      documentNumber: null,
      documentName: null,
      affectedField: '角色',
      beforeValue: roleLabel(change.from),
      // ⚠ 措辭明示「建議」而非「已改為」——本告警產生時角色**尚未變動**，
      //   若寫成既成事實，處理者會誤以為權限已經被拿掉而不採取行動。
      afterValue: `建議調整為 ${roleLabel(change.to)}（已不在部門主管名單中；尚未變更）`,
      personEmployeeNo: acc?.employeeNo ?? null,
      personName: acc?.name ?? null,
      accountLoginId: loginId,
      deptOrgCode: acc?.orgCode ?? null,
      deptName: null,
      deptCloseDate: null,
      createdAt: input.createdAt,
      sourceSyncRunId: input.sourceSyncRunId,
    });
  }

  return out;
}
