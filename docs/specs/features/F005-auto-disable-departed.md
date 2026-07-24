# F005: 離職者自動停用帳號
Priority: P0-MVP | Status: Implemented（告警縫隙補齊：DATA_INCONSISTENCY／ACCOUNT_DISAPPEARED；unit＋int 就緒、migration 落 SOP） | Last Updated: 2026-07-24
Epic/Story: E02 / US-012

## Description
當同步資料顯示人員**離職狀態**時，自動停用其帳號（軟停用，非刪除），既有 session 立即失效，並完整保留歷史稽核紀錄。**「人員自來源 view 消失」不等於離職**，不得據以停用（見下方判定規則）。

## 在職／離職判定規則（契約 §6，權威）

**權威判定：`VW_HPMUSER.EMPSTS = 'A'`**，優於 `RESIGNDT`。

| `EMPSTS` | 語意 | 本系統處理 |
|---|---|---|
| `A` | 在職 | 帳號維持啟用 |
| `B` | 已離職 | 自動停用（`disableReason=departed`） |
| `C` | 非在職（語意待上游確認） | 自動停用並標記待確認；語意釐清前不得視為在職 |

- `RESIGNDT` 之「未離職」哨兵為 **`9999-12-31`（非 NULL）**，僅作輔助顯示，不作為停用判定依據。
- 🔴 **人員自 `VW_HPMUSER` 消失 ≠ 離職**：上游 `VW_PERSONNEL_SQL` 之 `INNER JOIN` 會在 `DEPTID` 於部門主檔查無時靜默吞掉整筆（契約 §3.2）。本 feature 僅依 `EMPSTS` 狀態值停用，**不因「來源查無此人」而停用**；大規模消失之防護見 [F004 消失筆數閾值保護](F004-org-sync.md#edge-cases)。

## Preconditions
- F004 同步已完成、且未觸發消失筆數閾值保護（若觸發則本 feature 不執行任何停用）。
- F004 同步已依 `EMPSTS` 判定該人員為離職/停用類型異動。

## Main Flow
1. 同步（排程或手動）依 `EMPSTS` 完成離職判定。
2. 將對應帳號 `status=disabled`、`disableReason=departed`、記錄 `disabledAt` 與觸發來源（自動同步）。
3. 主動撤銷該帳號既有 session/JWT（黑名單或 session store），使其下一次操作即被拒。
4. 帳號仍保留於清單，狀態標示「停用（離職）」。

## Alternative Flows
- 誤判離職後隔日恢復在職：可重新啟用；自動恢復或需人工確認見 OQ-E02-04。

## Edge Cases
- 離職者以停用帳號經 Azure AD OIDC 登入：即使 AD 認證與 id_token 驗證皆通過，仍因本地帳號狀態檢查被拒（`AUTH_ACCOUNT_DISABLED`）；且帳號比對本身即強制 `EMPSTS='A'`，離職帳號不會被命中（見 [F001](F001-auth-login-session.md)）。
- **`EMPSTS='A'` 但 `RESIGNDT` 為過去日期之不一致資料**（實測 1 筆，離職日 2024-12-31）：以 `EMPSTS='A'` 為準**維持在職不停用**，同步須**容忍此不一致並記錄告警**（供人工向上游查核），**不得因此中止同步**。
- 人員自來源 view 消失（`EMPSTS` 無法取得）：**不停用**、記錄警告；比例超過 F004 閾值時由 F004 中止整次同步。
- 一人多帳號（實測 AS 在職 1,114 人對應 1,108 個相異員編）：停用以 `(COMPID, USERID)` 為單位逐帳號判定，不以 `EMPNO` 連坐。

## Postconditions
- 離職帳號無法經任一驗證方式登入；歷史稽核紀錄（F023）完整可查，筆數與停用前一致。

## Acceptance Criteria
- Given 帳號對應人員之 `EMPSTS` 由 `A` 變為 `B`, When 同步完成判定, Then 帳號設為停用，兩種登入皆無法使用。
- Given 帳號之 `EMPSTS='A'` 且 `RESIGNDT='9999-12-31'`, When 同步, Then 帳號維持啟用。
- Given 帳號之 `EMPSTS='A'` 但 `RESIGNDT` 為過去日期, When 同步, Then 帳號維持啟用、產生資料不一致告警，且同步流程正常完成不中止。
- Given 帳號未出現於本次來源查詢結果（消失）而非 `EMPSTS` 轉為離職, When 同步, Then **不停用該帳號**並記錄警告。
- Given F004 觸發消失筆數閾值保護, When 同步中止, Then 本次不執行任何帳號停用。
- Given 停用當下仍有有效 session, When 帳號被停用, Then 下一次操作被拒並強制登出，不可用至逾時。
- Given 帳號因離職停用, When 查詢其過往調閱歷程, Then 歷史稽核完整可查，帳號為停用非刪除。
- Given 帳號自動停用, When 後台查看清單, Then 顯示「停用（離職）」並記錄停用時間與觸發來源。

## Error Scenarios
- 停用帳號登入嘗試：見 [error-handling.md#auth](../error-handling.md#auth)（`AUTH_ACCOUNT_DISABLED`）。
- 誤判恢復：見 [error-handling.md 不可恢復情境](../error-handling.md)。

## Related
- **來源契約: [upstream-hr-source-contract.md](../upstream-hr-source-contract.md)**（§3.2 `INNER JOIN` 靜默吞人、§4 哨兵日期 `9999-12-31`、§6 在職／離職判定 `EMPSTS`、§7.3 消失筆數閾值保護）
- Data: [ACCOUNT](../data-model.md#account-entity), [PERSON](../data-model.md#person-entity), [AUDIT_LOG](../data-model.md#auditlog-entity)
- Depends on: [F004](F004-org-sync.md)（含消失筆數閾值保護）; 連動 [F001 session 撤銷](F001-auth-login-session.md)
- NFR: [NFR-002](../nfr.md#security), [NFR-003](../nfr.md#audit-retention)
- OQ: OQ-E02-04；`EMPSTS='C'`（實測 25 筆）之正式語意待上游確認（契約 §11-4）
