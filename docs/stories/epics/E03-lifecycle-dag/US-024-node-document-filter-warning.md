# US-024: 節點文件過濾與重複掛載警示

> **Story ID**: US-024
> **Epic**: [E03 循環池與 DAG 畫布維護](epic-brief.md)
> **Priority**: P0
> **Phase**: 1
> **Estimated Points**: 3

## User Story
As a ICSOP 管理員
I want 節點抽屜的文件候選清單自動過濾非本循環文件，並對已掛載於其他節點的文件顯示明確警示
So that 我不會誤將錯誤循環的文件掛載到節點上，也不會在未察覺的情況下覆蓋既有的節點掛載關係

## Acceptance Criteria

### AC1: 候選清單僅顯示同循環文件
- **Given** 系統中存在多個循環與多份 ICSOP 文件
- **When** 我在循環 A 的某節點抽屜開啟文件候選清單
- **Then** 清單僅顯示「所屬循環＝循環 A」的文件，循環 B、C 的文件不出現

### AC2: 未掛載文件直接完成掛載
- **Given** 候選清單中的文件 X 尚未掛載於任何節點
- **When** 我選取文件 X
- **Then** 系統直接完成掛載，不顯示警示

### AC3: 已掛載於其他節點顯示警示
- **Given** 候選清單中的文件 Y 已掛載於循環 A 的節點 N2
- **When** 我在節點 N1 的抽屜選取文件 Y
- **Then** 系統顯示警示「文件 Y 已掛載於節點 N2，是否要改派至此節點？」，並列出 N2 的節點名稱供辨識

### AC4: 確認改派後更新掛載關係
- **Given** 我已在警示對話框中確認改派
- **When** 系統執行改派
- **Then** 文件 Y 的「所屬節點」欄位更新為 N1，節點 N2 的候選清單/顯示中不再包含文件 Y

## Technical Notes
- 過濾邏輯建議於後端 API 層以查詢條件 `WHERE document.lifecycleId = :currentLifecycleId` 實作，不可僅靠前端過濾（避免繞過或資料外洩風險）。
- 重複掛載警示需查詢文件當前 `所屬節點` 是否已有值且不等於當前節點 ID，並在回應中附帶目前掛載節點的名稱供前端顯示。
- 此邏輯與 [US-023](US-023-node-drawer-maintenance.md) 共用同一 API，本 story 聚焦於過濾與警示規則本身的獨立驗收，便於單元測試涵蓋所有邊界情境。

## Test Cases
| ID | 情境 | 類型 |
|---|---|---|
| TC-024-01 | 循環 A 節點抽屜開啟候選清單，預期僅回傳循環 A 的文件 | Happy Path |
| TC-024-02 | 選取一份未掛載任何節點的文件，預期無警示、直接掛載成功 | Happy Path |
| TC-024-03 | 選取一份已掛載於同循環其他節點的文件，預期回傳警示且需二次確認 | Warning Case |
| TC-024-04 | 候選清單為空（循環內尚無任何文件所屬此循環），預期顯示「尚無可掛載文件」的空狀態提示，而非錯誤 | Edge Case |
| TC-024-05 | 文件的所屬循環於掛載後被他人於 E04 US-031 編輯變更為其他循環，預期該文件從原節點的顯示中被移除或標示不一致，需提示管理員重新確認節點掛載 | Edge Case |

## Dependencies
- **Blocked By**: [US-023 節點抽屜維護](US-023-node-drawer-maintenance.md)、[E04 US-030 建立 ICSOP 文件](../E04-icsop-document/US-030-create-icsop-document.md)
- **Blocks**: 無

## Definition of Done
- [ ] Acceptance criteria met
- [ ] Unit tests passing (>80% coverage)
- [ ] Code review approved
- [ ] Documentation updated

## Related
- Epic: [epic-brief.md](epic-brief.md)
- [US-023 節點抽屜維護](US-023-node-drawer-maintenance.md)
- [E04 US-031 編輯與版本對照](../E04-icsop-document/US-031-edit-with-comparison.md)
