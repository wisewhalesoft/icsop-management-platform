# Epic E12: 業務/功能類別管理

> **Epic ID**: E12
> **Priority**: P1
> **Phase**: 1
> **Status**: 🔵 **DRAFT / awaiting-human-review**（2026-09-02）
> **Stories**: 3 個
> **Feature 編號**: [F043](../../../specs/features/F043-business-function-category.md)（已建立）

## 需求來源（使用者原文，2026-09-02，逐字保留）

> 「在循環管理下方新增「業務/功能類別管理」— 比照循環管理模式，可建 DAG 畫布，文件(不再需要限制循環)可掛載於節點，並且不同於循環管理，移除一份文件只能掛在單一節點的限制。此功能開放給 ICSOP 管理員 CRUD，系統管理員 / 主管 唯讀。另外需要在 ICSOP 文件管理清單新增一欄「業務/功能類別」，需要做成篩選欄位，與比照連結點文件的 UI 顯示方式呈現該文件有掛的業務/功能類別。使用者瀏覽前台的部分，須區分為業務/功能類別樹狀圖(可切換業務/功能類別)與目前的文件清單瀏覽模式(預設為業務/功能類別樹狀圖模式)，供前台使用者瀏覽文件。」

## Epic Goal

現行系統中，ICSOP 程序書只有**一條**分類軸——「循環（Life Cycle）」，其模型為 DAG，且**一份文件僅屬一個循環節點**（[F009](../../../specs/features/F009-node-drawer-maintenance.md) 定案）。該模型正確描述的是「這份程序書在**流程**上的位置」，因為一份程序書在一條流程上只會出現在一個位置。

但實務上另有一條與流程**正交**的分類需求：**這份程序書在業務／功能上屬於哪一類**（例：授信、風險管理、帳務處理）。此分類是**標籤式**的——同一份程序書可以同時是「授信」也是「風險管理」，且與它落在哪一個循環無關。把它硬塞進既有循環模型會同時撞到兩堵牆：① 候選文件被 `lifecycleId` 過濾，跨循環的合法組合根本挑不到；② 單一歸屬使多重分類無法表達。

本 Epic 因此建立**與循環平行且完全獨立之第二套 DAG 分類骨架**：類別池、節點與邊、以及**多對多**的文件掛載，並在後台文件清單與前台瀏覽兩處開出對應的可見面。

**四項核心裁決（人類已裁決，不得重開、不得改寫語意）**：

1. **掛載模型＝完全多對多**：一份文件可同時掛在多個類別的多個節點；join table 之唯一鍵**僅** `(nodeId, documentId)`（防重複列）。同一份程序書可同時歸屬「授信」與「風險管理」兩個功能類別。
2. **配套全做，與循環管理完全對等**：① 停用/啟用 ＋ 刪除保護（比照 [F007](../../../specs/features/F007-lifecycle-pool-crud.md)）；② 子分類（比照 [F040](../../../specs/features/F040-lifecycle-subcategory.md)）；③ 樹狀圖預覽／PDF 下載／列印含浮水印（比照 [F036](../../../specs/features/F036-lifecycle-tree-preview.md)）；④ 結構變更歷程＋快照（比照 [F038](../../../specs/features/F038-lifecycle-tree-change-history.md)）。
3. **前台樹狀圖呈現＝比照現行循環樹狀圖**（沿用 [F036](../../../specs/features/F036-lifecycle-tree-preview.md) 之節點圖＋平移縮放，雙擊節點開抽屜列出該節點掛載文件，頂部下拉切換類別）。
4. **ICSOP 文件管理清單新欄納入 CSV 匯出**：現行 CSV **14 欄增為 15 欄**，多值以分隔符併為一格。

