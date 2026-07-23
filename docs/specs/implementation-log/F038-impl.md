---
type: implementation-log
feature_id: F038
feature_name: 循環樹狀圖變更歷程（DAG 結構事件日誌 + 預覽）
status: partial
last_updated: 2026-07-23
---

# F038: 循環樹狀圖變更歷程 — Implementation Log（changehistory worktree）

本輪新建 DAG 結構變更事件 seam，把 F008/F009 之節點/連線/文件掛載異動發為 `LifecycleChangedEvent`，持久化為新表 `LIFECYCLE_CHANGE_LOG`（append-only），並提供查詢 API＋前端「循環樹狀圖」tab（prototype 23）＋預覽（重用 F036 樹圖渲染）＋ `LIFECYCLE_CHANGELOG_VIEW` 稽核。與 F037 共用 change-history 模組。

## 本輪實作

### 結構變更 seam（比照 F037/document seam）
- `lifecycle/lifecycle-change-event.ts`：`LifecycleChangedEvent{lifecycleId, changeType, summary, oldValue?, newValue?, nodeId?, actor 快照, occurredAt}`；`changeType` 逐字沿用 spec 草案列舉（NODE_ADDED/NODE_REMOVED/NODE_RENAMED/EDGE_ADDED/EDGE_REMOVED/DOCUMENT_MOUNTED/DOCUMENT_REASSIGNED/DOCUMENT_UNMOUNTED）；token `LIFECYCLE_CHANGE_PUBLISHER`＋預設 `NoopLifecycleChangePublisher`。
- `DagService`（F008）：`@Optional` 注入 publisher＋clock；`addNode/updateNode(改名)/deleteNode/addEdge/deleteEdge` 於持久化後發事件，摘要含節點名（邊事件以 listNodes 反查名稱）。**位置拖曳（僅 positionX/Y）不發事件**（佈局非結構變更）。改名/刪除以 lifecycleId 預讀舊名。
- `NodeDocsService`（F009）：`mount`→`DOCUMENT_MOUNTED`（新掛）/`DOCUMENT_REASSIGNED`（已掛他節點 confirm）；`unmount`→`DOCUMENT_UNMOUNTED`；已在本節點 no-op 不發事件。
- `DagController`/`NodeDocsController`：加 `@Req()`＋`actorOf(req)`；updateNode/deleteNode/deleteEdge 帶 `{lifecycleId, actor}`。既有服務簽名以尾端選填參數擴充（不破壞既有 2/3 參呼叫）。

### 落地與查詢（change-history 模組）
- 實體/表 `LIFECYCLE_CHANGE_LOG`（entity + migration `1722729600000`，unique）：`lifecycleId/changeType/summary/oldValue/newValue/nodeId/actor 快照/occurredAt`；索引 lifecycleId、occurredAt、(lifecycleId,occurredAt)。
- `LifecycleChangeLogStore`（append-only 介面）＋TypeOrm 實作＋純 `buildLifecycleChangeLogRow`。
- `LifecycleChangeLogPublisher`（真實）：lifecycle.module `useExisting` 覆寫 `LIFECYCLE_CHANGE_PUBLISHER`；`DagService`/`NodeDocsService` 改 useFactory 注入真 publisher＋clock。
- `LifecycleChangeHistoryService`：`queryChanges`（純 `filterLifecycleChanges`）；`viewLifecycle(id,name,actor)`（記 `LIFECYCLE_CHANGELOG_VIEW`，targetId=lifecycleId）。
- `ChangeHistoryController`：`GET /admin/change-history/lifecycles`（清單）、`GET .../lifecycles/:lifecycleId`（記稽核）。

### 前端（prototype 23）
- 「循環樹狀圖」tab：篩選（循環別/變更類型/操作人/起始）＋表格（循環別/類型/摘要/操作人/時間/預覽·下載）。**變更類型 6 分類客端過濾**（文件掛載變更＝MOUNTED/REASSIGNED/UNMOUNTED 集合）。
- **預覽 modal 重用 F036 `buildTreeLayout`/`edgePath` 渲染**當前循環樹（`getDagGraph`），本次異動節點（event.nodeId）以琥珀色醒目標示，疊加**伺服器端浮水印**（`getLifecycleTreePreview`）；開啟即呼叫 `viewLifecycleChanges`（記 `LIFECYCLE_CHANGELOG_VIEW`）。下載重用 F036 `lifecycleTreeDownloadUrl`（內容層已燒錄浮水印）。

