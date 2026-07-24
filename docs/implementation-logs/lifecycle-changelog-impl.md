---
type: implementation-log
feature_id: F038
feature_name: 循環樹狀圖變更歷程（完整新舊快照重建 ＋ 雙頁 PDF 燒錄 ＋ 交易一致性）
worktree: lifecycle-changelog (feature/lifecycle-changelog)
status: complete
last_updated: 2026-07-24
---

# F038 lifecycle-changelog — Implementation Log

依 `docs/specs/test-design/lifecycle-changelog-test-design.md`（68 案）＋人類裁定「F038 為 ATOMIC（同一交易）」實作。

## 測試結果彙總

| 區塊 | 檔案 | 案例 | 狀態 |
|---|---|---|---|
| §A.3 快照建構純函式 | `lifecycle-snapshot-builder.spec.ts` | TS-LCC-A-001~004 | PASS（4）|
| §A.4 交易一致性 | `dag-snapshot-transaction.spec.ts` | TS-LCC-A-005~011 | PASS（7）|
| §B diff＋重建＋predecessor | `lifecycle-change-diff.spec.ts` | TS-LCC-B-001~016、A-012/013/014 | PASS（19）|
| §C 雙頁渲染器 | `lifecycle-change-history-pdf.spec.ts` | §C.3 smoke（2 頁/空前態/ASCII 退化）| PASS（3）|
| §C.5 diff 服務 | `lifecycle-change-diff.service.spec.ts` | TS-LCC-C-001~007、C-012[NFR] | PASS（8）|
| §C.6 diff controller | `lifecycle-change-diff.controller.spec.ts` | TS-LCC-C-008~011（含不對稱鎖定）| PASS（9）|
| §D 前端新舊並列 modal | `ChangeHistoryPage.test.tsx` | TS-LCC-D-002~015（D-005 取代舊案）| PASS（14）|

- **backend**：`npx jest` → **102 suites / 1181 tests** 全綠（基線 96/1131 → +6 suites、+50 tests）。`npx tsc --noEmit` clean。
- **frontend**：`npx vitest run` → **35 files / 403 tests** 全綠（基線 35/390 → +13 tests；D-005 取代 1 案、新增 14 案）。`npx tsc --noEmit` clean。
- 整合測試（§E）未執行（任務要求不跑 `test:int`）；新檔已建：`backend/test/int/lifecycle-changelog.itest.ts`。

## 交易一致性重構（人類裁定：F038 ATOMIC，architecture-spec §5.9）

**動機**：F038 快照是重建的 ACTIVE 輸入——若結構列 commit 但快照未 commit，重建會讀到與結構不符的舊快照 →
產生 CORRUPT 前後歷史。故結構寫入 ＋ `LIFECYCLE_CHANGE_LOG` ＋ `LIFECYCLE_SNAPSHOT` 三者必須同一交易。
（對比：F037 文件變更日誌人類刻意保留 best-effort——遺失一列僅是缺一筆歷史，非重建輸入；該例外由 orchestrator
於 §5.9 集中記載，本軌未動該文件。）

**包裝的 F008/F009 寫入路徑**（`recordStructuralChange(manager,...)` 簽章，架構已設計）：
- `DagService.addNode / updateNode / deleteNode / addEdge / deleteEdge`
- `NodeDocsService.mount / unmount`

**手法（設計 §A.4 授權「不綁定確切簽章」）**：
- 於 `DagStore` / `NodeDocsStore` 新增**選填能力** `runStructuralChange?<T>(work)`（選填 → 既有 5 個
  `implements DagStore/NodeDocsStore` 之 fake 無需改動、零破壞）。
- Service 之每個結構方法改走統一 `runChange(op)`：store 具 `runStructuralChange` → 原子路徑（op 於交易內執行，
  事件經 `tx.recordStructuralChange` 與結構寫入同交易落地含快照）；否則 → 循序 fallback（`publisher.publish`，
  無快照，供純單元 fake）。**事件內容由同一 `buildEvent` 建構**，故既有 `dag-change-emit.spec` /
  `node-docs-change-emit.spec` 之欄位值斷言（summary/oldValue/newValue/nodeId/actor）**逐字沿用、零修改**、續綠。
- 生產 `TypeOrmDagStore` / `TypeOrmNodeDocsStore` 實作 `runStructuralChange`＝`ds.transaction(m => ...)`，
  各 mutation/read 重構出 manager-bound `*With(m,...)` 版本（公開版走 `ds.manager`，行為不變）。
- 交易核心 `lifecycle-structural-recorder.ts::recordStructuralChange(manager, event)`：以 manager 重查節點/邊/掛載
  文件 → `buildSnapshotGraph` → 預生兩 UUID → insert `LIFECYCLE_CHANGE_LOG`（含 snapshotId）＋ `LIFECYCLE_SNAPSHOT`
  （含 changeLogId）雙向交叉回指，同交易。
- rollback 語意以 `FakeTransactionalDagStore/NodeDocsStore`（暫存區＋commit/rollback）於單元層驗證
  （TS-LCC-A-006：快照/日誌寫入失敗 → 結構列亦不殘留）。真實 MSSQL 中途斷線之注入超出整合環境能力（見 OQ-LCC-04）。

