# US-050: 前台清單與排序規則

> **Story ID**: US-050
> **Epic**: [E06 前台RWD瀏覽](epic-brief.md)
> **Priority**: P0
> **Phase**: 1
> **Estimated Points**: 8

## User Story

As a 公司同仁（一般使用者或其他角色瀏覽前台）,
I want 看到與我使用部門相關的 ICSOP 文件優先顯示、其餘依文件編號降冪排列的清單,
So that 我能快速找到與自己業務最相關的文件，不必在大量清單中逐一翻找。

## Acceptance Criteria

### AC1：使用部門相符文件置頂

**Given** 登入使用者所屬部門為 X
**When** 使用者開啟前台文件清單
**Then** 「文件使用部門」欄位包含 X 的文件排列於清單最上方（置頂區塊），其餘文件排列於下方。「使用部門」可指定至任意組織層級（本部／部／處室／課，見 [E08 US-071](../E08-permission-matrix/US-071-role-field-matrix.md)），比對時**自動展開子樹**：若文件使用部門設定為較高層級（如「部」），則該層級底下所有處/室/課人員皆視為相符（前綴比對，詳見 Technical Notes）。

### AC2：非置頂區依文件編號降冪排序

**Given** 清單中扣除置頂區後的其餘文件
**When** 呈現清單
**Then** 這些文件依「人為定義 ICSOP 文件編號」降冪排序。

### AC3：清單顯示必要欄位

**Given** 使用者瀏覽前台清單
**When** 清單載入完成
**Then** 每筆項目至少顯示文件編號、文件名稱、制定部門、使用部門、文件狀態、公告日期（可含內容摘要）。

### AC4：一般使用者可見範圍為「已公告」

**Given** 一般使用者開啟前台清單
**When** 清單載入
**Then** 僅回傳「已公告」文件（＝儲存狀態＝有效 且 公告日期 ≤ 今日）；「進度中」（有效但公告日期未到）與 失效／作廢 一律由後端過濾隱藏（不可依前端傳入條件繞過）。「已公告」為可見衍生，儲存狀態欄位仍為 有效／失效／作廢（見 [US-032](../E04-icsop-document/US-032-status-toggle.md)），不新增儲存狀態值。

## Technical Notes

- 排序邏輯需於後端 API 實作（非前端排序），確保分頁情境下排序一致且效能可控（見 [NFR-001](../../non-functional/NFR-001-performance.md)）。
- 「使用部門相符」之比對邏輯需與 [E02 組織同步](../E02-org-sync/epic-brief.md) 提供的使用者部門資訊連動；使用者若身兼多部門相關身分（如跨部門調動中），比對規則需架構師確認。
- 子樹展開之比對可直接以**部門代碼前綴**達成（不需 closure table／遞迴 CTE）：部門代碼為前綴編碼，`ORG_UNIT` 應儲存 `orgCode` 與預先計算之 `codePrefix` 並建立索引，前綴比對（如 `CODE LIKE 'JA%'`）為 index-seek 友善，詳見[上游人資來源資料契約 §9](../../../specs/upstream-hr-source-contract.md)。此規則與 [US-052 部門篩選](US-052-filter-dept-status-lifecycle.md)、[E09 US-096 權限感知檢索](../E09-rag-qa/US-096-permission-aware-retrieval.md) 共用同一套子樹展開邏輯。

## Test Cases

| ID | 情境 | 類型 |
|---|---|---|
| TC-050-01 | 使用者部門為「品保部」，清單中有 3 份使用部門含「品保部」的文件 → 該 3 份文件置頂顯示 | Happy Path |
| TC-050-02 | 置頂區以外文件依編號降冪正確排序 | Happy Path |
| TC-050-03 | 使用者部門查無任何相符文件 → 清單直接依編號降冪排序，無置頂區塊錯誤顯示 | Edge Case |
| TC-050-04 | 使用部門欄位為多個部門的文件，其中一個與使用者部門相符 → 仍列入置頂區 | Edge Case |
| TC-050-05 | 分頁載入第二頁時排序規則維持一致，不因分頁而錯亂 | Error Case（防止分頁排序不一致） |
| TC-050-06 | 文件使用部門設定為「部」層級（如營運管理部），使用者所屬部門為其下「處/室」或「課」（如審查室、醫療一課）→ 該文件仍列入置頂區（子樹展開比對成立） | Edge Case |

## Dependencies

- **Blocked By**：[E04 US-037 後台文件清單與搜尋](../E04-icsop-document/US-037-backend-document-list-search.md)（資料來源）、[E02 US-010 每日排程同步](../E02-org-sync/US-010-daily-scheduled-sync.md)（部門比對資料）、[E01 US-003 登入後角色導向](../E01-account-auth/US-003-role-based-routing.md)
- **Blocks**：[US-051 關鍵字搜尋](US-051-keyword-search.md)、[US-052 部門/狀態/循環篩選](US-052-filter-dept-status-lifecycle.md)、[US-055 RWD響應式版面](US-055-rwd-responsive-layout.md)

## Definition of Done

- [ ] Acceptance criteria met
- [ ] Unit tests passing (>80% coverage)
- [ ] Code review approved
- [ ] Documentation updated

## Related

- [Epic Brief: E06 前台RWD瀏覽](epic-brief.md)
- [NFR-001 效能與可擴展性](../../non-functional/NFR-001-performance.md)
- [E04 US-037 後台文件清單與搜尋](../E04-icsop-document/US-037-backend-document-list-search.md)
- Spec: [上游人資來源資料契約](../../../specs/upstream-hr-source-contract.md)（部門代碼前綴／子樹展開定案）
