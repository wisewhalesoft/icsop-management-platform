# US-004: Session 逾時與登出

> **Story ID**: US-004
> **Epic**: [E01 帳號與驗證](epic-brief.md)
> **Priority**: P0
> **Phase**: 1
> **Estimated Points**: 5

## User Story

As a 已登入使用者,
I want 系統在我閒置 30 分鐘後自動登出，並提供手動登出功能,
So that 我的帳號不會在離開座位時被他人冒用，同時我能主動結束工作階段。

## Acceptance Criteria

### AC1：閒置 30 分鐘自動逾時
**Given** 使用者已登入且最後一次有效操作時間已超過 30 分鐘
**When** 使用者嘗試進行下一個操作（如頁面切換或 API 請求）
**Then** 系統判定 session 已逾時，拒絕該操作並導向登入頁，要求重新登入。

### AC2：操作中不會被中途登出
**Given** 使用者持續在 30 分鐘內有互動（頁面操作或 API 請求）
**When** 每次互動發生
**Then** 系統重新計算閒置計時起點，使用者不會被強制登出。

### AC3：手動登出立即生效
**Given** 使用者點擊「登出」
**When** 登出請求送出
**Then** 系統立即使當前 JWT/session 失效，使用者被導向登入頁，且該憑證不可再用於任何 API 請求。

## Technical Notes

- 「操作」的判定基準（前端心跳 vs. 每次 API 請求更新最後活動時間）為技術實作決策，待系統架構師確認，此 story 僅定義行為需求。
- 30 分鐘為全域固定值；是否需依角色開放不同逾時秒數未於原始需求提及，暫不納入本次規劃。
- **不受登入方式變更影響**：US-001 登入方式已改為 Azure AD OIDC（見 [upstream-hr-source-contract.md §12](../../../specs/upstream-hr-source-contract.md#12-身分驗證與-ad-身分對應2026-07-20-部分定案)），但 Azure AD 僅負責**初次身分驗證**；本平台核發 JWT/session 後之閒置逾時判定與計時邏輯，維持由 ICSOP 後端自行管理，不受影響。

## Test Cases

| ID | 情境 | 類型 |
|---|---|---|
| TC-004-01 | 使用者每 10 分鐘操作一次，持續 1 小時 → 全程維持登入狀態 | Happy Path |
| TC-004-02 | 使用者閒置 31 分鐘後操作 → 被導回登入頁 | Error Case |
| TC-004-03 | 使用者點擊登出 → 立即無法再用原 JWT 呼叫任何受保護 API | Happy Path |
| TC-004-04 | 使用者於閒置 29 分 59 秒時操作 → session 應維持有效並重新計時 | Edge Case |
| TC-004-05 | 多分頁同時開啟同一帳號 → 任一分頁的有效操作應重置全域閒置計時（技術設計待確認） | Edge Case |

## Dependencies

- **Blocked By**：[US-001 Azure AD OIDC 登入（靜默 SSO）](US-001-upstream-signature-login.md)、[US-002 管理員帳密登入](US-002-admin-password-login.md)
- **Blocks**：無（屬於橫向貫穿所有已登入功能的行為需求）

## Definition of Done

- [ ] Acceptance criteria met
- [ ] Unit tests passing (>80% coverage)
- [ ] Code review approved
- [ ] Documentation updated

## Related

- [Epic Brief: E01 帳號與驗證](epic-brief.md)
- [NFR-002 資訊安全與身分驗證](../../non-functional/NFR-002-security.md)
