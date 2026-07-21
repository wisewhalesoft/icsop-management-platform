# US-051: 關鍵字搜尋

> **Story ID**: US-051
> **Epic**: [E06 前台RWD瀏覽](epic-brief.md)
> **Priority**: P0
> **Phase**: 1
> **Estimated Points**: 5

## User Story

As a 公司同仁,
I want 在前台文件清單頁輸入關鍵字搜尋 ICSOP 文件,
So that 我能快速定位特定文件，而不需在完整清單中手動尋找。

## Acceptance Criteria

### AC1：關鍵字符合文件編號或名稱時正確過濾

**Given** 使用者於搜尋框輸入關鍵字
**When** 該關鍵字為某份文件之文件編號或文件名稱的部分字串
**Then** 清單僅顯示符合的文件，並維持 [US-050](US-050-public-list-sorting.md) 之排序規則。

### AC2：查無符合結果時的呈現

**Given** 使用者輸入之關鍵字未匹配任何文件
**When** 執行搜尋
**Then** 畫面顯示「查無符合結果」提示，不顯示錯誤畫面。

### AC3：搜尋與篩選可組合使用

**Given** 使用者已套用部門/狀態/循環篩選（見 [US-052](US-052-filter-dept-status-lifecycle.md)）
**When** 同時輸入關鍵字搜尋
**Then** 系統回傳同時符合篩選條件與關鍵字的文件清單（AND 邏輯）。

## Technical Notes

- 搜尋實作方式（資料庫 LIKE 查詢 vs 全文檢索）由架構師決定，需符合 [NFR-001](../../non-functional/NFR-001-performance.md) 效能目標。
- 搜尋涵蓋欄位範圍待確認（見 Epic Brief Open Questions）；本 story 之 AC 暫以「文件編號、文件名稱」為最小範圍基準。

## Test Cases

| ID | 情境 | 類型 |
|---|---|---|
| TC-051-01 | 輸入完整文件編號 → 精確定位該文件 | Happy Path |
| TC-051-02 | 輸入文件名稱部分字串 → 回傳所有包含該字串的文件 | Happy Path |
| TC-051-03 | 輸入不存在的關鍵字 → 顯示「查無符合結果」 | Error Case |
| TC-051-04 | 輸入特殊字元（如 % _ ' 等 SQL 萬用字元）→ 系統正確跳脫處理，不產生錯誤或安全漏洞 | Edge Case |
| TC-051-05 | 關鍵字搜尋 + 部門篩選同時套用 → 回傳交集結果 | Edge Case |

## Dependencies

- **Blocked By**：[US-050 前台清單與排序規則](US-050-public-list-sorting.md)
- **Blocks**：無

## Definition of Done

- [ ] Acceptance criteria met
- [ ] Unit tests passing (>80% coverage)
- [ ] Code review approved
- [ ] Documentation updated

## Related

- [Epic Brief: E06 前台RWD瀏覽](epic-brief.md)
- [US-052 部門/狀態/循環篩選](US-052-filter-dept-status-lifecycle.md)
- [NFR-001 效能與可擴展性](../../non-functional/NFR-001-performance.md)
