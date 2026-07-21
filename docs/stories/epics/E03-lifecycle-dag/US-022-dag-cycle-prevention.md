# US-022: DAG 防環驗證

> **Story ID**: US-022
> **Epic**: [E03 循環池與 DAG 畫布維護](epic-brief.md)
> **Priority**: P0
> **Phase**: 1
> **Estimated Points**: 5

## User Story
As a ICSOP 管理員
I want 系統在我新增或編輯節點連線時自動驗證是否會造成環（cycle）
So that 循環結構永遠維持有向無環圖（DAG），不會產生邏輯上矛盾的工作流程

## Acceptance Criteria

### AC1: 阻擋間接成環連線
- **Given** 畫布上已有 A → B → C 的連線
- **When** 我嘗試新增 C → A 的連線
- **Then** 系統偵測到此連線會造成環，拒絕建立並提示「此連線會造成循環結構成環，請重新確認流程方向」

### AC2: 阻擋直接雙向成環
- **Given** 畫布上已有 A → B 的連線
- **When** 我嘗試新增 B → A 的連線
- **Then** 系統拒絕（雙向直接環）

### AC3: 允許合法連線
- **Given** 一個不會造成環的合法連線（如 A → D，D 為新節點）
- **When** 我送出連線請求
- **Then** 系統成功建立，不受此驗證阻擋

### AC4: 前端即時提示 + 後端權威驗證
- **Given** 前端已允許使用者以拖曳方式預覽連線
- **When** 使用者放開滑鼠送出連線
- **Then** 前端先行做基本防環檢查以提供即時回饋，後端仍須做權威性（authoritative）驗證，不可僅信任前端結果

## Technical Notes
- 防環演算法：新增邊 (source→target) 前，對圖執行由 target 出發的可達性搜尋（BFS/DFS），若可達 source 則表示會成環，拒絕該邊。
- 驗證必須在後端 API（NestJS Service 層）以資料庫交易內的權威檢查為準，前端僅作 UX 上的即時提示，避免 race condition 或繞過前端直接呼叫 API 產生環。
- 建議將圖驗證邏輯封裝為獨立可測試的 domain service（如 `DagCycleValidator`），供 US-021 新增邊與批次匯入等情境共用。

## Test Cases
| ID | 情境 | 類型 |
|---|---|---|
| TC-022-01 | 新增不造成環的合法連線，預期成功建立 | Happy Path |
| TC-022-02 | 新增直接造成環的連線（B→A，已存在 A→B），預期後端回傳 400/409 並附錯誤訊息 | Error Case |
| TC-022-03 | 新增間接造成環的連線（跨三個以上節點形成環路），預期同樣被攔截 | Error Case |
| TC-022-04 | 前端因網路延遲允許使用者提交一個已在其他分頁中被建立、實際會成環的連線，預期後端仍正確拒絕 | Edge Case |
| TC-022-05 | 單一節點對自身建立連線（self-loop），視為成環的特例，預期一併被拒絕 | Edge Case |

## Dependencies
- **Blocked By**: [US-021 DAG 節點與連線維護](US-021-dag-node-edge-maintenance.md)
- **Blocks**: 無（此為驗證規則，直接內嵌於 US-021 的連線建立流程中）

## Definition of Done
- [ ] Acceptance criteria met
- [ ] Unit tests passing (>80% coverage)
- [ ] Code review approved
- [ ] Documentation updated

## Related
- Epic: [epic-brief.md](epic-brief.md)
- [US-021 DAG 節點與連線維護](US-021-dag-node-edge-maintenance.md)
