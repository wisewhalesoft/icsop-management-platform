# US-040: 使用表單上傳管理

> **Story ID**: US-040
> **Epic**: [E05 文件使用表單管理](epic-brief.md)
> **Priority**: P1
> **Phase**: 1
> **Estimated Points**: 5

## User Story

As an ICSOP 管理員,
I want 為特定 ICSOP 文件上傳、更新、移除多個使用表單（excel 或 pdf 格式）,
So that 公司同仁於瀏覽文件時能一併取得該文件對應工作流程所需的實際表單。

## Acceptance Criteria

### AC1：成功上傳使用表單

**Given** ICSOP 管理員已進入某份 ICSOP 文件的編輯畫面
**When** 選擇一個或多個檔案（格式為 excel 或 pdf）並送出上傳
**Then** 系統將檔案存入 Azure Blob Storage，並與該文件建立關聯，畫面顯示已上傳表單清單。

### AC2：格式不符時拒絕上傳

**Given** ICSOP 管理員選擇之檔案非 excel 或 pdf 格式
**When** 送出上傳
**Then** 系統拒絕上傳並提示允許的檔案格式，不建立任何關聯紀錄。

### AC3：移除既有使用表單

**Given** 某份 ICSOP 文件已有一個或多個使用表單
**When** ICSOP 管理員選擇移除其中一個表單
**Then** 系統解除該表單與文件之關聯並將檔案自可存取清單移除（實體刪除或標記不可存取，由技術設計決定），並要求二次確認以避免誤刪。

## Technical Notes

- 檔案存放 Azure Blob Storage，命名/路徑規則需能追溯所屬 ICSOP 文件（供稽核與清理作業使用）。
- 上傳/移除動作建議記錄操作人員與時間，作為文件維護歷程之延伸（非公司同仁調閱稽核，屬管理端操作記錄，與 E07 稽核軌跡的「調閱」性質不同，需在架構設計時區分兩者）。

## Test Cases

| ID | 情境 | 類型 |
|---|---|---|
| TC-040-01 | 上傳單一 pdf 表單 → 成功建立關聯並顯示於清單 | Happy Path |
| TC-040-02 | 一次上傳多個 excel/pdf 表單 → 全部成功建立關聯 | Happy Path |
| TC-040-03 | 上傳非 excel/pdf 格式檔案（如 .docx）→ 拒絕並提示格式錯誤 | Error Case |
| TC-040-04 | 上傳檔案超過大小上限（待確認上限值）→ 拒絕並提示超出限制 | Error Case |
| TC-040-05 | 移除表單前之二次確認取消 → 表單保留不受影響 | Edge Case |

## Dependencies

- **Blocked By**：[E04 US-030 建立ICSOP文件](../E04-icsop-document/US-030-create-icsop-document.md)
- **Blocks**：[US-041 表單與文件關聯維護](US-041-form-document-association.md)

## Definition of Done

- [ ] Acceptance criteria met
- [ ] Unit tests passing (>80% coverage)
- [ ] Code review approved
- [ ] Documentation updated

## Related

- [Epic Brief: E05 文件使用表單管理](epic-brief.md)
- [NFR-002 資訊安全與身分驗證](../../non-functional/NFR-002-security.md)
- [NFR-004 可用性與備援](../../non-functional/NFR-004-availability-backup.md)
