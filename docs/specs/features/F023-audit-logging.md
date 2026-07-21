# F023: 稽核軌跡記錄
Priority: P0-MVP | Status: Draft | Last Updated: 2026-07-15
Epic/Story: E07 / US-060

## Description
使用者查看、下載、列印 ICSOP 文件（及下載使用表單）時，各自產生一筆 append-only 稽核紀錄，內容與該次浮水印一致。稽核不可竄改/刪除；記錄失敗不阻斷使用者瀏覽，改進補償佇列重試補寫。

## Preconditions
- 使用者身分已識別（F001）；操作由 F020（文件）或 F018（使用表單下載）觸發。

## Main Flow
1. 使用者觸發 VIEW/DOWNLOAD/PRINT（或使用表單 DOWNLOAD）。
2. 以同一次請求之身分/部門/處室/時間快照組裝稽核內容（與浮水印同來源）。
3. 寫入 `AUDIT_LOG`（append-only），含操作人員、員工編號、部門、處/室、文件 ID/編號、操作類型、時間戳記、浮水印快照。

## Alternative Flows
- 使用表單下載：targetType=USAGE_FORM，記 formId。

## Edge Cases
- 稽核寫入服務暫時不可用：使用者仍正常看文件；失敗進補償佇列，服務恢復後重試補寫。
- 短時間重複開啟同文件：草案各自獨立記錄（是否節流/去重見 OQ-E07-01）。

## Postconditions
- 每次調閱皆有獨立且不可竄改之稽核紀錄，供 F024 查詢。

## Acceptance Criteria
- Given 使用者查看一份文件, When 檢視器載入, Then 產生 1 筆 VIEW 紀錄，欄位正確。
- Given 使用者下載並列印同文件, When 各操作完成, Then 分別產生 DOWNLOAD 與 PRINT 兩筆獨立紀錄。
- Given 觸發下載/列印, When 產生浮水印, Then 稽核之人員/部門/處室/時間與該次浮水印完全一致。
- Given 稽核寫入暫時異常, When 使用者查看文件, Then 仍正常看到內容，且服務恢復後成功補寫該筆。
- Given 任一角色經介面/API 修改或刪除稽核, When 送出, Then 拒絕（`AUDIT_IMMUTABLE`，403/405）。

## Error Scenarios
- 補償重試/不可竄改：見 [error-handling.md#audit](../error-handling.md#audit)。保留年限見 [NFR-003](../nfr.md#audit-retention)。

## Related
- Diagram: [../diagrams/F020-watermark-audit.mmd](../diagrams/F020-watermark-audit.mmd)
- Data: [AUDIT_LOG](../data-model.md#auditlog-entity)
- Depends on: [F020](F020-watermark.md), [F001](F001-auth-login-session.md); Blocks: [F024](F024-access-history-query.md)
- NFR: [稽核與資料保留](../nfr.md#audit-retention), [浮水印一致性](../nfr.md#watermark)
- OQ: OQ-E07-01（重複調閱節流?）, OQ-NFR003（狀態切換是否納稽核）
