/**
 * F005「在職中但離職日已過」資料不一致告警偵測 —— 純邏輯，無 IO。
 *
 * v2.0（契約 §6）：在職判定改由 `RESIGN_DATE` 導出，本偵測之語意隨之收斂為
 * 「上游已離職、本地 status 尚未同步到」之落差窗，不再是 v1.0 之「兩個獨立欄位互相矛盾」。
 *
 * 語意為**不變式檢查**（比照 closed-dept-detection）：對同步後之全量在職帳號掃描，
 * 找出「在職（status='active'）卻帶有過去離職日」之落差。落差在下次成功同步前恆為真，
 * 故每次同步全量掃描皆命中；服務層以 loginId 去重（僅擋既有 pending，resolved 之歷史列不擋 → 每日重新浮現）。
 *
 * ⚠ 本函式**不停用任何帳號**（F005 AC）——僅產生告警供人工複核；停用一律走同步之 classify 路徑。
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
    if (acc.status !== 'active') continue; // 縱深防禦：僅在職者適用（F005 之限定詞）
    const resign = acc.resignDate;
    if (resign === null) continue; // 哨兵 9999-12-31 已由 normalization 收斂為 null → 無矛盾
    // 🔴 v2.0：比較**以日為單位**，不可比時間戳。
    //
    // 契約 §6 起 status 由 `RESIGN_DATE >= 基準日` 導出，而 RESIGN_DATE 為日期（00:00:00）、
    // 同步執行於當日稍晚。若沿用 v1.0 之 `resign.getTime() >= createdAt.getTime()`，則
    // **每一位「最後在職日為今天」的在職者都會被誤報**為資料不一致（其 resign=今日 00:00
    // 恆小於同步時刻）——每天有人離職就每天誤報，且看起來完全像真的告警。
    //
    // 以日比較後語意回正：僅「離職日已過、但本地 status 仍為 active」（即上游已離職而尚未
    // 同步到的落差窗）才告警，與 v1.0 之意圖一致。
    if (ymd(resign) >= ymd(input.createdAt)) continue;

    const loginId = acc.loginId;
    if (input.existingPendingLoginIds.has(loginId) || emitted.has(loginId)) continue;

    emitted.add(loginId);
    out.push({
      alertKind: 'DATA_INCONSISTENCY',
      documentId: null,
      documentNumber: null,
      documentName: null,
      affectedField: null,
      beforeValue: '帳號狀態＝在職',
      afterValue: `離職日＝${ymd(resign)}（已過期，與在職狀態不符）`,
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
