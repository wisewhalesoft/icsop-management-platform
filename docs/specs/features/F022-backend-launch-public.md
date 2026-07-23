# F022: 後台開啟前台瀏覽頁
Priority: P2 | Status: 已實作（unit 綠；新視窗入口＋封鎖 fallback，真瀏覽器分頁行為＝[integration]，見 implementation-logs/public-F019-F022-impl.md） | Last Updated: 2026-07-23
Epic/Story: E06 / US-056（Phase 2）

## Description
便利性功能：管理後台提供入口，於新視窗/分頁開啟前台瀏覽頁，供管理者快速預覽前台呈現效果，無需登出或切換帳號。前台頁以當前登入身分呈現（非模擬他人）。

## Preconditions
- 具後台存取權角色（SysAdmin/ICSOPAdmin/Supervisor/DeptContact）已登入（F001/F002）。
- 前台頁（F019）已具備。

## Main Flow
1. 後台點擊「瀏覽文件網頁」選單。
2. 以新視窗/分頁開啟前台瀏覽頁（帶既有 session/JWT），後台原分頁不受影響。
3. 前台以該角色自身身分/部門呈現（清單置頂排序依管理者自己的使用部門）。

## Alternative Flows
- 瀏覽器封鎖彈出視窗：提供替代提示（如「請允許彈出視窗」或改同分頁開新分頁）。

## Edge Cases
- 管理者無明確使用部門：前台排序退回純編號降冪（比照 F019 無相符情境）。

## Postconditions
- 管理者於新視窗檢視前台，後台狀態保留。

## Acceptance Criteria
- Given 後台已登入, When 點擊入口, Then 新視窗開啟前台頁，後台分頁維持原狀。
- Given 管理角色開啟前台頁, When 前台載入, Then 依管理者自身部門置頂排序（非模擬他人）。
- Given 瀏覽器封鎖彈出視窗, When 開啟失敗, Then 提供替代提示。

## Error Scenarios
- 彈出視窗被封鎖：見 [error-handling.md#public](../error-handling.md#public)。

## Related
- Depends on: [F019](F019-public-list-browsing.md), [F001](F001-auth-login-session.md)