> 設計 §A.2 建議「呼叫端 service 組 docsByNode 後呼叫純函式」；本實作將快照建構移入交易內的
> `recordStructuralChange`（同一 manager 重查 → 真正一致），純函式 `buildSnapshotGraph` 仍被呼叫並單測。此為
> 手法選擇（設計明文授權），非偏離。

## LIFECYCLE_SNAPSHOT schema ＋ migration

- 新 entity `lifecycle-snapshot.entity.ts`：`id / lifecycleId / changeLogId(唯一索引) / nodesJson,edgesJson
  (nvarchar(max)) / capturedAt(datetime2)`。`LIFECYCLE_CHANGE_LOG` entity 新增 `snapshotId uniqueidentifier NULL`。
- **兩表 1:1 互相回指皆無 DB FK、僅索引**（比照既有 `lifecycleId` 無 FK 慣例）：MSSQL 無延遲約束，雙向 FK 會互卡
  插入順序；兩 PK 皆應用層 `randomUUID()` 預生 → 任一插入順序皆可，完整性由「同交易兩列皆到位」把關。
- `snapshotId` DB 層 NULLable（既有表 ALTER ADD、無正式資料回填）；應用層每筆新寫入恆補上。遺留 null 舊列 → §B
  重建優雅降級為空圖（TS-LCC-B-011）。
- Migration `1723161600000-lifecycle-snapshot.ts`：CREATE TABLE ＋ 2 索引 ＋ ALTER ADD snapshotId ＋ 索引 ＋
  best-effort `REVOKE UPDATE,DELETE`（append-only 縱深防禦）。
- **已對真實 SOP 跑通**：`npx typeorm-ts-node-commonjs -d src/database/data-source.ts migration:run` → 全 DDL 於單一
  交易 COMMIT，`REVOKE ... TO [ICSOPT]` 成功。時間戳 1723161600000 未撞號（SOP 上兄弟軌 1723248000000 已先套用，
  本軌於其後執行、無衝突）。

## 重建 ／ diff ／ 雙頁 PDF

- **純函式** `lifecycle-change-diff.ts`：`computeLifecycleDiff(before,after)`（後-前＝addNodes/addEdges；前-後＝
  rmNodes/rmEdges；前後皆有但 name 或 docs 集合改變＝amberNodes；**位置差異不計入**——延伸 DagService「位置＝佈局非
  結構變更」哲學；忠實移植 prototype 23 `renderMiniDag` 三分類）。`reconstructBeforeAfter(logStore,snapStore,
  lifecycleId,changeLogId)`：after＝target 自身快照；before＝predecessor 快照或空圖；查無 target/跨循環 →
  `LIFECYCLE_CHANGE_LOG_NOT_FOUND`（不洩漏跨循環存在性）。另 `reconstructBeforeAfterForGroup`（60 秒視窗；本輪僅函式
  層級，不接清單 UI，見 OQ-LCC-01）。`selectPredecessor` 純函式（store 與單測共用）。
- `LifecycleChangeLogStore` 擴充 `findById` / `findPredecessor`；`LifecycleSnapshotStore` 新介面
  `findByChangeLogId` / `findById`（回反序列化 SnapshotGraph）。
- **雙頁渲染器**（獨立介面 `LifecycleChangeHistoryPdfRenderer`／`PdfLibChangeHistoryTreeRenderer`，**不動** F036
  單頁 `LifecycleTreePdfRenderer.render()` → 零回歸）：第 1 頁「變更前」（移除紅虛線＋刪除線＋「將移除」；amber
  「變更前」）、第 2 頁「變更後」（新增綠實線＋「新增」；amber「變更後」）。經既有 `PdfBurner`/CJK 管線（Noto Sans TC
  ＋fontkit）燒錄浮水印；缺字型退化 asciiSafe（'?' 佔位，非 U+25A1，避 WinAnsi 崩潰）。
- 端點掛 `LifecycleModule`（新 `LifecycleChangeDiffController/Service`），沿用「LifecycleModule 單向依賴
  ChangeHistoryModule」方向避免循環相依；`ChangeHistoryModule.exports` 新增 `LIFECYCLE_CHANGE_LOG_STORE` ＋
  `LIFECYCLE_SNAPSHOT_STORE` 兩 token。URL 保留 `admin/change-history/lifecycles/:lifecycleId/changes/:changeLogId/
  tree-diff[/download]`（與既有清單/明細不同深度、不衝突）。
- **稽核**：`preview` 不記稽核（沿用前端 `viewLifecycleChanges` 記 `LIFECYCLE_CHANGELOG_VIEW`，避免重複）；
  `download` 記 `LIFECYCLE_CHANGELOG_DOWNLOAD`（既有查詢服務未覆蓋此類型），非阻斷 try/catch。
