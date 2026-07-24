/**
 * F006 §7.3「在職者掛於已關閉部門」提示偵測 —— 純邏輯，無 IO。
 *
 * 語意為**不變式檢查**而非差異事件：部門於某次同步關閉後，即使該人員本身未再變動，
 * 只要提示尚未被處理就應持續可見。故每次同步完成後對「同步後之全量在職帳號」掃描，
 * 並以員編去重（AC10：連續兩次同步不重複產生）。
 *
 * ⚠ 本函式**不停用任何帳號、不改派部門**（AC9）——僅產生提示指令，交由管理員人工處理。
 */

import { AlertCreateCommand, ClosedDeptDetectionInput } from './org-change-alert.types';

export function detectClosedDeptAlerts(
  input: ClosedDeptDetectionInput,
): AlertCreateCommand[] {
  const out: AlertCreateCommand[] = [];
  const emitted = new Set<string>();

  for (const acc of input.activeAccounts) {
    if (acc.status !== 'active') continue; // 已離職者由 F005 既有路徑處理（AC8 限「在職者」）
    const emp = acc.employeeNo;
    if (!emp || !acc.orgCode) continue;
    if (input.existingPendingEmployeeNos.has(emp) || emitted.has(emp)) continue;

    const org = input.orgUnits.get(acc.orgCode);
    if (!org) continue; // 孤兒帳號（部門查無）：無關閉資訊可斷言，不臆測
    if (org.isActive) continue; // 哨兵 9999-12-31 → isActive=true，非「已關閉」

    emitted.add(emp);
    out.push({
      alertKind: 'CLOSED_DEPT_PERSON',
      documentId: null,
      documentNumber: null,
      documentName: null,
      affectedField: null,
      beforeValue: null,
      afterValue: null,
      personEmployeeNo: emp,
      personName: acc.name,
      deptOrgCode: org.orgCode,
      deptName: org.name,
      deptCloseDate: org.closeDate,
      createdAt: input.createdAt,
      sourceSyncRunId: input.sourceSyncRunId,
    });
  }

  return out;
}
