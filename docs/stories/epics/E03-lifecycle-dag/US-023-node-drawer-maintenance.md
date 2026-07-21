# US-023: 節點抽屜維護

> **Story ID**: US-023
> **Epic**: [E03 循環池與 DAG 畫布維護](epic-brief.md)
> **Priority**: P0
> **Phase**: 1
> **Estimated Points**: 8

## User Story
As a ICSOP 管理員
I want 點擊 DAG 畫布上的節點時開啟抽屜（drawer），編輯節點名稱並掛載對應的 ICSOP 文件
So that 我可以將實際工作流程步驟與正式文件建立明確對應關係

## Acceptance Criteria

### AC1: 點擊節點開啟抽屜
- **Given** 我在循環的 DAG 畫布上
- **When** 我點擊某個節點
- **Then** 系統從畫面右側滑出抽屜，顯示該節點的名稱欄位與目前已掛載的 ICSOP 文件清單

### AC2: 編輯節點名稱即時同步
- **Given** 抽屜已開啟
- **When** 我修改節點名稱並儲存
- **Then** 畫布上該節點的顯示名稱即時更新

### AC3: 文件候選清單過濾至當前循環
- **Given** 抽屜的文件選擇清單
- **When** 我開啟文件下拉選單
- **Then** 系統僅列出「所屬循環＝當前循環」的 ICSOP 文件（過濾非該循環的文件），詳見 [US-024](US-024-node-document-filter-warning.md)

### AC4: 已掛載於其他節點的文件需二次確認改派
- **Given** 我在候選清單中選擇一份文件
- **When** 該文件已被設定於其他節點
- **Then** 系統顯示警示訊息並要求二次確認後才完成改派（此文件將從原節點移除，改掛載至當前節點）

### AC5: 關閉抽屜保存並記錄稽核
- **Given** 我已完成節點名稱與文件掛載的變更
- **When** 我關閉抽屜
- **Then** 系統保存變更並記錄操作者與時間

## Technical Notes
- 抽屜為前端 UI 元件（如 Drawer/Sidebar），開啟時透過 `GET /lifecycles/:id/nodes/:nodeId` 取得節點詳情與候選文件清單。
- 儲存採單一 API `PATCH /lifecycles/:id/nodes/:nodeId`，同時更新節點名稱與掛載文件（更新對應 ICSOP 文件的 `所屬節點` 欄位）。
- 因文件的「所屬節點」欄位具唯一性（一份文件僅屬一個節點），改派操作需在資料庫交易中同時處理「解除原節點掛載」與「建立新節點掛載」，避免中間態不一致。
- **權威寫入路徑（定案）**：文件的 `所屬循環` 於 [E04 US-030](../E04-icsop-document/US-030-create-icsop-document.md) 建立時選定（必填）；`所屬節點` 則以本抽屜為**唯一權威寫入路徑**（掛載／改派），文件編輯頁（US-031）僅唯讀顯示目前節點並提供跳轉至畫布，不在文件表單直接改節點。

## Test Cases
| ID | 情境 | 類型 |
|---|---|---|
| TC-023-01 | 點擊節點開啟抽屜，編輯名稱並儲存，預期畫布與資料庫同步更新 | Happy Path |
| TC-023-02 | 從候選清單掛載一份尚未被任何節點掛載的文件，預期成功掛載 | Happy Path |
| TC-023-03 | 選擇已掛載於其他節點的文件但未確認警示提示直接嘗試儲存，預期系統阻擋並要求先行確認 | Error Case |
| TC-023-04 | 確認警示後完成改派，預期原節點的文件掛載關係被移除，新節點正確顯示該文件 | Happy Path |
| TC-023-05 | 同時有兩位管理員開啟同一節點抽屜並各自嘗試掛載不同文件，預期後端以樂觀鎖或交易序列化避免資料衝突 | Edge Case |

## Dependencies
- **Blocked By**: [US-021 DAG 節點與連線維護](US-021-dag-node-edge-maintenance.md)、[E04 US-030 建立 ICSOP 文件](../E04-icsop-document/US-030-create-icsop-document.md)（需已有文件可供掛載）
- **Blocks**: [US-024 節點文件過濾與重複掛載警示](US-024-node-document-filter-warning.md)

## Definition of Done
- [ ] Acceptance criteria met
- [ ] Unit tests passing (>80% coverage)
- [ ] Code review approved
- [ ] Documentation updated

## Related
- Epic: [epic-brief.md](epic-brief.md)
- [US-024 節點文件過濾與重複掛載警示](US-024-node-document-filter-warning.md)
- [E04 US-030 建立 ICSOP 文件](../E04-icsop-document/US-030-create-icsop-document.md)
