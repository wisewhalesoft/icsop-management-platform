# F002: 登入後角色分流導向
Priority: P0-MVP | Status: Draft | Last Updated: 2026-07-15
Epic/Story: E01 / US-003

## Description
登入成功後依角色自動導向：一般使用者直接進前台瀏覽頁；其餘四種管理類角色先顯示「瀏覽頁 / 管理後台」選擇畫面，進後台時僅顯示該角色有權限的功能選單。

## Preconditions
- 使用者已完成 F001 登入，JWT/session 內含有效角色資訊。
- 角色×功能矩陣（F025）已定義。

## Main Flow
1. 讀取 JWT/session 中的角色。
2. 角色為 `User` → 直接導向前台瀏覽頁（F019），不顯示選擇畫面。
3. 角色為 `SysAdmin/ICSOPAdmin/Supervisor/DeptContact` → 顯示「瀏覽頁 / 管理後台」選擇畫面。
4. 選擇管理後台 → 後台載入，僅顯示依 F025 有權限的功能選單。
5. 選擇瀏覽頁 → 導向前台，套用該使用者部門置頂邏輯（F019）。

## Alternative Flows
- 管理類角色選「瀏覽頁」：以自身身分/部門呈現前台（非模擬他人）。

## Edge Cases
- JWT 角色資訊遺失/無效：導回登入頁並提示重新登入。

## Postconditions
- 使用者位於與其角色一致的入口畫面，後台選單僅含有權限項目。

## Acceptance Criteria
- Given 角色為一般使用者且登入成功, When 登入完成, Then 直接導向前台瀏覽頁，不顯示選擇畫面。
- Given 角色為管理類之一且登入成功, When 登入完成, Then 顯示「瀏覽頁/管理後台」選擇畫面。
- Given 管理類角色選擇管理後台, When 後台載入, Then 僅顯示 F025 有權限的功能選單。
- Given JWT 角色遺失或無效, When 導向判定, Then 導回登入頁並提示重新登入。

## Error Scenarios
- 前端隱藏選單不可作為唯一防線：導向邏輯須前端路由＋後端 API 權限雙重把關（見 [error-handling.md#permission](../error-handling.md#permission)）。

## Related
- Data: [ROLE](../data-model.md#role-entity), [ACCOUNT](../data-model.md#account-entity)
- Depends on: [F001](F001-auth-login-session.md), [F025 角色×功能矩陣](F025-role-function-matrix.md)
- Next: [F019 前台清單](F019-public-list-browsing.md)
