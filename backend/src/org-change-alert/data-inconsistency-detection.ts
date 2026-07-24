/**
 * F005「EMPSTS='A' 但 RESIGNDT 為過去日期」資料不一致告警偵測 —— 純邏輯，無 IO。
 *
 * 語意為**不變式檢查**（比照 closed-dept-detection）：對同步後之全量在職帳號掃描，
 * 找出「在職（status='active'）卻帶有過去 RESIGNDT」之上游資料矛盾。矛盾在上游真正被修正前恆為真，
 * 故每次同步全量掃描皆命中；服務層以 loginId 去重（僅擋既有 pending，resolved 之歷史列不擋 → 每日重新浮現）。
 *
 * ⚠ 本函式**不停用任何帳號**（EMPSTS='A' 權威優於 RESIGNDT，F005 AC）——僅產生告警供人工複核。
 * ⚠ 去重鍵＝帳號 loginId，**不以 EMPNO 連坐**（一人多帳號，F005 spec 明文）。
 */

import {
  AlertCreateCommand,
  DataInconsistencyDetectionInput,
} from './org-change-alert.types';

/** YYYY-MM-DD（UTC，決定性；resignDate 為日期非時間戳，UTC 切片不致跨日誤差）。 */
function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function detectDataInconsistencyAlerts(
  input: DataInconsistencyDetectionInput,
): AlertCreateCommand[] {
  const out: AlertCreateCommand[] = [];
  const emitted = new Set<string>();

  for (const acc of input.activeAccounts) {
    if (acc.status !== 'active') continue; // 縱深防禦：僅在職者適用（F005「帳號之 EMPSTS='A'」限定詞）
    const resign = acc.resignDate;
    if (resign === null) continue; // 哨兵 9999-12-31 已由 normalization 收斂為 null → 無矛盾
    // 嚴格早於本次同步時刻方視為「過去日期」（恰等於當下不視為過去，見 TS-INCON-004/005）。
    if (resign.getTime() >= input.createdAt.getTime()) continue;

    const loginId = acc.loginId;
    if (input.existingPendingLoginIds.has(loginId) || emitted.has(loginId)) continue;

    emitted.add(loginId);
    out.push({
      alertKind: 'DATA_INCONSISTENCY',
      documentId: null,
      documentNumber: null,
      documentName: null,
      affectedField: null,
      beforeValue: 'EMPSTS=A（在職）',
      afterValue: `RESIGNDT=${ymd(resign)}（過去日期，與在職狀態矛盾）`,
      personEmployeeNo: acc.employeeNo,
      personName: acc.name,
      accountLoginId: loginId,
      deptOrgCode: null,
      deptName: null,
      deptCloseDate: null,
      createdAt: input.createdAt,
      sourceSyncRunId: input.sourceSyncRunId,
    });
  }

  return out;
}
