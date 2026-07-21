# US-041: 表單與文件關聯維護

> **Story ID**: US-041
> **Epic**: [E05 文件使用表單管理](epic-brief.md)
> **Priority**: P1
> **Phase**: 1
> **Estimated Points**: 3

## User Story

As a 公司同仁或 ICSOP 管理員,
I want 在文件詳情頁（前台或後台）看到該 ICSOP 文件所有關聯之使用表單並可個別下載,
So that 我能取得執行該文件所述工作流程所需的完整表單，而不必另外詢問或查找。

## Acceptance Criteria

### AC1：文件詳情頁正確列出關聯表單

**Given** 某份 ICSOP 文件已關聯一個或多個使用表單
**When** 使用者（前台一般使用者或後台管理角色）開啟該文件詳情頁
**Then** 畫面列出所有關聯表單之名稱與格式（excel/pdf），並提供個別下載連結。

### AC2：無關聯表單時的呈現

**Given** 某份 ICSOP 文件尚未關聯任何使用表單
**When** 使用者開啟該文件詳情頁
**Then** 畫面明確顯示「無使用表單」或等同提示，不顯示錯誤或空白區塊。

### AC3：下載表單觸發稽核記錄

**Given** 使用者於前台文件詳情頁點擊下載某使用表單
**When** 下載請求成功
**Then** 系統記錄一筆稽核軌跡（操作人員、部門/處室、文件、表單、操作類型=下載、時間戳記），比照 [E07 US-060](../E07-audit-trail/US-060-audit-trail-logging.md) 之記錄規則。

## Technical Notes

- 前台下載表單是否也需疊加浮水印，原始需求僅明確要求「ICSOP 文件」本身（PDF）之浮水印疊加/燒錄（見 E06 US-053/US-054），使用表單是否比照辦理未提及，列為 Open Question。
- 後台與前台之關聯清單呈現邏輯應共用同一組 API，避免兩處資料不一致。

## Test Cases

| ID | 情境 | 類型 |
|---|---|---|
| TC-041-01 | 文件有 3 個關聯表單 → 詳情頁正確列出 3 筆並各自可下載 | Happy Path |
| TC-041-02 | 文件無關聯表單 → 顯示「無使用表單」提示 | Happy Path |
| TC-041-03 | 未登入或無權限使用者嘗試直接組合下載網址存取表單 → 拒絕存取 | Error Case |
| TC-041-04 | 下載表單成功 → 稽核紀錄同步寫入且內容正確 | Edge Case |

## Dependencies

- **Blocked By**：[US-040 使用表單上傳管理](US-040-usage-form-upload.md)
- **Blocks**：[E06 US-050 前台清單與排序規則](../E06-public-browsing/US-050-public-list-sorting.md)（文件詳情頁需顯示表單清單）

## Definition of Done

- [ ] Acceptance criteria met
- [ ] Unit tests passing (>80% coverage)
- [ ] Code review approved
- [ ] Documentation updated

## Related

- [Epic Brief: E05 文件使用表單管理](epic-brief.md)
- [E07 US-060 查看/下載/列印稽核軌跡記錄](../E07-audit-trail/US-060-audit-trail-logging.md)
- [NFR-002 資訊安全與身分驗證](../../non-functional/NFR-002-security.md)
