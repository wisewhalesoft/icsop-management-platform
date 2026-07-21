# US-006: 角色指派管理

> **Story ID**: US-006
> **Epic**: [E01 帳號與驗證](epic-brief.md)
> **Priority**: P0
> **Phase**: 1
> **Estimated Points**: 5

## User Story

As a 系統管理員,
I want 將系統定義的 5 種角色之一指派給指定帳號,
So that 每個帳號能依其職責取得對應的功能與欄位存取權限。

## Acceptance Criteria

### AC1：指派角色給帳號
**Given** 系統管理員於帳號管理頁選定一個帳號
**When** 系統管理員從 5 種角色（系統管理員／ICSOP管理員／主管／部門窗口／一般使用者）中選擇一個並儲存
**Then** 系統更新該帳號角色，且此變更於下次該帳號請求時立即生效（含強制重新驗證權限，見 Technical Notes）。

### AC2：變更角色時提示影響範圍
**Given** 系統管理員將一個帳號的角色由管理類角色（如 ICSOP管理員）變更為「一般使用者」
**When** 變更送出前
**Then** 系統顯示提示，說明該帳號將失去所有後台管理權限，需二次確認後才執行。

### AC3：角色清單為系統固定值
**Given** 系統管理員開啟角色選擇下拉選單
**When** 選單載入
**Then** 僅顯示 5 種固定角色，不可由前台或後台新增/刪除角色種類。

## Technical Notes

- 角色變更後，若使用者已持有有效 JWT，該 JWT 內嵌角色資訊將與資料庫不一致，需於架構設計階段決定處理方式（如縮短 JWT 有效期、每次請求即時查角色、或強制該帳號重新登入）。
- 角色清單為程式碼層級固定列舉值，非資料庫可編輯之設定資料。

## Test Cases

| ID | 情境 | 類型 |
|---|---|---|
| TC-006-01 | 將帳號指派為「ICSOP管理員」→ 儲存成功，該帳號後續請求依新角色套用權限 | Happy Path |
| TC-006-02 | 由管理類角色降級為「一般使用者」→ 顯示二次確認提示 | Happy Path |
| TC-006-03 | 嘗試指派不存在的角色值（如 API 層繞過前端傳入非法角色字串）→ 回傳 400 錯誤，拒絕寫入 | Error Case |
| TC-006-04 | 系統管理員將自己的帳號降級 → 依草案規則應阻擋（避免系統無管理員可操作，屬 Open Question） | Edge Case |
| TC-006-05 | 已登入使用者角色被他人變更 → 依 Technical Notes 決定的機制生效（如下次請求即套用新角色） | Edge Case |

## Dependencies

- **Blocked By**：[US-005 帳號管理 CRUD](US-005-account-management.md)、[E08 US-070 角色×功能權限矩陣](../E08-permission-matrix/US-070-role-function-matrix.md)
- **Blocks**：[US-003 登入後角色導向](US-003-role-based-routing.md)，以及所有依賴角色權限判斷的功能

## Definition of Done

- [ ] Acceptance criteria met
- [ ] Unit tests passing (>80% coverage)
- [ ] Code review approved
- [ ] Documentation updated

## Related

- [Epic Brief: E01 帳號與驗證](epic-brief.md)
- [E08 US-070 角色×功能權限矩陣](../E08-permission-matrix/US-070-role-function-matrix.md)
- [E08 US-071 角色×欄位權限矩陣](../E08-permission-matrix/US-071-role-field-matrix.md)

## Open Questions

- [ ] 單一帳號是否可同時擁有多個角色？原始需求未明確定義，草案假設「單一帳號指派一個主要角色」。
- [ ] 是否應阻擋系統管理員將自己的帳號降級，以避免系統無任何系統管理員可操作？
