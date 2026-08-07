# F008: DAG 節點與連線維護（含防環）
Priority: P0-MVP | Status: Draft｜**循環子分類顯示 delta：🟢 APPROVED（2026-08-07 人類閘門通過，含 4 項裁決）** | Last Updated: 2026-08-07
Epic/Story: E03 / US-021, US-022

> **2026-08-07 additive delta**：畫布頁首之循環標題與結構事件之名稱快照須含子分類。規則權威＝[F040](F040-lifecycle-subcategory.md)；DAG 模型、防環邏輯與既有條款皆不變。

> 合併理由：防環驗證（US-022）內嵌於連線建立流程（US-021），合為單一 feature。畫布採 React Flow 類套件、top-down（TB）佈局。

## Description
ICSOP 管理員在循環 DAG 畫布上新增/刪除節點、以箭頭建立父子有向邊（parent→child），支援節點多 parent/多 child；系統於新增/編輯連線時自動驗證是否成環，維持有向無環圖。**連線樣式（OQ-E03-09 定案）**：一律採 **直角（orthogonal / elbow / step）箭頭連線**，非曲線／貝茲曲線——與唯讀預覽（[F036](F036-lifecycle-tree-preview.md)）及變更歷程新舊樹（[F038](F038-lifecycle-tree-change-history.md)）**全系統一致**。

## Preconditions
- 已存在循環（F007），使用者在該循環 DAG 畫布編輯頁。

## Main Flow
1. 新增節點：畫布新增未命名節點，可拖曳調整位置（持久化座標）。
2. 建立有向邊：從節點 A 拖曳連線至 B → 建立 A→B（箭頭上到下，**直角 elbow 樣式**）。
3. 多 parent/多 child：允許同一節點多條匯入/匯出邊。
4. 新增邊送出時：前端即時基本防環提示 → 後端於交易內權威驗證（由 target 出發可達性搜尋，若可達 source 則成環）。
5. 通過驗證 → 寫入 `LIFECYCLE_EDGE`。

## Alternative Flows
- 刪除節點：連動刪除相關聯的邊；若節點已掛載 N 份文件，提示「刪除後將一併移除掛載關係」並要求確認。

## Edge Cases
- 自我連線（self-loop）：視為成環特例，拒絕。
- 前端因延遲允許提交一個實際會成環（他分頁已建立）的連線：後端仍正確拒絕。

## Postconditions
- 資料庫中該循環所有邊構成 DAG，不存在任何成環邊（invariant）。

## Acceptance Criteria
- Given 畫布編輯頁, When 新增節點並命名, Then 節點持久化並顯示於畫布。
- Given 已有節點 A、B, When 由 A 連線至 B, Then 建立方向正確之 A→B 邊，並以**直角（elbow/step）箭頭**呈現（非曲線），與 F036/F038 樣式一致。
- Given 節點 C 已有多個 parent, When 再連入一節點, Then 允許多 parent，畫布正確呈現。
- Given 已有 A→B→C, When 嘗試新增 C→A, Then 後端偵測成環、拒絕、回 `DAG_CYCLE_DETECTED`。
- Given 已有 A→B, When 嘗試新增 B→A, Then 拒絕（直接雙向環）。
- Given 嘗試節點連向自己, When 送出, Then 回 `DAG_SELF_LOOP`。
- Given 合法不成環連線, When 送出, Then 成功建立，不受驗證阻擋。
- Given 前端已預覽連線, When 送出, Then 後端仍做權威驗證，不僅信任前端。

### 循環子分類 delta（🟢 APPROVED 2026-08-07；規則權威＝[F040](F040-lifecycle-subcategory.md)）

- **AC-S1**：Given 進入一個有子分類之循環的 DAG 畫布編輯頁, When 渲染頁首標題與麵包屑, Then 循環名稱顯示為 `lifecycleDisplayName` 之輸出（如 `銷售及收款循環（消金）· DAG 畫布`）；Given 該循環無子分類, Then 顯示為 `銷售及收款循環 · DAG 畫布`（不含括號）。畫布之節點/邊資料與防環邏輯**完全不受子分類影響**（DAG 恆屬單一 `lifecycleId`）。
- **AC-S2**：Given 於該循環新增／刪除節點或連線, When 事件寫入 `LIFECYCLE_CHANGE_LOG`, Then 其 `lifecycleName` 快照值為 `lifecycleDisplayName` 之輸出（含子分類），使歷史事件可唯一辨識所屬循環（[F040](F040-lifecycle-subcategory.md) AC-34）。

## Error Scenarios
- 成環/自環：見 [error-handling.md#dag](../error-handling.md#dag)（`DAG_CYCLE_DETECTED`, `DAG_SELF_LOOP`）。

## Related
- Diagram: [../diagrams/F008-dag-cycle-prevention.mmd](../diagrams/F008-dag-cycle-prevention.mmd)
- Data: [LIFECYCLE_NODE](../data-model.md#node-entity), [LIFECYCLE_EDGE](../data-model.md#edge-entity)
- **循環子分類規則權威**: [F040](F040-lifecycle-subcategory.md)（標題顯示與 `LIFECYCLE_CHANGE_LOG.lifecycleName` 快照）
- Depends on: [F007](F007-lifecycle-pool-crud.md); Blocks: [F009](F009-node-drawer-maintenance.md), [F038](F038-lifecycle-tree-change-history.md)（結構變更事件來源）
- Related: 連線樣式與 [F036](F036-lifecycle-tree-preview.md)／[F038](F038-lifecycle-tree-change-history.md) 一致（直角 elbow）
- NFR: [效能（畫布 <200 節點）](../nfr.md#performance), [瀏覽器（桌機為主，平板不強制編輯）](../nfr.md#browser-rwd)
- 定案: **OQ-E03-09（連線樣式統一為直角 elbow，全系統一致）**、OQ-NFR005（桌機為主、平板不強制編輯）
