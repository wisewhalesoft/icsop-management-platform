# US-106: 業務/功能類別池與 DAG 畫布（含子分類、停用、刪除保護、防環）

> **Story ID**: US-106
> **Epic**: [E12 業務/功能類別管理](epic-brief.md)
> **Priority**: P1
> **Phase**: 1
> **Estimated Points**: 8
> **Status**: 🔵 **DRAFT / awaiting-human-review**（2026-09-02）
> **規格權威**: [F043 §甲／§乙／§丁／§戊／§己](../../../specs/features/F043-business-function-category.md)（`AC-01`～`AC-19`、`AC-32`～`AC-47`）

## User Story

As an **ICSOP 管理員**,
I want **建立一套與循環平行的「業務/功能類別」，並在每個類別的 DAG 畫布上維護節點與有向連線**,
So that **我能以「業務／功能」這條與流程正交的分類軸來組織程序書，而不必把它硬塞進既有的循環結構裡**。

## Acceptance Criteria

### AC1：類別池 CRUD 與導向

**Given** 我是 ICSOP 管理員，於後台側選單「循環管理」**下方**看到新的「業務/功能類別管理」項目
**When** 我輸入名稱（必填）、子分類（非必填）與說明並送出
**Then** 系統建立該類別、配發 UUID，並**導向該類別的 DAG 畫布編輯頁**（比照循環池之既有行為）；
**Given** 我在清單頁
**Then** 每列顯示類別顯示名稱、狀態、節點數量、**掛載文件數（去重後之相異文件數）** 與最後更新時間，並可依名稱／狀態篩選。

### AC2：子分類與業務身分

**Given** 類別之業務身分為 `(名稱, 子分類)` 之組合
**When** 我建立同名但不同子分類的兩個類別
**Then** 兩者為**彼此獨立的類別**，各有獨立 UUID、獨立 DAG 與獨立掛載；
**Given** 我建立同名同子分類之第二筆
**Then** 系統拒絕；
**Given** 某名稱底下已有「無子分類」之列
**When** 我為同名補上子分類（或反向）
**Then** 系統拒絕並提示先處理既有那一筆（雙向皆適用）。
📌 規則權威＝[F043](../../../specs/features/F043-business-function-category.md) INV-B1／INV-B2；正規化**重用** [F040](../../../specs/features/F040-lifecycle-subcategory.md) 之既有純函式，顯示格式為 `名稱（子分類）`（全形括號、前後無空白）。

### AC3：停用與刪除保護（兩者刻意不對稱）

**Given** 某類別底下仍有程序書掛載
**When** 我刪除該類別
**Then** 系統拒絕並提示**需先解除全部掛載才能刪除**（非「永不可刪」）；
**When** 我改為**停用**該類別
**Then** 成功，且既有節點／連線／掛載關係**完全不受影響**（停用不需先清空掛載）；
**Given** 我已把該類別的掛載逐筆移除
**When** 我刪除
**Then** 允許刪除（其節點與連線一併移除）並記錄稽核。

### AC4：DAG 節點與連線（含防環）

**Given** 我在某類別的畫布上
**When** 我新增節點、拖曳調整位置、由節點 A 連線至 B
**Then** 節點與座標持久化，連線以**直角（elbow）箭頭**呈現（與全系統一致），並允許多 parent／多 child；
**When** 我嘗試建立一條會使結構成環的連線（直接雙向、間接繞回、或連向自己）
**Then** **後端於交易內權威驗證**並拒絕（即使前端已預覽亦以後端為準）。
📌 錯誤碼刻意另立（`BUSINESS_CATEGORY_CYCLE_DETECTED`／`BUSINESS_CATEGORY_SELF_LOOP`），**不沿用** `DAG_*`——後者之訊息含「循環結構」，而「循環」在本系統是已被佔用的專有名詞（[F043](../../../specs/features/F043-business-function-category.md) `AC-16`）。

### AC5：刪除節點之連動與確認

**Given** 某節點已掛載 N 份程序書
**When** 我刪除該節點
**Then** 系統提示「刪除後將一併移除 {N} 筆掛載關係」並要求二次確認；確認後於同一交易內刪除該節點、其相關連線與其全部掛載關係；取消則**一筆未動**。

### AC6：樹狀圖預覽、下載與列印（含浮水印）

