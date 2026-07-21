# US-002: 管理員帳密登入

> **Story ID**: US-002
> **Epic**: [E01 帳號與驗證](epic-brief.md)
> **Priority**: P0
> **Phase**: 1
> **Estimated Points**: 5

## User Story

As a 系統管理員／ICSOP管理員等管理類角色使用者,
I want 使用系統管理員設定之帳號密碼登入,
So that 在無法透過上游系統驗證的情況下，仍能存取管理後台完成職責。

## Acceptance Criteria

### AC1：帳密正確時成功登入
**Given** 使用者於登入頁輸入正確的帳號與密碼
**When** 使用者送出登入表單
**Then** 系統驗證通過並核發有效 JWT/session，導向 [US-003 角色導向](US-003-role-based-routing.md) 邏輯。

### AC2：帳密錯誤時的處理
**Given** 使用者輸入錯誤的帳號或密碼
**When** 使用者送出登入表單
**Then** 系統回傳統一的「帳號或密碼錯誤」訊息（不得洩漏帳號是否存在），並記錄此次失敗嘗試。

### AC3：密碼儲存安全性
**Given** 系統管理員於帳號管理建立新帳密
**When** 密碼被寫入資料庫
**Then** 密碼須以不可逆雜湊演算法（如 bcrypt/argon2）儲存，不得明碼儲存（見 [NFR-002](../../non-functional/NFR-002-security.md)）。

## Technical Notes

- 登入表單需具備基本前端輸入驗證，但安全性判斷一律以後端為準。
- 密碼複雜度規則（長度、組合）由分析師草案建議：至少 8 碼含英數混合，實際規則待確認。

## Test Cases

| ID | 情境 | 類型 |
|---|---|---|
| TC-002-01 | 正確帳密 → 成功登入並核發憑證 | Happy Path |
| TC-002-02 | 錯誤密碼 → 回傳統一錯誤訊息，不洩漏帳號存在與否 | Error Case |
| TC-002-03 | 帳號不存在 → 回傳與密碼錯誤相同的統一錯誤訊息 | Error Case |
| TC-002-04 | 連續多次登入失敗 → 是否觸發鎖定機制（見 Open Questions，草案未定案） | Edge Case |
| TC-002-05 | 帳號已被系統管理員停用 → 登入應被拒絕並提示帳號已停用 | Edge Case |

## Dependencies

- **Blocked By**：[US-005 帳號管理 CRUD](US-005-account-management.md)（需先有帳密類型帳號存在）
- **Blocks**：[US-003 登入後角色導向](US-003-role-based-routing.md)、[US-004 Session 逾時與登出](US-004-session-timeout.md)

## Definition of Done

- [ ] Acceptance criteria met
- [ ] Unit tests passing (>80% coverage)
- [ ] Code review approved
- [ ] Documentation updated

## Related

- [Epic Brief: E01 帳號與驗證](epic-brief.md)
- [NFR-002 資訊安全與身分驗證](../../non-functional/NFR-002-security.md)
- [US-005 帳號管理 CRUD](US-005-account-management.md)

## Open Questions

- [ ] 是否需要登入失敗次數鎖定機制？原始需求未提及，屬分析師草案建議，待確認。
- [ ] 密碼複雜度與定期更換政策未於原始需求定義，草案值待公司資安政策確認。
