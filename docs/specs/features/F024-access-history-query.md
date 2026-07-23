# F024: 文件調閱歷程查詢後台
Priority: P0-MVP | Status: Implemented (unit) — audit worktree 2026-07-23；效能/跨年度整合待（[integration] TS-017/018）| Last Updated: 2026-07-23
Epic/Story: E07 / US-061

## Description
後台依**類型**（文件／循環／變更）、人員（姓名/員工編號）、對象（文件編號/名稱、循環名稱/ID）、時間區間任意組合查詢調閱歷程。查詢結果依角色限縮可視範圍：系統管理員／ICSOP 管理員全公司唯讀；主管／部門窗口／一般使用者無此功能。可展開單筆明細（含當次浮水印快照）。

**涵蓋範圍（OQ-E07-03 定案）**：本頁**納入循環與變更歷程之調閱稽核**（不另建查詢頁籤）——除既有文件調閱（`VIEW`/`DOWNLOAD`/`PRINT`）外，涵蓋循環樹狀圖預覽（[F036](F036-lifecycle-tree-preview.md)：`LIFECYCLE_VIEW`/`LIFECYCLE_DOWNLOAD`/`LIFECYCLE_PRINT`）與變更歷程檢視（[F037](F037-document-change-history.md)：`CHANGE_LOG_VIEW`；[F038](F038-lifecycle-tree-change-history.md)：`LIFECYCLE_CHANGELOG_VIEW`/`LIFECYCLE_CHANGELOG_DOWNLOAD`）。以 `AUDIT_LOG.targetType` 區分（已支援 `DOCUMENT`/`USAGE_FORM`/`LIFECYCLE`/`DOCUMENT_CHANGE_LOG`/`LIFECYCLE_CHANGE_LOG`，見 OQ-E07-02），**無需 schema 變更**。

## Preconditions
- 操作者具查詢權（F025：僅 SysAdmin／ICSOPAdmin 全公司唯讀；主管／部門窗口／一般使用者無此功能）。
- 稽核資料由 F023 產生。

## Main Flow
1. 進入「文件調閱歷程」頁，選擇**類型篩選**（文件／循環／變更；預設全部）並輸入人員/對象/時間區間任意組合。
2. 送出查詢 → 回傳符合之稽核清單（分頁），每筆顯示操作人員、員工編號、公司、部門、室別、角色、**對象**、操作類型、操作時間（新到舊）。
3. **顯示欄位依類型切換**：類型＝文件 → 顯示文件編號/名稱；類型＝循環 → 顯示循環 ID/名稱；類型＝變更 → 顯示被查詢之變更歷程對象（文件或循環）。混合查詢（全部）時「對象」欄以類型標籤＋對象識別統一呈現。
4. 後端強制驗證角色（僅 SysAdmin／ICSOPAdmin 可存取本頁，不信任前端傳入條件）。
5. 點擊單筆 → 展開完整明細（含浮水印快照；無浮水印之動作類型則該欄留空）。

## Alternative Flows
- 匯出查詢結果（格式草案 CSV/Excel，見 [NFR-003](../nfr.md#audit-retention)）。
- 顯示欄位「公司」「角色」由 ORG_UNIT／ACCOUNT（roleCode）join 衍生供顯示/篩選；稽核**儲存**之身分快照仍以浮水印來源為準（[F023](F023-audit-logging.md)），未必新增儲存欄位。

## Edge Cases
- 查詢條件為空：要求至少一項條件或套用預設近 30 天，避免全表掃描。
- 主管／部門窗口／一般使用者呼叫本功能 API：一律回 403（無文件調閱歷程查詢權）。
- **非文件類型之紀錄無 `documentId`**：本頁原假設每筆皆有 `documentId`，因納入循環/變更類型後該欄改為**條件必填**（僅 `targetType=DOCUMENT`/`USAGE_FORM` 時有值）；查詢結果表格與匯出範本需容許該欄為空並改以「對象」欄呈現（見 architecture-spec §8.1 風險#14）。
- 以「文件編號」查詢但類型選「循環」：無結果（條件互斥），顯示空狀態而非錯誤。

## Postconditions
- 稽核需求發生時可快速定位特定文件/人員之調閱紀錄。

## Acceptance Criteria
- Given 以文件編號查詢, When 送出, Then 回傳該文件所有調閱紀錄，時間新到舊。
- Given 以時間區間+人員組合查詢, When 送出, Then 回傳同時滿足兩條件之結果。
- Given 主管呼叫本功能 API, When 請求, Then 回 403（主管無文件調閱歷程查詢權）。
- Given 部門窗口或一般使用者呼叫本功能 API, When 請求, Then 回 403。
- Given 查詢未輸入任何條件, When 送出, Then 要求至少一項條件或套用近 30 天預設。
- Given 點擊單筆紀錄, When 展開, Then 顯示完整明細含浮水印快照（無浮水印之動作類型該欄留空）。
- Given 類型篩選選擇「循環」, When 查詢, Then 僅回傳循環相關調閱紀錄（`LIFECYCLE_VIEW`/`LIFECYCLE_DOWNLOAD`/`LIFECYCLE_PRINT`），並以循環 ID/名稱呈現「對象」欄。
- Given 類型篩選選擇「變更」, When 查詢, Then 僅回傳變更歷程檢視紀錄（`CHANGE_LOG_VIEW`／`LIFECYCLE_CHANGELOG_VIEW`／`LIFECYCLE_CHANGELOG_DOWNLOAD`）。
- Given 類型篩選為「全部」（預設）, When 查詢, Then 回傳文件/循環/變更三類混合結果，「對象」欄以類型標籤＋對象識別統一呈現。

## Error Scenarios
- 權限限縮/空條件：見 [error-handling.md#permission](../error-handling.md#permission)、[#audit](../error-handling.md#audit)（`QUERY_CONDITION_REQUIRED`）。效能見 [NFR-001](../nfr.md#performance)。

## Related
- Data: [AUDIT_LOG](../data-model.md#auditlog-entity)（`targetType` 區分 `DOCUMENT`/`USAGE_FORM`/`LIFECYCLE`/`DOCUMENT_CHANGE_LOG`/`LIFECYCLE_CHANGE_LOG`）
- Depends on: [F023](F023-audit-logging.md), [F025](F025-role-function-matrix.md)
- Related: 稽核來源 [F020](F020-watermark.md)、[F036](F036-lifecycle-tree-preview.md)、[F037](F037-document-change-history.md)、[F038](F038-lifecycle-tree-change-history.md)
- NFR: [效能（索引/分頁）](../nfr.md#performance), [稽核保留（≥3 年，含變更歷程）](../nfr.md#audit-retention)
- 定案: **OQ-E07-03（循環/變更調閱稽核納入本頁查詢，新增「文件/循環/變更」類型篩選與顯示欄位切換；`AUDIT_LOG.targetType` 已支援，無 schema 變更）**、OQ-NFR003（保留 ≥3 年）
