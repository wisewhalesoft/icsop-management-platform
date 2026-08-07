# F009: 節點抽屜維護與文件過濾警示
Priority: P0-MVP | Status: Draft｜**循環子分類顯示 delta：🟢 APPROVED（2026-08-07 人類閘門通過，含 4 項裁決）** | Last Updated: 2026-08-07
Epic/Story: E03 / US-023, US-024

> **2026-08-07 additive delta**：抽屜頁首與候選過濾提示之循環名稱須含子分類。規則權威＝[F040](F040-lifecycle-subcategory.md)；候選過濾以 `lifecycleId` 為準之既有機制與其餘條款皆不變。

> 合併理由：抽屜維護（US-023）與候選過濾/重複掛載警示（US-024）共用同一 API 與交易。**本 feature 為文件「所屬節點」的唯一權威寫入路徑（定案）。**

## Description
點擊 DAG 節點開啟抽屜，編輯節點名稱並掛載對應 ICSOP 文件。候選清單僅顯示「所屬循環＝當前循環」的文件；選取已掛載於其他節點的文件時，顯示警示並要求二次確認後改派（同一交易解除原節點、綁定新節點）。

## Preconditions
- 節點已存在（F008）；已有屬於當前循環的文件（F010）可供掛載。
- 操作者為 ICSOP 管理員。

## Main Flow
1. 點擊節點 → 右側抽屜滑出，顯示節點名稱與目前掛載文件清單。
2. `GET /lifecycles/:id/nodes/:nodeId` 取得節點詳情與候選文件（後端以 `lifecycleId` 過濾）。
3. 編輯節點名稱 → 畫布即時更新。
4. 從候選清單選取文件：
   - 未掛載於任何節點 → 直接完成掛載，不顯示警示。
   - 已掛載於其他節點 N2 → 顯示警示（附 N2 名稱），二次確認後改派。
5. 關閉抽屜送出：`PATCH /lifecycles/:id/nodes/:nodeId` 同時更新節點名稱與掛載；改派於交易內「解除原節點＋綁定新節點」。
6. 保存並記錄操作者/時間（稽核）。

## Alternative Flows
- 候選清單為空：顯示「尚無可掛載文件」空狀態，而非錯誤。

## Edge Cases
- 兩位管理員同時開啟同一節點抽屜各自掛載：以樂觀鎖/交易序列化避免衝突。
- 文件所屬循環於掛載後被 F011 改為其他循環：該文件從原節點顯示中移除或標示不一致，提示重新確認。

## Postconditions
- 文件「所屬節點」唯一（一份文件僅屬一個節點）；改派後原節點不再顯示該文件。

## Acceptance Criteria
- Given 點擊節點, When 抽屜開啟, Then 顯示節點名稱與已掛載文件清單。
- Given 抽屜開啟, When 修改名稱並儲存, Then 畫布即時更新且持久化。
- Given 開啟候選清單, When 載入, Then 僅顯示所屬循環＝當前循環之文件（後端過濾）。
- Given 選取未掛載文件, When 掛載, Then 直接完成，不顯示警示。
- Given 選取已掛載於其他節點之文件, When 選取, Then 顯示警示（附原節點名）並要求二次確認。
- Given 未確認警示即嘗試儲存, When 送出, Then 阻擋並要求先確認（`NODE_DOC_ALREADY_ASSIGNED`）。
- Given 確認改派, When 執行, Then 原節點掛載被移除、新節點正確顯示該文件。
- Given 候選清單為空, When 開啟, Then 顯示空狀態提示而非錯誤。

### 循環子分類 delta（🟢 APPROVED 2026-08-07；規則權威＝[F040](F040-lifecycle-subcategory.md)）

- **AC-S1**：Given 於一個有子分類之循環開啟節點抽屜, When 渲染頁首與「僅顯示所屬循環＝… 之文件」之過濾提示, Then 循環名稱一律為 `lifecycleDisplayName` 之輸出（如 `銷售及收款循環（消金）`）；候選過濾之比對鍵仍為 `lifecycleId`（**非**名稱字串），故同名不同子分類之文件**不會**互相出現在對方候選清單中；掛載／改派事件寫入 `LIFECYCLE_CHANGE_LOG` 時，`lifecycleName` 快照同為該輸出（[F040](F040-lifecycle-subcategory.md) AC-34）。

## Error Scenarios
- 過濾/重複掛載/改派原子性：見 [error-handling.md#node-assign](../error-handling.md#node-assign)（`NODE_DOC_LIFECYCLE_MISMATCH`, `NODE_DOC_ALREADY_ASSIGNED`）。

## Related
- Diagram: [../diagrams/F009-node-reassign.mmd](../diagrams/F009-node-reassign.mmd)
- Data: [LIFECYCLE_NODE](../data-model.md#node-entity), [ICSOP_DOCUMENT 所屬節點](../data-model.md#document-entity)
- **循環子分類規則權威**: [F040](F040-lifecycle-subcategory.md)（抽屜標題／過濾提示之顯示、事件名稱快照）
- Depends on: [F008](F008-dag-node-edge.md), [F010](F010-create-document.md)
- Related: [F011 編輯（節點欄位唯讀顯示＋跳轉）](F011-edit-with-comparison.md)