**Given** 我在類別池清單點擊某列的樹狀圖圖示
**Then** 開新頁呈現該類別之**唯讀** DAG（上到下、直角箭頭、每節點顯示名稱與掛載程序書數），整頁疊加浮水印，頂部可切換至其他有權限可視之類別；
**When** 我單擊節點
**Then** 醒目標示該節點與其全部下游；**When** 我雙擊節點
**Then** 唯讀側抽屜列出該節點**子樹**所掛載之程序書（依節點分組）；
**When** 我點「下載」或「列印」
**Then** 取得伺服器端產生、浮水印**已燒錄於 PDF 內容層**之檔案，且下載與列印**各記一筆獨立稽核**。
📌 本頁渲染 HTML、無內容層可燒錄 ⇒ **疊加層是其唯一浮水印載體，必須保留**（比照 `LifecycleTreePreviewPage` 之既有明文）。

### AC7：結構變更歷程與快照

**Given** 我對某類別做了任一結構變更（增刪節點、增刪連線、節點改名、掛載／移除文件）
**When** 該動作完成
**Then** 系統於**同一交易內**寫入一筆 append-only 變更事件與其配對之完整結構快照；
**Given** 我開啟「文件變更歷程」頁
**Then** 存在**第三個** tab **`業務/功能類別樹狀圖`**（🟢 2026-09-02 人類裁決之逐字標籤；前兩個 tab 之標籤、順序與內容**一字不改**，新 tab 置於最後），可查詢事件、預覽／下載變更前後兩版樹狀圖，並匯出 CSV；
**Given** 我的角色是**主管**
**Then** 我**看不到這個頁面的任何一個 tab**（該頁閘門為既有之「文件變更歷程」功能鍵，主管為「無」）——🔴 **此落差刻意、非漏配**：變更歷程的閘門屬於**它所在的頁面**，不屬於**它所描述的對象**（與 [F038](../../../specs/features/F038-lifecycle-tree-change-history.md) 循環樹狀圖變更歷程之既有處置完全同構）。
⚠ 變更事件之 `changeType` 值域**恰 7 值、不含 `DOCUMENT_REASSIGNED`**——多對多模型下沒有「改派」這件事（見 [US-107](US-107-business-category-document-mount.md) AC3）。
⚠ 其資料表落點待 system-architect 裁定（`OQ-B-01`，🔴 **BLOCKING**）。

### AC8：權限

**Given** 角色為 ICSOP 管理員
**Then** 對本功能為 **CRUD**；
**Given** 角色為系統管理員或主管
**Then** 為**唯讀**——可檢視類別池、畫布、樹狀圖預覽與下載／列印，但任一寫入動作一律 403；
**Given** 角色為部門窗口或一般使用者
**Then** 側選單不呈現本項，且直接呼叫任一後台端點一律 403。
🔴 **前台不受本列限制**：部門窗口與一般使用者之**前台**業務/功能類別樹狀圖瀏覽由「前台瀏覽」列承接（見 [US-108](US-108-public-category-tree-browsing.md)）——**兩者是不同維度**。
🔴 **主管對本功能為「唯讀」，而 2026-09-02 同日之另一項裁決已把主管移出「循環管理」（改為「無」）——兩者刻意不同，不得對齊**（[F025](../../../specs/features/F025-role-function-matrix.md#business-category-function-key-delta) `AC-B29`）。

### AC9：與循環管理零漣漪

**Given** 本 Story 實作完成
**When** 執行循環管理之全部既有行為（[F007](../../../specs/features/F007-lifecycle-pool-crud.md)／[F008](../../../specs/features/F008-dag-node-edge.md)／[F009](../../../specs/features/F009-node-drawer-maintenance.md)／[F036](../../../specs/features/F036-lifecycle-tree-preview.md)／[F038](../../../specs/features/F038-lifecycle-tree-change-history.md)／[F040](../../../specs/features/F040-lifecycle-subcategory.md)）
**Then** **逐條通過且期望值未經修改**；且 `ICSOP_DOCUMENT` 之欄位集合與本 Story 導入前**逐欄相同**（**不新增任何欄位**）。

## Notes

- 🔒 **命名鎖定**：功能名／選單標籤／矩陣列名一律逐字 `業務/功能類別管理`（半形斜線、前後無空白）；程式碼識別子一律 `businessCategory`／`BUSINESS_CATEGORY`。
- 🔵 本 Story 為 DRAFT；逐條可驗收之 AC 見 [F043](../../../specs/features/F043-business-function-category.md) `AC-01`～`AC-19`、`AC-32`～`AC-47`。
