# US-061: 文件調閱歷程查詢後台

> **Story ID**: US-061
> **Epic**: [E07 稽核與文件調閱歷程](epic-brief.md)
> **Priority**: P0
> **Phase**: 1
> **Estimated Points**: 5

## User Story

As a 系統管理員 / ICSOP 管理員，
I want 在後台依人員、文件、時間區間查詢文件調閱歷程，
So that 我能在稽核需求發生時（如內部稽核、異常調閱調查）快速找出特定文件或特定人員的調閱紀錄。

## Acceptance Criteria

**AC1: 多條件查詢（2026-07-17 OQ-E07-03 定案：納入循環／變更調閱稽核）**
- Given 使用者已登入後台「文件調閱歷程」頁面且具備查詢權限
- When 使用者輸入人員（姓名/員工編號）、文件（文件編號/名稱）、時間區間任意組合條件並送出查詢
- Then 系統回傳符合條件的稽核紀錄清單（可分頁），內容涵蓋三種來源之調閱稽核：**文件**（既有 VIEW/DOWNLOAD/PRINT，對象為 ICSOP 文件）、**循環**（[E03 US-025](../E03-lifecycle-dag/US-025-lifecycle-tree-preview.md) 之 `LIFECYCLE_VIEW`／`LIFECYCLE_DOWNLOAD`／`LIFECYCLE_PRINT`，對象為循環樹狀圖預覽）、**變更**（[US-062](US-062-document-change-history.md)／[US-063](US-063-lifecycle-tree-change-history.md) 之 `CHANGE_LOG_VIEW`／`LIFECYCLE_CHANGELOG_VIEW`／`LIFECYCLE_CHANGELOG_DOWNLOAD`，對象為變更歷程之檢視/下載事件）；每筆顯示操作人員、員工編號、公司、部門、室別、角色、對象識別（文件編號或循環名稱，依類型而定）、操作類型、操作時間

**AC2: 角色存取限縮**
- Given 登入角色為「主管」「部門窗口」或「一般使用者」
- When 該角色呼叫文件調閱歷程查詢 API
- Then 系統回傳 403（此三種角色無「文件調閱歷程查詢」權限）；僅系統管理員與 ICSOP 管理員可查詢全公司範圍（依 [E08 US-070 角色×功能權限矩陣](../E08-permission-matrix/US-070-role-function-matrix.md)）——此權限範圍涵蓋文件/循環/變更三種類型之查詢，非僅文件類型

**AC3: 匯出/檢視明細**
- Given 查詢結果已顯示
- When 使用者點擊單筆紀錄
- Then 可展開查看該筆紀錄完整明細（含當次浮水印內容快照，若該類型有浮水印快照），供稽核佐證使用；循環/變更類型之明細展開內容依其自身快照結構呈現（非文件浮水印格式）

**AC4: 「類型」篩選（2026-07-17 OQ-E07-03 定案新增）**
- Given 查詢介面新增「類型」篩選（選項：文件／循環／變更，可複選，預設全選）
- When 我選擇其中一種或多種類型並送出查詢
- Then 系統僅回傳對應類型之稽核紀錄
- Given 我未特別選擇任何類型（維持預設）
- When 我送出查詢
- Then 系統回傳文件／循環／變更三種類型混合之結果，依操作時間新到舊排序

## Technical Notes

