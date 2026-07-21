# US-035: 文件連結點管理

> **Story ID**: US-035
> **Epic**: [E04 ICSOP 文件管理](epic-brief.md)
> **Priority**: P1 (Should Have)
> **Phase**: 1
> **Estimated Points**: 5

## User Story

As a **ICSOP 管理員**,
I want **在一筆 ICSOP 文件上新增多個連結點，連到系統中其他 ICSOP 文件**,
So that **使用者於前台檢視文件時能快速導覽至相關聯的其他文件**。

## Acceptance Criteria

**AC1 — 新增連結點**
- Given 我編輯一筆 ICSOP 文件
- When 我搜尋並選擇系統中既存的另一筆文件作為連結點
- Then 系統成功新增此連結關聯，且可重複新增多個連結點

**AC2 — 移除連結點**
- Given 一筆文件已有一個或多個連結點
- When 我選擇移除其中一個連結點
- Then 該筆連結關聯被移除，其餘連結點不受影響

**AC3 — 連結目標限制**
- Given 我嘗試新增連結點
- When 選擇的目標文件不存在於系統中（例如已被刪除）
- Then 系統阻擋新增並提示目標無效

## Technical Notes

- 連結為單向或雙向關係未於原始需求明確定義，草案假設為單向（A 連到 B 不代表 B 自動連回 A），列為 Open Question
- 連結點是否允許連到「已作廢」或「已失效」文件為 Open Question；草案建議允許連結但於前台顯示時標示目標文件狀態
- 連結點不同於「所屬循環／所屬節點」的樹狀歸屬關係，純粹是文件間的關聯導覽用途

## Test Cases

- **TC-035-01（Happy Path）**：新增 2 個連結點至其他既存文件，儲存成功
- **TC-035-02（Happy Path）**：移除其中 1 個連結點，僅該筆被移除
- **TC-035-03（Error）**：嘗試連結一個不存在的文件 ID，系統阻擋並提示
- **TC-035-04（Edge）**：連結目標文件狀態為「作廢」，系統允許新增但於清單標示目標狀態供管理員辨識

## Dependencies

**Blocked By**:
- [US-030 建立 ICSOP 文件](US-030-create-icsop-document.md)（需有多筆既存文件才可互相連結）

**Blocks**: 無直接下游 story，供前台文件檢視頁面（[E06](../E06-public-browsing/epic-brief.md)）顯示關聯文件之用

## Definition of Done

- [ ] Acceptance criteria met
- [ ] Unit tests passing (>80% coverage)
- [ ] Code review approved
- [ ] Documentation updated

## Related

- [Epic Brief: E04 ICSOP 文件管理](epic-brief.md)
- [US-030 建立 ICSOP 文件](US-030-create-icsop-document.md)
