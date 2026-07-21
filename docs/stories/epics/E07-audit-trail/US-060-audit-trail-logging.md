# US-060: 查看/下載/列印稽核軌跡記錄

> **Story ID**: US-060
> **Epic**: [E07 稽核與文件調閱歷程](epic-brief.md)
> **Priority**: P0
> **Phase**: 1
> **Estimated Points**: 8

## User Story

As a 公司管理層/稽核人員，
I want 系統在使用者查看、下載、列印 ICSOP 文件時自動記錄稽核軌跡，
So that 公司能於事後追溯任何一份文件曾被誰、於何時、以何種方式調閱過，滿足內控與稽核合規要求。

## Acceptance Criteria

**AC1: 三種操作類型皆各自記錄**
- Given 使用者已登入並開啟某份 ICSOP 文件
- When 使用者於前台檢視器開啟文件（查看）、點擊下載、或觸發列印
- Then 系統各自產生一筆對應操作類型（VIEW / DOWNLOAD / PRINT）的稽核紀錄，內容包含操作人員、員工編號、部門、處/室、文件 ID、文件編號、操作時間戳記

**AC2: 記錄與浮水印內容一致**
- Given 使用者觸發下載或列印
- When 系統產生浮水印內容（見 [E06 US-053](../E06-public-browsing/US-053-viewer-watermark-overlay.md) / [US-054](../E06-public-browsing/US-054-download-print-watermark-burn.md)）
- Then 稽核紀錄中的人員/部門/處室/時間資訊須與該次浮水印內容完全一致，避免兩者資料來源不同步

**AC3: 記錄失敗不阻斷正常瀏覽**
- Given 稽核紀錄寫入服務發生暫時性異常（如資料庫連線中斷）
- When 使用者查看文件
- Then 使用者仍可正常看到文件內容，不因稽核紀錄寫入失敗而被阻擋，但系統需將此次失敗記錄進補償佇列，待服務恢復後重試補寫

**AC4: 稽核紀錄不可被竄改或刪除**
- Given 稽核紀錄已寫入
- When 任何非系統內部流程的角色（含系統管理員、ICSOP 管理員）嘗試透過一般後台介面修改或刪除某筆稽核紀錄
- Then 系統拒絕該操作，稽核紀錄僅可寫入不可修改/刪除（Append-only）

## Technical Notes

- 建議稽核紀錄資料表設計為 Append-only，資料庫層級可考慮限制 UPDATE/DELETE 權限
- 記錄動作建議與浮水印產生邏輯共用同一次請求的使用者身分/部門快照，避免非同步造成資料不一致
- 失敗補償機制可採訊息佇列（如 outbox pattern）確保最終一致性，需於系統架構設計階段具體化

## Test Cases

| ID | 情境 | 類型 |
|---|---|---|
| TC-060-01 | 使用者查看一份文件，稽核紀錄正確產生 1 筆 VIEW 紀錄，欄位資料正確 | Happy Path |
| TC-060-02 | 使用者下載並列印同一份文件，分別產生 DOWNLOAD 與 PRINT 兩筆獨立紀錄 | Happy Path |
| TC-060-03 | 模擬稽核紀錄寫入服務暫時不可用，使用者仍可正常查看文件內容，且系統於服務恢復後成功補寫該筆紀錄 | Error Case |
| TC-060-04 | 嘗試透過 API 直接呼叫刪除或修改稽核紀錄的請求，應回傳 403 或 405 | Error Case |
| TC-060-05 | 同一使用者於極短時間內連續開啟同一份文件 5 次（如重複整理頁面），系統應各自產生獨立紀錄而非合併或去重（除非產品另有節流規則，此規則需標記為 Open Question） | Edge Case |

## Dependencies

**Blocked By**
- [E06 US-053 網頁檢視器浮水印疊加](../E06-public-browsing/US-053-viewer-watermark-overlay.md)
- [E06 US-054 下載/列印 PDF 浮水印燒錄](../E06-public-browsing/US-054-download-print-watermark-burn.md)
- [E01 帳號與驗證](../E01-account-auth/epic-brief.md) — 需已識別使用者身分

**Blocks**
- [US-061 文件調閱歷程查詢後台](US-061-access-history-query-backend.md)
- [E02 US-012 離職者自動停用帳號](../E02-org-sync/US-012-auto-disable-departed-accounts.md) — 依賴本 Story 保留之歷史稽核資料完整性

## Definition of Done

- [ ] Acceptance criteria met
- [ ] Unit tests passing（覆蓋率 >80%，含失敗補償情境）
- [ ] Code review approved
- [ ] Documentation updated

## Related

- Epic: [E07 稽核與文件調閱歷程](epic-brief.md)
- Story: [E06 US-053](../E06-public-browsing/US-053-viewer-watermark-overlay.md) / [US-054](../E06-public-browsing/US-054-download-print-watermark-burn.md)
- NFR: [NFR-003 稽核與資料保留](../../non-functional/NFR-003-audit-retention.md)
- NFR: [NFR-007 浮水印防竄改與一致性](../../non-functional/NFR-007-watermark-integrity.md)

## Open Questions

- [ ] 同一使用者短時間內重複查看同一文件是否需要節流/去重，或每次皆須獨立記錄？（見 TC-060-05）