- 查詢介面應對大量資料（見 [NFR-001 效能與可擴展性](../../non-functional/NFR-001-performance.md)）具備分頁與索引優化（建議對人員 ID、文件 ID、操作時間建立索引）
- 顯示欄位「公司」「角色」由組織（ORG_UNIT）／帳號（ACCOUNT.roleCode）資料 join 衍生，供清單顯示與篩選；稽核紀錄之**儲存**快照仍以浮水印來源為準（[F023](../../../specs/features/F023-audit-logging.md)／[US-060](US-060-audit-trail-logging.md)），公司/角色未必納入不可變快照
- 「主管」「部門窗口」「一般使用者」角色不具備本功能存取權（回 403），依 [E08 US-070](../E08-permission-matrix/US-070-role-function-matrix.md) 定案
- **已定案（2026-07-17，OQ-E07-03）**：`AUDIT_LOG.targetType` 已於資料模型層擴充涵蓋 `DOCUMENT`／`LIFECYCLE`／`DOCUMENT_CHANGE_LOG`／`LIFECYCLE_CHANGE_LOG`（見 [US-025](../E03-lifecycle-dag/US-025-lifecycle-tree-preview.md)／[US-062](US-062-document-change-history.md)／[US-063](US-063-lifecycle-tree-change-history.md) 之 `OQ-E07-02` 資料模型家族決策），本 story 之查詢邏輯僅需新增「類型」篩選條件與對應顯示欄位切換（AC4），無需另外新增 schema
- 循環／變更類型之紀錄不一定有 `documentId`（對象非文件），清單顯示欄位需依類型動態調整（例如循環類型顯示循環名稱而非文件編號；變更類型顯示被異動之文件或循環識別）

## Test Cases

| ID | 情境 | 類型 |
|---|---|---|
| TC-061-01 | 以文件編號查詢，正確回傳該文件所有調閱紀錄，時間排序正確（新到舊） | Happy Path |
| TC-061-02 | 以時間區間 + 人員條件組合查詢，回傳結果同時滿足兩條件 | Happy Path |
| TC-061-03 | 主管角色呼叫本功能 API，應回傳 403（主管無文件調閱歷程查詢權） | Error Case |
| TC-061-04 | 部門窗口／一般使用者角色呼叫本功能 API，應回傳 403 | Error Case |
| TC-061-05 | 查詢條件為空（未輸入任何篩選）時，系統應要求至少一項條件或提供合理的預設範圍（如近 30 天），避免全表掃描造成效能問題 | Edge Case |
| TC-061-06 | 篩選類型＝循環，預期僅回傳 `LIFECYCLE_VIEW`／`LIFECYCLE_DOWNLOAD`／`LIFECYCLE_PRINT` 紀錄 | Happy Path |
| TC-061-07 | 篩選類型＝變更，預期僅回傳 `CHANGE_LOG_VIEW`／`LIFECYCLE_CHANGELOG_VIEW`／`LIFECYCLE_CHANGELOG_DOWNLOAD` 紀錄 | Happy Path |
| TC-061-08 | 不選類型（維持預設全選），預期回傳文件／循環／變更三種類型混合結果，依時間新到舊排序正確 | Edge Case |

## Dependencies

**Blocked By**
- [US-060 查看/下載/列印稽核軌跡記錄](US-060-audit-trail-logging.md)
- [E08 US-070 角色×功能權限矩陣](../E08-permission-matrix/US-070-role-function-matrix.md)
- [E03 US-025 循環樹狀圖預覽](../E03-lifecycle-dag/US-025-lifecycle-tree-preview.md)（「循環」類型稽核紀錄來源，2026-07-17 OQ-E07-03 定案納入）
- [US-062 ICSOP 程序書變更歷程](US-062-document-change-history.md)／[US-063 循環樹狀圖變更歷程](US-063-lifecycle-tree-change-history.md)（「變更」類型稽核紀錄來源，2026-07-17 OQ-E07-03 定案納入）

**Blocks**
- 無下游 Story 直接依賴

## Definition of Done

- [ ] Acceptance criteria met
- [ ] Unit tests passing（覆蓋率 >80%，含未授權角色 403 情境）
- [ ] Code review approved
- [ ] Documentation updated

## Related

- Epic: [E07 稽核與文件調閱歷程](epic-brief.md)
- Story: [US-060 查看/下載/列印稽核軌跡記錄](US-060-audit-trail-logging.md)、[E03 US-025 循環樹狀圖預覽](../E03-lifecycle-dag/US-025-lifecycle-tree-preview.md)、[US-062 ICSOP 程序書變更歷程](US-062-document-change-history.md)、[US-063 循環樹狀圖變更歷程](US-063-lifecycle-tree-change-history.md)
- Epic: [E08 權限矩陣](../E08-permission-matrix/epic-brief.md)
- NFR: [NFR-001 效能與可擴展性](../../non-functional/NFR-001-performance.md)
