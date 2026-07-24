---
type: test-design-feature
covers: [F038]
related_spec:
  - docs/specs/features/F038-lifecycle-tree-change-history.md
  - docs/specs/architecture-spec.md#4.8
  - docs/specs/architecture-spec.md#5.9
  - docs/specs/data-model.md#change-history-entities
worktree: lifecycle-changelog (feature/lifecycle-changelog)
priority: P1
last_updated: 2026-07-24
status: draft
---

# lifecycle-changelog 測試設計：F038 循環樹狀圖變更歷程 — 完整新舊快照重建 ＋ 雙頁 PDF 燒錄

> ID 命名慣例：本文件所有新設計案例一律以 `TS-LCC-` 開頭（LCC = lifecycle-changelog worktree）。
> F038 目前**沒有**既存 `docs/test-specs/features/F038-test.md`（`find docs/test-specs` 已確認），亦無既存
> `TS-F038-*` 編號，故本文件無需交叉引用/避讓既有案例；但**既有** `backend/src/**/*.spec.ts` 與
> `frontend/src/pages/ChangeHistoryPage.test.tsx` 中已綠的測項見 §0.1「已覆蓋範圍」，本文件不重工，
> 僅在必要處明示「取代」（見 §0.4、§D 開頭）。

## 0. 範圍聲明

### 0.1 已被現有測試覆蓋、本文件不重新設計之基線

- `backend/src/change-history/lifecycle-change-log-publisher.spec.ts`：`buildLifecycleChangeLogRow` 之事件
  → 落地列純轉換、`LifecycleChangeLogPublisher.publish` 之 append 呼叫。
- `backend/src/change-history/lifecycle-change-history.service.spec.ts`：`queryChanges` 篩選/排序、
  `viewLifecycle` 之 `LIFECYCLE_CHANGELOG_VIEW` 稽核（`targetId=lifecycleId`）。**本文件不變更此服務/此稽核
  呼叫點**（見 §D.0 設計決策：前端 `openPreview()` 仍呼叫既有 `viewLifecycleChanges()` 記稽核，僅資料來源
  改接新端點）。
- `backend/src/change-history/change-history.controller.spec.ts`：4 端點 RBAC metadata（`DOCUMENT_CHANGE_HISTORY`
  read）、路徑不遮蔽、委派貫穿。
- `backend/src/lifecycle/dag-change-emit.spec.ts`、`node-docs-change-emit.spec.ts`：F008/F009 結構變更 →
  `LifecycleChangedEvent` 之 8 種 `changeType` 發射（summary/oldValue/newValue/nodeId/actor）。**本文件延伸**
  此發射契約以新增快照資料，但不重新設計既有斷言之欄位值本身（見 §A.3）。
- `backend/src/lifecycle/lifecycle-tree-pdf.spec.ts`：`PdfLibTreeRenderer.render()` 單頁基底圖（CJK／空循環／
  ASCII 退化）三案。**本文件新增雙頁渲染器，不修改此既有單頁契約**（零回歸風險，見 §C.1）。
- `backend/src/lifecycle/lifecycle-preview.service.spec.ts`／`lifecycle-preview.controller.spec.ts`：F036
  單一目前狀態預覽/下載/列印（`LIFECYCLE_MANAGEMENT` read，含 Supervisor）。**本文件之新端點使用不同權限
  functionKey（`DOCUMENT_CHANGE_HISTORY`），刻意造成 Supervisor 於 F036/F038 之不對稱**（見 §C.4 關鍵發現）。
- `frontend/src/pages/ChangeHistoryPage.test.tsx`：程序書 tab 全部案例（`TS-DCL-D-011~014` 等）；循環樹狀圖
  tab 之查詢清單渲染、RBAC 封鎖畫面。**唯一例外**：第 134-147 行「循環 tab 預覽 → 記 LIFECYCLE_CHANGELOG_VIEW
  ＋重用 F036 樹圖渲染（節點醒目標示）」一案斷言基礎（`getLifecycleTreePreview`＋`tree-node-n4`＋
  `data-highlighted`）於本次改動後不再成立，**本文件取代之**（見 §D.1）。

### 0.2 本文件涵蓋（對應任務 1–4，另加 0 項基礎缺口）

| 節 | 一句話 | 主要異動檔案（生產碼，供 tdd-developer 對照；本文件僅設計測試） |
|---|---|---|
| §0.3 | **交易一致性基礎缺口**（非任務原列 4 項，但為 §1/§2 之必要前提，見下方關鍵發現） | `dag.service.ts`／`node-docs.service.ts`／`typeorm-dag.store.ts`／`typeorm-node-docs.store.ts`／`lifecycle-change-log-publisher.ts` |
| §A | `LIFECYCLE_SNAPSHOT` 實體＋migration＋快照建構純函式 | 新 migration `1723161600000-lifecycle-snapshot.ts`、新 `lifecycle-snapshot.entity.ts`／`lifecycle-snapshot.store.ts`／`typeorm-lifecycle-snapshot.store.ts`、`lifecycle-change-log.store.ts`（新增 `snapshotId`） |
| §B | 新舊快照重建 ＋ diff 計算 | 新 `lifecycle-change-diff.ts`（純函式：`reconstructBeforeAfter`／`computeLifecycleDiff`） |
| §C | 雙頁 PDF 燒錄 ＋ 新端點 RBAC ＋ NFR | 新 `lifecycle-change-diff.service.ts`、新 `lifecycle-change-diff.controller.ts`（掛於 `LifecycleModule`）、`lifecycle-tree-pdf.ts`（新增雙頁渲染方法，不動既有 `render()`）、`change-history.module.ts`（`exports` 新增 store token） |
| §D | 前端：新舊並列 modal（prototype 23 對齊） | `ChangeHistoryPage.tsx`（`TreeTab`／`TreePreviewModal`→`TreeDiffModal`）、`frontend/src/api/endpoints.ts`／`types.ts` |
| §E | 整合測試 | 新 `backend/test/int/lifecycle-changelog.itest.ts` |

### 0.3 ⚠ 關鍵發現：交易一致性缺口（架構 §5.9 已定案要求，現況未落實）

**現況查證**（非假設，逐項對照原始碼）：`DagService.addNode()`／`updateNode()`／`deleteNode()`／`addEdge()`／
`deleteEdge()`（`dag.service.ts`）與 `NodeDocsService.mount()`／`unmount()`（`node-docs.service.ts`）之模式
恆為：

```
const node = await this.store.createNode(...);   // 步驟 1：結構寫入（自身完成/隱含 autocommit）
await this.emit(...);                             // 步驟 2：await this.publisher.publish(event) → store.append(row)
```

兩步驟是**兩個獨立的資料庫往返**，`emit()`/`publish()` 前後**沒有** `ds.transaction()` 包住兩者、也**沒有**
try/catch（不同於 documents 側 `CompositeDocumentChangePublisher` 的逐訂閱者容錯）。這與 architecture-spec.md
§5.9 已定案要求直接牴觸：

> 「`LIFECYCLE_CHANGE_LOG`／`LIFECYCLE_SNAPSHOT` 之寫入**與來源交易強一致（同一 DB 交易）**...若寫入失敗，
> 來源功能（...F008/F009）之 API 回應**必須反映失敗**...不得回報「儲存成功」但實際未留下變更紀錄。」

現況下：若 `publisher.publish()`（未來含快照寫入）中途拋錯，**結構列（`LIFECYCLE_NODE`/`LIFECYCLE_EDGE`）已經
持久化**，但例外會往上拋至 controller（無 catch），使用者收到 5xx——**卻節點/連線其實已建立成功**。這是比
「稽核遺漏」更嚴重的問題（操作結果與回應矛盾，重試會產生重複節點）。

**本文件立場**：這不是重新開啟 OQ-E07-05（儲存粒度已定案：完整快照＋逐動作），而是**落實**該決策明文要求
的「同一交易」前提——沒有這個前提，§1（`LIFECYCLE_SNAPSHOT` 新建）與 §2（重建）就是蓋在會漂移的地基上
（快照可能與其宣稱代表的結構列不同步）。**故本文件將此列為 §A 之必要子項（§A.4），而非任務外事項**；
設計為「觀察行為契約」的測試（用假體模擬交易 commit/rollback），不綁定特定實作手法（見 §A.4 前言）。

### 0.4 ⚠ 關鍵發現：前端目前是「假的」新舊對照（重用 F036 當前狀態＋高亮）

`ChangeHistoryPage.tsx::TreeTab::openPreview()` 目前呼叫 `getLifecycleTreePreview(ev.lifecycleId)`——這是
F036 的「**目前狀態**」端點（`GET /admin/lifecycles/:lifecycleId/tree-preview`），回傳的樹狀圖是**現在**的
DAG，`TreePreviewModal` 僅將 `event.nodeId === n.id` 的節點標黃（`data-highlighted`），**並非**變更前/變更後
兩個時點的快照並列。下載按鈕 `lifecycleTreeDownloadUrl(ev.lifecycleId)` 同樣指向 F036 單頁目前狀態下載
端點。這精準對應 `feature-status.md` F038 列「剩：完整新舊快照重建＋雙頁 PDF 燒錄」——即本文件 §B/§C/§D
所設計之範圍為**真正補上**這個功能，非錦上添花。

