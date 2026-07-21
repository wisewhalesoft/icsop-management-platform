# US-021: DAG 節點與連線維護

> **Story ID**: US-021
> **Epic**: [E03 循環池與 DAG 畫布維護](epic-brief.md)
> **Priority**: P0
> **Phase**: 1
> **Estimated Points**: 8

## User Story
As a ICSOP 管理員
I want 在循環的 DAG 畫布上新增／刪除節點，並以箭頭連接節點建立父子關係
So that 我可以將實際工作流程視覺化地建模為循環結構，供後續掛載 ICSOP 文件

## Acceptance Criteria

### AC1: 新增節點
- **Given** 我在某循環的 DAG 畫布編輯頁
- **When** 我點擊「新增節點」
- **Then** 畫布上新增一個未命名節點，並可拖曳調整其位置

### AC2: 建立有向邊（parent → child）
- **Given** 畫布上已有節點 A 與節點 B
- **When** 我從 A 拖曳出一條連線至 B
- **Then** 系統建立 A → B 的有向邊，箭頭方向由上（parent）指向下（child）

### AC3: 多 parent 支援
- **Given** 節點 C 已有兩個 parent（A、B）
- **When** 我再將節點 D 連接至 C
- **Then** 系統允許 C 擁有多個 parent，畫布正確呈現三條匯入 C 的邊

### AC4: 刪除節點連動移除邊與掛載提示
- **Given** 節點已建立連線
- **When** 我刪除某個節點
- **Then** 系統同時刪除該節點所有相關聯的邊，並提示「此節點已掛載 N 份文件，刪除後將一併移除掛載關係」（如適用）

## Technical Notes
- 前端採 React Flow 類套件（技術棧既定）實作 DAG 畫布，佈局方向設定為 top-to-bottom（`direction: 'TB'`）。
- 節點/邊資料需持久化：`lifecycle_node (id, lifecycleId, name, positionX, positionY)`、`lifecycle_edge (id, lifecycleId, sourceNodeId, targetNodeId)`。
- 新增邊的 API 呼叫需先經過 [US-022 DAG 防環驗證](US-022-dag-cycle-prevention.md) 才可寫入。
- 畫布操作（新增/刪除節點、連線）建議採樂觀更新 + 後端驗證失敗回滾的互動模式。

## Test Cases
| ID | 情境 | 類型 |
|---|---|---|
| TC-021-01 | 新增節點並命名，預期節點成功持久化並顯示於畫布 | Happy Path |
| TC-021-02 | 連接兩節點建立有向邊，預期邊成功建立且方向正確（parent→child） | Happy Path |
| TC-021-03 | 一節點同時連接多個 parent 與多個 child，預期畫布正確呈現且資料庫邊筆數正確 | Happy Path |
| TC-021-04 | 嘗試建立自我連線（節點連向自己），預期系統拒絕並提示錯誤 | Error Case |
| TC-021-05 | 刪除一個已掛載 ICSOP 文件（見 US-023）的節點，預期系統提示掛載關係將被移除並要求確認 | Edge Case |

## Dependencies
- **Blocked By**: [US-020 循環池 CRUD](US-020-lifecycle-pool-crud.md)
- **Blocks**: [US-022 DAG 防環驗證](US-022-dag-cycle-prevention.md)、[US-023 節點抽屜維護](US-023-node-drawer-maintenance.md)

## Definition of Done
- [ ] Acceptance criteria met
- [ ] Unit tests passing (>80% coverage)
- [ ] Code review approved
- [ ] Documentation updated

## Related
- Epic: [epic-brief.md](epic-brief.md)
- [US-022 DAG 防環驗證](US-022-dag-cycle-prevention.md)
- [US-023 節點抽屜維護](US-023-node-drawer-maintenance.md)