- **§C.4 RBAC 不對稱**（OQ-E07-04 定案，刻意保留）：新端點掛 `DOCUMENT_CHANGE_HISTORY` read（僅
  SysAdmin/ICSOPAdmin；主管 403）；F036 tree-preview 掛 `LIFECYCLE_MANAGEMENT` read（含主管）。同一 Supervisor
  對 F036 下載 200、對 F038 下載 403——以 TS-LCC-C-008 對照測試明確鎖定，防未來重構誤「統一」。

## 前端 TreeTab 重建（取代假新舊對照）

- 舊 `TreeTab::openPreview` 呼叫 F036「目前狀態」端點 `getLifecycleTreePreview` ＋單樹高亮，下載連 F036 單頁端點
  （mislabeled）。重建為 prototype 23 之**真正雙欄並列** `TreeDiffModal`：左「變更前」／右「變更後（本筆快照）」各自
  `buildTreeLayout` 渲染、三色圖例（新增 emerald 實線／移除 red 虛線／改名·掛載變更 amber）、被移除節點/連線僅現於
  「變更前」欄（刪除線＋「將移除」）、新增僅現於「變更後」欄（「新增」）、amber 兩欄並列顯示舊/新名與掛載數、每欄
  各自浮水印層。下載按鈕文案「下載新舊對照 PDF」、頁尾文案改為 prototype 逐字（含「架構決策」「變更前＝前一筆快照」）。
- `openPreview` 保留 `viewLifecycleChanges`（稽核呼叫點不變）＋改呼叫 `getLifecycleTreeDiff(lifecycleId, ev.id)`；
  表格列與 modal 下載改用 `lifecycleTreeDiffDownloadUrl(lifecycleId, changeLogId)`。
- **取代之陳舊測試**：`ChangeHistoryPage.test.tsx` 原「循環 tab 預覽 → 記 VIEW ＋重用 F036 樹圖（tree-node-n4
  data-highlighted）」一案，於雙欄改動後其斷言基礎（`getLifecycleTreePreview`＋單一 `tree-node-{id}`＋
  `data-highlighted`）必然失效 → 以 **TS-LCC-D-005** 完整取代（sanctioned supersession，設計 §D.1 已預告）。
- Icon 註冊：modal 使用 git-compare/clock/check-circle-2/shield-check/x/download/git-commit-vertical 皆已在
  `Icon.tsx` REGISTRY；`Icon.registry.test.tsx` 守門綠，無新增圖示。

## 供 orchestrator 之 feature-status.md 變更（本軌未改該檔，請 orchestrator 落地）

將 F038 由 `🟡` 升為 `✅`：

```
| F038 | 循環樹狀圖變更歷程 | ✅ | 結構事件日誌＋查詢＋LIFECYCLE_SNAPSHOT 交易一致快照＋新舊重建＋diff＋雙頁燒錄下載＋前端新舊並列 modal（prototype 23）；migration 1723161600000 已對 SOP 跑通；交易一致性以 FakeTransactional*Store rollback 單測把關 |
```

（本軌已自行更新 `docs/specs/features/F038-*.md` 之 Status 行——該檔非凍結清單。feature-status.md 屬凍結，故僅於此回報。）

## 開放問題（回報人類，不阻擋落地）

- **OQ-LCC-01**（60 秒清單分組顯示）：本輪僅提供 `reconstructBeforeAfterForGroup` 函式層級支援，未接清單 UI
  分組（prototype 23 demo 資料未示範）。人類已裁定「60 秒 grouping 於 list view 亦套用」——本軌交付重建函式之 group
  模式；清單 UI 分組歸屬（前端 groupDoc 模式 vs 後端查詢層）待後續。
- **OQ-LCC-03**：新錯誤碼 `LIFECYCLE_CHANGE_LOG_NOT_FOUND` 需人類/orchestrator 補入凍結之 `error-handling.md`
  （比照 `NODE_NOT_FOUND`/`DOCUMENT_NOT_FOUND`）。程式已引用。
- **OQ-LCC-04**：交易 rollback 之整合層驗證限制——真實 MSSQL 中途斷線無 fault-injection 機制；rollback 語意僅於單元
  層（假體）覆蓋，`lifecycle-changelog.itest.ts::TS-LCC-E-010` 僅佐證 happy-path 三表列數 1:1:1 一致。
- **OQ-LCC-02**：`LIFECYCLE_CHANGE_LOG` 現行 schema 與 data-model.md 之既存落差（lifecycleName/entityType/操作者
  department/section 快照）非本次新增、不影響重建（重建僅依 lifecycleId/occurredAt/snapshotId）；未修正。

## 整合測試（未執行）

`backend/test/int/lifecycle-changelog.itest.ts`（新檔，自帶清理）：TS-LCC-E-001~010。清理順序於**自身 afterAll**：先刪
`LIFECYCLE_SNAPSHOT`（`changeLogId IN (SELECT id FROM LIFECYCLE_CHANGE_LOG WHERE lifecycleId=...)`）→ 再刪
`LIFECYCLE_CHANGE_LOG` → `shutdownIntApp` 級聯 LIFECYCLE→NODE/EDGE。**未改共用 `harness.ts` cleanupMarkers**（比照
F006 itest-local 先例）。依任務要求未跑 `test:int`。
