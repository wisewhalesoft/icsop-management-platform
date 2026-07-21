# US-003: 登入後角色導向

> **Story ID**: US-003
> **Epic**: [E01 帳號與驗證](epic-brief.md)
> **Priority**: P0
> **Phase**: 1
> **Estimated Points**: 3

## User Story

As a 已登入使用者,
I want 登入成功後依我的角色自動導向合適的畫面,
So that 我不需要自行判斷該進入前台瀏覽頁還是管理後台。

## Acceptance Criteria

### AC1：一般使用者直接導向前台
**Given** 使用者角色為「一般使用者」且登入成功
**When** 登入流程完成
**Then** 系統直接導向前台瀏覽頁（見 [E06 US-050](../E06-public-browsing/US-050-public-list-sorting.md)），不顯示選擇畫面。

### AC2：管理類角色顯示選擇畫面
**Given** 使用者角色為系統管理員、ICSOP管理員、主管或部門窗口之一，且登入成功
**When** 登入流程完成
**Then** 系統顯示「瀏覽頁 / 管理後台」選擇畫面，由使用者自行選擇進入路徑。

### AC3：選擇管理後台時依角色顯示對應功能
**Given** 管理類角色使用者選擇進入「管理後台」
**When** 後台頁面載入
**Then** 系統僅顯示該角色依 [E08 US-070 角色×功能權限矩陣](../E08-permission-matrix/US-070-role-function-matrix.md) 有權限存取的功能選單。

## Technical Notes

- 導向邏輯應於前端路由層與後端 API 權限層雙重把關，避免僅前端隱藏選單造成的越權風險。
- 角色資訊應包含於 JWT payload 或 session 中，避免每次導向都重新查詢資料庫。

## Test Cases

| ID | 情境 | 類型 |
|---|---|---|
| TC-003-01 | 一般使用者登入 → 直接進入前台瀏覽頁 | Happy Path |
| TC-003-02 | 系統管理員登入 → 顯示選擇畫面 | Happy Path |
| TC-003-03 | ICSOP管理員選擇管理後台 → 僅顯示其權限範圍內的功能選單 | Happy Path |
| TC-003-04 | JWT 中角色資訊遺失或無效 → 導回登入頁並提示重新登入 | Error Case |
| TC-003-05 | 主管角色選擇「瀏覽頁」→ 導向前台，且前台清單套用其部門置頂邏輯（見 [E06 US-050](../E06-public-browsing/US-050-public-list-sorting.md)） | Edge Case |

## Dependencies

- **Blocked By**：[US-001 Azure AD OIDC 登入（靜默 SSO）](US-001-upstream-signature-login.md)、[US-002 管理員帳密登入](US-002-admin-password-login.md)、[E08 US-070 角色×功能權限矩陣](../E08-permission-matrix/US-070-role-function-matrix.md)
- **Blocks**：[E06 US-050 前台清單與排序規則](../E06-public-browsing/US-050-public-list-sorting.md)、[E06 US-056 後台開啟前台瀏覽頁](../E06-public-browsing/US-056-backend-launch-public-page.md)

## Definition of Done

- [ ] Acceptance criteria met
- [ ] Unit tests passing (>80% coverage)
- [ ] Code review approved
- [ ] Documentation updated

## Related

- [Epic Brief: E01 帳號與驗證](epic-brief.md)
- [E08 US-070 角色×功能權限矩陣](../E08-permission-matrix/US-070-role-function-matrix.md)
- [E06 US-050 前台清單與排序規則](../E06-public-browsing/US-050-public-list-sorting.md)
