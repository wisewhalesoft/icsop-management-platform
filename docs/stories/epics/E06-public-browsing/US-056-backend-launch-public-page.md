# US-056: 後台開啟前台瀏覽頁

> **Story ID**: US-056
> **Epic**: [E06 前台RWD瀏覽](epic-brief.md)
> **Priority**: P2
> **Phase**: 2
> **Estimated Points**: 2

## User Story

As a 系統管理員或ICSOP管理員,
I want 在管理後台提供一個入口，可於新視窗開啟一般使用者瀏覽文件網頁,
So that 我能快速預覽前台呈現效果，而不需另外登出/切換帳號或另開瀏覽器分頁手動導覽。

## Acceptance Criteria

### AC1：後台提供新視窗開啟入口

**Given** 具備後台存取權限之角色（系統管理員/ICSOP管理員/主管/部門窗口）已登入後台
**When** 點擊「瀏覽文件網頁」選單項目
**Then** 系統以新視窗/新分頁開啟前台瀏覽頁，後台原分頁不受影響。

### AC2：前台頁面以當前登入身分呈現

**Given** 管理角色開啟前台瀏覽頁
**When** 前台頁面載入
**Then** 清單排序、可見文件範圍等行為與該角色自身身分一致（即以管理者自己的使用部門進行置頂排序），而非模擬其他使用者身分。

## Technical Notes

- 屬便利性功能，不影響核心業務邏輯；技術上可直接以 `window.open()` 開啟前台路由並帶入既有 session/JWT。

## Test Cases

| ID | 情境 | 類型 |
|---|---|---|
| TC-056-01 | 後台點擊入口 → 新視窗開啟前台頁，後台分頁維持原狀 | Happy Path |
| TC-056-02 | 開啟前台頁後，清單依管理者自身部門置頂排序 | Happy Path |
| TC-056-03 | 瀏覽器封鎖彈出視窗時 → 提供替代提示（如「請允許彈出視窗」或改為同分頁新分頁開啟） | Error Case |

## Dependencies

- **Blocked By**：[US-050 前台清單與排序規則](US-050-public-list-sorting.md)、[E01 帳號與驗證](../E01-account-auth/epic-brief.md)
- **Blocks**：無

## Definition of Done

- [ ] Acceptance criteria met
- [ ] Unit tests passing (>80% coverage)
- [ ] Code review approved
- [ ] Documentation updated

## Related

- [Epic Brief: E06 前台RWD瀏覽](epic-brief.md)
- [E01 帳號與驗證](../E01-account-auth/epic-brief.md)