> ⚠ **本 Epic 明文推翻 [F009](../../../specs/features/F009-node-drawer-maintenance.md) 兩條限制對本功能之適用性**（**非**推翻 F009 本身——F009 之條文、行為與測試一字不改）：① 候選清單僅顯示所屬循環＝當前循環之文件；② 一份文件僅屬一個節點（含其警示、二次確認與改派語意）。**逐條對照表＝[F043 §推翻總表](../../../specs/features/F043-business-function-category.md#override-table)，該表為本次推翻範圍之單一真相來源。** 本 Epic 及其 Story **不自行宣告任何一條既有 AC 之最終存廢**。

## User Stories

| Story ID | Title | Priority | File |
|---|---|---|---|
| US-106 | 業務/功能類別池與 DAG 畫布（含子分類、停用、刪除保護、防環） | P1 | [US-106-business-category-pool-and-dag.md](US-106-business-category-pool-and-dag.md) |
| US-107 | 文件多對多掛載與後台清單之「業務/功能類別」欄／篩選／匯出 | P1 | [US-107-business-category-document-mount.md](US-107-business-category-document-mount.md) |
| US-108 | 前台兩種瀏覽模式（業務/功能類別樹狀圖／文件清單） | P1 | [US-108-public-category-tree-browsing.md](US-108-public-category-tree-browsing.md) |

## Dependencies

**Depends On**：
- [E03 循環與 DAG](../E03-lifecycle-dag/epic-brief.md) — 本 Epic 之類別池、DAG 畫布、樹狀圖預覽與變更歷程**逐項比照**該 Epic 之既有規格（[US-020](../E03-lifecycle-dag/US-020-lifecycle-pool-crud.md)／[US-021](../E03-lifecycle-dag/US-021-dag-node-edge-maintenance.md)／[US-022](../E03-lifecycle-dag/US-022-dag-cycle-prevention.md)／[US-025](../E03-lifecycle-dag/US-025-lifecycle-tree-preview.md)），並**明文推翻** [US-023](../E03-lifecycle-dag/US-023-node-drawer-maintenance.md)／[US-024](../E03-lifecycle-dag/US-024-node-document-filter-warning.md) 兩條限制對本功能之適用性。
- [E04 ICSOP 文件管理 / US-030](../E04-icsop-document/US-030-create-icsop-document.md) — ICSOP 文件須先存在，節點才有掛載對象。
- [E04 ICSOP 文件管理 / US-037](../E04-icsop-document/US-037-backend-document-list-search.md) — 後台文件清單為新欄／新篩選／CSV 新欄之落點。
- [E06 前台瀏覽 / US-050～US-052](../E06-public-browsing/epic-brief.md) — 前台瀏覽頁為兩種模式切換之落點；其可見性判定（已公告＋[F041](../../../specs/features/F041-user-subtype-business-scope.md) 業務子分類部門過濾）必須在樹狀圖模式一樣生效。
- [E08 權限矩陣 / US-070](../E08-permission-matrix/US-070-role-function-matrix.md) — 需新增一列功能矩陣（第 15 列）。

**Blocks**：
- [E07 稽核與變更歷程](../E07-audit-trail/epic-brief.md) — 結構變更歷程需於「文件變更歷程」頁新增第三個 tab；其資料表落點與稽核動作類型待 system-architect 裁定。
- [E09 智慧問答（RAG）](../E09-rag-qa/epic-brief.md) — 業務/功能類別**日後**可能成為檢索之 metadata 維度；**本 Epic 明確不做**，僅記錄此可能性。

## Success Criteria

- ICSOP 管理員可建立、編輯、停用、刪除業務/功能類別，並在其 DAG 畫布上維護節點與有向邊（防環由後端於交易內權威保證）。
- 任一類別之任一節點，其候選文件為**全部** ICSOP 文件；掛載時**不因該文件屬於哪個循環、或已掛在何處而受阻或被警示**。
- 同一份程序書可同時掛在多個類別的多個節點，且**移除其中一筆掛載不影響其餘任何一筆**，亦不影響其循環節點掛載。
- 後台文件清單可一眼看出每份文件所屬之業務/功能類別、可依該欄篩選，並可匯出含該欄之 CSV。
- 前台使用者預設看到業務/功能類別樹狀圖、可切換類別、可雙擊節點檢視其掛載文件，亦可切回原本的文件清單模式；**兩種模式所能觸及之文件集合完全相同**（樹狀圖不得成為繞過可見性限縮之側門）。
- 循環管理之既有行為（[F007](../../../specs/features/F007-lifecycle-pool-crud.md)／[F008](../../../specs/features/F008-dag-node-edge.md)／[F009](../../../specs/features/F009-node-drawer-maintenance.md)／[F036](../../../specs/features/F036-lifecycle-tree-preview.md)／[F038](../../../specs/features/F038-lifecycle-tree-change-history.md)／[F040](../../../specs/features/F040-lifecycle-subcategory.md)）**逐條不變**，且 `ICSOP_DOCUMENT` **一欄未新增**。

## Open Questions

本 Epic 之待裁決清單（`OQ-B-01` ～ `OQ-B-10`，共 10 題）與 10 項 `[ASSUMPTION]`，**集中登錄於 [F043 §給人類閘門的審查清單](../../../specs/features/F043-business-function-category.md#human-gate-review)**，本檔僅列標題供索引：

- [ ] `OQ-B-01`〔🔴 **BLOCKING**〕：變更歷程／快照之資料表落點（擴充既有多型 vs 新增兩張平行表）——建議**乙**
- [x] ~~`OQ-B-02`~~：「文件變更歷程」第三個 tab 之權限閘門——🟢 **已裁決＝甲**（2026-09-02）：tab 標籤逐字 `業務/功能類別樹狀圖`、閘門沿用「文件變更歷程」列 ⇒ **主管有類別管理唯讀權但看不到其變更歷程，此落差刻意**（[F043](../../../specs/features/F043-business-function-category.md) `AC-40`／`AC-54`）
- [ ] `OQ-B-03`：前台是否列出「沒有任何可見文件」之類別——建議**不列**
- [ ] `OQ-B-04`：停用之類別，其既有掛載是否仍出現在後台清單第 16 欄——建議**仍顯示**
- [ ] `OQ-B-05`：一份文件可掛載之類別／節點數是否設上限——建議**不設**（但須對真庫實測分佈）
- [ ] `OQ-B-06`：節點名稱是否必填——建議**可先未命名**（比照 F008）
- [ ] `OQ-B-07`：`subcategory` 長度上限與是否需專屬錯誤碼——**沿用 F040 既有處置**
- [x] ~~`OQ-B-08`~~：[F026](../../../specs/features/F026-role-field-matrix.md) 是否需要新增一列——🟢 **已裁決＝不新增**（2026-09-02）：維持 20 列逐格不變（[F043](../../../specs/features/F043-business-function-category.md) `AC-51`）
- [ ] `OQ-B-09`：稽核動作類型之數量與 [F024](../../../specs/features/F024-access-history-query.md) 類型篩選值是否由五擴為六——待 system-architect
- [ ] `OQ-B-10`：前台瀏覽模式之選擇是否跨 session 記憶——建議**不記憶**

## 本 Epic 明確不做（範圍紀律）

- ❌ **不**在文件建立／編輯表單上新增任何「業務/功能類別」欄位——掛載之唯一寫入路徑為類別節點抽屜。
- ❌ **不**在 `ICSOP_DOCUMENT` 上新增任何欄位。
- ❌ **不**改動循環管理之任一既有行為、錯誤碼、端點形狀或 DOM 掛鉤。
- ❌ **不**提供前台樹狀圖之 PDF 下載／列印（使用者原文對前台只說「供前台使用者瀏覽文件」）。
- ❌ **不**把業務/功能類別納入 RAG 檢索之 metadata 維度（E09 之未來可能性，本輪僅記錄）。
- ❌ **不**重開 [F040](../../../specs/features/F040-lifecycle-subcategory.md) `OQ-E03-10`（唯一性涵蓋停用列）與 `OQ-E03-11`（子分類長度）之既有裁決。
