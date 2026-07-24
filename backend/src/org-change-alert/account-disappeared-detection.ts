/**
 * F005 逐帳號「消失」告警偵測 —— 純邏輯，無 IO。
 *
 * 差異事件：消費 computeDisappeared().missingIds（本次「本地在職、來源查無」之 loginId），
 * 為每個消失帳號產生 ACCOUNT_DISAPPEARED 告警，並帶入消失前之員編/姓名/最後已知部門快照。
 *
 * ⚠ 消失 ≠ 離職（US-010 AC4）：本函式**不停用任何帳號**——帳號 status 維持不變，僅產生告警供人工複核。
 *   因帳號未被停用，`computeDisappeared()` 每次同步皆會重新計入 → 未修正前每日重新浮現（刻意行為，D4）。
 * ⚠ 去重鍵＝帳號 loginId（不以 EMPNO 連坐）；deptCloseDate 對此類恆為 null（語意為「帳號消失」非「部門關閉」）。
 */

import {
  AccountDisappearedDetectionInput,
  AlertCreateCommand,
} from './org-change-alert.types';

export function detectAccountDisappearedAlerts(
  input: AccountDisappearedDetectionInput,
): AlertCreateCommand[] {
  const out: AlertCreateCommand[] = [];
  const emitted = new Set<string>();

  for (const loginId of input.disappearedLoginIds) {
    if (input.existingPendingLoginIds.has(loginId) || emitted.has(loginId)) continue;
    emitted.add(loginId);

    // 消失前快照（防禦性：missingIds 衍生自同一 existingAcc，理論上必有；查無則以最低限度資訊產生）。
    const acc = input.existingAcc.get(loginId);
    const orgCode = acc?.orgCode ?? null;
    // 部門名稱僅在本地查得到對應單位時填入；查無（孤兒）則退回 null，不臆測。
    const deptName = orgCode !== null ? (input.orgUnits.get(orgCode)?.name ?? null) : null;

    out.push({
      alertKind: 'ACCOUNT_DISAPPEARED',
      documentId: null,
      documentNumber: null,
      documentName: null,
      affectedField: null,
      beforeValue: '上次同步：在職',
      afterValue: '本次同步來源查無此帳號（消失）',
      personEmployeeNo: acc?.employeeNo ?? null,
      personName: acc?.name ?? null,
      accountLoginId: loginId,
      deptOrgCode: orgCode,
      deptName,
      deptCloseDate: null, // 語意不適用（非部門關閉事件）
      createdAt: input.createdAt,
      sourceSyncRunId: input.sourceSyncRunId,
    });
  }

  return out;
}
