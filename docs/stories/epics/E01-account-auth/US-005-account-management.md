# US-005: 帳號管理 CRUD

> **Story ID**: US-005
> **Epic**: [E01 帳號與驗證](epic-brief.md)
> **Priority**: P0
> **Phase**: 1
> **Estimated Points**: 8

## User Story

As a 系統管理員,
I want 在後台建立、查詢、編輯、停用帳號,
So that 我能維護誰有權限存取本平台，並區分管理員帳密類型帳號與上游同步帳號兩種來源。

## Acceptance Criteria

### AC1：手動建立管理員帳密類型帳號
**Given** 系統管理員填寫新帳號資訊（帳號、初始密碼、指派角色）
**When** 系統管理員送出建立請求
**Then** 系統建立帳號並以雜湊儲存密碼（見 [NFR-002](../../non-functional/NFR-002-security.md)），該帳號標記來源為「手動建立」。

### AC2：查詢與篩選帳號清單
**Given** 系統管理員進入帳號管理頁
**When** 依帳號來源（手動建立/上游同步）、角色、啟用狀態進行篩選
**Then** 系統回傳符合條件的帳號清單，並清楚標示每個帳號的來源類型。

### AC3：停用帳號
**Given** 系統管理員選定一個帳號並執行停用
**When** 停用操作送出
**Then** 該帳號立即無法登入（含既有 session 應被強制失效），且此操作被記錄於稽核軌跡。

## Technical Notes

- 上游同步帳號（由 [E02 US-010](../E02-org-sync/US-010-daily-scheduled-sync.md) 建立）與手動建立帳號共用同一資料表，但來源欄位不同；上游同步帳號的基本資料（姓名/部門等）以組織同步結果為準，系統管理員原則上不應手動覆寫，僅能調整角色與啟用狀態（細節見 Open Questions）。
- 帳號停用需與 [E01 US-004 Session 逾時與登出](US-004-session-timeout.md) 的 session 失效機制連動。

## Test Cases

| ID | 情境 | 類型 |
|---|---|---|
| TC-005-01 | 建立新管理員帳密帳號 → 成功建立，密碼雜湊儲存 | Happy Path |
| TC-005-02 | 篩選「上游同步」來源帳號 → 僅回傳該類型帳號 | Happy Path |
| TC-005-03 | 停用一個已登入使用者的帳號 → 該使用者的既有 session 立即失效 | Happy Path |
| TC-005-04 | 建立帳號時帳號名稱重複 → 回傳明確錯誤，拒絕建立 | Error Case |
| TC-005-05 | 嘗試手動編輯上游同步帳號的姓名/部門欄位 → 依草案規則應被拒絕或提示「請透過組織同步更新」 | Edge Case |

## Dependencies

- **Blocked By**：[E08 US-070 角色×功能權限矩陣](../E08-permission-matrix/US-070-role-function-matrix.md)
- **Blocks**：[US-002 管理員帳密登入](US-002-admin-password-login.md)、[US-006 角色指派管理](US-006-role-assignment.md)

## Definition of Done

- [ ] Acceptance criteria met
- [ ] Unit tests passing (>80% coverage)
- [ ] Code review approved
- [ ] Documentation updated

## Related

- [Epic Brief: E01 帳號與驗證](epic-brief.md)
- [E02 US-010 每日排程同步](../E02-org-sync/US-010-daily-scheduled-sync.md)
- [E02 US-012 離職者自動停用帳號](../E02-org-sync/US-012-auto-disable-departed-accounts.md)
- [E07 US-060 查看下載列印稽核軌跡記錄](../E07-audit-trail/US-060-audit-trail-logging.md)

## Open Questions

- [ ] 上游同步帳號的基本資料欄位是否允許系統管理員手動覆寫，或一律以同步結果為準？需與 [E02 US-013](../E02-org-sync/US-013-org-change-impact-alert.md) 一併確認。