### 0.5 ⚠ 關鍵發現：prototype 23 之權威 UI 為「雙欄並列」，非現行單樹高亮

`prototypes/23-change-history.html` 第 225-234 行、`renderMiniDag()`（第 449-474 行）之內嵌 demo 邏輯確立
權威 UI 契約（非僅版面文案，逐項見 §D.2）：**左右雙欄**（`grid-cols-2`）「變更前」／「變更後（本筆快照）」
各自渲染**該時點自身的**樹狀圖（非同一張圖疊加標示），差異以「新增（emerald 實線）／移除（red 虛線）／
改名或掛載變更（amber）」三色圖例標示於節點卡；被移除節點/連線**只出現在「變更前」欄**（帶刪除線＋
「將移除」標籤）、新增節點/連線**只出現在「變更後」欄**（帶「新增」標籤）；每欄各自疊加浮水印。下載按鈕
文案「下載新舊對照 PDF」，toast 訊息明確逐字確認**「單一 PDF 兩頁」**（`lcDownload()` 第 488 行），與
architecture-spec.md §5.9 OQ-E07-06 之架構建議完全一致——**本文件視此為 OQ-E07-06 之最終確認**（prototype
為版面權威來源，非僅建議），設計為既定契約，不再視為待決。

### 0.6 明確不重工（out of scope）

- OQ-E07-05 儲存粒度本身（完整快照＋逐動作）——已定案，本文件僅落實其「同一交易」前提，不重新比較選項。
- 查詢清單之「編輯階段」60 秒動態分組**顯示**（列表把多筆事件合併成一個可展開項目）——prototype 23 之
  demo 資料（`LC_EVENTS`）彼此間隔皆 >1 天，未曾示範分組後的清單樣式，此為**待確認之 prototype 缺口**
  （見 §8 開放問題 OQ-LCC-01），本文件僅設計**重建函式**支援「單一事件」與「一組事件（含起訖 changeLogId）」
  兩種輸入模式（任務原文「或一個 60 秒視窗分組」），**不**將清單列表分組 UI 納入本輪設計範圍。
- F037（ICSOP 程序書 tab）——不動，`DocTab` 沿用既有實作。
- `entityType`／`lifecycleName`／操作者 `department`/`section` 快照等 `data-model.md` 決議與現行
  `LIFECYCLE_CHANGE_LOG` entity 之既存落差——**非本次任務新增**（F008/F009 併回時已存在），本文件於 §8
  記錄觀察，不在範圍內修正（不影響快照重建正確性：重建演算法僅依賴 `lifecycleId`／`occurredAt`／
  `snapshotId`，與這些落差欄位無關）。

---

## §A：`LIFECYCLE_SNAPSHOT` 實體 ＋ migration ＋ 快照建構

### A.1 Schema 設計（依 data-model.md 已定案定義，非本文件新創）

```sql
-- 1723161600000-lifecycle-snapshot.ts（保留時間戳，避開既有最高值 1723075200000）
CREATE TABLE [LIFECYCLE_SNAPSHOT] (
  [id] uniqueidentifier NOT NULL,
  [lifecycleId] uniqueidentifier NOT NULL,
  [changeLogId] uniqueidentifier NOT NULL,
  [nodesJson] nvarchar(max) NOT NULL,
  [edgesJson] nvarchar(max) NOT NULL,
  [capturedAt] datetime2 NOT NULL,
  CONSTRAINT [PK_LIFECYCLE_SNAPSHOT] PRIMARY KEY ([id])
);
CREATE UNIQUE INDEX [UQ_LIFECYCLE_SNAPSHOT_changeLogId] ON [LIFECYCLE_SNAPSHOT] ([changeLogId]);
CREATE INDEX [IX_LIFECYCLE_SNAPSHOT_lifecycleId] ON [LIFECYCLE_SNAPSHOT] ([lifecycleId]);
-- 同一 migration 內：LIFECYCLE_CHANGE_LOG 新增 1:1 回指
ALTER TABLE [LIFECYCLE_CHANGE_LOG] ADD [snapshotId] uniqueidentifier NULL;
CREATE INDEX [IX_LC_CHANGE_LOG_snapshotId] ON [LIFECYCLE_CHANGE_LOG] ([snapshotId]);
-- REVOKE UPDATE, DELETE ON [LIFECYCLE_SNAPSHOT]（比照 LIFECYCLE_CHANGE_LOG best-effort 模式）
```

**設計決策（需 tdd-developer 知悉，非阻擋）**：

1. **`snapshotId` 於 DB 層設為 `NULL`able，而非 `NOT NULL`**：data-model.md 標記此欄位「必填」，但那是
   *應用層完整性不變量*（每筆新寫入之列，交易提交前必已補上），非 DB 層可強制的初始欄位——本次為既有表
   `ALTER ADD COLUMN`，若設 `NOT NULL` 需為既存列提供預設值/回填，而**本專案目前無真實正式資料**（F038 為
   🟡 部分功能，僅開發/測試資料），故選擇 `NULL`able 以避免不必要的回填腳本；應用層不變量改由 §A.4 之交易
   一致性測試把關（"snapshotId 恆與新寫入列同時到位"）。**副作用（需一則測試鎖定）**：早於本次 migration
   即存在的舊列（若有）`snapshotId` 會是 `NULL`——§B 重建演算法之「取前一筆快照」查詢若命中這類舊列，
   須優雅降級（視為「無可用快照的更早紀錄」，非崩潰），見 TS-LCC-B-011。
2. **`changeLogId`／`snapshotId` 皆不加 DB 層 FK 約束，僅索引**：與現行 `LIFECYCLE_CHANGE_LOG.lifecycleId`
   同一慣例（該欄位已是「無 FK、僅索引」的既定設計，見 migration 註解）。理由：兩表互相 1:1 回指
   （`LIFECYCLE_CHANGE_LOG.snapshotId → LIFECYCLE_SNAPSHOT.id` 且 `LIFECYCLE_SNAPSHOT.changeLogId →
   LIFECYCLE_CHANGE_LOG.id`）——MSSQL 無延遲約束（deferred constraint），若雙向皆掛 DB FK，兩筆列之插入
   順序會互相卡死（無論先插哪一筆，另一筆尚未存在時之 FK 會即時失敗）。**因兩表 PK 皆由應用層
   `randomUUID()` 預先產生**（非 DB `NEWSEQUENTIALID()`），此問題可用「兩個 UUID 皆於寫入前算好、任一插入
   順序皆可」規避而不需 FK；但為與既有 `LIFECYCLE_CHANGE_LOG.lifecycleId` 慣例一致、且避免未來若真的加上
   FK 又忘記这個順序限制而踩雷，本文件建議維持「無 FK、僅索引」，完整性由應用層＋§A.4 測試把關。