## Test Results Summary
| Scenario / 測項 | 說明 | Status |
|---|---|---|
| lifecycle-change-history.service.spec | builder/publisher、篩選/排序、viewLifecycle 記 LIFECYCLE_CHANGELOG_VIEW | PASS（5） |
| dag-change-emit.spec | addNode/rename/delete/addEdge/deleteEdge 發事件；位置變更不發；無 publisher graceful | PASS（6） |
| node-docs-change-emit.spec | mount/reassign/no-op/unmount 事件 | PASS（4） |
| dag.service.spec / node-docs.service.spec | 既有回歸（2/3 參呼叫不破） | PASS |
| change-history.controller.spec | 路由/RBAC/委派/403 | PASS（10，與 F037 共檔） |
| ChangeHistoryPage.test.tsx（前端） | 循環清單、預覽記稽核＋F036 樹圖節點醒目標示 | PASS |
| 全 backend / frontend 單元 | 無回歸 | PASS（900 / 176） |
| migration:run vs SOP | `LIFECYCLE_CHANGE_LOG` 建表＋索引＋REVOKE 成功 | 已執行 |

> 端到端（真 SOP）：`test/int/changehistory.itest.ts`「新增節點 → LIFECYCLE_CHANGE_LOG 落 NODE_ADDED＋查詢」**已備、本輪未跑**。

## Files Changed（F038 相關）
| File Path | Change | Description |
|---|---|---|
| backend/src/lifecycle/lifecycle-change-event.ts | new | 結構事件 seam＋Noop＋actor/ctx 型別 |
| backend/src/lifecycle/dag.service.ts | modified | 發 NODE_*/EDGE_* 事件＋actor 貫穿 |
| backend/src/lifecycle/node-docs.service.ts | modified | 發 DOCUMENT_MOUNTED/REASSIGNED/UNMOUNTED |
| backend/src/lifecycle/dag.controller.ts / node-docs.controller.ts | modified | @Req actor 貫穿 |
| backend/src/lifecycle/lifecycle.module.ts | modified | useExisting 真 publisher；Dag/NodeDocs 改 useFactory |
| backend/src/change-history/lifecycle-change-log.store.ts / typeorm-*.ts | new | store 契約＋TypeOrm |
| backend/src/change-history/lifecycle-change-log-publisher.ts | new | 真實 publisher＋純 builder |
| backend/src/change-history/lifecycle-change-query.ts | new | 純函式篩選 |
| backend/src/change-history/lifecycle-change-history.service.ts | new | 查詢＋viewLifecycle（稽核） |
| backend/src/change-history/change-history.controller.ts / change-history.module.ts | new | 兩 tab 端點＋模組（app.module 已註冊） |
| backend/src/database/entities/lifecycle-change-log.entity.ts | new | 實體 |
| backend/src/database/migrations/1722729600000-lifecycle-change-log.ts | new | 建表 migration（已對 SOP 執行） |
| backend/test/int/changehistory.itest.ts | new | F037/F038 整合測試（已備、未跑） |
| frontend/src/pages/ChangeHistoryPage.tsx | new | 循環 tab＋預覽 modal（重用 F036 renderer） |

## status=partial 之理由 / Flags（待 system-architect，OQ-E07-05）
- **新舊樹狀圖「並列」重建屬架構未決（OQ-E07-05）**：spec 明訂「完整結構快照 vs diff 重放」與事件粒度（逐動作 vs 編輯階段聚合）**待 system-architect，本 spec 不敲定**。本輪落地**逐事件日誌**（未存整棵快照），故預覽以 F036 renderer 呈現**當前樹＋本次異動節點醒目標示**（而非變更前/變更後兩棵並列）。完整前後快照重建與並列渲染 = deferred。
- **下載 = 重用 F036 當前樹 PDF（燒錄浮水印，記 LIFECYCLE_DOWNLOAD）**：新舊對照「單一 PDF 兩頁」排版（OQ-E07-06）＋ `LIFECYCLE_CHANGELOG_DOWNLOAD` 專屬稽核依賴上述快照重建，一併 deferred。
- **交易邊界**：結構事件於來源交易成功後 publish-after-commit（非同一交易）；spec「持久化時同步寫入（強一致）」屬架構決策，flag architect。
- **未改動之 shared spec docs**（僅 flag，不自行編輯）：`data-model.md`（`LIFECYCLE_CHANGE_LOG`/`LIFECYCLE_SNAPSHOT` schema）、`error-handling.md`。
