# F043: 業務/功能類別管理
Priority: P1 | Status: 🟢 **APPROVED（2026-09-02 人類閘門通過，三輪共 12 項裁決）**——`OQ-B-01`～`OQ-B-10` **10 題全數結案**、12 項 `[ASSUMPTION]` **全數確認**、system-architect 8 項已裁定（[第 14 章](../architecture-spec.md#ch14-f043) 決策 E1～E9）；**已核准進入 Phase B（實作）** | Last Updated: 2026-09-02

> 🔴 **實作前置警語（核准的是「規格」，不是「migration 已跑」）**
> 本檔之 `🟢 APPROVED` 表示**規格內容獲人類閘門核准**、可以開工；它**不表示**任何資料表已經存在。
> **本功能需三支 migration**——`BUSINESS_CATEGORY` ＋ `BUSINESS_CATEGORY_NODE` ＋ `BUSINESS_CATEGORY_EDGE` ＋ `BUSINESS_CATEGORY_DOC` 四張表（[data-model](../data-model.md#business-category-entity)）、`BUSINESS_CATEGORY_CHANGE_LOG` ＋ `BUSINESS_CATEGORY_SNAPSHOT` 兩張表（[決策 E1](../architecture-spec.md#ch14-f043)）、`AUDIT_LOG` 之 additive 欄位（[決策 E3](../architecture-spec.md#ch14-f043)）——**每一支都必須對 dev 真庫實跑並覆核，才算兌現。**
> 🔴 **單元測試全綠證明不了資料表存在。** 本 repo 已**三度**重演同一形狀：migration 寫了但沒對真庫跑（或跑了但寫入路徑沒接線）⇒ **少數功能回 500、其餘一切正常**——那個「少數 500、多數正常」就是缺 migration 的特徵形狀，兩端單元測試在整個過程中都是綠的。
> **⇒ 驗收條件（缺一不可）**：① 三支 migration 對 dev 真庫實跑 COMMIT；② 以 `SELECT` 覆核四張新表與兩張歷程表確實存在且索引語意正確（特別是 `BUSINESS_CATEGORY` 之 `(name, subcategory)` 唯一索引與 `BUSINESS_CATEGORY_DOC` 之 `(nodeId, documentId)` 唯一鍵）；③ 重建 image 並實際開過一次後台類別池、DAG 畫布、節點抽屜與前台樹狀圖。**未做完這三項者，不得宣稱本功能已上線。**
Epic/Story: E12 / [US-106](../../stories/epics/E12-business-function-category/US-106-business-category-pool-and-dag.md)（類別池與 DAG）＋[US-107](../../stories/epics/E12-business-function-category/US-107-business-category-document-mount.md)（多對多掛載）＋[US-108](../../stories/epics/E12-business-function-category/US-108-public-category-tree-browsing.md)（前台兩種瀏覽模式）

> 🟢 **本檔已於 2026-09-02 經人類閘門核准（三輪共 12 項裁決），可進入 Phase B 實作。** 全部 `[ASSUMPTION]`（12 項，**全數確認**）與 `OQ-B-01`～`OQ-B-10`（**全數結案**）之逐項裁決紀錄集中於檔尾 [§給人類閘門的審查清單](#human-gate-review)。<br>📝 **原措辭逐字保留供追溯**：`OLD>` 「🔵 **本檔為 DRAFT，供人類閘門審查用。**⋯**本輪不寫任何程式碼、不寫測試、不建 prototype、不建 migration 檔。**」——該範圍紀律適用於 2026-09-02 之**規格輪**，核准後已解除；🔴 **惟「migration 未實跑 ≠ 已兌現」之警語仍然有效**，見檔頭之實作前置警語。
> **AC 編號規則**：F043 內部主 AC 自 **`AC-01`** 起；**跨檔之 delta AC 一律採 `AC-B#`**（B＝business category 批，2026-09-02；已 grep 確認 `AC-B` 於本 repo 全域未被使用，與既有 `AC-C#`／`AC-D#`／`AC-E#`／`AC-F#`／`AC-J#`／`AC-M#`／`AC-N#`／`AC-P#`／`AC-R#`／`AC-S#`／`AC-T#`／`AC-U#`／`AC-X#`／`AC-Y#` 批次區隔、不重號）。🔴 **明文禁止續編 `AC-N83` 以後**（`AC-N#` 為 2026-08-20 D9 批之保留區間）、**禁止續編 `AC-J27` 以後**（`AC-J#` 為 E11 OJT 批之保留區間）。
> 🔴 **本功能為 [F007](F007-lifecycle-pool-crud.md)／[F008](F008-dag-node-edge.md)／[F009](F009-node-drawer-maintenance.md)／[F036](F036-lifecycle-tree-preview.md)／[F038](F038-lifecycle-tree-change-history.md)／[F040](F040-lifecycle-subcategory.md) 之**平行第二套**結構，不是它們的 delta。** 循環管理之任一條文**一字不改**（[§庚 回歸鎖定](#regression-lock)）；本檔凡與該六檔對等者一律逐條標註「比照 Fxxx AC-yy」，凡刻意相異者一律標註「**本功能推翻 Fxxx 第 N 條，理由＝…**」（集中於 [§丙](#mount-section) 與 [§既有條文推翻總表](#override-table)）。

## 需求來源（使用者原文，逐字保留）

> 「在循環管理下方新增「業務/功能類別管理」— 比照循環管理模式，可建 DAG 畫布，文件(不再需要限制循環)可掛載於節點，並且不同於循環管理，移除一份文件只能掛在單一節點的限制。此功能開放給 ICSOP 管理員 CRUD，系統管理員 / 主管 唯讀。另外需要在 ICSOP 文件管理清單新增一欄「業務/功能類別」，需要做成篩選欄位，與比照連結點文件的 UI 顯示方式呈現該文件有掛的業務/功能類別。使用者瀏覽前台的部分，須區分為業務/功能類別樹狀圖(可切換業務/功能類別)與目前的文件清單瀏覽模式(預設為業務/功能類別樹狀圖模式)，供前台使用者瀏覽文件。」

## 人類裁決（2026-09-02，權威，不得再翻案）

| # | 裁決 | 落點 |
|---|---|---|
| **決 1** | **掛載模型＝完全多對多**：一份文件可同時掛在多個類別的多個節點；join table 唯一鍵**僅** `(nodeId, documentId)`（防重複列）。同一份程序書可同時歸屬「授信」與「風險管理」兩個功能類別 | [§丙](#mount-section) `AC-20`～`AC-31`、[data-model](../data-model.md#business-category-doc) |
| **決 2** | **配套全做，與循環管理完全對等**：① 停用/啟用 ＋ 刪除保護（比照 [F007](F007-lifecycle-pool-crud.md)）；② 子分類（比照 [F040](F040-lifecycle-subcategory.md)）；③ 樹狀圖預覽／PDF 下載／列印含浮水印（比照 [F036](F036-lifecycle-tree-preview.md)）；④ 結構變更歷程＋快照（比照 [F038](F038-lifecycle-tree-change-history.md)） | [§甲](#pool-section)／[§乙](#dag-section)／[§丁](#tree-section)／[§戊](#history-section) |
| **決 3** | **前台樹狀圖呈現＝比照現行循環樹狀圖**（沿用 [F036](F036-lifecycle-tree-preview.md) `LifecycleTreePreviewPage` 之節點圖＋平移縮放，雙擊節點開抽屜列出該節點掛載文件，頂部下拉切換類別） | [F019 delta](F019-public-list-browsing.md#business-category-browse-delta) `AC-B12`～`AC-B27` |
| **決 4** | **ICSOP 文件管理清單新欄納入 CSV 匯出**：現行 CSV **14 欄增為 15 欄**，多值以分隔符併為一格 | [F017 delta](F017-backend-document-list.md#business-category-column-delta) `AC-B1`～`AC-B11` |

### 🟢 同日第二輪人類裁決（4 項，2026-09-02；spec-writer 提報之推定經逐項確認）

| # | 裁決 | 原提報 | 落點 |
|---|---|---|---|
| **決 5** | 🟢 **主管權限之刻意不對稱＝確認為本意**：`循環管理（DAG）`.主管 ＝ `無`、`業務/功能類別管理`.主管 ＝ `唯讀`，**兩列刻意不同**。`AC-B29` 之成對斷言**維持原樣** | spec-writer 提請確認 | `AC-44`／[F025](F025-role-function-matrix.md#business-category-function-key-delta) `AC-B29` |
| **決 6** | 🟢 **前台樹狀圖模式不提供 PDF 下載／列印**；PDF 下載／列印**僅後台**類別管理之樹狀圖預覽有（比照 [F036](F036-lifecycle-tree-preview.md)） | `[ASSUMPTION]` **A4** | `AC-53`（新增）／[F019](F019-public-list-browsing.md#business-category-browse-delta) `AC-B26` |
| **決 7** | 🟢 **結構變更歷程＝「文件變更歷程」頁新增第三個 tab**，標籤逐字 **`業務/功能類別樹狀圖`**、置於既有兩個 tab 之後；**權限沿用該頁既有之「文件變更歷程」功能鍵**（SysAdmin／ICSOPAdmin 唯讀，**主管看不到**） | `OQ-B-02`（甲案）＋`[ASSUMPTION]` **A6** | `AC-40`（就地改寫）／`AC-54`（新增） |
| **決 8** | 🟢 **[F026](F026-role-field-matrix.md) 不新增列**，維持 **20 列逐格不變** | `OQ-B-08`（甲案） | `AC-51`（措辭由「建議」改為「裁定」） |

> 🔴 **決 7 之逐字標籤已於本輪由 `業務/功能類別` 改為 `業務/功能類別樹狀圖`**（人類指定；與既有第二個 tab `循環樹狀圖` 同構）。<br>⚠ **由此產生一處刻意之字串重用，必須明記**：`業務/功能類別樹狀圖` 自此有**兩個互不相干的載體**——① 本 tab（後台「文件變更歷程」頁，閘門＝`文件變更歷程` read）；② 前台瀏覽模式標籤（[F019](F019-public-list-browsing.md#business-category-browse-delta) `AC-B12`，閘門＝`前台瀏覽`）。**兩者頁面不同、角色集合不同、行為不同**。<br>🔴 **對 test-generator 之明文要求**：任一針對該字串之斷言**必須先限定容器**（該頁／該分頁列），**明文禁止**以全域 `getByText('業務/功能類別樹狀圖')` 斷言——那在兩個載體任一存在時都會過，等於沒有鑑別力；亦**禁止**把兩處抽成同一個常數（它們碰巧同字，不是同一件事）。

## 本規格鎖定之命名（下游程式碼逐字使用，不得同義改寫） {#naming-lock}

| 類別 | 字串 | 狀態 | 說明 |
|---|---|---|---|
| 功能中文名（側選單項、[F025](F025-role-function-matrix.md) 矩陣列名、後台頁面標題） | **`業務/功能類別管理`** | 🔒 **鎖定** | 逐字採用（**半形斜線 `/`，前後無空白**）。**不得**改寫為「業務功能類別管理」「功能類別管理」「業務別管理」等同義詞（跨層識別碼 churn） |
| 文件清單欄名／篩選標籤／前台切換標籤 | **`業務/功能類別`** | 🔒 **鎖定** | 逐字採用；同一字串在三處消費（[F017](F017-backend-document-list.md#business-category-column-delta) 第 16 欄表頭、第 14 項篩選之無障礙名稱、前台模式切換之標籤詞根） |
| 前台瀏覽模式標籤（恰二值） | **`業務/功能類別樹狀圖`**（🔒 **預設**）／**`文件清單`** | 🔒 **鎖定** | 兩個逐字標籤；預設為前者（人類原文明訂）。⚠ 前者與下一列之字串相同但**載體不同**，見下方 🔴 |
| 「文件變更歷程」頁第三個 tab 之標籤 | **`業務/功能類別樹狀圖`** | 🔒 **鎖定（🟢 決 7，2026-09-02）** | 逐字採用，置於既有 `ICSOP 程序書`／`循環樹狀圖` 兩個 tab 之後；與第二個 tab `循環樹狀圖` 同構。<br>🔴 **本字串在本系統有兩個互不相干之載體**（本列 ＋ 上一列之前台模式標籤）：**頁面不同、閘門不同、角色集合不同、行為不同**。斷言時**必須先限定容器**，**明文禁止**全域 `getByText` 斷言，亦**禁止**把兩處抽成同一常數 |
| 程式碼識別子（英文） | `businessCategory` / `BUSINESS_CATEGORY` | 🔒 **鎖定** | 🔴 **明文禁止** `functionCategory`／`bizCat`／`bizCategory`／`category`（裸）等變體。實體表名、`FunctionKey` 常數、DTO 鍵、`data-*` 掛鉤一律以此為詞根 |
| FunctionKey 常數 | `FunctionKey.BUSINESS_CATEGORY_MANAGEMENT` | 🔵 建議 | 比照既有 `APPENDIX_MANAGEMENT`／`OJT_PROGRESS_MANAGEMENT` 之命名慣例 |
| 類別池實體 | `BUSINESS_CATEGORY` | 🔒 鎖定 | 比照 `LIFECYCLE` |
| 節點／邊實體 | `BUSINESS_CATEGORY_NODE`／`BUSINESS_CATEGORY_EDGE` | 🔒 鎖定 | 比照 `LIFECYCLE_NODE`／`LIFECYCLE_EDGE` |
| 掛載 join 實體 | `BUSINESS_CATEGORY_DOC` | 🔒 鎖定 | 🔴 **M:N join，不是 `ICSOP_DOCUMENT` 上的欄位**（見 INV-B4） |
| 顯示名稱純函式 | `businessCategoryDisplayName` | 🔒 鎖定 | 輸入 `{ name, subcategory }` → 顯示字串。**組合規則與 [F040](F040-lifecycle-subcategory.md) `lifecycleDisplayName` 逐字相同**（全形括號、前後無空白），並由 `AC-06` 之固定向量鎖住兩者不漂移 |
| 正規化純函式 | `normalizeSubcategory` | 🔒 **沿用既有、不新增第二份** | 🔴 **直接重用 [F040](F040-lifecycle-subcategory.md) 之既有純函式**（trim → 空值收斂為 `null`），該函式與循環領域無耦合。**明文禁止**複製一份 `normalizeBusinessCategorySubcategory`（`AC-05`） |
| 後端模組目錄與端點前綴 | `backend/src/business-categories/`／`/admin/business-categories` | 🔵 建議 | 比照 `backend/src/appendices/`／`/admin/appendices`；前台端點前綴 `/public/business-categories`（比照 `/public/documents`） |
| 前台模式切換之 URL query 鍵與值 | `mode=tree`（預設）／`mode=list` | 🔵 建議 | 供 deep link 與測試定位；缺鍵／不可辨識值一律視同 `tree`（`AC-B14`） |
| prototype 檔名 | `prototypes/26-business-category-list.html`／`27-business-category-canvas.html`／`28-business-category-node-drawer.html`／`29-business-category-tree-preview.html`／`30-public-category-tree.html` | 🟢 **已建立（ui-ux-designer，2026-09-02）** | 📝 **本列於 2026-09-02 就地更正為實際檔名**。`OLD>` spec-writer 撰稿時**保留**之三個編號為 `26-business-category-list`／`27-business-category-tree`／`28-public-category-tree`——實際交付為**五支**（畫布、節點抽屜、樹狀圖預覽各自成檔），且前台樹狀圖落在 **`30`** 而非 `28`。⚠ **保留編號是預估、不是契約**，凡引用 prototype 檔名處一律以磁碟實際檔名為準 |

## Description

「業務/功能類別」為與「循環」**平行且完全獨立**的第二套 DAG 分類骨架：ICSOP 管理員可建立類別池、於每個類別的 DAG 畫布上維護節點與有向邊，並將 ICSOP 文件掛載於節點上。

與循環管理之**兩大結構差異**（本功能之存在理由，逐條寫死於 [§丙](#mount-section)）：

1. **候選文件不以循環過濾**——任一類別的任一節點，其候選文件為**全部 ICSOP 文件**（`ICSOP_DOCUMENT` 全表），與該文件之 `lifecycleId` 無關。
2. **掛載為完全多對多**——一份文件可同時掛在多個類別的多個節點；掛載關係存於 `BUSINESS_CATEGORY_DOC`（`(nodeId, documentId)` 唯一），**不佔用** `ICSOP_DOCUMENT` 上的任何欄位。

其餘一切（子分類身分、停用/啟用、刪除保護、DAG 防環、樹狀圖預覽／PDF 燒錄下載／列印、結構變更歷程＋快照）**與循環管理逐項對等**。

本功能另新增兩處對外可見面：
- **後台**：[F017](F017-backend-document-list.md#business-category-column-delta) 文件清單新增第 16 欄「業務/功能類別」（比照第 12 欄連結點之 pill＋`+N` 摺疊呈現）、第 14 項篩選，並納入 CSV 匯出（14 → **15** 欄）。
- **前台**：[F019](F019-public-list-browsing.md#business-category-browse-delta) 瀏覽頁拆為兩種模式——`業務/功能類別樹狀圖`（**預設**）與 `文件清單`（＝現行行為，一字不改）。

## 本功能與循環管理之逐項對照（差異一覽） {#comparison}

| 面向 | 循環管理（F007–F009／F036／F038／F040） | 業務/功能類別管理（本檔） | 差異？ |
|---|---|---|---|
| 池之業務身分 | `(name, subcategory)` 組合（INV-1／INV-2） | 同左（INV-B1／INV-B2） | 同 |
| 子分類正規化 | `normalizeSubcategory` | **重用同一支函式** | 同 |
| 顯示名稱 | `lifecycleDisplayName` → `名稱（子分類）` | `businessCategoryDisplayName` → 同格式 | 同（另有逐字相同不變式 `AC-06`） |
| 停用/啟用 | `status ∈ {active, inactive}` | 同左 | 同 |
| 刪除保護 | 仍有文件掛載 → 409 `LIFECYCLE_HAS_DOCUMENTS` | 仍有文件掛載 → 409 `BUSINESS_CATEGORY_HAS_DOCUMENTS` | 同（碼不同） |
| DAG 防環 | 後端交易內權威驗證；`DAG_SELF_LOOP`／`DAG_CYCLE_DETECTED` | 同語意；`BUSINESS_CATEGORY_SELF_LOOP`／`BUSINESS_CATEGORY_CYCLE_DETECTED` | 同（碼不同，`AC-16` 說明為何不共用既有碼） |
| 連線樣式 | 直角 elbow（[F008](F008-dag-node-edge.md) OQ-E03-09） | 直角 elbow，**全系統一致** | 同 |
| **節點掛載候選** | **僅同循環之文件**（後端以 `lifecycleId` 過濾） | 🔴 **全部 ICSOP 文件，不過濾** | **異（推翻 [F009](F009-node-drawer-maintenance.md) 第 1 條限制）** |
| **一份文件之歸屬** | **僅屬一個節點**（`ICSOP_DOCUMENT.nodeId`，0..1） | 🔴 **可屬多節點、多類別**（M:N join） | **異（推翻 [F009](F009-node-drawer-maintenance.md) 第 2 條限制）** |
| **重複掛載之處置** | 警示 `NODE_DOC_ALREADY_ASSIGNED` ＋ 二次確認 ＋ 交易內改派 | 🔴 **無此語意**；新增／移除各自獨立，不確認、不改派 | **異** |
| 掛載寫入載體 | `ICSOP_DOCUMENT.nodeId`（文件表上的欄位） | `BUSINESS_CATEGORY_DOC` 之列（join table） | **異** |
| 樹狀圖預覽／下載／列印 | [F036](F036-lifecycle-tree-preview.md)（含燒錄浮水印＋稽核） | 比照，端點與稽核動作另立 | 同（動作類型不同） |
| 結構變更歷程 | [F038](F038-lifecycle-tree-change-history.md)（append-only 事件＋快照） | 比照 | 同（表落點待 system-architect） |
| 後台可視角色 | SysAdmin 唯讀／ICSOPAdmin CRUD／**主管 無**（2026-09-02 裁決） | SysAdmin 唯讀／ICSOPAdmin CRUD／**主管 唯讀** | 🔴 **異——見 `AC-44` 之明文理由** |
| 前台呈現 | 無（循環樹狀圖為後台功能） | 🔴 **有**——前台預設瀏覽模式 | **異** |

## 不變式（Invariants） {#invariants}

| ID | 不變式 | 違反時 |
|---|---|---|
| **INV-B1** | `(name, subcategory)` 組合於 `BUSINESS_CATEGORY` 全表唯一；`subcategory = null` 視為單一具體值參與比對（同名之「無子分類」列至多一筆）。**比對範圍涵蓋全部列、不分 `status`** | `BUSINESS_CATEGORY_DUPLICATE`（409） |
| **INV-B2** | 對任一 `name`，其列集合**要麼恰為一筆 `subcategory = null`，要麼全部 `subcategory ≠ null`**，兩者不得並存（雙向禁止） | `BUSINESS_CATEGORY_SUBCATEGORY_CONFLICT`（409） |
| **INV-B3** | `subcategory` 持久化值恆為 `null` 或非空之 trim 後字串（不得存在空字串或前後空白） | 由服務層入口之 `normalizeSubcategory` 保證 |
| **INV-B4** | 🔴 **兩套掛載互不干涉**：本功能之任一操作（建立／編輯／停用／刪除類別、增刪節點與邊、掛載／移除文件）**一律不讀、不寫、不清空 `ICSOP_DOCUMENT.nodeId`／`lifecycleId`**；反之 [F009](F009-node-drawer-maintenance.md) 之任一操作亦不影響 `BUSINESS_CATEGORY_DOC` 之任一列 | 回歸缺陷（`AC-27`／`AC-48` 雙向鎖定） |
| **INV-B5** | 同一 `BUSINESS_CATEGORY` 內所有邊構成有向無環圖；禁止 self-loop 與任何成環（後端交易內權威驗證） | `BUSINESS_CATEGORY_SELF_LOOP`／`BUSINESS_CATEGORY_CYCLE_DETECTED`（409） |
| **INV-B6** | `BUSINESS_CATEGORY_DOC` 之 `(nodeId, documentId)` 唯一。**這是全表唯一的唯一性約束**——**不得**另加 `(categoryId, documentId)` 或 `(documentId)` 之唯一鍵（任一者都會把「一份文件可掛多節點／多類別」變回單一歸屬，直接架空決 1） | `BUSINESS_CATEGORY_DOC_ALREADY_MOUNTED`（409） |

- 子分類值**可跨名稱重複**（`授信（消金）` 與 `徵審（消金）` 併存合法）——唯一性是「組合」而非「子分類本身」。
- **🔴 INV-B1 與循環之唯一性完全獨立**：`BUSINESS_CATEGORY` 與 `LIFECYCLE` 為兩張表，同名不衝突。**允許**存在名為「銷售及收款循環」之業務/功能類別（雖不建議），系統不做跨表比對、不回任何錯誤（`AC-04`）。
- **🔴 本功能無 `BUSINESS_CATEGORY_SUBCATEGORY_REQUIRED` 錯誤碼**（與 [F040](F040-lifecycle-subcategory.md) `LIFECYCLE_SUBCATEGORY_REQUIRED` 之刻意不對稱）：該碼之存在理由是「文件建立／編輯時必須**選到**一個具體循環」；本功能之掛載方向相反（**由類別節點挑文件**，文件端從不選類別），**沒有任何「只選到名稱層」之可達請求形狀** ⇒ 憑空新增該碼會產生一段**不可達程式碼**與一條**恆真的 AC**（`AC-10` 明文鎖定）。

## Preconditions

- 操作者為 ICSOP 管理員（[F025](F025-role-function-matrix.md#business-category-function-key-delta) 新增功能列「業務/功能類別管理」＝ICSOPAdmin `CRUD`）；SysAdmin／Supervisor 為 `唯讀`。
- 前台瀏覽另循「前台瀏覽」列（5 種角色皆為「可」），並疊加既有之**已公告過濾**與 [F041](F041-user-subtype-business-scope.md) **業務子分類使用部門過濾**（`AC-B20`～`AC-B23`）。

## Main Flow

### 甲、類別池 CRUD（比照 [F007](F007-lifecycle-pool-crud.md)）

1. 後台側選單「業務/功能類別管理」（🔒 **置於「循環管理」之下方**，人類原文明訂）→ 進入類別池清單頁。
2. 新增類別：輸入**名稱（必填）**、**子分類（非必填）**、說明 → 服務層以 `normalizeSubcategory` 正規化 → 依固定順序驗證 ① `BUSINESS_CATEGORY_NAME_REQUIRED` → ② INV-B1 → ③ INV-B2 → 建立、配發 UUID、**導向該類別 DAG 畫布編輯頁**。
3. 查詢清單：顯示 `businessCategoryDisplayName`、狀態、節點數量、**掛載文件數（去重後之相異文件數）**、最後更新時間；可依名稱／狀態篩選，關鍵字比對對象為顯示名稱（含子分類）。
4. 編輯：修改名稱／子分類／說明；唯一性驗證同步驟 2，惟**排除自身列**。
5. 刪除：檢查該類別是否仍有任何 `BUSINESS_CATEGORY_DOC` 列 → 有 → 409 `BUSINESS_CATEGORY_HAS_DOCUMENTS`（提示需先解除全部掛載）；無 → 刪除類別（含其節點／邊）並記錄稽核。
6. 停用：`status` 切為 `inactive`（**不受掛載限制**，可隨時執行）。

### 乙、DAG 節點與邊（比照 [F008](F008-dag-node-edge.md)）

1. 於類別 DAG 畫布新增節點（可先未命名），拖曳調整位置（持久化 `positionX`／`positionY`）。
2. 由節點 A 拖曳連線至 B → 建立 A→B，以**直角（orthogonal / elbow / step）箭頭**呈現（**非曲線**，與 [F008](F008-dag-node-edge.md)／[F036](F036-lifecycle-tree-preview.md)／[F038](F038-lifecycle-tree-change-history.md) 全系統一致）。
3. 允許多 parent／多 child。
4. 新增邊送出時：前端即時基本防環提示 → **後端於交易內權威驗證**（由 target 出發之可達性搜尋，若可達 source 即成環）→ 通過始寫入 `BUSINESS_CATEGORY_EDGE`。
5. 刪除節點：連動刪除其相關聯之邊**與其全部 `BUSINESS_CATEGORY_DOC` 掛載列**；若該節點已掛載 N 份文件，提示「刪除後將一併移除 N 筆掛載關係」並要求確認。

### 丙、節點掛載（🔴 本功能與循環管理之兩大差異所在）

1. 單擊節點 → 右側抽屜滑出，顯示節點名稱與**該節點目前掛載之文件清單**。
2. 候選文件清單＝**全部 ICSOP 文件**（可依程序書編號／書名關鍵字搜尋、分頁）；🔴 **不以 `lifecycleId` 過濾、不以任何循環條件過濾、不以「是否已掛載於他處」過濾**。
3. 選取候選文件 → **直接完成掛載**（寫入一筆 `BUSINESS_CATEGORY_DOC`）；🔴 **無警示、無二次確認、無改派語意**——即使該文件已掛在本類別的其他節點、或已掛在其他類別、或已有 `ICSOP_DOCUMENT.nodeId`（循環節點）。
4. 移除掛載 → 刪除該筆 `BUSINESS_CATEGORY_DOC` 列；🔴 **不影響文件本身、不影響其循環節點掛載、不影響其在其他類別／其他節點之掛載**。
5. 編輯節點名稱 → 畫布即時更新並持久化。
6. 每一次掛載／移除／改名／增刪節點與邊，各寫入一筆結構變更事件＋快照（[§戊](#history-section)）與一筆稽核。

### 丁、樹狀圖預覽／下載／列印（比照 [F036](F036-lifecycle-tree-preview.md)）

1. 類別池清單列之樹狀圖圖示 → 開新頁，帶入 `businessCategoryId`。
2. 後端依角色可視範圍校驗 → 回傳唯讀節點／邊資料 → 前端以上到下佈局、直角箭頭渲染；每節點顯示名稱與**掛載程序書數**。
3. 整頁對角平鋪疊加浮水印（格式權威同 [NFR-007](../nfr.md#watermark)；🔴 **本頁渲染 HTML、無 PDF 內容層可燒錄 ⇒ 疊加層為其唯一浮水印載體，必須保留**，比照 [F020](F020-watermark.md) `AC-N66` 對 `LifecycleTreePreviewPage` 之既有明文）。
4. 頂部類別切換器（後端角色過濾）→ 切換重繪，每次切換另記一筆檢視稽核。
5. 單擊節點：醒目標示該節點與其全部下游；雙擊節點：唯讀側抽屜列出**該節點子樹**所掛載之程序書（比照 [F036](F036-lifecycle-tree-preview.md#subtree-drawer-delta) `AC-T10`～`AC-T28` 之子樹語意）。
6. toolbar「下載」「列印」→ 伺服器端產生 PDF 並將浮水印**燒錄進內容層**，各記一筆獨立稽核。

### 戊、結構變更歷程（比照 [F038](F038-lifecycle-tree-change-history.md)）

1. 每一筆結構變更於**同一交易內**寫入 append-only 事件列＋該動作完成後之完整結構快照（節點＋邊＋各節點掛載文件清單）。
2. 「文件變更歷程」頁新增**第三個 tab** **`業務/功能類別樹狀圖`**（🟢 決 7 定值；與既有 `ICSOP 程序書`／`循環樹狀圖` 兩 tab 併存、置於其後）；可依類別、期間、變更類型查詢，並預覽／下載變更前後兩版本樹狀圖（燒錄浮水印）。**權限沿用該頁既有之「文件變更歷程」功能鍵 ⇒ 主管看不到**（`AC-54`）。
3. 「變更前」狀態＝同 `businessCategoryId`、`changedAt` 早於本筆之最近一筆事件之快照；若無更早紀錄，視為空 DAG。
4. 本 tab 提供「匯出」（CSV），規則權威＝[error-handling.md#export](../error-handling.md#export)（該節適用範圍由**五處**擴為**六處**）。

### 己、前台瀏覽（詳見 [F019 delta](F019-public-list-browsing.md#business-category-browse-delta)）

1. 前台瀏覽頁頂部提供**恰兩個**模式：`業務/功能類別樹狀圖`（**預設**）／`文件清單`。
2. 樹狀圖模式：頂部下拉切換類別（僅列 `active` 且**對該 viewer 至少有一份可見文件**之類別，`AC-B18`）→ 渲染該類別 DAG → 雙擊節點開唯讀抽屜列出該節點掛載且**對該 viewer 可見**之文件 → 點列進入前台文件詳情／檢視器。
3. 文件清單模式：**＝現行 [F019](F019-public-list-browsing.md) 行為，一字不改**（六項篩選、置頂排序、卡片八項標籤欄位）。

## Alternative Flows

- **停用類別**：`status` 切為 `inactive`，既有節點／邊／掛載關係**不受影響**；停用**不需**先清空掛載（與刪除規則不同）。停用之類別不出現於前台切換器（`AC-B18`），亦不出現於 [F017](F017-backend-document-list.md#business-category-column-delta) 篩選下拉之預設選項集（`AC-B7`）。
- **清空掛載後刪除**：管理員經節點抽屜將該類別內全部掛載逐筆移除後，即可成功刪除該類別。
- **候選清單為空**（系統中尚無任何 ICSOP 文件）：顯示「尚無可掛載文件」空狀態，**非錯誤**。
- **類別無任何節點**：樹狀圖預覽顯示空狀態提示，**非錯誤畫面**。
- **前台無任何可用類別**（全部停用，或該 viewer 在所有類別下皆無可見文件）：樹狀圖模式顯示空狀態並**保留模式切換器可用**（使用者仍可切到 `文件清單`），**不自動切換模式**（`AC-B19`——自動切換會使「預設為樹狀圖」這條規則變得不可觀察）。

## Edge Cases

| 情境 | 預期行為 |
|---|---|
| 子分類輸入 `"  授信  "` | 正規化為 `"授信"` 後持久化（`AC-05`） |
| 子分類輸入空字串／純空白／未提供 | 一律視為無子分類，持久化為 `null`（`AC-05`） |
| 名稱 trim 後為空 | 400 `BUSINESS_CATEGORY_NAME_REQUIRED`，**優先於**任何唯一性檢查（`AC-09`） |
| 已存在 `授信(∅)`，建立 `授信(消金)` | 409 `BUSINESS_CATEGORY_SUBCATEGORY_CONFLICT`（INV-B2 方向一，`AC-07`） |
| 已存在 `授信(消金)`，建立 `授信(∅)` | 409 `BUSINESS_CATEGORY_SUBCATEGORY_CONFLICT`（INV-B2 方向二，`AC-08`） |
| 類別名稱與某個既有**循環**名稱相同 | **允許**，不回任何錯誤（兩表獨立，`AC-04`） |
| 同一文件掛到同一節點兩次 | 409 `BUSINESS_CATEGORY_DOC_ALREADY_MOUNTED`，**不產生第二筆列**（INV-B6，`AC-24`） |
| 同一文件掛到**同類別之另一節點** | ✅ **允許、無警示**（`AC-21`） |
| 同一文件掛到**另一類別之節點** | ✅ **允許、無警示**（`AC-22`） |
| 已掛在循環節點（`nodeId ≠ null`）之文件掛到類別節點 | ✅ **允許、無警示**，且 `ICSOP_DOCUMENT.nodeId` **一格不動**（`AC-23`／INV-B4） |
| 移除某節點之掛載後，該文件仍掛在別處 | 別處之掛載**完全不受影響**（`AC-25`） |
| 移除一筆不存在之掛載（重送、他人已移除） | 404 `BUSINESS_CATEGORY_MOUNT_NOT_FOUND`（🔴 **不採靜默 200**——靜默會使「移除成功」與「移除了不存在的東西」產生逐位元組相同之回應，無測試可區分，本 repo 已多次付出代價之靜默失敗形狀） |
| 文件於掛載後被**硬刪除** | 該文件之全部 `BUSINESS_CATEGORY_DOC` 列一併移除（🟢 已裁定＝FK `ON DELETE CASCADE`，[§14.4](../architecture-spec.md#ch14-f043)）；**不留孤兒列**。<br>🔴 **今日無可達路徑**：現行系統之 `ICSOP_DOCUMENT` 從未被硬刪除（僅 `status` 切換）⇒ 本列為**面向未來之防禦性條款**，其兌現形式為 **DB 層 FK 結構斷言**，**不得**建成「呼叫刪除端點」之整合測試（`AC-26`） |
| 節點刪除時該節點有 N 份掛載 | 提示「刪除後將一併移除 N 筆掛載關係」並要求確認；確認後連動刪除邊與掛載列（`AC-18`） |
| 兩位管理員同時對同一節點掛同一份文件 | DB 唯一鍵（INV-B6）＋應用層驗證雙保險，僅一筆成功、另一筆回 409 `BUSINESS_CATEGORY_DOC_ALREADY_MOUNTED`（`AC-24`） |
| 文件清單第 16 欄：文件未掛任何類別 | 顯示 `—`（比照第 12 欄 0 筆之呈現，`AC-B2`） |
| 文件清單第 16 欄：文件掛在同一類別之 3 個節點 | **該類別只呈現一顆 pill**（依 `categoryId` 去重，`AC-B3`） |
| 前台樹狀圖：某節點之掛載文件全部對該 viewer 不可見 | 該節點顯示掛載數 **0**、雙擊抽屜為空狀態；**非錯誤**、**不得**顯示不可見文件之任何欄位（`AC-B21`） |

## Postconditions

- `BUSINESS_CATEGORY` 滿足 INV-B1～INV-B3；任一類別之 DAG 滿足 INV-B5。
- `ICSOP_DOCUMENT` 之 `nodeId`／`lifecycleId` **與本功能導入前逐筆相同**（INV-B4）。
- 任一結構變更皆有一筆 append-only 事件與其配對快照。
- 前台使用者可透過兩種模式瀏覽文件，且**兩種模式所能觸及之文件集合完全相同**（`AC-B23`——樹狀圖模式不得成為繞過可見性限縮之側門）。

---

## Acceptance Criteria

> 每條均可由**後端服務層測試**或**前端純函式／元件測試**直接驗證（jest／vitest），不需 e2e。
> 「池」指測試中預先置入之 `BUSINESS_CATEGORY` 列集合，以 `名稱（子分類）` 表示，`A(∅)` 表示 `subcategory = null`。
> **示範資料（本檔定稿，下游 prototype 與測試逐字沿用）**：類別名稱一律採 `授信`／`風險管理`／`帳務處理`；子分類一律採 `消金`／`企金`／`子公司`（🔒 **與 [F040](F040-lifecycle-subcategory.md) 裁決 3 之子分類示範值逐字相同**，避免下游出現第二組示範詞彙）。

### 甲、類別池 CRUD 與子分類（比照 [F007](F007-lifecycle-pool-crud.md)／[F040](F040-lifecycle-subcategory.md)） {#pool-section}

- **AC-01**：Given 輸入合法名稱 `授信`、子分類留白，When 新增類別，Then 建立成功、回傳 UUID、**導向該類別 DAG 畫布編輯頁**，且持久化之 `subcategory` 為 **`null`（非空字串）**，清單該列顯示 `授信`（不含括號）。
- **AC-02**：Given 輸入名稱 `授信`、子分類 `"  消金  "`，When 送出，Then 建立成功、持久化之 `subcategory` 為 `"消金"`（已 trim），清單該列顯示 **`授信（消金）`**（全形括號、前後無空白）。
- **AC-03**：Given 池為 `{ 授信(消金) }`，When 再建立 `授信(消金)`，Then 回 **409 `BUSINESS_CATEGORY_DUPLICATE`**、池筆數不變；When 改以子分類 `企金` 送出，Then 建立成功且與前者 UUID 相異。
- **AC-04**（🔴 **跨表獨立**）：Given `LIFECYCLE` 表中已存在名為 `銷售及收款循環` 之循環，When 建立同名之業務/功能類別 `銷售及收款循環`，Then **建立成功、不回任何錯誤**——`BUSINESS_CATEGORY` 與 `LIFECYCLE` 為兩張獨立的表，**明文禁止**任何跨表名稱比對。<br>📌 **可測形狀**：斷言建立成功 **且** 該次請求路徑上**未讀取** `LIFECYCLE` 表（以 store／repository spy 斷言，防「順手加一道跨表檢查」）。
- **AC-05**（🔒 **重用既有正規化函式、不得複製第二份**）：Given 子分類輸入分別為 `"  消金  "`、`""`、`"   "`、`undefined`、`null`，When 建立類別，Then 持久化值分別為 `"消金"`、`null`、`null`、`null`、`null`；且 When 檢視實作，Then 其呼叫的是 [F040](F040-lifecycle-subcategory.md) 之**既有** `normalizeSubcategory`，**不存在**任何名為 `normalizeBusinessCategorySubcategory`（或等義）之第二份實作。<br>🔴 **理由**：該函式（trim → 空值收斂為 `null`）與循環領域**零耦合**；複製一份等於製造兩條可各自漂移的正規化規則，而兩份初始碰巧相同 ⇒ 測試在漂移前**兩份都會綠**。
- **AC-06**（🔴 **顯示名稱與 `lifecycleDisplayName` 逐字相同之不變式**）：Given 固定向量 `V = [ {name:'授信', subcategory:'消金'}, {name:'授信', subcategory:null}, {name:'授信', subcategory:''}, {name:'授信', subcategory:'   '}, {name:'風險管理', subcategory:'企金'} ]`，When 對 `V` 之每一個元素分別呼叫 `businessCategoryDisplayName` 與 [F040](F040-lifecycle-subcategory.md) 之 `lifecycleDisplayName`，Then **兩者之輸出逐元素逐字相同**，且其值依序為 `授信（消金）`／`授信`／`授信`／`授信`／`風險管理（企金）`（第 3、4 元素為髒資料防禦：**不得**輸出 `授信（）`）。<br>📌 **為何要兩份而非共用一份**：本 repo 之既有處置（`watermarkLines()`／`change-labels.ts`／`OJT_STATUS_LABEL`）為「**兩份並存 ＋ 以同一組固定向量綁定逐字相同**」；本條沿用該既有模式，**不創新模式**。若 system-architect 裁定改為單一共用純函式，本條之斷言**自動仍然成立**（同一支函式對自己恆等），故本條不阻擋該重構。
- **AC-07**：Given 池為 `{ 授信(∅) }`，When 建立 `授信(消金)`，Then 回 **409 `BUSINESS_CATEGORY_SUBCATEGORY_CONFLICT`**、池筆數不變（INV-B2 方向一）。
- **AC-08**：Given 池為 `{ 授信(消金) }`，When 建立子分類留白之 `授信`，Then 回 **409 `BUSINESS_CATEGORY_SUBCATEGORY_CONFLICT`**、池筆數不變（INV-B2 方向二）。
- **AC-09**（🔴 **驗證順序固定，先後不可調換**）：Given 名稱 trim 後為空且該（空）名稱在池中已有同組合之列，When 建立，Then 回 **400 `BUSINESS_CATEGORY_NAME_REQUIRED`**（**非** `BUSINESS_CATEGORY_DUPLICATE`）——順序恆為 ① `NAME_REQUIRED` → ② `DUPLICATE` → ③ `SUBCATEGORY_CONFLICT`（比照 [F040](F040-lifecycle-subcategory.md) AC-14）。
- **AC-10**（🔒 **不新增 `BUSINESS_CATEGORY_SUBCATEGORY_REQUIRED`**）：Given 本功能之全部端點與服務層，When 逐一檢視其可回傳之錯誤碼集合，Then **不存在** `BUSINESS_CATEGORY_SUBCATEGORY_REQUIRED`（或任何等義之「請選擇具體子分類」錯誤）。<br>🔴 **理由（不得省略）**：[F040](F040-lifecycle-subcategory.md) 之 `LIFECYCLE_SUBCATEGORY_REQUIRED` 服務的是「**文件建立／編輯時必須選到一個具體循環**」這條路徑；本功能之掛載方向**相反**（由類別節點挑文件，文件端從不選類別），該請求形狀**在本功能中不存在** ⇒ 新增該碼會產生一段永不執行之程式碼與一條恆真之 AC。<br>📌 **例外之界線**：[F017](F017-backend-document-list.md#business-category-column-delta) 之第 14 項篩選其選項值為 `businessCategoryId`（**非**名稱字串，`AC-B7`），故篩選端亦無「只選到名稱層」之形狀。
- **AC-11**：Given 池為 `{ 授信(消金), 授信(企金) }`，When 編輯前者僅修改說明，Then 儲存成功、不回唯一性錯誤且 `updatedAt` 更新；When 將 `授信(企金)` 之子分類改為 `消金`，Then 回 409 `BUSINESS_CATEGORY_DUPLICATE`；When 將 `授信(企金)` 之子分類清空，Then 回 409 `BUSINESS_CATEGORY_SUBCATEGORY_CONFLICT`；Given 池為 `{ 授信(消金) }`（該名稱僅此一列），When 將其子分類清空，Then **儲存成功**，池為 `{ 授信(∅) }`。
- **AC-12**（🔴 **刪除保護與停用之不對稱**）：Given 某類別其 `BUSINESS_CATEGORY_DOC` 尚有至少一列，When 刪除該類別，Then 回 **409 `BUSINESS_CATEGORY_HAS_DOCUMENTS`**，訊息語意＝**需先解除全部文件掛載才能刪除**（非「永不可刪」），且該類別、其節點、其邊、其掛載列**一筆未動**；<br>Given 同一類別（仍有掛載），When 改為**停用**，Then **成功**、`status` 為 `inactive`，且既有節點／邊／掛載關係**完全不受影響**；<br>Given 已將該類別之全部掛載逐筆移除，When 刪除，Then **允許刪除**（其節點與邊一併移除）並記錄稽核。
- **AC-13**（🔴 **唯一性比對涵蓋停用列**）：Given 池為 `{ 授信(消金) }` 且該列 `status = 'inactive'`，When 建立 `授信(消金)`，Then 回 409 `BUSINESS_CATEGORY_DUPLICATE`——比對範圍涵蓋全部列、不分 `status`（比照 [F040](F040-lifecycle-subcategory.md) AC-20 之既有裁決，**不重開此題**）。
- **AC-14**（清單搜尋比對對象）：Given 池中有 `授信（消金）` 與 `授信（企金）`，When 於類別池清單之關鍵字搜尋輸入 `消金`，Then 僅命中前者——比對對象為 `businessCategoryDisplayName` 之**輸出**（名稱＋子分類），非僅 `name`（比照 [F007](F007-lifecycle-pool-crud.md) `AC-S8`）。

### 乙、DAG 節點與邊（比照 [F008](F008-dag-node-edge.md)） {#dag-section}

- **AC-15**：Given 類別 DAG 畫布編輯頁，When 新增節點並命名，Then 節點持久化（含 `positionX`／`positionY`）並顯示於畫布；When 由節點 A 連線至 B，Then 建立方向正確之 A→B 邊，並以**直角（elbow/step）箭頭**呈現（**非曲線**），與 [F008](F008-dag-node-edge.md)／[F036](F036-lifecycle-tree-preview.md)／[F038](F038-lifecycle-tree-change-history.md) 樣式一致；Given 節點 C 已有多個 parent，When 再連入一節點，Then 允許多 parent 且畫布正確呈現。
- **AC-16**（🔴 **防環，且刻意使用專屬錯誤碼**）：Given 已有 `A→B→C`，When 嘗試新增 `C→A`，Then **後端**偵測成環並拒絕、回 **409 `BUSINESS_CATEGORY_CYCLE_DETECTED`**；Given 已有 `A→B`，When 嘗試新增 `B→A`，Then 同碼拒絕；Given 嘗試節點連向自己，When 送出，Then 回 **409 `BUSINESS_CATEGORY_SELF_LOOP`**；Given 合法不成環之連線，When 送出，Then 成功建立、不受阻擋。<br>🔴 **為何不沿用既有 `DAG_CYCLE_DETECTED`／`DAG_SELF_LOOP`（本條之立條理由，不得刪）**：那兩個碼於 [error-handling.md#dag](../error-handling.md#dag) 之出處欄逐字為 `F008`，且使用者可見訊息為「此連線會造成**循環結構**成環」——「循環」在本系統是一個**已被佔用的專有名詞**（`LIFECYCLE`）。沿用會使業務/功能類別畫布上的錯誤訊息宣稱使用者破壞了「循環結構」，指向一個他根本沒在編輯的東西。<br>📌 **驗證邏輯本身必須共用、不得抄第二份**：可達性搜尋之純函式（比照 `backend/src/lifecycle/lifecycle-tree-layout.ts` 之 `descendants()`）由 system-architect 決定共用形狀；**共用的是演算法，不是錯誤碼**。
- **AC-17**（後端權威）：Given 前端已預覽該連線為合法，When 送出，Then 後端仍於**交易內**做權威驗證，不僅信任前端；Given 因他分頁已建立而使該連線實際會成環，Then 後端仍正確拒絕（`AC-16` 之碼）。
- **AC-18**（刪除節點之連動與確認）：Given 某節點已掛載 N ≥ 1 份文件，When 刪除該節點，Then 系統提示**逐字含 `刪除後將一併移除 {N} 筆掛載關係`** 並要求二次確認；Given 確認，Then 於同一交易內刪除該節點、其全部相關邊、其全部 `BUSINESS_CATEGORY_DOC` 列，並各寫入結構變更事件；Given 取消，Then **一筆未動**。
- **AC-19**（畫布標題）：Given 進入一個有子分類之類別的 DAG 畫布編輯頁，When 渲染頁首標題與麵包屑，Then 類別名稱顯示為 `businessCategoryDisplayName` 之輸出（如 `授信（消金）· DAG 畫布`）；Given 該類別無子分類，Then 顯示為 `授信 · DAG 畫布`（不含括號）。畫布之節點／邊資料與防環邏輯**完全不受子分類影響**（DAG 恆屬單一 `businessCategoryId`）。

### 丙、節點掛載——🔴 本功能與循環管理之兩大差異（逐條寫死） {#mount-section}

> 🔴 **本節之首要責任是明文記錄「本功能推翻了 [F009](F009-node-drawer-maintenance.md) 的哪兩條限制、為什麼」**，使日後讀者不會把它讀成一次靜默的回歸。
> 🔒 **被推翻者是 [F009](F009-node-drawer-maintenance.md) 在**循環**語境下的限制對本功能之適用性；[F009](F009-node-drawer-maintenance.md) 本身之條文、行為與測試一字不改**（`AC-48`）。

#### 推翻總表 {#override-table}

| # | [F009](F009-node-drawer-maintenance.md) 之原條文 | 本功能之規定 | 推翻理由 |
|---|---|---|---|
| **推 1** | Main Flow 2／AC「候選清單僅顯示**所屬循環＝當前循環**之文件（後端以 `lifecycleId` 過濾）」 | **候選＝全部 ICSOP 文件，不施加任何循環條件** | 使用者原文「文件(**不再需要限制循環**)可掛載於節點」。業務/功能類別是與循環**正交**的第二套分類軸——一份「授信」類的程序書可能屬於任何一個循環；以循環過濾候選會使絕大多數合法組合**根本挑不到**，功能形同不可用 |
| **推 2** | Postconditions「文件『所屬節點』**唯一**（一份文件僅屬一個節點）」＋ AC「選取已掛載於其他節點之文件 → 顯示警示（附原節點名）並要求二次確認」＋ `NODE_DOC_ALREADY_ASSIGNED` ＋「確認改派 → 原節點掛載被移除」 | **一份文件可同時掛在多個類別的多個節點**；掛載與移除為兩個各自獨立的動作，**無警示、無二次確認、無「改派」語意、無 `NODE_DOC_ALREADY_ASSIGNED` 之對應碼** | 使用者原文「移除**一份文件只能掛在單一節點**的限制」。單一歸屬是「循環＝流程位置」的正確模型（一份程序書在一條流程上只會出現在一個位置）；業務/功能類別是**標籤式歸類**，多重歸屬是需求本身（決 1 舉例：同一份程序書同時屬「授信」與「風險管理」） |

- **AC-20**（🔴 **推 1：候選不以循環過濾**）：Given 系統中有 5 份 ICSOP 文件，其 `lifecycleId` 分屬 3 個不同循環、其中 1 份之 `lifecycleId` 所指循環為 `inactive`，When 開啟任一業務/功能類別之任一節點抽屜並載入候選文件清單，Then **5 份全部出現於候選**。<br>📌 **可測形狀（防「順手加一道過濾」）**：① 斷言候選筆數 **恰為 5**；② 斷言候選查詢之參數物件**不含** `lifecycleId`／`lifecycleIds`／`cycle` 等鍵（以 store／repository spy 斷言實際下推之條件）。<br>🔴 **語料鑑別力要求**：測試語料中 **3 個循環必須至少有 2 個相異且各有 ≥1 份文件**——若全部文件同屬一個循環，「有過濾」與「沒過濾」之輸出**完全相同**，該斷言恆真、等於沒寫。
- **AC-21**（🔴 **推 2 之一：同類別多節點**）：Given 類別 `授信` 有節點 `N1`、`N2`，且文件 `D1` 已掛載於 `N1`，When 於 `N2` 之抽屜選取 `D1` 並掛載，Then **掛載成功**、`BUSINESS_CATEGORY_DOC` 新增一列 `(N2, D1)`、`(N1, D1)` **仍然存在**；Then **不顯示任何警示、不要求任何二次確認**。<br>📌 **可測形狀**：斷言 `N1` 抽屜與 `N2` 抽屜**同時**列出 `D1`；且斷言畫面上**不存在**任何含「已掛載於」「改派」字樣之元素（`queryByText(/已掛載於/) === null` **且** `queryByText(/改派/) === null`）。<br>🔒 **本條之負向半句必須成立於「已有一筆既存掛載」之語料上**——若語料裡 `D1` 根本沒被掛過，警示本來就不會出現，該負向斷言恆真、無鑑別力。
- **AC-22**（🔴 **推 2 之二：跨類別**）：Given 文件 `D1` 已掛載於類別 `授信` 之節點 `N1`，When 於類別 `風險管理` 之節點 `M1` 掛載 `D1`，Then 掛載成功、兩筆掛載並存、無警示、無確認；Then `D1` 於 [F017](F017-backend-document-list.md#business-category-column-delta) 第 16 欄呈現**兩顆 pill**（`授信`、`風險管理`，`AC-B3`）。
- **AC-23**（🔴 **推 2 之三：與循環掛載並存**）：Given 文件 `D1` 之 `ICSOP_DOCUMENT.nodeId` 已指向某循環節點 `L1`，When 將 `D1` 掛載於業務/功能類別之節點 `N1`，Then 掛載成功、**無警示**，且 `D1.nodeId` **仍逐字等於 `L1`**（一格未動）；Then 循環樹狀圖（[F036](F036-lifecycle-tree-preview.md)）之 `L1` 節點掛載數**不變**。
- **AC-24**（同節點重複掛載）：Given `BUSINESS_CATEGORY_DOC` 已有列 `(N1, D1)`，When 再次於 `N1` 掛載 `D1`，Then 回 **409 `BUSINESS_CATEGORY_DOC_ALREADY_MOUNTED`**、**不產生第二筆列**（INV-B6）；Given 兩個請求並發，Then DB 唯一鍵與應用層驗證雙保險，恰一筆成功、另一筆回本碼。
- **AC-25**（🔴 **移除只影響那一筆**）：Given `D1` 掛載於 `N1`（類別 `授信`）、`N2`（類別 `授信`）、`M1`（類別 `風險管理`），When 移除 `(N1, D1)`，Then `BUSINESS_CATEGORY_DOC` 僅少該一列，`(N2, D1)` 與 `(M1, D1)` **仍然存在**；Then `D1` 本身之**任一欄位皆未變更**（含 `status`／`nodeId`／`lifecycleId`／`updatedAt`）。<br>📌 **可測形狀**：移除前後對 `D1` 之完整資料列做**逐欄比對**（非僅抽驗 `nodeId`）——本條要偵測的是「順手更新了文件」，抽驗會漏掉未抽到的欄位。
- **AC-26**（文件刪除之連動｜🔴 **面向未來之防禦性條文——今日無行為面可達路徑，兌現形式為 DB 層結構斷言**）：Given `D1` 掛載於 3 個節點，When `D1` 被硬刪除（`DELETE FROM ICSOP_DOCUMENT`），Then 其 3 筆 `BUSINESS_CATEGORY_DOC` 列一併移除、**不留孤兒列**；Then 該次刪除**不因掛載存在而被阻擋**（🔴 **文件刪除不受本功能之刪除保護限制**——保護的對象是**類別**，不是文件）。
  - 🔴 **本條今日不可由行為面驗證（system-architect 2026-09-02 查證，[§14.6.7](../architecture-spec.md#ch14-f043)）**：`ICSOP_DOCUMENT` 在現行系統**從未被硬刪除**——`documents.service.ts`／`typeorm-documents.store.ts` 全無刪除路徑，文件之「消失」一律以 `status` 切換（`失效`／`作廢`）表達，**沒有任何端點會觸發本條之 Given**。
  - 🔴 **因此本條之兌現形式明確指定為「DB 層結構斷言」，並明文禁止另一種寫法**：<br>　✅ **應如此驗證**——斷言 migration 所建之 `BUSINESS_CATEGORY_DOC.documentId` **外鍵存在**且其 **`onDelete` 為 `CASCADE`**（可自 TypeORM entity metadata 或 migration SQL 斷言；資料庫層一旦具此約束，語意即由 DB 保證，不需應用層程式碼）。<br>　🔴 **不得如此驗證**——**不得**寫成「呼叫刪除文件端點後斷言掛載列消失」之整合測試：**該端點不存在** ⇒ 測試要嘛根本寫不出來，要嘛以自製 SQL／自製 fixture 假裝有那條路徑而變成**假綠**（本 repo 已多次記錄之「載體不存在卻替它建環」形狀）。
  - 📌 **行為面驗證俟未來真有硬刪除路徑時再補**：屆時本條之 Given 才成為可達，屆時應**新增**行為面案例，而**非**改寫本條——結構斷言與行為斷言兩者並存、互不取代。
  - ⚠ **原條文之第三句（「該 3 個節點之掛載數各減 1」）一併適用於結構斷言之語意層**，但其**畫面**驗證同樣今日不可達，不得為此建環。
- **AC-27**（🔴 **INV-B4 正向半句：本功能不碰文件表**）：Given 依序執行——建立類別、建立節點、建立邊、掛載 `D1`、改節點名、移除掛載、刪除邊、刪除節點、停用類別、刪除類別——共 10 個動作，When 每個動作各自完成後，Then `ICSOP_DOCUMENT` 之 `D1` 列**逐欄與動作前相同**（含 `nodeId`／`lifecycleId`／`updatedAt`）。<br>📌 **可測形狀**：以 store spy 斷言該 10 條路徑上**從未呼叫**任何 `ICSOP_DOCUMENT` 之寫入方法（`save`／`update`／`delete`）——比「事後比對值」更強，因為值比對在「寫入了相同的值」時仍會綠。
- **AC-28**（候選清單之搜尋與空狀態）：Given 候選文件數量龐大，When 於抽屜候選區輸入程序書編號或書名關鍵字，Then 依 `documentNumber` ∪ `documentName` 之 contains 過濾（萬用字元 `%`／`_`／`'` 正確跳脫）；Given 系統中尚無任何 ICSOP 文件，When 開啟候選，Then 顯示空狀態提示（逐字 `尚無可掛載文件`）**而非錯誤**。
- **AC-29**（抽屜之已掛載清單）：Given 開啟節點抽屜，When 載入，Then 顯示節點名稱與**該節點目前掛載之文件清單**（每列至少含 `程序書編號`／`程序書書名`），每列提供「移除」動作；Given 該節點尚無掛載，Then 顯示空狀態（逐字 `尚未掛載任何程序書`）。
- **AC-30**（🔴 **掛載／移除各自為獨立之原子動作**）：Given 使用者於同一次抽屜操作中掛載 2 份、移除 1 份，When 送出，Then 系統以**三個各自獨立之事件**寫入結構變更歷程（2 筆 `DOCUMENT_MOUNTED` ＋ 1 筆 `DOCUMENT_UNMOUNTED`），**不得**產生任何 `DOCUMENT_REASSIGNED`（或等義之「改派」）事件類型。<br>🔴 **理由**：`REASSIGNED` 是「解除舊的＋綁定新的」之複合語意，只在單一歸屬模型下成立；在 M:N 模型中把「移除 A ＋ 新增 B」記成一次改派，會憑空捏造兩者之間並不存在的因果關係，使歷程重建產生錯誤的中間態。
- **AC-31**（掛載寫入稽核）：Given 成功掛載或移除一筆，When 檢視稽核，Then 各記一筆稽核紀錄，含操作人員身分快照（員工編號／姓名／部門／處室，與浮水印同一來源）、時間、`businessCategoryId`、`nodeId`、`documentId`。**稽核之 `actionType`／`targetType` 具體值待 system-architect 裁定**（見 [§待 system-architect](#for-architect) 第 3 項）。

### 丁、樹狀圖預覽／下載／列印（比照 [F036](F036-lifecycle-tree-preview.md)） {#tree-section}

- **AC-32**（預覽頁之基本呈現｜🔴 **2026-09-02 就地改寫：節點徽章逐字對齊 `prototypes/22`**）：Given 具可視權限角色於類別池清單點擊某列樹狀圖圖示，When 觸發，Then 開新頁並帶入該 `businessCategoryId`，以**上到下佈局、直角箭頭連線**渲染其 DAG，多 parent／多 child 正確呈現；Then 每節點顯示名稱與掛載徽章，其逐字為 **`掛載 {N} 份程序書`**（`N ≥ 1`）／**`尚未掛載程序書`**（`N = 0`）；Given 該類別無任何節點，Then 顯示空狀態提示**而非錯誤畫面**。
  - 🔒 **DOM 契約**：該徽章之載體須帶 **`data-mounted-doc-count`** 屬性，其值為 `N` 之字串（`N = 0` 時為 `"0"`，**不得省略該屬性**）。<br>　📌 **為何需要這個屬性**：`尚未掛載程序書` 這句話裡**沒有數字**，若只斷言可見文字，「0」這個值就**沒有任何機器可讀的載體**；下游只能改斷言文案，而文案一改斷言就失效。屬性讓「顯示 0」本身可被斷言。
  - 📝 **原例示逐字保留供追溯**：`OLD>` 「每節點顯示**名稱與掛載程序書數**（如 `節點名稱 (3)`）」。<br>🔴 **改寫理由（人類裁決 2026-09-02）**：`節點名稱 (3)` 是 spec-writer 自擬之例示，與既有 `prototypes/22-lifecycle-tree-preview.html` 之實際逐字（`掛載 {N} 份程序書`／`尚未掛載程序書`）**不一致**。裁定**採 22 的逐字**（全站同一語彙）——反向去改 `22` 會撞 `AC-49` 之循環側零漣漪回歸鎖定。
- **AC-33**（🔴 **浮水印疊加層為本頁唯一載體，必須保留**）：Given 預覽頁渲染完成，When 呈現，Then 整頁對角平鋪疊加浮水印，格式與欄位順序比照 [NFR-007](../nfr.md#watermark) 之權威格式、固定機密聲明另起一行、由伺服器端當下動態產生（不同次開啟時間戳記不同）；When 使用縮放控制項放大／縮小／重置，Then 節點相對位置正確且疊加層仍覆蓋整個可視區域（**幾何要求比照 [F036](F036-lifecycle-tree-preview.md) `AC-T50`：旋轉後之矩形須涵蓋畫板四角**，非僅 `inset` 等比放大）。<br>🔴 **本頁渲染 HTML、無 PDF 內容層可燒錄** ⇒ 疊加層是其唯一浮水印載體，**明文禁止**比照 [F020](F020-watermark.md) `AC-N7` 對前台 PDF 檢視器所做的「移除疊加層」（那條裁決之前提是**該頁有內容層可燒錄**，本頁沒有；同一理由已見於 `AC-N66` 對 `LifecycleTreePreviewPage`／`ChangeHistoryPage` 之保留）。
- **AC-34**（切換器）：Given 頂部類別切換器，When 選擇另一可視類別，Then 重繪其 DAG、頁面框架（浮水印、切換器、縮放）維持不變，並**另記一筆檢視稽核**；Then 切換器選項**僅列出當前角色可視範圍內之類別**（後端過濾），且對同名不同子分類之兩個類別呈現**兩個相異選項**（各以 `businessCategoryDisplayName` 顯示），**選項值為各自 `businessCategoryId`**（**非**名稱字串）。
- **AC-35**（單擊標示下游／雙擊開子樹抽屜）：Given 樹狀圖已渲染，When 單擊任一節點，Then 醒目標示該節點與其**全部下游**（沿有向邊可達之後代節點與其間連線）、其餘淡化；再次單擊同節點或空白區則取消標示；When **雙擊**任一節點，Then 自右側滑出**唯讀側抽屜**，列出該節點**子樹**所掛載之全部程序書（欄位＝程序書編號／程序書書名／版次／狀態／公告日期），依節點分組，且**子樹節點集合 ≡ 單擊醒目標示之集合**（比照 [F036](F036-lifecycle-tree-preview.md#subtree-drawer-delta) `AC-T10`～`AC-T27` 之既有不變式）；Then 單擊之標示行為於雙擊時**仍會先發生並保留**。<br>🔴 **抽屜為唯讀孿生**：**不得**含任何寫入元件（無新增／移除／搜尋加入等按鈕），**不得**復用 [§丙](#mount-section) 之可寫抽屜；其資料來源端點之閘門＝`業務/功能類別管理` **read**（`AC-45`）。<br>🔴 **去重**：同一份文件若掛在子樹內多個節點，抽屜**依節點分組呈現多次**（每個節點下各出現一次），但**子樹之相異文件總數**（若呈現）須為去重後之值——兩個數字不同是事實，**不得互相對齊**。
- **AC-36**（下載／列印之燒錄與稽核）：Given 具可視權限角色於 toolbar 點「下載」或「列印」，When 動作完成，Then 取得**伺服器端產生、浮水印已燒錄於 PDF 內容層**之檔案（格式權威同 [NFR-007](../nfr.md#watermark)、機密聲明另起一行、比照 [F020](F020-watermark.md)），非僅前端疊加；Then 下載與列印**各記一筆獨立稽核**（不合併計數），內容與當次燒錄浮水印一致。<br>🔴 **載體＝代理串流**（`downloadViaBlob`／`openPdfViaBlob`），**不得**用 `<a href>` top-level navigation——否則 session 逾時會把後端 JSON 錯誤當網頁呈現（比照 [F036](F036-lifecycle-tree-preview.md#file-action-carrier-delta) `AC-T49` 之既有裁決）；列印之新分頁須於 click handler 內、任何 `await` **之前**同步 `window.open('', '_blank')`，否則被彈出視窗封鎖器擋下。
- **AC-37**（未授權之下載／列印）：Given 無可視權限角色（DeptContact／User）略過 UI 直接呼叫下載／列印 API，When 請求，Then 回 **403 `PERMISSION_DENIED`**，且**不產生檔案、不燒錄浮水印、不記錄稽核**（操作即被拒，非稽核失敗情境）。
- **AC-53**（🟢 **決 6，2026-09-02 人類裁決——PDF 下載／列印之範圍界線，僅後台**）：Given 本功能實作完成，When 逐一檢視全系統之業務/功能類別樹狀圖載體，Then ——
  - ① **後台**類別管理之樹狀圖預覽頁**有**「下載」與「列印」（`AC-36`，比照 [F036](F036-lifecycle-tree-preview.md)）；
  - ② **前台**之 `業務/功能類別樹狀圖` 瀏覽模式（[F019](F019-public-list-browsing.md#business-category-browse-delta) `AC-B16`）**沒有**下載鈕、**沒有**列印鈕、**不存在**任何前台之樹狀圖 PDF 端點；
  - ③ **可測形狀（正負成對）**：後台預覽頁 `getByLabelText('下載')` 與 `getByLabelText('列印')` **皆非 `null`**；前台樹狀圖模式 `queryByLabelText('下載') === null` **且** `queryByLabelText('列印') === null`，且前台路由表中**不存在** `/public/business-categories/**/download`／`**/print`。🔴 **兩半必須同時存在**——只寫負向半句時，一個「連後台也沒做下載鈕」的實作照樣全綠。
  - 🔴 **裁決理由（人類指定，不得省略）**：**前台 PDF 需另行套用 [F041](F041-user-subtype-business-scope.md) 可見性過濾**——一張分類圖上的節點掛載清單會把「該 viewer 不可見之程序書」一併燒進 PDF，而燒錄是**伺服器端一次性產出**、沒有第二道逐列過濾的機會；要做就必須先決定「PDF 內容是否逐 viewer 不同」「掛載數以誰的視角計算」「是否記調閱稽核」三件事。**本輪不做。**
  - 📌 **前台之浮水印義務不受本條影響**：`AC-B25` 之疊加層仍為前台樹狀圖之**必要**載體（該頁渲染 HTML、無內容層可燒錄）——**「不提供 PDF」不等於「不需要浮水印」**，兩者是不同的事。
  - 📝 **本條由 `[ASSUMPTION]` A4 升格**（2026-09-02 人類裁決確認）；若日後要開放前台下載，須回答上述三個問題並新增 2 個端點、2 種稽核動作與其 AC。

### 戊、結構變更歷程與快照（比照 [F038](F038-lifecycle-tree-change-history.md)） {#history-section}

- **AC-38**（append-only 事件＋同交易快照）：Given 對某類別執行任一結構變更（新增／刪除節點、新增／刪除邊、節點改名、掛載／移除文件），When 該動作於後端完成，Then **於同一交易內**寫入一筆變更事件（含 `businessCategoryId`／`changeType`／`entityType`／`entityId`／`beforeValue`／`afterValue`／操作者帳號與身分快照／`changedAt`）與其配對之**完整結構快照**（節點集合＋邊集合＋各節點之掛載文件清單）；Then 該事件列**不可被修改或刪除**（append-only，DB 層撤銷應用帳號之 UPDATE／DELETE 權限，比照 `AUDIT_LOG`／`LIFECYCLE_CHANGE_LOG`）。
- **AC-39**（🔴 `changeType` 之封閉值域 ＋ **七個中文字面逐字鎖定**）：Given 檢視 `changeType` 之值域，Then 其**恰為 7 個鍵**，且各自之**顯示字面逐字**為——

  | # | `changeType` | 顯示字面（🔒 逐字） |
  |---|---|---|
  | 1 | `NODE_ADDED` | **`新增節點`** |
  | 2 | `NODE_REMOVED` | **`移除節點`** |
  | 3 | `NODE_RENAMED` | **`節點改名`** |
  | 4 | `EDGE_ADDED` | **`新增連線`** |
  | 5 | `EDGE_REMOVED` | **`移除連線`** |
  | 6 | `DOCUMENT_MOUNTED` | **`新增掛載`** |
  | 7 | `DOCUMENT_UNMOUNTED` | **`移除掛載`** |

  - 🔒 **詞彙來源**：`prototypes/23-change-history.html`（ui-ux-designer 2026-09-02 定稿）；第 6／7 兩值**與節點抽屜 `prototypes/28-business-category-node-drawer.html` 同一組詞**——**「歷程看到的」與「抽屜做的」必須同語彙**，否則使用者在抽屜按了「新增掛載」、在歷程卻讀到另一個詞。
  - 🔴 **`新增掛載` 與 `移除掛載` 是兩個相異值，明文禁止收斂為單一「文件掛載變更」**（本條最重要之一句）。<br>　**這不是假設性的風險，而是既有實況**：spec-writer 已查證 `backend/src/change-history/change-labels.ts` —— 既有循環 tab 之表把 **`DOCUMENT_MOUNTED`／`DOCUMENT_REASSIGNED`／`DOCUMENT_UNMOUNTED` 三個鍵全部映射到同一個字串 `'文件掛載變更'`**（8 個鍵 → **6 個相異顯示字面**）。<br>　🔴 **若本功能「比照」那張表而跟著收斂**，後果有二：① `AC-39`「恰 7 值」在顯示層**不可觀察**，該斷言**無法證偽**；② 掛載與移除兩種相反的事件在畫面與 CSV（`AC-42`）上**輸出逐字相同**，任何想區分兩者的斷言都會恆真——**這正是本 repo 記錄過的「語料無鑑別力」形狀**。
  - 🔴 **明文列出不存在的第 8 個值**（供下游寫出有鑑別力的負向斷言）：值域中**不存在** `DOCUMENT_REASSIGNED`，顯示字面中**不存在** `改派`、亦**不存在** `文件掛載變更`。<br>　📌 **`改派`／`文件掛載變更` 兩個字面確實存在於 `prototypes/23`**（spec-writer 已查證：`改派` 出現 4 次、`文件掛載變更` 出現 5 次）——**但那些屬於既有的「循環樹狀圖」tab**，🔒 **不得**被本功能之第三個 tab 沿用，亦**不得**因為「同一支 prototype 裡有這個詞」就誤判為本功能的詞彙。
  - 📌 **可測形狀（三半必須齊備）**：① 斷言鍵集合**恰 7 個**（不得只驗「這 7 個都在」——那對「多了第 8 個」完全無感）；② 斷言 7 個**顯示字面兩兩相異**（直接偵測收斂）；③ 斷言 `DOCUMENT_REASSIGNED` **不在鍵集合中**、`文件掛載變更`／`改派` **不在字面集合中**。
  - 🔒 **既有循環側之 `change-labels.ts` 一行未改**（`AC-49`）——本功能新增自己的一張表，**不修改、不共用**那一張；兩張表之並存與其「三鍵映射同一字串 vs 七鍵各自相異」之差異為**刻意**。
- **AC-40**（🟢 **決 7 就地改寫**——第三個 tab、其逐字標籤與查詢）：Given 以 **SysAdmin 或 ICSOPAdmin** 開啟「文件變更歷程」頁，When 渲染，Then 存在**恰三個** tab，其標籤逐字為 `ICSOP 程序書`／`循環樹狀圖`／**`業務/功能類別樹狀圖`**（🔒 前兩者之標籤、順序與內容**一字不改**，新 tab 置於**最後**）；When 進入第三個 tab，Then 可依 `類別`／`期間`／`變更類型` 查詢事件清單。<br>📝 **原字面逐字保留供追溯**：`OLD>` 第三個 tab 之標籤為 `業務/功能類別`。**改寫依據＝2026-09-02 人類裁決（決 7）**，理由＝與既有第二個 tab `循環樹狀圖` 同構（該頁三個 tab 皆以其所描述之「變更對象」命名）。<br>🔴 **斷言必須限定容器**：本標籤與前台瀏覽模式標籤（[F019](F019-public-list-browsing.md#business-category-browse-delta) `AC-B12`）**逐字相同但為兩個互不相干之載體**；**明文禁止**全域 `getByText('業務/功能類別樹狀圖')`，須先取得本頁之分頁列再於其內斷言。
- **AC-41**（新舊樹狀圖預覽／下載）：Given 於第三個 tab 選定某一筆事件，When 開啟預覽，Then 並列呈現**變更前／變更後**兩版樹狀圖（直角 elbow、上到下），「變更前」＝同 `businessCategoryId`、`changedAt` 早於本筆之最近一筆事件之快照；Given 無更早紀錄（該類別第一筆事件），Then「變更前」視為**空 DAG**（顯示空狀態，非錯誤）；When 下載，Then 取得浮水印已燒錄於內容層之 PDF（比照 `AC-36`）。Given 指定之事件 id 不存在，Then 回 **404 `BUSINESS_CATEGORY_CHANGE_LOG_NOT_FOUND`**。
- **AC-42**（匯出）：Given 於第三個 tab 點「匯出」，When 動作完成，Then 產生 CSV，其規則**全數向 [error-handling.md#export](../error-handling.md#export) 之共用規則對齊**（UTF-8 BOM／CRLF／RFC 4180／CSV 注入前綴／`EXPORT_ROW_LIMIT_EXCEEDED` 於 > 10,000 筆／0 筆僅表頭／檔名 `{scope}_{YYYYMMDD}_{HHmmss}.csv`／唯讀角色允許匯出）；🔒 **既有五處匯出之規則與逐字文案一字不改**——本處為**第六處**，向共用規則對齊，不得反過來。<br>🔴 **不新增任何錯誤碼**（沿用 `EXPORT_ROW_LIMIT_EXCEEDED`／`VALIDATION_ERROR`／`PERMISSION_DENIED`）。<br>⚠ **列舉欄之值＝畫面所見中文標籤**，其**七個字面逐字為 `AC-39` 之表**（`新增節點`／`移除節點`／`節點改名`／`新增連線`／`移除連線`／**`新增掛載`**／**`移除掛載`**）——🔴 **不得輸出列舉代碼**（`NODE_ADDED` 等不得出現於 CSV，[error-handling.md#export](../error-handling.md#export) 值層通則）。
  - 🔴 **`新增掛載`／`移除掛載` 於 CSV 必為兩個相異儲存格值**（`AC-39` 之收斂禁令於匯出層同樣成立）。<br>　**可測形狀**：以一筆 `DOCUMENT_MOUNTED` ＋ 一筆 `DOCUMENT_UNMOUNTED` 之語料匯出，斷言該兩列之「變更類型」欄**彼此不相等**且各自逐字為上述兩值。🔴 **語料必須同時含這兩種事件**——只放其中一種時，「有沒有收斂」在輸出上**完全看不出來**。
  - 🔴 **明文禁止照抄既有循環側之 8 鍵→6 字面對照表**（`backend/src/change-history/change-labels.ts`，spec-writer 已查證其把 `DOCUMENT_MOUNTED`／`DOCUMENT_REASSIGNED`／`DOCUMENT_UNMOUNTED` 三鍵**全部映射到 `'文件掛載變更'`**）——照抄會使本欄之掛載與移除**輸出逐字相同**，直接違反上一項。
  - 🔒 **對照表之處置沿用既有模式、不創新模式**：本功能新增**自己的一張** 7 鍵表，與畫面維持「**兩份逐字相同**」之既有不變式（比照 [F038](F038-lifecycle-tree-change-history.md#export-delta) `AC-D7` ④／`watermarkLines()`／`OJT_STATUS_LABEL`）；🔒 **既有 `change-labels.ts` 一行未改**（`AC-49`）。

### 己、權限 {#permission-section}

- **AC-43**（🔴 新增功能矩陣列，值已定）：Given [F025](F025-role-function-matrix.md#business-category-function-key-delta) 之 `FUNCTION_MATRIX`，When 逐格取值，Then 功能鍵集合**新增恰一個**，列名逐字為 **`業務/功能類別管理`**，其五角色格值逐字為——

  | 功能 | 系統管理員 | ICSOP管理員 | 主管 | 部門窗口 | 一般使用者 |
  |------|-----------|-------------|------|----------|-----------|
  | **業務/功能類別管理** | **唯讀** | **CRUD** | **唯讀** | **無** | **無** |

  🔒 **值域不擴充**：三個格值皆為既有之 `唯讀`／`CRUD`／`無`，**不引入** `受限CRUD`（本功能無「可新增不可刪除」之類的細則）。<br>🔒 **側選單相應新增恰一項**，置於「循環管理」之下方，其可見性依本列格值（`無` ⇒ 部門窗口與一般使用者不呈現）。
- **AC-44**（🔴 **與「循環管理」列之刻意不對稱，須明文記錄**｜🟢 **2026-09-02 人類裁決確認為本意**，決 5）：Given 同一份 `FUNCTION_MATRIX`，When 比對「循環管理（DAG）」列與「業務/功能類別管理」列之**主管**欄，Then 前者為 **`無`**（2026-09-02 人類裁決）、後者為 **`唯讀`**（2026-09-02 同日人類裁決）——**兩者刻意不同，非疏漏**。<br>🟢 **2026-09-02 人類裁決確認**：spec-writer 曾提請人類覆核此不對稱是否為本意，**使用者本人已明確確認為本意**；本條與 [F025](F025-role-function-matrix.md#business-category-function-key-delta) `AC-B29` 之成對斷言**維持原樣、不放寬**。<br>🔴 **本條之存在理由（不得刪）**：同一日的兩項人類裁決，一項把主管**移出**循環管理、另一項把主管**放進**業務/功能類別管理。日後最可能發生的「整理」是把兩列對齊成同一個值——那會**同時違反兩條人類裁決**。<br>📌 **可測形狀**：一條**專門比對這兩格**之斷言（`FUNCTION_MATRIX['循環管理（DAG）'].Supervisor === '無'` **且** `FUNCTION_MATRIX['業務/功能類別管理'].Supervisor === '唯讀'`），使任一方被對齊時立即紅燈。
- **AC-45**（端點閘門｜🔴 **2026-09-02 就地改寫：變更歷程之端點自本條移出**）：Given 本功能之端點，When 檢視其 route metadata，Then ——
  - **讀取類**（清單／詳情／樹狀圖預覽／下載／列印／子樹文件清單／候選文件）之閘門為 `BUSINESS_CATEGORY_MANAGEMENT` **`read`**；
  - **寫入類**（建立／編輯／停用／刪除類別、增刪節點與邊、節點改名、掛載／移除文件）之閘門為同一功能鍵之 **`write`**；
  - Given 角色為 SysAdmin 或 Supervisor，When 呼叫任一寫入類端點，Then 回 **403 `PERMISSION_DENIED`**、操作不執行；Given 角色為 DeptContact 或 User，When 呼叫任一端點（含讀取類），Then 回 403。
  - 🔴 **本條之適用範圍明文排除變更歷程**：`/admin/change-history/business-categories*` 之**五個**端點（清單／明細／匯出／`tree-diff`／`tree-diff/download`）**不適用本條**，其閘門另循 **`AC-54`＝`FunctionKey.DOCUMENT_CHANGE_HISTORY` `read`**（人類決 7／`OQ-B-02` 甲案）。
  - 📝 **原條文逐字保留供追溯**：`OLD>` 「Then 讀取類（清單／詳情／樹狀圖預覽／下載／列印／子樹文件清單／**變更歷程查詢／匯出**）之閘門為 `BUSINESS_CATEGORY_MANAGEMENT` **`read`**⋯」
  - 🔴 **改寫理由（本輪最重要之一筆，不得省略）**：原條文把「變更歷程查詢／匯出」列入本功能鍵之讀取類，**與同日較晚之 `AC-54`（人類裁決）直接牴觸**——`AC-54` 明訂變更歷程屬「文件變更歷程」列、主管在其下為**整頁 403**。而本功能鍵對主管是 **`唯讀`** ⇒ 依原條文，主管**呼叫得到** diff／download，人類裁決當場被架空。<br>　⚠ **此矛盾已造成實際損害**：`architecture-spec.md` §14.5 之閘門寫錯，**是忠實照抄本條**——**不是架構師自己發明的**。⇒ **只修架構表不夠**；本條不改，下一個照字面實作的人會把同一個 bug 再造一次。<br>　📌 **這是本檔第二次出現同型缺陷**（第一次＝`AC-B9` ④ vs `AC-B10` 之排序規則各說各話，已於 2026-09-02 就地收斂）：**規格內部兩條 AC 各說各話，下游各取一句**。**兩次的修法相同——就地收斂為單一規則，不以增補條文迴避。**
- **AC-46**（後端強制，非僅前端隱藏）：Given 以直接帶入 `businessCategoryId` 之網址繞過清單或切換器，When 請求，Then 後端仍依角色可視範圍校驗（DeptContact／User 一律 403）；Given 側選單對 DeptContact／User 不呈現該項，Then 該隱藏**不得**是唯一防線（前端隱藏 ＋ 後端 403 **兩者皆須成立**）。
- **AC-47**（🔴 **前台不受後台功能列限制**）：Given 角色為 DeptContact 或一般使用者（對 `業務/功能類別管理` 為 `無`），When 開啟**前台**瀏覽頁之 `業務/功能類別樹狀圖` 模式，Then **允許**——前台之閘門為「前台瀏覽」列（5 種角色皆為「可」），與後台功能列**是兩件事**；Then 其可見文件仍受既有之**已公告過濾**與 [F041](F041-user-subtype-business-scope.md) **業務子分類使用部門過濾**約束（`AC-B20`～`AC-B23`）。<br>🔴 **可測形狀**：以 DeptContact 呼叫 `/public/business-categories/*` 得 **200**、呼叫 `/admin/business-categories/*` 得 **403**——**兩條斷言必須成對出現**，只驗其一等於沒有界定邊界。
- **AC-54**（🟢 **決 7，2026-09-02 人類裁決——主管之權限落差是刻意的，不是漏洞**）：Given 角色為**主管（Supervisor）**，When 逐一嘗試，Then ——
  - ① 對**業務/功能類別管理**本身為**唯讀**：可進入類別池清單、DAG 畫布（唯讀）、**類別樹狀圖預覽**並可下載／列印（`AC-43`／`AC-45`）；<br>　🔴 **本項之「下載／列印」指的是[§丁](#tree-section)之類別樹狀圖 PDF（`AC-36`），閘門＝`BUSINESS_CATEGORY_MANAGEMENT` read——與 ② 之變更歷程 `tree-diff/download` 是兩個不同的東西、掛在兩個不同的功能鍵上**。⚠ 兩者的名字都叫「樹狀圖下載」，是本條最容易讀混的地方：**主管下載得到「這個類別現在長什麼樣」，下載不到「它上週被改成什麼樣」。**
  - ② 對其**結構變更歷程**為**無**：開啟「文件變更歷程」頁時，**該頁對主管整頁 403**（其功能鍵 `文件變更歷程` 對主管既有值即為 `無`）⇒ 主管**看不到任何一個 tab，包含新增的第三個**；直接呼叫 `/admin/change-history/business-categories*` **五個**端點一律回 **403 `PERMISSION_DENIED`**（📝 `OLD>` 路徑為 `/admin/business-category-changes*`、`OLD>` 計數為「三個」，2026-09-02 三邊收斂裁定後改為此值——**本條之語意一字未改，改的是它指向的路徑字串與端點數**）。<br>　🔴 **可測形狀（成對）**：以 `Supervisor` 對**五個端點**逐一斷言 403，**不得只驗矩陣格值**——矩陣上主管對「業務/功能類別管理」正是 `唯讀`，只驗格值會得到相反的結論。
  - 🔴 **本條之存在理由（不得刪，這正是本條最容易被當成 bug 修掉的地方）**：主管「看得到類別、卻看不到類別的變更歷程」在直覺上像是漏配權限。**它不是。** 變更歷程之閘門屬於**它所在的頁面**（`文件變更歷程`），不屬於**它所描述的對象**（`業務/功能類別管理`）——這與 [F038](F038-lifecycle-tree-change-history.md) 循環樹狀圖變更歷程之既有處置**完全同構**（`OQ-E07-04` 定案：該頁僅 SysAdmin／ICSOPAdmin）。<br>　**採此案之具體代價與反案**：若改用 `業務/功能類別管理` 列作閘門（乙案，已否決），主管會進到一個**只有第三個 tab 可看、前兩個 tab 皆 403** 的變更歷程頁——一個半殘的頁面比一個進不去的頁面更難解釋。
  - 🔴 **端點層之可測形狀——必須成對，缺任一半都測不到本 bug（本條之核心，不得省略）**：對 `/admin/change-history/business-categories*` 之**五個**端點（清單／明細／匯出／`tree-diff`／`tree-diff/download`）——<br>　**① 正向**：以 **ICSOPAdmin** 逐一呼叫，各斷言 **200**；<br>　**② 負向**：以 **Supervisor** 呼叫**同樣那五個**端點，各斷言 **403**。<br>　🔴 **為何兩半缺一不可**：<br>　　- **只驗 ②**：一個「把五個端點全部擋掉、連 ICSOPAdmin 也進不去」的錯誤實作**照樣全綠**——負向斷言分不出「擋對了人」與「擋掉了所有人」。<br>　　- **只驗 ①**：本 bug（誤用 `BUSINESS_CATEGORY_MANAGEMENT` ⇒ **主管進得去**）**完全偵測不到**——ICSOPAdmin 在兩種閘門下都是 200，正向斷言對閘門用錯**零鑑別力**。<br>　🔴 **且不得以矩陣格值代替端點呼叫**：矩陣上主管對「業務/功能類別管理」正是 `唯讀`，只驗格值會導出「應該放行」的相反結論。**必須實際呼叫端點。**
  - 📌 **頁面層之可測形狀（正負成對）**：以 **ICSOPAdmin** 開啟該頁得**恰三個** tab（`AC-40`）；以 **Supervisor** 開啟同一頁得 **403**，且 `queryByText('業務/功能類別樹狀圖')` 於該頁**為 `null`**。🔴 **後者之斷言必須限定在該頁之 render 結果內**——主管在**前台**看得到逐字相同的模式標籤（`AC-B12`），全域斷言會抓到那一個而恆綠。
  - 🔒 **本條不改動任何既有格值**：[F025](F025-role-function-matrix.md) 之 `文件變更歷程` 列**一格未動**（SysAdmin `唯讀`／ICSOPAdmin `唯讀`／其餘 `無`）；本輪新增的只有第 15 列 `業務/功能類別管理`（`AC-B28`）。

### 庚、回歸鎖定 {#regression-lock}

- **AC-48**（🔴 **INV-B4 反向半句：循環管理不碰本功能之表**）：Given 依序執行 [F007](F007-lifecycle-pool-crud.md)／[F008](F008-dag-node-edge.md)／[F009](F009-node-drawer-maintenance.md) 之全部既有動作（建立／編輯／停用／刪除循環、增刪循環節點與邊、節點改名、掛載／改派／解除掛載），When 每個動作完成後，Then `BUSINESS_CATEGORY`／`BUSINESS_CATEGORY_NODE`／`BUSINESS_CATEGORY_EDGE`／`BUSINESS_CATEGORY_DOC` 四張表**逐列與動作前相同**；特別是**刪除一個循環節點時，掛在業務/功能類別節點上的同一份文件其掛載列一筆未動**。
- **AC-49**（🔒 **循環管理之全部既有 AC 逐條不變**）：Given 本功能實作完成，When 執行 [F007](F007-lifecycle-pool-crud.md)／[F008](F008-dag-node-edge.md)／[F009](F009-node-drawer-maintenance.md)／[F036](F036-lifecycle-tree-preview.md)／[F038](F038-lifecycle-tree-change-history.md)／[F040](F040-lifecycle-subcategory.md) 之**全部既有 AC**，Then **逐條通過且期望值未經修改**——本功能為**淨新增**，**不得**為了共用而改動循環側之任何行為、錯誤碼、端點形狀或 DOM 掛鉤。
- **AC-50**（🔒 **`ICSOP_DOCUMENT` 不新增欄位**）：Given 本功能實作完成，When 檢視 [ICSOP_DOCUMENT](../data-model.md#document-entity) 之欄位集合，Then 與本功能導入前**逐欄相同**（仍為 20 欄業務欄位＋既有系統欄）；**不存在** `businessCategoryId`／`businessCategoryIds`／`categoryNodeId` 等任何新欄。<br>🔴 **理由**：掛載為 M:N，**沒有任何單值欄位能表達它**；在文件表上加一個單值欄等於偷偷把模型改回單一歸屬（決 1 之直接違反），而該欄與 join table 之不一致**在測試上不會立即顯現**。
- **AC-51**（🔒 **[F026](F026-role-field-matrix.md) 欄位矩陣逐格不變、不新增列**）：Given 本功能實作完成，When 逐格取 `FIELD_MATRIX` 之全部欄位鍵 × 5 種角色之值，Then **與本功能導入前逐格相同**、欄位鍵集合**亦未增減**（**不存在** `業務/功能類別` 欄位列）。<br>🔴 **理由（本檔對「F026 是否需要一列」之明文結論）**：[F026](F026-role-field-matrix.md) 之矩陣範圍是 [ICSOP_DOCUMENT](../data-model.md#document-entity) 之 **20 個文件欄位**；業務/功能類別掛載**不是文件欄位**（`AC-50`），它住在 `BUSINESS_CATEGORY_DOC`，且**文件表單／詳情頁上完全沒有它的寫入載體**（唯一寫入路徑＝類別節點抽屜，閘門＝功能矩陣 `write`，`AC-45`）。<br>　⚠ **與「所屬節點」列之差異須明說**：`所屬節點` 之所以在 [F026](F026-role-field-matrix.md) 有一列，是因為它**是 `ICSOP_DOCUMENT` 上的一個欄位**（第 12 欄 `nodeId`），縱使其維護入口在 [F009](F009-node-drawer-maintenance.md) 抽屜；本功能之掛載**連欄位都不是**。<br>　🔴 **加一列的具體代價**：會在同一個動作上疊出**第二道較弱的閘門**——欄位矩陣說 X、端點閘門說 Y，兩者分歧時無人攔（本 repo 已於 `AC-N36` 記錄過同型代價）。<br>　🟢 **2026-09-02 人類裁決（決 8／`OQ-B-08` 結案）＝裁定不加**：措辭自此由「spec-writer 建議不加」升格為「**人類裁定不加**」，[F026](F026-role-field-matrix.md) **維持 20 列逐格不變**。裁決理由**逐字採納 spec-writer 原提報**——類別掛載**不是文件欄位**（它住在別張關聯表 `BUSINESS_CATEGORY_DOC`），其**寫入權限已由功能矩陣把關**（`AC-45`）。<br>　📝 **原措辭逐字保留供追溯**：`OLD>` 「本結論仍列為待人類覆核（§給人類閘門的審查清單 第 8 項），若人類裁定要加一列，本條連同 F026 delta 一併改寫，**不以增補條文迴避**。」
- **AC-52**（🔒 **[F019](F019-public-list-browsing.md) 之判定邏輯零漣漪**）：Given 前台新增樹狀圖模式，When 檢視既有之可見性判定（`isDocVisibleToViewer`）、置頂判定（`isPinned`／`isWithinSubtree`）、已公告基底條件（`status = 有效 AND 公告日期 ≤ 今日`）與空狀態文案（逐字 `查無符合結果`），Then **四者逐字不變**；Then `文件清單` 模式之六項篩選、卡片八項標籤欄位、排序規則與 DTO 形狀**一字不改**（`AC-B24`）。

---

## Error Scenarios

> 語意、驗證順序與回退細節：見 [error-handling.md#business-category](../error-handling.md#business-category)。

| 錯誤碼 | HTTP | 觸發情境 | AC |
|---|---|---|---|
| `BUSINESS_CATEGORY_NAME_REQUIRED` | 400 | 名稱 trim 後為空（**驗證順序最優先**） | `AC-09` |
| `BUSINESS_CATEGORY_DUPLICATE` | 409 | 違反 INV-B1：`(name, subcategory)` 組合已存在（含 `subcategory = null` 之組合）；比對涵蓋全部列不分 `status`；編輯時排除自身 | `AC-03`／`AC-11`／`AC-13` |
| `BUSINESS_CATEGORY_SUBCATEGORY_CONFLICT` | 409 | 違反 INV-B2：同一名稱之「無子分類」與「有子分類」列將並存（**雙向**） | `AC-07`／`AC-08`／`AC-11` |
| `BUSINESS_CATEGORY_HAS_DOCUMENTS` | 409 | 刪除仍有掛載之類別（語意＝**需先解除全部掛載才能刪除**，非「永不可刪」）；**停用不受此限** | `AC-12` |
| `BUSINESS_CATEGORY_SELF_LOOP` | 409 | 節點連向自己 | `AC-16` |
| `BUSINESS_CATEGORY_CYCLE_DETECTED` | 409 | 該連線會使 DAG 成環（直接或間接） | `AC-16`／`AC-17` |
| `BUSINESS_CATEGORY_DOC_ALREADY_MOUNTED` | 409 | 違反 INV-B6：`(nodeId, documentId)` 已存在（同一節點重複掛同一份文件） | `AC-24` |
| `BUSINESS_CATEGORY_NOT_FOUND` | 404 | 指定之 `businessCategoryId` 不存在 | — |
| `BUSINESS_CATEGORY_NODE_NOT_FOUND` | 404 | 指定之節點不存在（或不屬於該類別） | — |
| `BUSINESS_CATEGORY_MOUNT_NOT_FOUND` | 404 | 移除一筆不存在之掛載（**刻意不採靜默 200**，見 Edge Cases） | — |
| `BUSINESS_CATEGORY_CHANGE_LOG_NOT_FOUND` | 404 | 找不到指定之結構變更事件（重建新舊樹狀圖／下載時），比照 `LIFECYCLE_CHANGE_LOG_NOT_FOUND` | `AC-41` |
| `PERMISSION_DENIED` | 403 | **既有碼**。角色對本功能為「無／唯讀」而呼叫寫入類端點；或 DeptContact／User 呼叫任一後台端點 | `AC-37`／`AC-45`／`AC-46` |
| `EXPORT_ROW_LIMIT_EXCEEDED` | 400 | **既有共用碼**。變更歷程匯出筆數 > 10,000 | `AC-42` |
| `VALIDATION_ERROR` | 400 | **既有碼**。請求 body 不合法 | `AC-42` |

- 🔒 **本功能新增 11 個 `BUSINESS_CATEGORY_*` 錯誤碼；權限類、匯出類、檔案類一律沿用既有碼、零新增。**
- 🔴 **明文不新增者**：`BUSINESS_CATEGORY_SUBCATEGORY_REQUIRED`（`AC-10`）、任何等義於 `NODE_DOC_ALREADY_ASSIGNED` 之「已掛載於他處」碼（推 2）、任何等義於 `NODE_DOC_LIFECYCLE_MISMATCH` 之「文件不屬於此類別」碼（推 1——**候選不過濾 ⇒ 該情境不存在**）。

## Interface Contract（端點草案，🔵 形狀待 system-architect 定案） {#interface-contract}

> ⚠ **本節為草案**：路徑與方法比照 `backend/src/appendices/`／`/admin/appendices` 與 `lifecycle` 模組之既有慣例列出，供 system-architect 於下一棒收斂；**AC 只約束可觀測行為，不綁實作**。

| 方法 | 路徑 | 閘門 | 語意 |
|---|---|---|---|
| GET | `/admin/business-categories` | `read` | 類別池清單（含節點數、去重掛載文件數、狀態、`businessCategoryDisplayName`） |
| POST | `/admin/business-categories` | `write` | 建立類別（`AC-01`～`AC-10`） |
| PATCH | `/admin/business-categories/:id` | `write` | 編輯名稱／子分類／說明／狀態（`AC-11`／`AC-12`） |
| DELETE | `/admin/business-categories/:id` | `write` | 刪除（刪除保護見 `AC-12`） |
| GET | `/admin/business-categories/:id/graph` | `read` | 節點＋邊＋各節點掛載數（畫布與預覽共用） |
| POST／PATCH／DELETE | `/admin/business-categories/:id/nodes[/:nodeId]` | `write` | 節點 CRUD（`AC-15`／`AC-18`／`AC-19`） |
| POST／DELETE | `/admin/business-categories/:id/edges[/:edgeId]` | `write` | 邊建立／刪除（防環見 `AC-16`／`AC-17`） |
| GET | `/admin/business-categories/:id/nodes/:nodeId/candidates` | `read` | 候選文件（🔴 **全部 ICSOP 文件**，`AC-20`；支援關鍵字與分頁） |
| POST | `/admin/business-categories/:id/nodes/:nodeId/documents` | `write` | 掛載一份文件（`AC-21`～`AC-24`） |
| DELETE | `/admin/business-categories/:id/nodes/:nodeId/documents/:documentId` | `write` | 移除一筆掛載（`AC-25`；不存在回 404） |
| GET | `/admin/business-categories/:id/nodes/:nodeId/subtree-documents` | `read` | 子樹掛載文件（分組／排序／去重**全部由後端做**，比照 [F036](F036-lifecycle-tree-preview.md) `AC-T25`） |
| GET | `/admin/business-categories/:id/tree/download`／`/print` | `read` | 燒錄浮水印之 PDF（`AC-36`） |
| GET | `/admin/change-history/business-categories` | 🔴 **`FunctionKey.DOCUMENT_CHANGE_HISTORY` `read`** | 第三個 tab 之事件清單（`AC-40`） |
| **GET** | `/admin/change-history/business-categories/export` | 同上 | CSV 匯出（`AC-42`）。🔴 **必須宣告於下一列之前**，見下方路由順序契約 |
| GET | `/admin/change-history/business-categories/:id` | 同上 | 單筆事件明細（`AC-40`） |
| GET | `/admin/change-history/business-categories/:businessCategoryId/changes/:changeLogId/tree-diff` | 同上 | 新舊樹重建（`AC-41`） |
| GET | `/admin/change-history/business-categories/:businessCategoryId/changes/:changeLogId/tree-diff/download` | 同上 | 新舊樹 PDF 下載，浮水印燒錄於內容層（`AC-41`／`AC-36`） |
| GET | `/public/business-categories` | 前台瀏覽 | 前台可用類別清單（`AC-B18`） |
| GET | `/public/business-categories/:id/graph` | 前台瀏覽 | 前台樹狀圖資料（掛載數已套可見性過濾，`AC-B21`） |
| GET | `/public/business-categories/:id/nodes/:nodeId/documents` | 前台瀏覽 | 前台節點抽屜之文件（已套已公告＋F041 過濾，`AC-B20`～`AC-B22`） |

- 🔴 **本組五個端點之閘門為「文件變更歷程」，不是「業務/功能類別管理」——用錯會直接架空 `AC-54`**（本表最重要之一行，**不得省略**）：<br>　閘門逐字為 **`@RequirePermission(FunctionKey.DOCUMENT_CHANGE_HISTORY, 'read')`**。<br>　🔴 **若誤用 `BUSINESS_CATEGORY_MANAGEMENT`**：主管對本功能是 **`唯讀`** ⇒ 該功能鍵之 `read` 對主管**放行** ⇒ 主管呼叫得到清單／明細／diff／download，而 `AC-54` 與人類決 7 明訂**主管看不到任何一個 tab**。**矩陣格值與端點閘門會各說各話，且矩陣那一側完全看不出問題**。<br>　📌 **既有前例（已查證）**：`backend/src/lifecycle/lifecycle-change-diff.controller.ts:28,43` 與 `backend/src/change-history/change-history.controller.ts` 之 6 條既有路由，**全部**掛 `DOCUMENT_CHANGE_HISTORY read`——本組為第三組並列資源，沿用同一條守門鏈。<br>　📌 **可測形狀**：以 `Supervisor` 實際呼叫**五個端點**各斷言 **403**（🔴 **不得只驗矩陣格值**——矩陣上主管對「業務/功能類別管理」正是 `唯讀`，只驗格值會得到「應該放行」的錯誤結論）。
- 📝 **匯出之 HTTP 方法於 2026-09-02 由 lead 改判 POST → `GET`，原值逐字保留供追溯**：`OLD>` `POST /admin/change-history/business-categories/export`。<br>🔴 **改判理由（lead 採納 spec-writer 之提報）**：**[F017](F017-backend-document-list.md#interface-contract) 用 `POST` 是因為 body 要塞上萬個 UUID**（10,000 × 36 字元 ≈ 370 KB，超出 nginx header 預算，architecture-spec §13 決策 D1）；**本處之匯出是篩選條件式的**（類別／期間／變更類型），**與兩個既有 sibling 同型**——已查證 `backend/src/change-history/change-history.controller.ts:101` 為 `@Get('documents/export')`、`:130` 為 `@Get('lifecycles/export')`。**原裁定寫 POST 是抄了本表舊值、未套用「逐字比照 F038 既有形狀」這條自己給的理由。**
- 🔒 **本表之列序即為要求之宣告順序**（`export` 列刻意排在 `:id` 列**之前**）——照表實作即自然滿足下列契約；**表格若與契約相牴觸，讀者只會照表做**（本檔已兩度付出此代價：`AC-B9④` vs `AC-B10`、`AC-45` vs `AC-54`）。
- 🔴 **路由宣告順序契約（明文條款，非註記）**：`@Get('business-categories/export')` **必須宣告於 `@Get('business-categories/:id')` 之前**——`export` 為固定段，參數路由若先宣告會把它**吃成 `:id`**，於是匯出請求會被當成「查詢 id 為 `export` 的那一筆」而回 404（或更糟：回一筆不存在的空明細）。
  - 📌 **本 repo 對此有明文前例（已查證，非臆測）**：`backend/src/public/public-documents.controller.ts:70` 之註解逐字為「🔴 必須宣告於 `@Get(':id')` **之前**，否則會被參數路由吃掉。」；`change-history.controller.ts` 之**兩組既有 sibling 亦皆已遵守**（`documents/export`:101 在 `documents/:documentId`:114 之前；`lifecycles/export`:130 在 `lifecycles/:lifecycleId`:146 之前）。⇒ 本組為**第三組**，沿用同一紀律。
  - 🔴 **可測形狀（不得只驗存在性）**：**明文禁止**「斷言兩個 route 都已註冊」——**順序反了照樣兩個都在、照樣全綠**。須採下列任一：<br>　**甲（行為式，較強）**：實際請求 `GET /admin/change-history/business-categories/export`，斷言**命中的是匯出 handler**（回 `text/csv` ＋ `Content-Disposition`），**而非**把 `export` 當成 id 的明細 handler（會回 JSON 或 404）；<br>　**乙（結構式）**：讀取 controller 之 route metadata，斷言 `export` 之**宣告索引小於** `:id` 之宣告索引。
  - 🔒 **本契約須以註解就地記錄於 controller**（比照 `public-documents.controller.ts:70` 與 `usage-forms.controller.ts:91-95` 之既有明文），**不得只存在於本規格**——規格擋不住下一個人重排方法順序。
- 📝 **路徑於 2026-09-02 三邊收斂裁定，原值逐字保留供追溯**：`OLD>` `GET /admin/business-category-changes`／`GET /admin/business-category-changes/:changeLogId/diff`／`POST /admin/business-category-changes/export`。<br>🔴 **改寫理由**：舊路徑自成一個 `/admin/business-category-changes` 前綴，會使**同一個 tab 的端點跨兩條守門鏈**（其餘兩個 tab 在 `/admin/change-history/` 之下、本組卻在別處）；收斂後五個端點全部落在 `/admin/change-history/` 底下，與 `documents`／`lifecycles` 並列為**第三組資源**，詞尾（`export`／`changes/:changeLogId/tree-diff`／`/download`）**逐字沿用 F038 既有形狀、不發明新詞尾**。
- 🟢 **變更歷程端點之閘門已定案（決 7／`OQ-B-02` → 甲案，2026-09-02 人類裁決）＝沿用「文件變更歷程」功能鍵**（[F025](F025-role-function-matrix.md) 該列＝SysAdmin 唯讀／ICSOPAdmin 唯讀／**其餘無**）⇒ **主管看不到第三個 tab、三個端點對主管一律 403**（`AC-54`）。理由＝tab 之可見性必須與其所在頁面一致；被否決之乙案（改用 `業務/功能類別管理` 列）會讓主管進到一個只有第三個 tab 可看、前兩個 tab 皆 403 的半殘頁面。<br>📝 **原措辭逐字保留供追溯**：`OLD>` 「⚠ 變更歷程三個端點之閘門**待裁定**⋯列為 §審查清單 第 5 項待覆核。」
- 🔴 **前台三個端點必為 deny-by-default**：可見性過濾在**查詢層**施加（比照 [F041](F041-user-subtype-business-scope.md)／[F033](F033-permission-aware-retrieval.md) 之既有紀律），**不得**先取全量再於前端過濾（`AC-B22`）。

## 待 system-architect — 🟢 **8 項已全數裁定（2026-09-02）** {#for-architect}

> 🟢 **system-architect 已於 2026-09-02 完成本節全部 8 項，落點＝[architecture-spec 第 14 章](../architecture-spec.md#ch14-f043)（決策 **E1～E9**）。**
> 🔴 **本節自此僅為指標，不複製其內容**——架構決策之逐字權威在第 14 章；本檔與其分歧時**以第 14 章為準**。本節保留原 8 項題目供追溯，各項後綴其落點。
> 🟢 **人類閘門已於同日通過**（第三輪，決 9～決 12）：本檔全文自此為 `APPROVED`，**已核准進入 Phase B**。<br>📝 `OLD>` 「⚠ 架構裁定解除的是設計阻塞，不是人類閘門：本檔全文仍為 DRAFT，核准前不得建 migration、不得實作。」——**該句之前半（兩者是不同的關卡）仍然成立且仍然重要**，只是兩道關卡此刻都已通過；🔴 **第三道關卡「migration 對真庫實跑」尚未通過**，見檔頭之實作前置警語。

1. 🟢 **變更歷程／快照表之落點（`OQ-B-01`，原唯一 🔴 BLOCKING）＝裁定採乙案** → [§14.1 決策 E1](../architecture-spec.md#ch14-f043)：**新增 [BUSINESS_CATEGORY_CHANGE_LOG](../data-model.md#businesscategorychangelog-entity)／[BUSINESS_CATEGORY_SNAPSHOT](../data-model.md#businesscategorysnapshot-entity) 兩張平行表**（欄位定義已落 data-model），既有 `LIFECYCLE_CHANGE_LOG`／`LIFECYCLE_SNAPSHOT` **一欄未動**；兩案取捨表保留於 [data-model §落點](../data-model.md#business-category-change-log-decision) 供追溯。<br>📝 **原題目逐字保留**：`OLD>` 「⚠ 變更歷程／快照表之落點——甲：擴充既有兩表為多型（加 `scopeType` 判別欄、`lifecycleId` 改 nullable 並解除 FK）；乙：新增兩張平行表。**spec-writer 建議乙**。」
2. 🟢 **已裁定（決策 E2）＝直接重用、不複製** → [§14.6.1](../architecture-spec.md#ch14-f043)。原題目：**防環演算法之共用形狀**：既有 `backend/src/lifecycle/lifecycle-tree-layout.ts` 之 `descendants()`／`buildTreeLayout()` 是否抽為與領域無關之純模組供兩套 DAG 共用（**演算法可共用、錯誤碼不共用**，`AC-16`）。若共用，[F036](F036-lifecycle-tree-preview.md) `AC-T28` 之 F1–F5 固定向量須擴充涵蓋本功能之呼叫端。
3. 🟢 **已裁定（決策 E3，`OQ-B-09`）** → [§14.6.2](../architecture-spec.md#ch14-f043)（新增 2 個 `targetType` ＋ 8 個 `actionType`；[F024](F024-access-history-query.md) 類型值五→六）。原題目：**稽核之 `actionType`／`targetType`**（`AC-31`／`AC-34`／`AC-36`）：需要幾個新值、是否比照 `LIFECYCLE_VIEW`／`LIFECYCLE_DOWNLOAD`／`LIFECYCLE_PRINT` 家族另立 `BUSINESS_CATEGORY_*` 家族，以及 [F024](F024-access-history-query.md) 之類型篩選值是否由五擴為六。`AUDIT_LOG.actionType`（`varchar(40)`）／`targetType`（`varchar(30)`）皆無 CHECK ⇒ **預期不需 migration**，須覆核。
4. 🟢 **已裁定** → [§14.7 前台兩種瀏覽模式資料流](../architecture-spec.md#ch14-f043)。原題目：**前台端點之查詢下推**：`/public/business-categories/:id/graph` 之「各節點掛載數已套可見性過濾」如何以固定次數查詢達成（🔴 **效能紅線：不得 N+1**，比照 [data-model §建議查詢形狀](../data-model.md#ojt-session-query-shape) 之既有紀律）。
5. 🟢 **已裁定（決策 E5）** → [§14.5 端點清單](../architecture-spec.md#ch14-f043)。⏳ **架構師交回 spec-writer 一項待回填**：[F017](F017-backend-document-list.md#business-category-column-delta)／[F019](F019-public-list-browsing.md#business-category-browse-delta) 兩處 delta 之端點形狀細節（`businessCategories` additive 欄位、前台過濾施加點），**本輪未做**。原題目：**第 16 欄之取值路徑**：`GET /admin/documents` 之回應是否 additive 新增 `businessCategories: {id, displayName}[]`，或另立端點；以及**匯出端點 `POST /admin/documents/export` 之 body 是否需要改動**（🔴 **spec-writer 之強烈建議＝不需要**——第 16 欄之值應由後端依 `documentIds` 自行 join 取得，`AC-B10`；若改 body 形狀則牴觸 [F017](F017-backend-document-list.md#interface-contract) 之「恰兩鍵」語意契約）。
6. 🟢 **已裁定** → [§14.8 前端模組結構](../architecture-spec.md#ch14-f043)（`domain/business-category.ts` 重新匯出）。原題目：**是否收斂為單一共用純函式**（`AC-06` 對兩種形狀皆成立，不阻擋）。
7. 🟢 **已裁定（決策 E7）** → [§14.8](../architecture-spec.md#ch14-f043)／[§14.9 共用 vs 複製之逐項裁定表](../architecture-spec.md#ch14-f043)。原題目：**渲染元件是否與 `LifecycleTreePreviewPage` 共用**（決 3 明訂「沿用其節點圖＋平移縮放」）；若共用，須明確界定**後台版與前台版之差異點**（前台無切換至他人不可見類別之能力、前台抽屜之文件連結指向 `/public/documents/:id` 而非 `/admin/documents/:id`）。
8. 🟢 **已裁定** → [§14.4 Entity 與 Migration 規劃](../architecture-spec.md#ch14-f043)。⚠ **連帶查證結果已回饋本檔 `AC-26`**：現行系統之 `ICSOP_DOCUMENT` **從未被硬刪除**，故該 AC 今日無行為面可達路徑，其兌現形式已改寫為 **DB 層 FK CASCADE 之結構斷言**。原題目：**`BUSINESS_CATEGORY_DOC` 之刪除連動採 FK `ON DELETE CASCADE` 或服務層同交易刪除**。

## Related

- **Diagram**：[../diagrams/F043-business-category-mount.mmd](../diagrams/F043-business-category-mount.mmd)（掛載判定與兩套掛載之獨立性）、[../diagrams/F043-business-category-er.mmd](../diagrams/F043-business-category-er.mmd)（四張新表之關係）
- **Data**：[BUSINESS_CATEGORY](../data-model.md#business-category-entity)／[BUSINESS_CATEGORY_NODE](../data-model.md#business-category-node)／[BUSINESS_CATEGORY_EDGE](../data-model.md#business-category-edge)／[BUSINESS_CATEGORY_DOC](../data-model.md#business-category-doc)／[ICSOP_DOCUMENT](../data-model.md#document-entity)（**不新增欄位**，`AC-50`）
- **Errors**：[error-handling.md#business-category](../error-handling.md#business-category)（11 個新碼＋驗證順序＋與 [#node-assign](../error-handling.md#node-assign) 之逐條反向對照）
- **Open Questions**：[open-questions.md §B](../open-questions.md#b-2026-09-02)（`OQ-B-01`～`OQ-B-10` 之索引；**逐題完整敘述以本檔 [§審查清單](#human-gate-review) 為單一真相來源**）
- **Stories**：[E12 epic-brief](../../stories/epics/E12-business-function-category/epic-brief.md)／[US-106](../../stories/epics/E12-business-function-category/US-106-business-category-pool-and-dag.md)／[US-107](../../stories/epics/E12-business-function-category/US-107-business-category-document-mount.md)／[US-108](../../stories/epics/E12-business-function-category/US-108-public-category-tree-browsing.md)
- **平行對照之既有規格（本檔逐條比照，該六檔一字不改）**：[F007](F007-lifecycle-pool-crud.md)／[F008](F008-dag-node-edge.md)／[F009](F009-node-drawer-maintenance.md)（🔴 **本功能推翻其兩條限制之適用性，見 [§推翻總表](#override-table)**）／[F036](F036-lifecycle-tree-preview.md)／[F038](F038-lifecycle-tree-change-history.md)／[F040](F040-lifecycle-subcategory.md)
- **本批之跨檔 delta（`AC-B1`～`AC-B29`）**：[F017 §業務/功能類別欄 delta](F017-backend-document-list.md#business-category-column-delta)（`AC-B1`～`AC-B11`）／[F019 §業務/功能類別瀏覽模式 delta](F019-public-list-browsing.md#business-category-browse-delta)（`AC-B12`～`AC-B27`）／[F025 §業務/功能類別管理功能列 delta](F025-role-function-matrix.md#business-category-function-key-delta)（`AC-B28`～`AC-B29`）
- **明確不影響**：[F026](F026-role-field-matrix.md)（**不新增列**，理由見 `AC-51`）／[F010](F010-create-document.md)／[F011](F011-edit-with-comparison.md)（文件建立／編輯表單**不新增任何類別欄位**）／[F013](F013-document-number-uniqueness.md)（文件編號規則完全不變）／[F023](F023-audit-logging.md)（稽核為 additive，落點待第 3 項架構裁定）／[F041](F041-user-subtype-business-scope.md)（可見性判定式一字不改，`AC-52`）
- **權限**：[F025](F025-role-function-matrix.md#business-category-function-key-delta) 新增第 15 列「業務/功能類別管理」（`AC-43`／`AC-44`）
- **Prototype**：待 ui-ux-designer（保留編號 `26`／`27`／`28`，本輪不建檔）

---

## 給人類閘門的審查清單 {#human-gate-review}

> 🔵 **以下為 spec-writer 於撰寫過程中所做之全部推定與未決項。** 每項附建議預設值；未經裁決者一律以 `[ASSUMPTION]` 標記於正文對應處。**下游 test-generator 不得為未決項臆造斷言。**
> 🟢 **2026-09-02 第二輪人類裁決已結案 4 項**（見上方 [§同日第二輪人類裁決](#human-gate-review) 之決 5～決 8）：`A4`（前台無 PDF）／`A6` ＋ `OQ-B-02`（第三個 tab 與其閘門）／`OQ-B-08`（F026 不加列）**全數確認 spec-writer 之推定成立**；另確認**主管權限之刻意不對稱為本意**（`AC-44`／`AC-B29` 維持原樣）。> 🟢 **同日 system-architect 亦已完成裁定**（[architecture-spec 第 14 章](../architecture-spec.md#ch14-f043)，決策 E1～E9）：`OQ-B-01`（原唯一 🔴 BLOCKING）**＝乙案，設計層阻塞解除**；`OQ-B-09`（稽核類型）＝決策 E3。[§待 system-architect](#for-architect) 之 8 項**已全數結案**。
>
> ### 🟢 同日第三輪人類裁決（決 9～決 12，2026-09-02，使用者本人）——**全數結案並核准進入 Phase B**
>
> | # | 裁決 | 原提報 | 落點 |
> |---|---|---|---|
> | **決 9** | 🟢 **第 16 欄 pill 只出「類別」、依 `categoryId` 去重**（同一份文件掛在同一類別之多個節點時只出一顆 pill） | `[ASSUMPTION]` **A2** | [F017](F017-backend-document-list.md#business-category-column-delta) `AC-B3` ③ 之去重規則與其語料鑑別力要求 |
> | **決 10** | 🟢 **第 16 欄之個別 pill 純顯示、不可點擊**；唯一可互動者為 `+{N−1}` 展開徽章。**理由逐字採規格原文**：連結點 pill 可點是因為背後有**可下載之 PDF**，類別背後**沒有檔案** | `[ASSUMPTION]` **A11** | [F017](F017-backend-document-list.md#business-category-column-delta) `AC-B4` |
> | **決 11** | 🟢 **停用類別之既有掛載「第 16 欄仍顯示、篩選下拉不納入」**——**含這個刻意的不對稱**（顯示歷史事實 vs 不引導新篩選，是兩件不同的事） | `OQ-B-04`（甲案） | [F017](F017-backend-document-list.md#business-category-column-delta) `AC-B7` ③ 與其 ⚠ 段 |
> | **決 12** | 🟢 **核准進入 Phase B（實作）**；其餘未逐一列出之推定（`A1`／`A3`／`A5`／`A7`／`A8`／`A9`／`A10`／`A12`）與 open question（`OQ-B-03`／`05`／`06`／`07`／`10`）**一律採規格所載之建議預設** | 上列 8 項 `[ASSUMPTION]` ＋ 5 題 `OQ-B` | 各自條文原地生效，無需改寫 |
>
> **⇒ 本檔自此為 `🟢 APPROVED`：12 項 `[ASSUMPTION]` 全數確認、`OQ-B-01`～`OQ-B-10` 全數結案、[§待 system-architect](#for-architect) 8 項全數裁定。**
> 🔴 **唯一仍未通過的關卡＝「migration 對 dev 真庫實跑」**，見[檔頭之實作前置警語](#f043-business-function-category)——**核准的是規格，不是資料表已存在**。<br>⚠ **架構裁定解除的是設計阻塞，不是人類閘門**——本檔全文仍為 DRAFT，核准前**不得建 migration、不得實作**。<br>🟢 **同日第三輪（決 9～決 12）已將其餘 10 項 `[ASSUMPTION]`（A1／A2／A3／A5／A7～A12）與 6 題 `OQ-B-03`～`OQ-B-07`／`OQ-B-10` 全數結案**——`A2`＝決 9、`A11`＝決 10、`OQ-B-04`＝決 11，其餘一律依決 12「採規格所載之建議預設」。<br>📝 `OLD>` 「**仍待人類裁決者＝其餘 10 項 `[ASSUMPTION]`⋯＋ 6 題⋯（全數不阻塞）。**」<br>📌 另登記 **3 項既有技術債 `TD-B-01`～`TD-B-03`**（皆非本功能引入、本輪刻意不修；`TD-B-02`／`TD-B-03` 之 prototype 補正 lead 已指派 ui-ux-designer），見 [§三之一](#human-gate-review)。

### 一、已做之推定（`[ASSUMPTION]`，均已寫入正文，請逐項確認或推翻）

| # | 推定 | 依據／理由 | 若推翻之影響 |
|---|---|---|---|
| ~~**A1**~~ 🟢 **已確認（決 12）** | **新欄置於文件清單之最末（第 16 欄，緊接「循環別」之後）**；CSV 亦置於最末（第 15 欄） | 使用者原文僅說「新增一欄」未指定位置；置末對既有 15 欄之相對順序**零影響**，且「循環別」與「業務/功能類別」為兩條分類軸，相鄰最易對讀 | ✅ **已結案**——2026-09-02 人類閘門確認本推定成立，維持規格所載之處置。 改位置只需改 `AC-B1`／`AC-B9` 之逐字欄序，不影響其餘條文 |
| ~~**A2**~~ 🟢 **已確認（決 9）** | **第 16 欄之 pill 呈現的是「類別」而非「類別/節點」**；同一類別下掛多個節點時**依 `categoryId` 去重、只出一顆 pill** | 使用者原文「呈現該文件有掛的**業務/功能類別**」——受詞是類別。節點層級之細節在樹狀圖抽屜可見，塞進清單格會使一列爆長 | ✅ **已結案**——2026-09-02 人類閘門確認本推定成立，維持規格所載之處置。 若要顯示到節點，`AC-B3`／`AC-B10` 與 CSV 值層規則須改寫，且需重新裁定去重規則 |
| ~~**A3**~~ 🟢 **已確認（決 12）** | **CSV 多值分隔符＝全形頓號 `、`** | 本欄之值是**中文顯示名**（同「當責室長」欄，[F017](F017-backend-document-list.md) `AC-X5` 用 `、`）；半形分號 `;` 在既有規格中專用於**編號**類（`AC-X6`），與中文名並置會不一致。**兩欄分隔符不同為既有之刻意，本欄向「中文名」那一類對齊** | ✅ **已結案**——2026-09-02 人類閘門確認本推定成立，維持規格所載之處置。 改為 `;` 只需改 `AC-B9` 一處；🔴 **但不得改為半形逗號 `,`**（會觸發 RFC 4180 引號包覆，欄內外逗號肉眼無從分辨，理由同 `AC-X5` ①） |
| ~~**A4**~~ 🟢 **已裁決（決 6，2026-09-02）** | **前台樹狀圖模式不提供 PDF 下載／列印**；PDF 下載／列印**僅後台**類別管理之樹狀圖預覽有 | 🟢 **人類確認成立，已升格為明文裁決條款 `AC-53`**（含正負成對之可測形狀）。裁決理由＝**前台 PDF 需另行套用 [F041](F041-user-subtype-business-scope.md) 可見性過濾**（燒錄是伺服器端一次性產出，沒有第二道逐列過濾的機會），本輪不做 | ✅ **已結案**——若日後要開放，須先回答「PDF 內容是否逐 viewer 不同／掛載數以誰的視角計算／是否記調閱稽核」三題 |
| ~~**A5**~~ 🟢 **已確認（決 12）** | **前台樹狀圖之節點掛載數＝套用可見性過濾後之數字**（`AC-B21`） | 顯示未過濾之總數等於洩漏「存在幾份你看不到的文件」，與 [F041](F041-user-subtype-business-scope.md) 之「刻意隱藏存在性、回 404 而非 403」之既有裁決相牴觸 | ✅ **已結案**——2026-09-02 人類閘門確認本推定成立，維持規格所載之處置。 若改為顯示總數，須同時推翻 F041 之隱藏存在性裁決（**不建議**） |
| ~~**A6**~~ 🟢 **已裁決（決 7，2026-09-02）** | **結構變更歷程＝「文件變更歷程」頁之第三個 tab**，標籤逐字 **`業務/功能類別樹狀圖`**、置於既有兩個 tab 之後 | 🟢 **人類確認成立**（`AC-40` 已就地改寫；標籤由原提報之 `業務/功能類別` 改為人類指定之 `業務/功能類別樹狀圖`，與既有第二個 tab `循環樹狀圖` 同構）。權限沿用該頁既有功能鍵 ⇒ **主管看不到**（`AC-54`／`OQ-B-02` 甲案） | ✅ **已結案**——⚠ 連帶產生一處**刻意之字串重用**（本 tab 標籤 ≡ 前台瀏覽模式標籤，但為兩個互不相干之載體），斷言**必須限定容器** |
| ~~**A7**~~ 🟢 **已確認（決 12）** | **本功能之錯誤碼一律另立 `BUSINESS_CATEGORY_*`，不沿用 `DAG_*`／`NODE_DOC_*`** | 見 `AC-16` 之逐字理由（「循環」為已被佔用之專有名詞；沿用會讓錯誤訊息指向使用者沒在編輯的東西） | ✅ **已結案**——2026-09-02 人類閘門確認本推定成立，維持規格所載之處置。 若裁定沿用，`AC-16` 之立條理由段須刪除並改寫錯誤表（11 個新碼降為 8 個） |
| ~~**A8**~~ 🟢 **已確認（決 12）** | **移除不存在之掛載回 404，不採靜默 200** | 靜默會使「移除成功」與「移除了不存在的東西」產生逐位元組相同之回應（本 repo 反覆付出代價之靜默失敗形狀） | ✅ **已結案**——2026-09-02 人類閘門確認本推定成立，維持規格所載之處置。 改為靜默只需刪 `BUSINESS_CATEGORY_MOUNT_NOT_FOUND` 一碼 |
| ~~**A9**~~ 🟢 **已確認（決 12）** | **示範資料採 `授信`／`風險管理`／`帳務處理` ＋ 子分類 `消金`／`企金`／`子公司`** | 子分類三值與 [F040](F040-lifecycle-subcategory.md) 人類閘門裁決 3 逐字相同，避免下游出現第二組示範詞彙；類別名為 spec-writer 依「業務/功能」語意所擬 | ✅ **已結案**——2026-09-02 人類閘門確認本推定成立，維持規格所載之處置。 純文案，改動成本僅限 prototype 與測試 fixture |
| ~~**A10**~~ 🟢 **已確認（決 12）** | **前台無可用類別時顯示空狀態、不自動切換到 `文件清單` 模式**（`AC-B19`） | 自動切換會使「預設為樹狀圖」這條人類明訂之規則變得**不可觀察**（測試無法區分「預設是清單」與「預設是樹但自動切走了」） | ✅ **已結案**——2026-09-02 人類閘門確認本推定成立，維持規格所載之處置。 若裁定自動切換，`AC-B14`／`AC-B19` 須改寫並須明訂切換後是否顯示提示 |
| ~~**A11**~~ 🟢 **已確認（決 10）** | **第 16 欄之個別 pill 為純顯示、不可點擊**；唯一可互動者為 `+{N−1}` 展開徽章（`AC-B4`） | 第 12 欄之 pill 可點是因為「連結點程序書」背後有**可下載之 PDF**；類別背後**沒有檔案**。決 4 之「比照連結點之 UI 顯示方式」所指為**摺疊呈現方式**，非其可點擊性 | ✅ **已結案**——2026-09-02 人類閘門確認本推定成立，維持規格所載之處置。 若裁定 pill 應可點擊並導向該類別之樹狀圖預覽，`AC-B4` 須改寫並新增一條導向 AC（含「前台／後台導向何處」之裁定） |
| ~~**A12**~~ 🟢 **已確認（決 12）** | **CSV 第 15 欄之多值順序恆依 `businessCategoryDisplayName` 字典序**，**不**套用畫面之「篩選命中者置前」（`AC-B10`） | 命中者置前需要把「命中之類別」傳給後端，而匯出端點之 body 已定為**恰兩鍵**之語意契約（`OQ-X-01` 裁決）；為一個排序細節再開一個 body 鍵，代價高於收益。⚠ **此為本欄與第 12 欄之刻意不同，已於 `AC-B10` 明列、非疏漏** | ✅ **已結案**——2026-09-02 人類閘門確認本推定成立，維持規格所載之處置。 若裁定要一致，須放寬 [F017 §Interface Contract](F017-backend-document-list.md#interface-contract) 之「恰兩鍵」契約（🔴 **spec-writer 不建議**——那扇門正是該裁決要關掉的） |

### 二、未決之 open question（建議預設值已寫入正文並標記）

| ID | 問題 | 選項 | **建議預設** | 阻塞？ |
|---|---|---|---|---|
| **OQ-B-01** | 變更歷程／快照之資料表落點 | 甲：擴充既有 `LIFECYCLE_CHANGE_LOG`／`LIFECYCLE_SNAPSHOT` 為多型｜乙：新增兩張平行表 | **乙**——既有表之 `lifecycleId` 為 NOT NULL FK → `LIFECYCLE`，改多型須把它放寬為 nullable 並解除 FK，而該表是 **append-only、DB 層已撤銷 UPDATE／DELETE 權限**之稽核級資料；且既有「變更前＝前一筆快照」之查詢以 `lifecycleId` 為鍵。**代價＝兩套結構近乎相同之查詢與重建程式碼可能漂移**，須以「兩份逐字相同」之既有處置約束 | 🔴 **是**（決定 migration 形狀，system-architect 需先答） |
| ~~**OQ-B-02**~~ | 「文件變更歷程」第三個 tab 之權限閘門 | 甲：沿用「文件變更歷程」列（主管**看不到**第三個 tab）｜乙：改用「業務/功能類別管理」列（主管看得到第三個 tab，卻看不到前兩個） | 🟢 **已裁決＝甲**（2026-09-02，決 7）——主管對類別管理有唯讀權**但看不到其變更歷程**，此落差**刻意、非漏洞**（`AC-54` 已明文立條並附反案代價） | ✅ **已結案** |
| **OQ-B-03** | 前台樹狀圖是否列出「沒有任何可見文件」之類別 | 甲：不列（`AC-B18` 現採）｜乙：列出但呈現空樹 | **甲**——列出一個點進去全空的類別，對前台使用者只是噪音；且與 F041 隱藏存在性一致 | ⬜ 否 |
| **OQ-B-04** | 停用之類別，其既有掛載是否仍出現在 [F017](F017-backend-document-list.md) 第 16 欄 | 甲：仍顯示（歷史事實）｜乙：不顯示 | **甲**——掛載關係並未消失，隱藏會使管理員無法理解「為何刪不掉這個類別」（`BUSINESS_CATEGORY_HAS_DOCUMENTS` 指向一個看不見的關係）。**現採甲，並於 `AC-B7` 明訂篩選下拉之預設選項集不含停用類別**（兩者刻意不同） | ⬜ 否 |
| **OQ-B-05** | 一份文件可掛載之類別／節點數是否設上限 | 甲：不設｜乙：設（如每份文件至多 20 筆掛載） | **甲**——需求未提，且上限會在第 16 欄與 CSV 產生截斷語意（又一處需要「+N」與「已截斷」告知）。⚠ **但須注意規模**：591 份文件 × 無上限掛載，第 16 欄之 pill 數與 CSV 欄長皆無界；若日後出現一列數十顆 pill，比照 [F042](F042-ojt-progress-management.md) `OQ-E11-21` 之教訓（真實資料才暴露、假資料整個藏住） | ⬜ 否（但建議實作後對真庫實測分佈） |
| **OQ-B-06** | 節點名稱是否必填 | 甲：可先未命名（比照 [F008](F008-dag-node-edge.md)）｜乙：必填 | **甲**——與循環畫布之既有行為對等（決 2「完全對等」） | ⬜ 否 |
| **OQ-B-07** | `subcategory` 之長度上限與是否需專屬錯誤碼 | 沿用 `nvarchar(100)` 同 `name`、不新增專屬碼 | **沿用**（比照 [F040](F040-lifecycle-subcategory.md) `OQ-E03-11` 之既有處置，不重開此題） | ⬜ 否 |
| ~~**OQ-B-08**~~ | 🔴 **[F026](F026-role-field-matrix.md) 是否需要新增一列** | 甲：**不新增**｜乙：新增一列「業務/功能類別」（比照 `所屬節點` 之「欄位在文件上、入口在抽屜」先例） | 🟢 **已裁決＝甲**（2026-09-02，決 8）——**F026 維持 20 列逐格不變**。裁決理由逐字採納原提報：類別掛載**不是文件欄位**（住在別張關聯表），其**寫入權限已由功能矩陣把關** | ✅ **已結案**（`AC-51` 措辭已由「建議」升格為「裁定」） |
| **OQ-B-09** | 稽核動作類型之數量 | 待 system-architect（見 [§待 system-architect](#for-architect) 第 3 項） | 比照 `LIFECYCLE_*` 家族另立 `BUSINESS_CATEGORY_VIEW`／`_DOWNLOAD`／`_PRINT`／`_CHANGED`，並使 [F024](F024-access-history-query.md) 類型篩選值由五擴為六 | ⬜ 否 |
| **OQ-B-10** | 前台樹狀圖模式之選擇是否需要跨 session 記憶 | 甲：不記憶，每次進入皆為預設之樹狀圖模式｜乙：記憶上次選擇 | **甲**——人類原文明訂「預設為業務/功能類別樹狀圖模式」；記憶會使該規則在第二次造訪後不成立 | ⬜ 否 |

### 三之一、既有技術債（**非本功能引入、本輪刻意不修**，交人類閘門知悉）

| # | 技術債 | 事實（spec-writer 已獨立查證，非採信轉述） | 為何本輪不修 | 風險與建議 |
|---|---|---|---|---|
| **TD-B-01** | 🔴 **[data-model.md](../data-model.md#lifecyclechangelog-entity) 之 `LIFECYCLE_CHANGE_LOG` 欄位表與實際 entity 不一致** | 逐欄比對 `backend/src/database/entities/lifecycle-change-log.entity.ts` 之實際欄位集合＝`id`／`lifecycleId`／`changeType`／**`summary`**／**`oldValue`**／**`newValue`**／**`nodeId`**／**`actorId`**／**`actorName`**／**`actorEmployeeNo`**／**`occurredAt`**／`snapshotId`；而 data-model 該節列的是 `entityType`／`entityId`／`beforeValue`／`afterValue`／`changedByAccountId`／`employeeNo`／`name`／**`department`**／**`section`**／`changedAt`。<br>**⇒ 4 組欄位名不同（`beforeValue`↔`oldValue`、`changedByAccountId`↔`actorId`、`changedAt`↔`occurredAt`、`entityType`+`entityId`↔`nodeId`）、文件多列 `department`／`section` 兩個實際不存在的欄位、少列 `summary` 一欄。**<br>成因＝2026-08-08 使用者裁決 5（「修規格、不修 schema」）之後，該節僅移除了 `lifecycleName` 一列，其餘欄位描述未一併與 entity 對帳 | ① 該表為 **append-only 稽核級資料**，其文件定義是下游建 migration 與查詢的參照點——順手改一整張表的欄位描述，**風險大於收益**；② 修它需要逐欄回溯「文件寫錯」vs「entity 後來改過」，屬獨立的對帳工作；③ **與 F043 無因果關係**（本功能不讀不寫該表） | ⚠ **對 F043 的實際影響已被架構師的作法規避**：[§14.1](../architecture-spec.md#ch14-f043) 設計 `BUSINESS_CATEGORY_CHANGE_LOG` 時**照的是 entity 的真實形狀**（`summary`／`oldValue`／`actorId`／`actorName`／`occurredAt`／`nodeId`），**不是** data-model 該節的文字 ⇒ 新表與其姊妹表**結構同構**。<br>🔴 **殘留風險**：日後若有人「比照 data-model 的 `LIFECYCLE_CHANGE_LOG` 描述」去改新表或建查詢，會照著一份錯的規格做。<br>**建議**：另案排一次「該節 vs entity 逐欄對帳」，**不夾帶在任何 feature delta 裡**。 |

| **TD-B-02** | 🔴 **功能矩陣之 prototype 複本落後於後端權威**（ui-ux 於 2026-09-02 回報，spec-writer 已逐檔查證） | ① **`prototypes/18-permission-matrix.html` 之 `FUNC_ROWS`**：`'循環管理（DAG）',['唯讀','CRUD','**唯讀**','無','無']`，而 `backend/src/rbac/function-matrix.ts` 之同格已是 **`NONE`**（該檔第 114–118 行明載「2026-09-02 人類裁決：主管由『唯讀』改為『無』」）⇒ **prototype 落後一輪**。<br>② **同檔 `FUNC_ROWS` 僅 13 列，缺 `OJT 進度管理` 一列**（2026-08-28 那批）——⚠ **但同檔之 MENU 陣列已有 `{id:'ojtprogress',…}`**，即**同一支 prototype 內兩份複本各自落後不同的輪次**。<br>③ **`07-admin-shell.html` 等 19 支之 MENU**：`循環管理` 之 `roles:{…,supervisor:'唯讀'}`，同樣落後。 | ① 修正 prototype 屬 ui-ux 職責（**lead 已指派**），非 spec-writer；② 與 F043 無因果關係——本功能只**新增**第 15 列，既有 14 列一格未動（`AC-B29`）；③ 夾帶修改 20 支 prototype 會使本輪 delta 的 diff 失去可審性 | 🔴 **可複用的教訓（本列之重點，請寫進下游建環之必檢項）**：**功能矩陣改值時，權威在後端 `backend/src/rbac/function-matrix.ts`，但它在前端鏡射檔與 19＋ 支 prototype 各有一份複本。改一處而不傳播，會讓日後任何依賴該格值的斷言失去鑑別力**——因為斷言可能對著一份**還停在舊值**的複本，於是「改了」與「沒改」在該複本上輸出相同。<br>⚠ **這正是本輪 `AC-44`／`AC-B29` 成對斷言差點變成恆真的成因**：若那兩條的驗證載體取自 prototype 18（`唯讀`）而非 `function-matrix.ts`（`NONE`），「主管兩列刻意不同」這件事**在該載體上根本看不出來**，斷言會恆綠。<br>**⇒ 建環規則**：凡斷言功能矩陣格值者，**驗證載體必須是 `function-matrix.ts`**；prototype 之矩陣僅可作**視覺**對照，**不得**充當權威。 |

| **TD-B-03** | 🔴 **權限裁決之「連帶生效項」未傳播至 prototype**（ui-ux 於 2026-09-02 回報，spec-writer 已逐檔查證；**與 `TD-B-02` 是不同的東西——那是矩陣格值本身，這是依該格值做分支的下游載體**） | ① **`prototypes/10`／`11`／`12` 之 `setRole()`** 仍讓主管以唯讀進入循環管理相關頁（`10` 內 `supervisor:'唯讀'` 出現 4 次）；<br>② **`prototypes/13-document-list.html` 之「樹狀圖」欄**仍未對主管／部門窗口移出 DOM。<br>🟢 **兩者皆僅為 prototype 落後、已上線程式碼是對的**（spec-writer 查證）：`frontend/src/pages/DocumentListPage.tsx:234` 為 `const canSeeTree = canPerform(role, FunctionKey.LIFECYCLE_MANAGEMENT, 'read')`，`:880` 與 `:935` 皆為 `{canSeeTree && …}`；`backend/src/lifecycle/lifecycle-preview.controller.ts:25/35/52` 三個端點皆掛 `@RequirePermission(FunctionKey.LIFECYCLE_MANAGEMENT, 'read')`，而該格值已是 `NONE`。<br>③ **另一筆既有缺口**：`prototypes/07-admin-shell.html` 之 **`CARDS`（第 153 行起）缺 `OJT 進度管理` 卡片**，而同檔 **`MENU`（第 120 行）已有** `{id:'ojtprogress',…}` ⇒ 同一支檔內**兩個陣列不一致** | ① 修 prototype 屬 ui-ux 職責（**lead 已指派**）；② 與 F043 無因果關係——本功能不動循環側任何格值或分支（`AC-49`）；③ ③ 屬 E11 之殘留、**本輪明確不修**，僅登記 | 🔴 **可複用的教訓（本列之重點）**：**一個權限裁決的「連帶生效」項——判定邏輯、渲染條件、卡片／選單陣列——比矩陣格值本身更容易漏傳播，因為它們散落在不同型別的載體裡**（`.ts` 的 `canPerform` 分支、`.tsx` 的 `{cond && …}`、prototype 的 `roles:{}` 物件、另一支 prototype 的 `CARDS` 陣列）。改一個格值時，`FUNCTION_MATRIX` 那一格是**最顯眼、最不會漏**的一處；真正會漏的是「**誰依這格值做分支**」。<br>**⇒ 建議之作業規則**：矩陣改值時同步 grep 該 `FunctionKey` 的**全部消費點**並逐一盤點（端點 `@RequirePermission`／前端 `canPerform` 分支／選單 `roles`／卡片陣列／prototype 的 `setRole`），**盤點清單隨該次 delta 一併留檔**——否則下一輪沒有人知道當初漏了哪幾處。<br>📌 **③ 之形狀與 `TD-B-02` ② 完全相同**（同一支 prototype 內 MENU 與另一陣列各自落後不同輪次），兩者可一併修。 |

### 三、本輪明確不做（範圍紀律）

- ❌ 不寫任何產品程式碼、測試、migration 檔、prototype。
- ❌ 不改動 [F007](F007-lifecycle-pool-crud.md)／[F008](F008-dag-node-edge.md)／[F009](F009-node-drawer-maintenance.md)／[F036](F036-lifecycle-tree-preview.md)／[F038](F038-lifecycle-tree-change-history.md)／[F040](F040-lifecycle-subcategory.md) 之任一既有條文（僅於本檔記錄「其兩條限制對本功能不適用」）。
- ❌ 不改動 [F026](F026-role-field-matrix.md)——🟢 **2026-09-02 人類裁定不加列，維持 20 列逐格不變**（決 8；`AC-51`／`OQ-B-08` 已結案）。
- ❌ 不提供**前台**樹狀圖之 PDF 下載／列印——🟢 **2026-09-02 人類裁定，已升格為明文條款 `AC-53`**（決 6；理由＝前台 PDF 須另行套用 [F041](F041-user-subtype-business-scope.md) 可見性過濾，本輪不做）。**後台**之下載／列印不受影響（`AC-36`）。
- ❌ 不改動 [F017](F017-backend-document-list.md) 之既有 15 欄集合／13 項篩選語意／子樹 chip／統計卡／排序／分頁（僅**增加**第 16 欄與第 14 項篩選）。
- ❌ 不改動 [F019](F019-public-list-browsing.md) `文件清單` 模式之任一既有行為（六項篩選、置頂、卡片欄位、空狀態文案）。
- ❌ 不改動 [error-handling.md#export](../error-handling.md#export) 之任一既有規則（本功能為第六處，向其對齊）。
- ❌ 不重開 [F040](F040-lifecycle-subcategory.md) `OQ-E03-10`（唯一性涵蓋停用列）與 `OQ-E03-11`（子分類長度）之既有裁決。