3. **`nodesJson`／`edgesJson` 用 `nvarchar(max)`**：data-model.md 未定長度上限；循環節點 < 200
   （[NFR-001](../nfr.md#performance)），結構化 JSON 非二進位檔案，`nvarchar(max)` 是此類「大小隨資料量
   浮動但無合理硬上限」欄位之既有慣例（比照別處 unbounded JSON/text 欄位）。

### A.2 快照內容 Schema（`SnapshotGraph`，序列化進 `nodesJson`/`edgesJson`）

```ts
interface SnapshotNode {
  id: string;
  name: string | null;
  positionX: number;
  positionY: number;
  /** 掛載文件清單（依 data-model.md：id + documentNumber），非僅計數。 */
  docs: Array<{ id: string; documentNumber: string }>;
}
interface SnapshotEdge { id: string; sourceNodeId: string; targetNodeId: string; }
interface SnapshotGraph { nodes: SnapshotNode[]; edges: SnapshotEdge[]; }
```

新純函式 `buildSnapshotGraph(nodes: NodeView[], edges: EdgeRow[], docsByNode: Map<string, DocRef[]>):
SnapshotGraph`（放 `backend/src/lifecycle/lifecycle-snapshot-builder.ts`）；呼叫端（`DagService`／
`NodeDocsService`）於結構寫入後，重新查詢 `DagStore.listNodes/listEdges` ＋ `NodeDocsStore.listLifecycleDocs`
（既有方法，見程式碼查證，`DocRef.nodeId` 可分組），組出 `docsByNode` 後呼叫此純函式。

### A.3 測試案例（unit — `lifecycle-snapshot-builder.spec.ts`）

#### TS-LCC-A-001 節點+邊+掛載文件 → 正確序列化 `SnapshotGraph`
- **Given**：2 節點（一有掛載 2 份文件、一無掛載）、1 邊
- **When**：`buildSnapshotGraph(nodes, edges, docsByNode)`
- **Then**：回傳物件 `nodes[0].docs` 長度 2 且含 `{id, documentNumber}`；`nodes[1].docs` 為 `[]`（非
  `undefined`）；`edges` 原樣帶出 `id/sourceNodeId/targetNodeId`
- **AC**：data-model.md `LIFECYCLE_SNAPSHOT.nodesJson` 定義（逐字對應）
- **檔案**：`backend/src/lifecycle/lifecycle-snapshot-builder.spec.ts`

#### TS-LCC-A-002 空循環（無節點無邊）→ `{nodes:[], edges:[]}`（不崩潰，供第一筆事件的「變更後」使用）
- **AC**：Edge Case「循環無任何歷史結構變更事件」之資料面前提
- **檔案**：同上

#### TS-LCC-A-003 節點無掛載（`docsByNode` 未含該節點 key）→ `docs` 為 `[]`（防禦性，非拋錯）
- **AC**：gap-derived（防禦性設計）
- **檔案**：同上

#### TS-LCC-A-004 序列化結果可被 `JSON.parse` 還原且與輸入結構一致（round-trip）
- **Given**：`JSON.stringify(buildSnapshotGraph(...).nodes)` → `JSON.parse(...)`
- **Then**：深比對與原輸入語意等價（供 `nodesJson` 落地欄位之寫入前置驗證）
- **AC**：gap-derived（序列化正確性回歸防護）
- **檔案**：同上

### A.4 交易一致性測試（§0.3 關鍵發現之落實；行為契約測試，不綁定特定實作手法）

> **設計前言**：本節測試以「注入一個可模擬交易 commit/rollback 的假體」驗證**可觀察行為**——不預先指定
> `DagStore`/`NodeDocsStore` 介面確切新簽章（那是 tdd-developer 之實作決策空間）。核心不變量只有一條：
> **若「結構寫入 + 快照插入 + 變更日誌插入」三者中任一失敗，其餘兩者亦不得殘留**（同進退）。以下以
> `addNode` 為代表案例，其餘 7 種 `changeType`（`updateNode` 改名／`deleteNode`／`addEdge`／`deleteEdge`／
> `mount`／`unmount` 之 `MOUNTED`/`REASSIGNED`/`UNMOUNTED`）建議 tdd-developer 以同一 table-driven 模式擴充
> （**代表樣本，非窮舉**，明示於此避免遺漏）。

#### TS-LCC-A-005 成功路徑：`addNode` → 結構列 + 快照列 + 變更日誌列 三者皆落地，`snapshotId`/`changeLogId` 互相正確交叉引用
- **Given**：一個支援「單一交易」語意的假體（`FakeTransactionalDagStore`，內部以陣列模擬 commit 後狀態）
- **When**：`await svc.addNode('lc1', { name: '進件作業' }, actor)`
- **Then**：`fakeChangeLogRows` 長度 1，其 `snapshotId` 等於 `fakeSnapshotRows[0].id`；`fakeSnapshotRows[0]
  .changeLogId` 等於前者之 `id`（雙向交叉引用皆正確，非僅單向）
- **AC**：data-model.md「`snapshotId`（→ LIFECYCLE_SNAPSHOT，1:1，同一交易內產生）」（逐字對應）
- **檔案**：`backend/src/lifecycle/dag-snapshot-transaction.spec.ts`（新檔，與既有
  `dag-change-emit.spec.ts` 分離，避免既有檔案過度膨脹）

#### TS-LCC-A-006 快照/日誌寫入失敗 → 結構列亦不得殘留（rollback 語意）
- **Given**：假體之「快照/日誌寫入」步驟被設定為擲出錯誤（模擬 DB 連線中斷）
- **When**：`await svc.addNode('lc1', { name: 'X' }, actor)`
- **Then**：呼叫拒絕（reject）；隨後 `svc.getGraph('lc1')` 回傳之節點清單**不含**剛才嘗試建立的節點（即
  結構寫入本身亦已回滾，非僅「日誌沒寫但節點還在」）
- **AC**：architecture-spec.md §5.9「寫入失敗 → 整筆業務交易回滾」（逐字對應，本案為本文件核心不變量）
- **檔案**：同上

#### TS-LCC-A-007 結構寫入本身失敗（如 F008 成環驗證擋下）→ 完全不產生快照/日誌列（既有行為之延伸鎖定）
- **Given**：`addEdge()` 送出會成環的 source/target
- **When/Then**：拋 `DAG_CYCLE_DETECTED`；`fakeChangeLogRows`／`fakeSnapshotRows` 皆長度 0
- **AC**：既有「失敗不發事件」慣例（比照 documents 側 F010/F012 慣例）之 DAG 結構延伸（gap-derived，回歸
  防護——確保新交易包裝不會意外讓「驗證失敗前」就已寫出快照列）
- **檔案**：同上

#### TS-LCC-A-008 `deleteNode`（連動刪除其邊）→ 快照反映刪除後之淨結構（不含被刪節點與其邊）
- **Given**：2 節點 1 邊，刪除其中一節點
- **When**：`svc.deleteNode(nodeId, {lifecycleId, actor})`
- **Then**：對應快照列之 `nodesJson` parse 後長度 1（不含被刪節點）；`edgesJson` 長度 0（該邊已連動刪除）
- **AC**：data-model.md「快照為當下節點+邊集合」定義（逐字對應）
- **檔案**：同上

#### TS-LCC-A-009 `mount`（文件掛載）→ 快照之該節點 `docs` 陣列含新掛載文件
- **AC**：同上（掛載事件之快照延伸）
- **檔案**：同上

#### TS-LCC-A-010 `unmount`（移除掛載）→ 快照之該節點 `docs` 陣列不再含該文件
- **AC**：同上
- **檔案**：同上

#### TS-LCC-A-011 連續 3 個原子操作（無總送出邊界）→ 產生 3 筆獨立快照列，非 1 筆聚合列
- **Given**：依序 `addNode`→`addNode`→`addEdge`（皆在極短時間內）
- **When/Then**：`fakeSnapshotRows` 長度 3（逐動作各一筆，儲存層不聚合——OQ-E07-05 決議之直接延伸）
- **AC**：architecture-spec.md §4.8 OQ-E07-05 決議「逐原子操作各寫一筆」（逐字對應）
- **檔案**：同上

#### TS-LCC-A-012 `LifecycleChangeLogStore` 契約擴充：`findById`／`findPredecessor` 新方法（供 §B 重建使用）
- **Given**：3 筆同循環之列，`occurredAt` 分別為 T1<T2<T3
- **When**：`store.findPredecessor('lc1', T3)`
- **Then**：回傳 T2 那筆（最近一筆早於目標時間）；`store.findPredecessor('lc1', T1)` 回傳 `null`（無更早紀錄）
- **AC**：architecture-spec.md §4.8「取同 lifecycleId、changedAt 早於目標事件之最近一筆」（逐字對應）
- **檔案**：`backend/src/change-history/typeorm-lifecycle-change-log.store.spec.ts`（新檔，或併入既有測試檔）

#### TS-LCC-A-013 `findPredecessor` 跨循環隔離：不同 `lifecycleId` 之更早列不得被誤取
- **Given**：`lc1`／`lc2` 各自有列，`lc2` 的列時間早於 `lc1` 目標事件
- **When**：`store.findPredecessor('lc1', T)`
- **Then**：不回傳 `lc2` 的列（`lifecycleId` 過濾正確）
- **AC**：gap-derived（跨循環資料隔離回歸防護）
- **檔案**：同上

#### TS-LCC-A-014 `LifecycleSnapshotStore.findByChangeLogId` 契約
- **Given**：一筆快照列，`changeLogId='cl-1'`
- **When**：`store.findByChangeLogId('cl-1')`
- **Then**：回傳該列；`store.findByChangeLogId('不存在')` 回傳 `null`
- **AC**：data-model.md `LIFECYCLE_SNAPSHOT` 1:1 定義
- **檔案**：`backend/src/change-history/typeorm-lifecycle-snapshot.store.spec.ts`（新檔）

---

## §B：新舊快照重建 ＋ diff 計算

### B.1 重建演算法（純函式，`backend/src/lifecycle/lifecycle-change-diff.ts`）

```ts
async function reconstructBeforeAfter(
  logStore: LifecycleChangeLogStore,
  snapStore: LifecycleSnapshotStore,
  lifecycleId: string,
  changeLogId: string,
): Promise<{ before: SnapshotGraph; after: SnapshotGraph }>
```

演算法（逐字對應 architecture-spec.md §4.8「快照重建細節」）：
1. `target = logStore.findById(changeLogId)`；若不存在或 `target.lifecycleId !== lifecycleId` → 拋
   `LIFECYCLE_CHANGE_LOG_NOT_FOUND`（新錯誤碼，404，比照既有 `NODE_NOT_FOUND`/`DOCUMENT_NOT_FOUND` 慣例；
   **需人類將此碼補入 error-handling.md**，該檔案凍結，見 §8）。
2. `after = target.snapshotId ? snapStore.findByChangeLogId(target.snapshotId) : null`；若為 `null` → 視為
   空圖（防禦性，理論上不應發生，見 TS-LCC-B-010）。
3. `predecessor = logStore.findPredecessor(lifecycleId, target.occurredAt)`。
4. `before = predecessor?.snapshotId ? snapStore.findByChangeLogId(predecessor.snapshotId) : EMPTY_GRAPH`
   （`predecessor` 不存在，或存在但 `snapshotId` 為 `null`——見 §A.1 決策 1 之遺留舊列情境——皆視為空圖）。

**group 模式擴充**（任務原文「或一個 60 秒視窗分組」；供未來清單分組 UI 使用，本輪不接線，見 §0.6）：
```ts
async function reconstructBeforeAfterForGroup(
  logStore, snapStore, lifecycleId, firstChangeLogId, lastChangeLogId,
): Promise<{ before: SnapshotGraph; after: SnapshotGraph }>
```
`before` = 錨定 `firstChangeLogId` 走 predecessor 查詢（同單事件模式步驟 3-4）；`after` = 直接取
`lastChangeLogId` 自身快照（同單事件模式步驟 2）。

### B.2 Diff 計算（純函式，無 IO）

```ts
interface LifecycleDiff {
  addNodes: string[];
  rmNodes: string[];
  /** 存在於前後兩側、但 name 或 docs 集合已變（改名／掛載變更）。 */
  amberNodes: string[];
  addEdges: Array<[string, string]>;
  rmEdges: Array<[string, string]>;
}
function computeLifecycleDiff(before: SnapshotGraph, after: SnapshotGraph): LifecycleDiff
```

規則（逐字對應 architecture-spec.md §5.9「後-前=新增；前-後=刪除」＋忠實移植 prototype 23
`renderMiniDag()` 之 `add`/`rm`/`amber` 三分類）：
- `addNodes` = `after.nodes` 有、`before.nodes` 無之 id 集合。
- `rmNodes` = `before.nodes` 有、`after.nodes` 無之 id 集合。
- `amberNodes` = 前後皆有之 id，且 `name` 不同**或** `docs`（依 id 集合比較，不論順序）不同。**位置
  （positionX/positionY）差異不計入 amber**（比照 `DagService.updateNode()` 既有「位置＝佈局，非結構
  變更」哲學，位置拖曳不產生 `LIFECYCLE_CHANGE_LOG` 事件，故此規則是既有哲學在 diff 呈現層的自然延伸，
  非新發明）。
- `addEdges`/`rmEdges` = 以 `${sourceNodeId}>${targetNodeId}` 為鍵之集合差（比照 prototype `addE`/`rmE`
  之 key 格式，僅為設計參考，實作不必逐字沿用字串格式）。

### B.3 測試案例（unit — `lifecycle-change-diff.spec.ts`）

#### TS-LCC-B-001 一般案例（新增節點並改接連線，忠實對照 prototype `lc1` fixture）
- **Given**：`before = {nodes:[a1,a2,a3,a5], edges:[a1-a2,a1-a3,a2-a5,a3-a5]}`、
  `after = {nodes:[a1,a2,a3,a4,a5], edges:[a1-a2,a1-a3,a2-a4,a3-a4,a4-a5]}`
- **When**：`computeLifecycleDiff(before, after)`
- **Then**：`addNodes=['a4']`；`addEdges` 含 `[a2,a4]`/`[a3,a4]`/`[a4,a5]`；`rmEdges` 含 `[a2,a5]`/`[a3,a5]`；
  `rmNodes=[]`；`amberNodes=[]`
- **AC**：F038 AC「差異節點/連線視覺標示新增/刪除」＋ prototype 23 `lc1` fixture（逐字對照，權威來源）
- **檔案**：`backend/src/lifecycle/lifecycle-change-diff.spec.ts`

#### TS-LCC-B-002 節點改名（僅名稱變更）→ `amberNodes` 含該節點，`addNodes`/`rmNodes` 皆空
- **Given**：`before` 該節點 `name='撥款核准'`、`after` 同節點 `name='撥款核准作業'`
- **Then**：`amberNodes` 含該節點 id；`addNodes`/`rmNodes`/`addEdges`/`rmEdges` 皆空
- **AC**：prototype 23 `lc3` fixture（逐字對照）
- **檔案**：同上

#### TS-LCC-B-003 文件掛載數變化（1→2 份）→ `amberNodes` 含該節點（docs 集合改變，非位置/名稱）
- **AC**：prototype 23 `lc4` fixture
- **檔案**：同上

#### TS-LCC-B-004 移除節點（含其連線）→ `rmNodes`＋`rmEdges` 皆含對應項，`after` 不再含該節點
- **AC**：prototype 23 `lc5` fixture ＋ F038 Edge Case「差異涉及被刪除節點/連線」
- **檔案**：同上

#### TS-LCC-B-005 僅新增連線（節點不變）→ `addNodes`/`rmNodes`/`amberNodes` 皆空，僅 `addEdges` 有值
- **AC**：prototype 23 `lc2` fixture
- **檔案**：同上

#### TS-LCC-B-006 節點位置變更（僅 x/y）、名稱與 docs 皆同 → 不計入 `amberNodes`（純佈局非結構）
- **AC**：§B.2 規則（gap-derived，鎖定「位置不算結構變更」哲學延伸，防止未來誤將拖曳判為異動）
- **檔案**：同上

#### TS-LCC-B-007 `before`/`after` 完全相同（理論上不應發生於真實事件，但需防禦） → 五個陣列皆空
- **AC**：防禦性（gap-derived）
- **檔案**：同上

#### TS-LCC-B-008 `before` 為空圖（循環第一筆事件）→ `after` 全部節點/邊皆判定為 `addNodes`/`addEdges`
- **AC**：架構「若無更早紀錄，視為空 DAG」之 diff 呈現延伸（逐字對應）
- **檔案**：同上

#### TS-LCC-B-009 `reconstructBeforeAfter`：一般案例 → 正確取得 `before`（前一筆快照）與 `after`（本筆快照）
- **Given**：Fake `logStore`/`snapStore`，3 筆同循環列
- **When**：對第 2 筆的 `changeLogId` 呼叫 `reconstructBeforeAfter`
- **Then**：`before` 等於第 1 筆之快照；`after` 等於第 2 筆之快照
- **AC**：architecture-spec.md §4.8 演算法（逐字對應）
- **檔案**：同上（或獨立 `lifecycle-change-diff-reconstruct.spec.ts`，視 tdd-developer 偏好）

#### TS-LCC-B-010 循環第一筆事件 → `before` 為空圖（`{nodes:[],edges:[]}`），不查無資料而拋錯
- **AC**：architecture-spec.md §4.8「若無更早紀錄，視為空 DAG」（逐字對應）
- **檔案**：同上

#### TS-LCC-B-011（§A.1 決策延伸）predecessor 存在但其 `snapshotId` 為 `null`（migration 前遺留舊列）→
  視為無可用快照，`before` 降級為空圖（不崩潰）
- **Given**：predecessor 列存在但 `snapshotId===null`
- **When/Then**：`before` 為空圖（非拋 `TypeError`/`Cannot read snapshotId of null` 之類的非預期例外）
- **AC**：§A.1 決策 1 之相容性防護（gap-derived）
- **檔案**：同上

#### TS-LCC-B-012 `changeLogId` 不存在 → 拋 `LIFECYCLE_CHANGE_LOG_NOT_FOUND`
- **AC**：§B.1 步驟 1（新錯誤碼，需人類補 error-handling.md）
- **檔案**：同上

#### TS-LCC-B-013 `changeLogId` 存在但屬於**另一循環**（`lifecycleId` 不符 URL 路徑參數）→ 亦拋
  `LIFECYCLE_CHANGE_LOG_NOT_FOUND`（不得洩漏「此 id 存在於別的循環」，避免枚舉/IDOR 疑慮）
- **AC**：安全性設計（gap-derived，比照既有「查無視為 404，不細分原因」之全站慣例）
- **檔案**：同上

#### TS-LCC-B-014 group 模式：`reconstructBeforeAfterForGroup`（firstId, lastId）→ `before`=first 事件之
  predecessor 快照、`after`=last 事件自身快照（跳過中間各筆）
- **AC**：architecture-spec.md §4.8「取分組內第一筆事件的『變更前』快照...與最後一筆事件的快照做為
  變更前/後兩端點」（逐字對應；本輪僅函式層級驗證，不接清單 UI，見 §0.6）
- **檔案**：同上

#### TS-LCC-B-015 group 模式：`firstId === lastId`（單一事件之退化情況）→ 結果與單事件模式
  `reconstructBeforeAfter` 完全一致
- **AC**：一致性回歸防護（gap-derived）
- **檔案**：同上

#### TS-LCC-B-016 `computeLifecycleDiff` 對 `SnapshotGraph.nodes` 之 `docs` 比較為「集合語意」（順序不影響
  結果）→ 同一 docs 集合、不同陣列順序 → 不計入 `amberNodes`
- **AC**：防禦性（gap-derived，避免後端查詢排序不穩定導致誤判為「改變」）
- **檔案**：同上

---

## §C：雙頁 PDF 燒錄 ＋ 新端點 ＋ RBAC ＋ NFR

### C.1 模組配線設計決策（🔴 需 tdd-developer 依此落地，非任意選擇——原因見下）

**問題**：`ChangeHistoryModule`（擁有 `LIFECYCLE_CHANGE_LOG_STORE`／`LIFECYCLE_SNAPSHOT_STORE`）與
`LifecycleModule`（擁有 `DagStore`／`LifecycleStore`／`LifecycleTreePdfRenderer`／`PdfBurner`／
`LifecycleWatermarkBuilder`）現況為**單向依賴**：`LifecycleModule` 已 `imports: [...,ChangeHistoryModule]`
（供 `DagService`/`NodeDocsService` 取得真實 publisher）。若新端點放在 `ChangeHistoryController`（依
architecture-spec.md §5.9 循序圖之 "CH" 參與者，語意上最自然），`ChangeHistoryModule` 需要反過來 import
`LifecycleModule` 以取得渲染器/store——**造成模組循環依賴**（`LifecycleModule` → `ChangeHistoryModule` →
`LifecycleModule`），NestJS 需 `forwardRef()` 才能解，且會使已穩定的既有 F036/F038 查詢配線變複雜。

**決策**：新端點**物理上**掛在 `LifecycleModule`（新檔 `lifecycle-change-diff.controller.ts`／
`lifecycle-change-diff.service.ts`），沿用現有「`LifecycleModule` 單向依賴 `ChangeHistoryModule`」方向；
`ChangeHistoryModule` 之 `exports` 陣列**新增** `LIFECYCLE_CHANGE_LOG_STORE`、新 `LIFECYCLE_SNAPSHOT_STORE`
兩個 token（現況只 export 兩個 publisher class）。URL 路徑**保留** `admin/change-history/lifecycles/...`
前綴（與既有 `ChangeHistoryController` 路由家族語意一致，供前端/使用者無感——NestJS 路由不要求同前綴的
端點必須位於同一個 Controller 類別，只要求路徑+方法不衝突，本設計與既有 `lifecycles`／`lifecycles/:id`
不衝突，見下方路由表）。

| 方法 | 路徑 | 所在 Controller/Module | 說明 |
|---|---|---|---|
| GET | `admin/change-history/lifecycles` | `ChangeHistoryController`（既有，不動） | 清單查詢 |
| GET | `admin/change-history/lifecycles/:lifecycleId` | `ChangeHistoryController`（既有，不動） | 某循環全部異動 + VIEW 稽核 |
| GET | `admin/change-history/lifecycles/:lifecycleId/changes/:changeLogId/tree-diff` | **新** `LifecycleChangeDiffController`（`LifecycleModule`） | 單筆事件之新舊結構 + diff + 浮水印快照 |
| GET | `admin/change-history/lifecycles/:lifecycleId/changes/:changeLogId/tree-diff/download` | 同上 | 雙頁已燒錄浮水印 PDF |

### C.2 新端點回應/請求契約

```ts
// GET .../tree-diff → 200
interface LifecycleTreeDiffResponse {
  lifecycle: { id: string; name: string };
  before: DagGraph;   // { nodes: NodeView[]; edges: EdgeRow[] }（既有型別，重用）
  after: DagGraph;
  diff: LifecycleDiff; // 見 §B.2
  watermark: string;  // 伺服器端組裝快照（與 F036 同一 buildSnapshot 來源）
}
```
`GET .../tree-diff/download` → `Content-Type: application/pdf`，`Content-Disposition: attachment`，body
為雙頁已燒錄浮水印 PDF。

### C.3 渲染器設計（不動既有 F036 `LifecycleTreePdfRenderer.render()` 契約）

新增獨立介面（**不**修改 `LifecycleTreePdfRenderer`，零回歸風險於既有 3 案 `lifecycle-tree-pdf.spec.ts`）：

```ts
export const LIFECYCLE_CHANGE_HISTORY_PDF_RENDERER = Symbol(...);
export interface LifecycleChangeHistoryPdfRenderer {
  render(input: {
    lifecycleName: string;
    beforeLayout: TreeLayout;
    afterLayout: TreeLayout;
    diff: LifecycleDiff;
  }): Promise<Buffer>; // 兩頁：第 1 頁「{名稱} - 變更前」，第 2 頁「{名稱} - 變更後」
}
```
內部建議（供 tdd-developer 參考，非強制）：抽出 `lifecycle-tree-pdf.ts` 既有 `drawNodeCard`/
`drawOrthogonalEdge` 為可重用內部函式，兩個渲染器（既有單頁／新雙頁）皆呼叫，達成「重用 F036 樹圖渲染」
之任務要求，同時不變更既有公開介面。移除節點/連線覆寫樣式（僅第 1 頁）：紅色虛線框＋文字加刪除線＋
「將移除」標籤；新增節點/連線覆寫樣式（僅第 2 頁）：綠色實線框＋「新增」標籤；`amberNodes`（兩頁皆有）：
琥珀色框＋依頁面顯示「變更前」/「變更後」標籤——**逐項對照 prototype 23 CSS**（`.n-add`/`.n-rm`/
`.n-amber`/`.e-add`/`.e-rm`，見 §0.5），確保伺服器端 PDF 與前端 modal 視覺語意一致。

### C.4 ⚠ 關鍵發現：新端點刻意造成 RBAC 不對稱（非疏漏，需鎖定測試防止未來被「統一」）

F036 之 `LifecyclePreviewController`（`admin/lifecycles/:lifecycleId/tree-preview/*`）使用
`FunctionKey.LIFECYCLE_MANAGEMENT` read（**含 Supervisor**）。本文件之新端點掛
`FunctionKey.DOCUMENT_CHANGE_HISTORY` read（**僅 SysAdmin/ICSOPAdmin，OQ-E07-04 定案，Supervisor 被排除**）。
同一顆循環、同一位 Supervisor：呼叫 F036 下載 → 200；呼叫本文件新端點下載 → 403。這是**刻意**的（F038
「文件變更歷程」為獨立後台功能，OQ-E07-04 明文「主管對本『循環樹狀圖變更』tab 亦無權」），但正因兩者
URL/回應形狀相似（皆回 PDF），未來重構時容易被誤判為「應該統一權限」而悄悄修掉這個差異——**故設計一則
對照測試明確鎖定不對稱本身**（TS-LCC-C-008）。

### C.5 測試案例（unit — `lifecycle-change-diff.service.spec.ts`）

#### TS-LCC-C-001 `preview`（tree-diff JSON）：成功案例 → 回 `lifecycle`/`before`/`after`/`diff`/`watermark`，
  並記一筆 `LIFECYCLE_CHANGELOG_VIEW`？**否**——見設計決策：本服務**不**重複記 VIEW 稽核（沿用 §0.1，前端
  仍呼叫既有 `viewLifecycleChanges()` 記稽核；本服務純資料）。本案改為：`preview()` 呼叫**不**觸發
  `auditWriter.recordAccess`（鎖定「不重複稽核」設計決策，回歸防護）
- **AC**：§0.1 設計決策（gap-derived，避免未來誤加重複稽核呼叫）
- **檔案**：`backend/src/lifecycle/lifecycle-change-diff.service.spec.ts`

#### TS-LCC-C-002 `changeLogId` 不存在 → 服務層拋 `LIFECYCLE_CHANGE_LOG_NOT_FOUND`（貫穿 §B.1）
- **AC**：同 TS-LCC-B-012
- **檔案**：同上

#### TS-LCC-C-003 `lifecycleId` 不存在（循環本身已被刪除，但變更日誌因無 FK 仍存在——OQ-E03-03 允許刪除
  循環）→ 回應仍可成功（`lifecycle.name` 使用 `LIFECYCLE_CHANGE_LOG` 之操作當下摘要或「（循環已刪除）」
  佔位，**不**因循環本體已刪除而整體 404）
- **AC**：F038 spec「未保留歷史版本檔；循環本體仍僅保存當前狀態」與 OQ-E03-03「允許刪除循環」交叉之邊界
  （gap-derived，稽核可追溯性優先——歷史異動記錄不應因來源循環後來被刪除而變成不可查）
- **檔案**：同上

#### TS-LCC-C-004 `download`：成功案例 → 回傳 PDF buffer（`%PDF-` 開頭），呼叫
  `LifecycleChangeHistoryPdfRenderer.render()` 傳入正確 `beforeLayout`/`afterLayout`/`diff`，再交
  `PdfBurner.burnPdf()` 燒錄，並記一筆 `LIFECYCLE_CHANGELOG_DOWNLOAD` 稽核（**下載情境需要稽核**，與
  §C.5-001 之「預覽不重複稽核」不同，因為現行 `viewLifecycleChanges()` 只覆蓋 VIEW，不覆蓋 DOWNLOAD——
  下載稽核**必須**由本服務自行記錄，無既有呼叫點可依賴）
- **AC**：F038 AC「預覽或下載完成...各記一筆稽核（LIFECYCLE_CHANGELOG_VIEW／LIFECYCLE_CHANGELOG_DOWNLOAD）」
  （逐字對應，DOWNLOAD 半句）
- **檔案**：同上

#### TS-LCC-C-005 稽核寫入失敗（`AuditWriter.recordAccess` 拋錯）→ 不阻斷下載（PDF 仍正常回傳），僅記
  log（比照 F036 `burnAndAudit()` 既有 catch-swallow 模式）
- **AC**：F038 AC「寫入失敗不阻斷瀏覽，進補償佇列重試」（逐字對應）
- **檔案**：同上

#### TS-LCC-C-006 `renderer.render()` 呼叫參數：`beforeLayout`/`afterLayout` 分別為 `buildTreeLayout(before)`／
  `buildTreeLayout(after)` 各自獨立佈局（**非**共用同一佈局座標系）——因兩時點節點集合可能不同，各自
  獨立分層置中，比照 prototype `layoutGraph()` 對 `before`/`after` 各自呼叫（非共用座標）
- **AC**：prototype 23 `renderMiniDag(host, graph, side, diff)` 逐次以各自 `graph` 呼叫 `layoutGraph`
  （逐字對照）
- **檔案**：同上

#### TS-LCC-C-007 空前態（循環第一筆事件）→ `download` 仍能產生兩頁 PDF（第 1 頁「變更前」為空版面，
  非崩潰或跳過該頁）
- **AC**：Edge Case 延伸（gap-derived，"before 為空圖" 需仍可渲染成一個有效但空白的頁面）
- **檔案**：同上

### C.6 測試案例（unit — `lifecycle-change-diff.controller.spec.ts`，RBAC + 委派貫穿）

#### TS-LCC-C-008（§C.4 不對稱鎖定）SysAdmin／ICSOPAdmin → 放行；Supervisor／DeptContact／User → 403
  `PERMISSION_DENIED`（`FunctionKey.DOCUMENT_CHANGE_HISTORY`，非 `LIFECYCLE_MANAGEMENT`）
- **Given**：比照 `change-history.controller.spec.ts` 既有 RBAC metadata 測試手法（`RolePermissionGuard`
  + `ctxFor()`）
- **Then**：`it.each(['SysAdmin','ICSOPAdmin'])` 放行；`it.each(['Supervisor','DeptContact','User'])` 403
- **AC**：OQ-E07-04 定案（逐字對應）＋ §C.4 對稱性回歸防護
- **檔案**：`backend/src/lifecycle/lifecycle-change-diff.controller.spec.ts`

#### TS-LCC-C-009 兩端點皆掛 `RequirePermission(DOCUMENT_CHANGE_HISTORY, 'read')`（metadata 斷言，比照既有
  `change-history.controller.spec.ts` 手法）
- **AC**：同上
- **檔案**：同上

#### TS-LCC-C-010 `tree-diff` 委派貫穿：`ctrl.treeDiff(req, lifecycleId, changeLogId)` →
  `svc.preview(session, lifecycleId, changeLogId)` 參數正確傳遞
- **AC**：gap-derived（controller-service 契約回歸防護）
- **檔案**：同上

#### TS-LCC-C-011 `download` 委派貫穿：正確設定 response headers（`Content-Type: application/pdf`、
  `Content-Disposition: attachment; filename="lifecycle-{lifecycleId}-{changeLogId}-diff.pdf"`）
- **AC**：比照既有 `LifecyclePreviewController.download()` 之 header 設定慣例（gap-derived）
- **檔案**：同上

### C.7 NFR：燒錄時間（比照 F020/F036 既定門檻）

`浮水印下載 < 3s`（architecture-spec.md §6 效能表既有列，涵蓋「循環樹狀圖變更歷程之新舊版下載燒錄」，見
`nfr.md#watermark` AC3 情境 4 逐字列舉）。

#### TS-LCC-C-012（[NFR]，best-effort，環境相依，標記非嚴格 CI gate）代表規模（各 ≤ 200 節點，
  [NFR-001](../nfr.md#performance)）之雙頁渲染 + 燒錄，總耗時 < 3000ms（單機、暖機後量測；CI 環境雜訊大，
  建議寬鬆判定或僅記錄耗時不斷言，交由 tdd-developer 依 CI 穩定性決定是否納入硬性斷言）
- **AC**：`nfr.md#watermark` AC3 情境 4（F038 新舊版下載燒錄）
- **檔案**：`backend/src/lifecycle/lifecycle-change-diff.service.spec.ts`（標記 `[NFR]`，或獨立
  `*.perf.spec.ts` 若專案有獨立效能測試慣例——目前未見此類檔案，建議併入既有 spec 並跳過 CI 強制門檻）

---

## §D：前端 — 新舊並列 modal（prototype 23 逐項對齊）

### D.0 設計決策：稽核呼叫點不變，僅資料來源端點替換

`openPreview()` **保留**既有 `await viewLifecycleChanges(ev.lifecycleId, cycName(ev.lifecycleId))` 呼叫
（記 `LIFECYCLE_CHANGELOG_VIEW`，`lifecycle-change-history.service.spec.ts` 既有測試不動）；**新增**呼叫
`getLifecycleTreeDiff(ev.lifecycleId, ev.id)`（`ev.id` 即該列之 `changeLogId`）取代原本的
`getLifecycleTreePreview(ev.lifecycleId)`。下載連結（表格列 + modal 頁尾）改用新
`lifecycleTreeDiffDownloadUrl(lifecycleId, changeLogId)`。

### D.1 取代既有測試（§0.1 已預告）

`ChangeHistoryPage.test.tsx` 第 134-147 行「循環 tab 預覽 → 記 LIFECYCLE_CHANGELOG_VIEW ＋重用 F036 樹圖
渲染（節點醒目標示）」：其斷言 `endpoints.getLifecycleTreePreview` 被呼叫、`tree-node-n4` 存在
`data-highlighted='true'`——本次改動後 `TreeTab` 不再呼叫 `getLifecycleTreePreview`（改呼叫
`getLifecycleTreeDiff`），且 modal 改為雙欄，不再有單一 `tree-node-{id}` + `data-highlighted` 語意。
**本文件以 TS-LCC-D-005 完整取代此案**（非交叉引用——舊斷言在新設計下必然失敗，需整段重寫，比照
doc-changelog-test-design.md §2.4 之取代模式）。

### D.2 Prototype 23 對齊查證（逐項，非僅版面文案）

| 項目 | prototype 23 權威行為 | 現行 React（待改） | 本文件設計目標 |
|---|---|---|---|
| Modal 版面 | `grid-cols-2`，左「變更前」／右「變更後（本筆快照）」（L225-234） | 單樹＋高亮 | 雙欄各自獨立渲染 |
| 圖例 | 3 色：新增(emerald實線)／移除(red虛線)／改名或掛載變更(amber)（L220-222） | 1 色：本次異動節點(amber) | 3 色圖例 |
| 移除標示 | 僅「變更前」欄，虛線框+刪除線文字+「將移除」標籤（CSS `.n-rm`） | 無 | 依設計 |
| 新增標示 | 僅「變更後」欄，實線綠框+「新增」標籤（CSS `.n-add`） | 無 | 依設計 |
| 改名/掛載標示 | 兩欄皆有，amber框+「變更前」/「變更後」標籤（CSS `.n-amber`） | 無 | 依設計 |
| 邊線標示 | `.e-add`(綠實線,粗)／`.e-rm`(紅虛線) | 無 | 依設計 |
| 浮水印 | 每欄各自平鋪（`.wm-layer`，兩份） | 單一疊加（現行單樹） | 每欄各自平鋪 |
| 下載按鈕文案 | 「下載新舊對照 PDF」 | 「下載樹狀圖 PDF」 | 改為前者，逐字對齊 |
| 頁尾說明文案 | 「變更後 DAG＝本筆完整快照、變更前＝前一筆快照」（架構決策）...（L203） | 「結構變更為 append-only 事件日誌；預覽/下載重用 F036...」 | 改為 prototype 逐字文案 |
| 稽核 badge | 「本預覽已寫入 LIFECYCLE_CHANGELOG_VIEW 稽核」（modal 內） | 同（已存在） | 沿用不變 |

### D.3 測試案例（unit — `frontend/src/pages/ChangeHistoryPage.test.tsx`，`TreeTab`/`TreeDiffModal`）

#### TS-LCC-D-001 「查詢」清單渲染不變（沿用既有測試，僅確認新舊行為不衝突，不重工）
- 交叉引用既有測試「切換至循環樹狀圖 tab → 渲染結構變更清單」，本文件不重新設計

#### TS-LCC-D-002 點擊「預覽」→ 呼叫 `getLifecycleTreeDiff(lifecycleId, changeLogId)`（新）＋
  `viewLifecycleChanges(lifecycleId, name)`（既有，不變）恰各一次
- **Given**：mock 兩函式皆 resolve
- **When**：點擊「預覽」按鈕
- **Then**：兩函式各被呼叫恰 1 次，且**不**再呼叫 `getLifecycleTreePreview`
- **AC**：§D.0 設計決策（gap-derived）
- **檔案**：`frontend/src/pages/ChangeHistoryPage.test.tsx`

#### TS-LCC-D-003 Modal 渲染雙欄：`data-testid="tree-board-before"` 與 `tree-board-after"` 皆存在，
  各自渲染各自 `before`/`after` 之節點清單（節點名稱、掛載數皆各自正確，不互相污染）
- **AC**：prototype 23 §D.2「Modal 版面」（逐字對應）
- **檔案**：同上

#### TS-LCC-D-004 `addNodes` 命中之節點 → 僅出現於 `tree-board-after`（`data-diff="add"`），`tree-board-before`
  不存在該節點
- **AC**：prototype 23 §D.2「新增標示」（逐字對應）
- **檔案**：同上

#### TS-LCC-D-005（取代舊案，見 §D.1）`rmNodes` 命中之節點 → 僅出現於 `tree-board-before`
  （`data-diff="remove"`），`tree-board-after` 不存在該節點；且 modal 不再有 `data-highlighted` 屬性語意
- **AC**：prototype 23 §D.2「移除標示」（逐字對應）＋ §D.1 取代宣告
- **檔案**：同上

#### TS-LCC-D-006 `amberNodes` 命中之節點 → 兩欄皆出現，皆帶 `data-diff="amber"`，`before` 側顯示舊名/舊
  掛載數、`after` 側顯示新名/新掛載數（before/after 資料不互相覆蓋）
- **AC**：prototype 23 §D.2「改名/掛載標示」（逐字對應）
- **檔案**：同上

#### TS-LCC-D-007 三色圖例文字皆渲染：「新增」／「移除」／「改名／掛載變更」
- **AC**：prototype 23 圖例（逐字對應）
- **檔案**：同上

#### TS-LCC-D-008 每欄各自顯示 `data-testid="watermark-overlay-before"`／`"watermark-overlay-after"`，內容
  皆等於 API 回傳之 `watermark` 字串（雙欄各自浮水印，非共用單一疊加層）
- **AC**：prototype 23 §D.2「浮水印」（逐字對應）
- **檔案**：同上

#### TS-LCC-D-009 下載連結（表格列內）href 改用 `lifecycleTreeDiffDownloadUrl(lifecycleId, changeLogId)`
  （非 `lifecycleTreeDownloadUrl(lifecycleId)`）
- **AC**：§D.0（gap-derived，回歸防護——避免表格列下載仍誤連 F036 單頁端點）
- **檔案**：同上

#### TS-LCC-D-010 Modal 內下載按鈕文案為「下載新舊對照 PDF」，href 同上新端點
- **AC**：prototype 23 §D.2「下載按鈕文案」（逐字對應）
- **檔案**：同上

#### TS-LCC-D-011 頁尾說明文案改為與 prototype 23 逐字一致（含「架構決策」與「變更前＝前一筆快照」字樣）
- **AC**：prototype 23 §D.2「頁尾說明文案」（逐字對應）
- **檔案**：同上

#### TS-LCC-D-012 `getLifecycleTreeDiff` 失敗（如 404 `LIFECYCLE_CHANGE_LOG_NOT_FOUND`）→ 顯示錯誤訊息，
  不開啟 modal（比照既有 `msgOf(e)`/`error` 狀態處理模式，`viewLifecycleChanges` 已成功呼叫但第二個
  API 失敗時仍需一致的錯誤呈現）
- **AC**：gap-derived（錯誤處理一致性）
- **檔案**：同上

#### TS-LCC-D-013 `before` 為空圖（第一筆事件）→ `tree-board-before` 顯示空狀態（非崩潰、非顯示殘留舊資料）
- **AC**：Edge Case 延伸（gap-derived）
- **檔案**：同上

#### TS-LCC-D-014 RBAC 封鎖畫面（Supervisor 等）→ 沿用既有測試（交叉引用，不重工），額外確認**不**呼叫
  `getLifecycleTreeDiff`（新函式亦不應被非授權角色觸發，比照既有 `getDocumentChanges` 之斷言模式延伸）
- **AC**：OQ-E07-04（既有斷言之新函式延伸）
- **檔案**：同上

#### TS-LCC-D-015 關閉 modal（按鈕/ESC）→ 兩欄狀態清空，下次開啟不殘留前次事件之 diff 標示（比照既有
  `closePreview()` 行為，新增雙欄場景之殘留檢查）
- **AC**：gap-derived（狀態管理回歸防護）
- **檔案**：同上

#### TS-LCC-D-016 `frontend/src/api/types.ts` 新增 `LifecycleTreeDiff` 型別／`endpoints.ts` 新增
  `getLifecycleTreeDiff`／`lifecycleTreeDiffDownloadUrl`：型別/簽章與後端 §C.2 契約一致（型別層測試，
  或以現有 API 呼叫測試間接鎖定，視專案是否有獨立型別測試慣例——現況未見，建議併入 D.002 等既有案例
  之呼叫參數斷言達成等效覆蓋，不另立獨立型別測試檔）

---

## §E：整合測試（`backend/test/int/lifecycle-changelog.itest.ts`，新檔）

> 新檔而非擴充既有 `changehistory.itest.ts`：本次新增範圍（快照表、雙頁下載、新 RBAC）夠大且自成一組，
> 獨立檔案可平行執行、失敗時更快定位（`changehistory.itest.ts` 現況已 273 行，涵蓋 F037+F038 既有查詢
> +doc-changelog A/B 兩項，不宜再無限累加）。沿用 `harness.ts` 之 `bootIntApp`/`shutdownIntApp`/`MARK`。

### E.1 `cleanupMarkers` 新增設計（🔴 需報告，任務明確要求）

**不修改 `harness.ts` 的共用 `cleanupMarkers()` 函式本身**——與既有 `LIFECYCLE_CHANGE_LOG` 同一先例：該表
現況**未**在 `harness.ts` 之 `cleanupMarkers()` 內清除，而是各 itest 檔案於自己的 `afterAll` 內以捕獲的
`lifecycleId` 變數手動清除（因 `LIFECYCLE_CHANGE_LOG` 無 `lifecycleName` 欄位可用 `MARK.lc` 前綴比對，
只能靠精確 id）。`LIFECYCLE_SNAPSHOT` 同理無法以 marker 前綴查詢，**採同一模式**：於本檔（新
`lifecycle-changelog.itest.ts`）自己的 `afterAll` 內，**於刪除 `LIFECYCLE_CHANGE_LOG` 之前**先刪
`LIFECYCLE_SNAPSHOT`（子表先於「父」表——雖無 DB FK 強制，仍以此順序清理避免混淆與未來若真的加上 FK 時
不必回頭改測試）：

```ts
afterAll(async () => {
  const q = AppDataSource.query.bind(AppDataSource);
  if (lifecycleId) {
    // 順序：LIFECYCLE_SNAPSHOT（子，changeLogId 回指）→ LIFECYCLE_CHANGE_LOG（父）
    await q(
      `DELETE FROM [LIFECYCLE_SNAPSHOT] WHERE [changeLogId] IN
         (SELECT [id] FROM [LIFECYCLE_CHANGE_LOG] WHERE [lifecycleId] = '${lifecycleId}')`,
    ).catch(() => undefined);
    await q(`DELETE FROM [LIFECYCLE_CHANGE_LOG] WHERE [lifecycleId] = '${lifecycleId}'`).catch(
      () => undefined,
    );
  }
  await shutdownIntApp(ctx); // 內部 cleanupMarkers() 再清 LIFECYCLE（by MARK.lc 前綴，級聯 NODE/EDGE）
});
```

**報告給人類**：`harness.ts` 之共用 `cleanupMarkers()` **不需修改**（`LIFECYCLE_SNAPSHOT` 遵循既有
`LIFECYCLE_CHANGE_LOG` 之 itest-local 清理先例，非新增例外）；若未來人類決定改為在 `LIFECYCLE_CHANGE_LOG`
補上 `lifecycleName` 欄位（見 §8 觀察項），屆時可將此兩表的清理一併收斂進 `harness.ts` 共用函式（以
`lifecycleName LIKE 'ZZINT_LC_%'` 取代精確 id 比對），現階段不建議為此單一好處而動 `data-model.md` 之
已定案 schema。

### E.2 測試案例

#### TS-LCC-E-001 建立循環 → 新增 2 節點 → 新增 1 連線 → 改名其一節點：查 `LIFECYCLE_SNAPSHOT` 恰 4 筆
  （逐動作各一筆，不聚合），`nodesJson`/`edgesJson` 皆為合法 JSON 且可 parse
- **AC**：OQ-E07-05 決議「逐原子操作各寫一筆」（逐字對應，真實 DB 落地驗證，非單元假體）
- **檔案**：`backend/test/int/lifecycle-changelog.itest.ts`

#### TS-LCC-E-002 每筆 `LIFECYCLE_CHANGE_LOG.snapshotId` 皆非 `NULL`，且等於對應 `LIFECYCLE_SNAPSHOT.id`；
  反向 `LIFECYCLE_SNAPSHOT.changeLogId` 亦正確回指（雙向交叉引用，真實 DB 驗證 TS-LCC-A-005 之單元假體
  結論）
- **AC**：data-model.md 1:1 定義（逐字對應）
- **檔案**：同上

#### TS-LCC-E-003 `GET .../changes/:changeLogId/tree-diff`（對「改名」事件）→ `before.nodes` 含節點舊名，
  `after.nodes` 含新名，`diff.amberNodes` 含該節點 id
- **AC**：F038 AC「並列/可切換呈現變更前後兩版本樹狀圖」（逐字對應，端到端）
- **檔案**：同上

#### TS-LCC-E-004 `GET .../tree-diff`（對循環**第一筆**事件，即第一個新增節點）→ `before = {nodes:[],
  edges:[]}`（空圖，非查詢錯誤）
- **AC**：architecture-spec.md §4.8「無更早紀錄視為空 DAG」（逐字對應，端到端）
- **檔案**：同上

#### TS-LCC-E-005 `GET .../tree-diff/download` → 200，`Content-Type: application/pdf`，body 以 `%PDF-` 開頭，
  以 `pdf-lib` 反解該 buffer 之 `getPageCount()` 恰為 `2`（測試內直接 `PDFDocument.load(res.body)` 驗證頁數，
  非僅檢查 header）
- **AC**：F038 AC「取得...PDF」＋ architecture-spec.md §5.9「單一 PDF、兩頁」（逐字對應，最關鍵之端到端
  驗證——單元測試無法驗證真實 pdf-lib 位元組層頁數，此案為唯一權威來源）
- **檔案**：同上

#### TS-LCC-E-006（§C.4 不對稱，端到端）Supervisor 呼叫本文件新端點 `tree-diff/download` → 403；同一
  Supervisor 呼叫 F036 既有 `tree-preview/download`（同循環）→ 200（對照驗證，鎖定刻意不對稱非環境差異）
- **AC**：OQ-E07-04 定案 ＋ §C.4（逐字對應）
- **檔案**：同上

#### TS-LCC-E-007 下載完成後 → 觸發 `AuditWriterService.processOutboxRetry()` → `AUDIT_LOG` 查得一筆
  `actionType='LIFECYCLE_CHANGELOG_DOWNLOAD'`（比照既有 `lifecycle.itest.ts` 之 Outbox 驗證手法）
- **AC**：F038 AC「各記一筆稽核」DOWNLOAD 半句（逐字對應）
- **檔案**：同上

#### TS-LCC-E-008 文件掛載事件（F009 mount）→ 對應 `LIFECYCLE_SNAPSHOT.nodesJson` parse 後，該節點之 `docs`
  陣列含新掛載文件之 `id`+`documentNumber`（真實 DB 驗證 TS-LCC-A-009 假體結論）
- **AC**：data-model.md `nodesJson` 定義「掛載文件 id+documentNumber 清單」（逐字對應）
- **檔案**：同上

#### TS-LCC-E-009 `changeLogId` 帶入不存在之 UUID → `GET .../tree-diff` 回 404
  `LIFECYCLE_CHANGE_LOG_NOT_FOUND`
- **AC**：§B.1／§C.5-002（端到端驗證）
- **檔案**：同上

#### TS-LCC-E-010（交易一致性端到端佐證，非強制模擬中斷）任一結構操作成功後，`LIFECYCLE_NODE`/`EDGE`
  真實列數 與 `LIFECYCLE_CHANGE_LOG` 列數 與 `LIFECYCLE_SNAPSHOT` 列數 三者於同一批操作後**恆一致**
  （逐動作 1:1:1，非用於證明「rollback 語意」本身——真正的 rollback 驗證見 §A.4 單元測試以假體模擬，
  真實 MSSQL 中途斷線難以於整合測試環境可靠注入，此為已知測試限制，見 §8）
- **AC**：§0.3 交易一致性關鍵發現之 happy-path 佐證（gap-derived）
- **檔案**：同上

---

## 追溯矩陣（AC → 測試案例，僅列本文件新設計部分）

| F038 Acceptance Criteria | 涵蓋案例 |
|---|---|
| 清單查詢（循環/時間區間/分頁/排序） | 既有測試覆蓋（§0.1），不重工 |
| F008 結構事件記錄 | 既有測試覆蓋（§0.1），不重工 |
| F009 結構事件記錄 | 既有測試覆蓋（§0.1），不重工 |
| 並列/可切換呈現變更前後兩版本樹狀圖，差異視覺標示 | TS-LCC-B-001~016、D-003~008、E-003、E-004 |
| 下載：伺服器端產生、浮水印燒錄進內容層、單一 PDF 兩頁 | TS-LCC-C-004~007、C-012、D-009~010、E-005 |
| 各記一筆稽核（VIEW／DOWNLOAD） | TS-LCC-C-001、C-004、C-005、E-007 |
| 主管/部門窗口/一般使用者 → 403（OQ-E07-04） | TS-LCC-C-008、D-014、E-006 |
| 循環無歷史結構變更事件 → 空狀態 | 既有測試覆蓋（§0.1「循環尚無結構變更事件」空狀態），本文件新增之空圖情境見 A-002、B-008/010、D-013、E-004 |
| 稽核寫入失敗不阻斷 | TS-LCC-C-005 |
| 變更日誌寫入與來源交易一致性（§5.9） | TS-LCC-A-005~011、E-002、E-010 |

---

## 假設與設計決策彙總

1. `snapshotId` 於 DB 層設為 `NULL`able（應用層恆填，見 §A.1）。
2. `LIFECYCLE_SNAPSHOT.changeLogId`／`LIFECYCLE_CHANGE_LOG.snapshotId` 皆**不**加 DB FK，僅索引（比照既有
   `lifecycleId` 慣例，見 §A.1）。
3. 交易一致性（§0.3/§A.4）以「觀察行為契約」設計，不綁定 `DagStore`/`NodeDocsStore` 確切新簽章。
4. 新端點物理上掛 `LifecycleModule`（新 Controller/Service），非 `ChangeHistoryModule`，以避免模組循環
   依賴（見 §C.1）；`ChangeHistoryModule.exports` 需新增兩個 store token。
5. 新雙頁渲染器為**獨立介面**，不修改既有 `LifecycleTreePdfRenderer.render()` 契約（零回歸風險）。
6. 前端 `openPreview()` 稽核呼叫點（`viewLifecycleChanges`）保持不變，僅資料端點替換為 `getLifecycleTreeDiff`
   （見 §D.0）；下載稽核（`LIFECYCLE_CHANGELOG_DOWNLOAD`）改由新 `LifecycleChangeDiffService` 自行記錄
   （既有查詢服務未覆蓋此稽核類型）。
7. OQ-E07-06（PDF 排版：單一兩頁 vs 兩份）視為已由 prototype 23 demo 邏輯確認（見 §0.5），不再視為待決。
8. 60 秒編輯階段之「清單分組顯示」不在本輪範圍（見 §0.6），重建函式僅提供 group 模式之函式層級支援
   （§B.1 `reconstructBeforeAfterForGroup`）。

---

## 開放問題（回報人類；不阻擋本文件既有測試設計之落地）

### OQ-LCC-01（🟡 非阻擋，供人類/PO 確認）60 秒編輯階段之清單分組顯示是否納入本輪
architecture-spec.md §4.8 決議之「查詢層動態分組」文字似乎期待**清單**（非僅重建函式）呈現分組後的
可展開項目，但 prototype 23 之 demo 資料未曾示範此情境（各事件間隔皆 >1 天）。本文件僅設計了
「重建函式支援 group 模式」（§B.1），**未**設計清單 UI 分組（§0.6 明示排除）。**需人類確認**：F038
本輪是否要求清單本身也做 60 秒分組顯示？若是，需追加：(a) 分組演算法之歸屬（前端 `groupDoc()`
模式 vs 後端 `queryLifecycleChangeLog()`，兩者現況先例不一致，F037 為前端、架構文字暗示 F038 可能
為後端）、(b) 分組後清單列的「預覽」按鈕應呼叫 group 模式或退化為只取最後一筆事件。

### OQ-LCC-02（🟢 非阻擋，觀察項）`LIFECYCLE_CHANGE_LOG` 現行 schema 與 data-model.md 決議之既存落差
`lifecycleName`（循環名稱快照）、`entityType`（NODE/EDGE/MOUNT）、操作者 `department`/`section` 快照
於 data-model.md 列為必填，但現行 entity（F008/F009 併回時建立）未包含這些欄位。**此落差非本次任務
新增**，且不影響本文件之重建/diff/燒錄邏輯正確性（重建演算法僅依賴 `lifecycleId`/`occurredAt`/
`snapshotId`）。是否於未來另立 migration 補齊，屬產品/架構決定，本文件不代為決定。

### OQ-LCC-03（🟡 需人類裁定）新錯誤碼 `LIFECYCLE_CHANGE_LOG_NOT_FOUND` 需補入 `error-handling.md`
`error-handling.md` 為凍結文件，本文件不可修改。§B.1/§C.5 設計之新 404 錯誤碼需人類/spec-writer 另行
補入該檔案「權限（功能面/欄位面）」或既有 `_NOT_FOUND` 表格區塊（比照 `NODE_NOT_FOUND`/
`DOCUMENT_NOT_FOUND` 慣例格式）。

### OQ-LCC-04（🟢 非阻擋，測試限制記錄）§A.4／§E.2 交易 rollback 之整合測試層級驗證限制
真實 MSSQL 中途斷線/交易失敗難以在現有 `harness.ts` 整合測試環境可靠、確定性地注入（無 fault-injection
機制）。本文件之「rollback 語意」驗證僅於**單元測試層級**（§A.4，以假體模擬）覆蓋；整合測試層級
（TS-LCC-E-010）僅能佐證 happy-path 下三表列數 1:1:1 一致，**不能**證明失敗路徑確實回滾。若需更高信心，
建議未來評估注入點（如 `LifecycleSnapshotStore.append()` 之測試替身覆寫）於 itest 環境亦可行，但屬
超出本輪測試設計範圍之基礎設施投資。
