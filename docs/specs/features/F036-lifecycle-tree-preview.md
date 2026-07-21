# F036: 循環樹狀圖預覽（唯讀＋浮水印）
Priority: P0-MVP | Status: Draft | Last Updated: 2026-07-17
Epic/Story: E03 / US-025

> 由**兩個後台入口**開啟新頁（viewer 風格，`22-lifecycle-tree-preview.html`）以唯讀檢視某循環之 DAG 結構：(1)「循環管理」清單（`10-lifecycle-list`）每列「狀態」欄右側之樹狀圖圖示；(2)「ICSOP 文件（程序書）清單」（`13-document-list`，[F017](F017-backend-document-list.md)）每列之樹狀圖圖示，以 `?cycle=<該文件所屬循環代碼>` 帶入該文件所屬循環為預選。屬「循環管理」之**唯讀子能力**：可視角色與範圍**沿用 F025「循環管理」唯讀列**（不新增權限矩陣列）。

## Description
提供循環 DAG 之**唯讀樹狀圖預覽頁**：上到下（top-down）佈局、直角（orthogonal）箭頭連線、節點顯示名稱與掛載程序書數、點節點醒目標示其所有下游；整頁疊加對角平鋪浮水印（格式權威同 [NFR-007](../nfr.md#watermark)）；頂部循環切換器可切換並重繪其他**有權限可視**之循環。本頁**不提供任何 DAG 編輯操作**（編輯須經 F008 畫布／F009 節點抽屜）。另提供 toolbar **下載/列印**：伺服器端將樹狀圖匯出為 PDF 並將浮水印**燒錄進內容層**（比照 [F020](F020-watermark.md)／US-054），下載與列印分別記 `LIFECYCLE_DOWNLOAD`／`LIFECYCLE_PRINT` 稽核。開啟預覽即記錄一筆 `LIFECYCLE_VIEW` 調閱稽核；三種動作（檢視/下載/列印，動作類型皆為草案）之稽核資料模型歸屬見 OQ-E07-02。節點/邊資料唯讀複用 F008 既有模型，不新增寫入路徑。

## Preconditions
- 使用者已登入（[F001](F001-auth-login-session.md)），身分/部門/處室資料來自 [F004](F004-org-sync.md)（供浮水印與稽核）。
- 目標循環與其節點/邊資料已存在（[F007](F007-lifecycle-pool-crud.md)／[F008](F008-dag-node-edge.md)）；節點掛載文件數來源為 [F009](F009-node-drawer-maintenance.md)。
- 操作者對「循環管理」具**唯讀（含）以上**可視權限（[F025](F025-role-function-matrix.md)：ICSOPAdmin／SysAdmin／**Supervisor 皆全公司唯讀（含）以上**；DeptContact／User 為「無」）。

## Main Flow
1. 具可視權限角色於「循環管理」清單（`10-lifecycle-list`）點擊某循環列狀態欄右側之樹狀圖圖示。
2. 系統開啟新頁（`22-lifecycle-tree-preview.html`），帶入該循環 ID。
3. 後端依角色可視範圍校驗該循環（見 Alternative Flows「角色可視範圍」）；通過後回傳該循環之節點/邊唯讀資料。
4. 前端以上到下佈局、直角箭頭連線渲染 DAG；每節點顯示名稱與掛載程序書數（如「節點名稱 (3)」）；支援多 parent／多 child。
5. 系統以伺服器端當下身分/時間快照組裝浮水印，於整頁對角平鋪疊加。
6. 系統同步寫入一筆調閱稽核（`LIFECYCLE_VIEW`），內容與當次浮水印一致（見 [F023](F023-audit-logging.md)）。
7. 頂部循環切換器載入**經後端角色過濾**之可視循環清單，供切換重繪。

## Alternative Flows
- **第二入口（F017 文件清單）**：由 `13-document-list`（[F017](F017-backend-document-list.md)）某文件列樹狀圖圖示開啟時，網址帶 `?cycle=<該文件所屬循環代碼>`，系統以該文件所屬循環為預選並套用同一角色可視範圍檢查（見「角色可視範圍」）；其餘頁面行為（浮水印、切換器、縮放、標示下游、下載/列印）與第一入口完全一致。**主管對循環管理已為全公司唯讀**，與文件管理全公司唯讀一致，第二入口不再有可視範圍落差（雙入口一致，OQ-E08-03 定案）。`?cycle` 之確切值（循環 UUID 或業務代碼）與後端反查/套用可視範圍之細節見 OQ-E03-07。
- **下載/列印燒錄**：於 toolbar 點「下載」或「列印」→ 伺服器端即時產生該循環樹狀圖 PDF 並將浮水印**燒錄進內容層**（格式權威同 [NFR-007](../nfr.md#watermark)、機密聲明另起一行；比照 [F020](F020-watermark.md)／US-054），非僅前端疊加；下載與列印**各記一筆獨立稽核**（`LIFECYCLE_DOWNLOAD`／`LIFECYCLE_PRINT`，不合併），內容與當次燒錄浮水印一致。列印與下載技術上可共用同一份已燒錄 PDF，但稽核仍須區分兩種動作類型。
- **切換循環重繪**：使用者自切換器選擇另一可視循環 → 系統重載並重繪該循環 DAG，頁面框架（浮水印、切換器、縮放）維持不變；每次切換視為一次新的檢視，另記一筆 `LIFECYCLE_VIEW` 稽核（比照 F023「每次調閱獨立記錄」；短時間重複開啟/切換是否節流去重比照 [OQ-E07-01](../open-questions.md) 一併確認）。
- **點節點標示下游**：點擊任一節點 → 醒目標示該節點與其所有下游（沿有向邊可達之全部後代節點與其間連線），其餘節點/連線淡化；再次點擊同節點或點擊空白區 → 取消標示、恢復預設。下游遍歷以點擊節點為起點沿 parent→child 方向 BFS/DFS；因 DAG 禁止成環（F008），遍歷保證終止。
- **角色可視範圍**（沿用 F025「循環管理」唯讀列，後端強制、非僅前端隱藏）：
  - SysAdmin／ICSOPAdmin／**Supervisor**：**全公司循環皆可開啟**（主管由「本部門相關」反向放寬為全公司唯讀，OQ-E08-03 定案；OQ-E03-06 已收斂，主管不再需要本部門範圍定義）。
  - DeptContact／User：清單不顯示樹狀圖圖示，且直接呼叫 API 一律回 403。
- **縮放**：放大/縮小/重置時節點與連線相對位置維持正確，對角平鋪浮水印仍覆蓋整個可視區域，不露出無浮水印空白區。

## Edge Cases
- 循環無任何節點：顯示空狀態提示（非錯誤畫面）。
- 以直接帶入循環 ID/網址繞過清單或切換器過濾：後端仍依角色可視範圍校驗（DeptContact／User 一律 403；SysAdmin／ICSOPAdmin／主管皆全公司可視）。
- 同一使用者相隔時間兩次開啟同循環：兩次浮水印時間戳記不同（各自當下伺服器時間）。
- 開發工具移除浮水印 DOM：屬 [NFR-007](../nfr.md#watermark) 已知限制，非本 feature 完全防禦範圍。
- 稽核寫入服務暫時不可用：使用者仍可正常檢視，稽核改進補償佇列重試補寫（見 Error Scenarios）。

## Postconditions
- 使用者取得指定循環之唯讀 DAG 檢視，未產生任何 DAG 資料異動。
- 每次成功開啟/切換皆有一筆與浮水印一致、不可竄改之 `LIFECYCLE_VIEW` 稽核紀錄。
- 下載/列印成功時取得浮水印已燒錄於內容層之 PDF，並各留一筆 `LIFECYCLE_DOWNLOAD`／`LIFECYCLE_PRINT` 稽核；未授權之下載/列印請求被拒且**不產檔、不留稽核**。

## Acceptance Criteria
- Given 具可視權限角色於循環管理清單點擊某列樹狀圖圖示, When 觸發, Then 開啟預覽頁並正確帶入該循環 ID 顯示其 DAG。
- Given 具可視權限角色於 F017 文件清單點擊某文件列樹狀圖圖示, When 觸發, Then 開啟預覽頁並以 `?cycle=<該文件所屬循環代碼>` 帶入該文件所屬循環為預選顯示，其餘行為與循環管理入口一致。
- Given 主管由文件清單（第二入口）開啟一份文件之樹狀圖圖示, When 觸發, Then 允許開啟其所屬循環（主管對循環管理為全公司唯讀，雙入口一致、無 403 落差；OQ-E08-03 定案）。
- Given 預覽頁渲染完成, When 呈現, Then 整頁對角平鋪疊加浮水印，格式與欄位順序比照 [NFR-007](../nfr.md#watermark) 權威格式，固定機密聲明另起一行；浮水印由伺服器端當下動態產生，不同次開啟時間戳記不同。
- Given 頂部循環切換器, When 選擇另一有權限可視之循環, Then 重繪該循環 DAG，頁面框架維持不變；切換器選單僅列出當前角色可視範圍內之循環（後端過濾）。
- Given 預覽頁載入完成, When 檢視畫布, Then 節點以上到下佈局、直角箭頭連線呈現父子關係，每節點顯示名稱與掛載程序書數，多 parent／多 child 正確呈現。
- Given 樹狀圖已渲染, When 點擊任一節點, Then 醒目標示該節點與其所有下游（後代）及其間連線、其餘淡化；再次點擊同節點或空白區則取消標示恢復預設。
- Given ICSOP 管理員於預覽頁, When 嘗試拖曳/新增/刪除節點或建立/刪除連線, Then 系統不提供任何編輯互動元件（純唯讀），僅支援檢視/縮放/點擊標示。
- Given 登入角色為部門窗口或一般使用者, When 嘗試開啟預覽（清單圖示或直接呼叫 API）, Then 清單不顯示圖示且 API 回 403（`PERMISSION_DENIED`）。
- Given 登入角色為主管, When 開啟任一循環之預覽（清單／第二入口／切換器／直接帶入循環 ID）, Then 允許開啟（全公司唯讀），切換器列出全部循環（主管由「本部門相關」放寬為全公司，OQ-E08-03 定案）。
- Given 任一具可視權限角色成功開啟預覽頁, When 頁面載入完成, Then 產生一筆 `LIFECYCLE_VIEW` 稽核（含操作人員/員工編號/部門/處室/循環 ID/循環名稱/時間戳記），內容與當次浮水印完全一致。
- Given 稽核寫入服務暫時異常, When 使用者開啟預覽, Then 使用者仍可正常檢視，失敗進補償佇列於服務恢復後重試補寫（不阻斷檢視）。
- Given 使用縮放控制項放大/縮小/重置, When 縮放, Then 節點相對位置正確且對角平鋪浮水印仍覆蓋整個可視區域。
- Given 具可視權限角色於預覽頁 toolbar 點「下載」或「列印」, When 動作完成, Then 取得伺服器端產生、浮水印已**燒錄於 PDF 內容層**之檔案（格式權威同 [NFR-007](../nfr.md#watermark)、機密聲明另起一行、比照 [F020](F020-watermark.md)），非僅前端疊加。
- Given 下載或列印各自完成, When 完成, Then 分別記一筆獨立稽核（`LIFECYCLE_DOWNLOAD`／`LIFECYCLE_PRINT`，不合併計數），內容與當次燒錄浮水印完全一致。
- Given 無可視權限角色（部門窗口／一般使用者）略過 UI 直接呼叫下載/列印 API, When 請求, Then 回 403（`PERMISSION_DENIED`），**不產生檔案、不燒錄浮水印、不記錄稽核**（操作即被拒，非稽核失敗情境）。
- Given 循環無任何節點, When 開啟預覽, Then 顯示空狀態提示而非錯誤。

## Error Scenarios
- **權限不足**：部門窗口／一般使用者（無循環管理權）開啟預覽或直接呼叫 API（含第二入口由文件清單觸發）→ 回 403 `PERMISSION_DENIED`；見 [error-handling.md#permission](../error-handling.md#permission)。（主管對循環管理為全公司唯讀，無「主管非本部門→403」情境。）
- **下載/列印未授權**：無可視權限角色略過 UI 直接呼叫下載/列印 API → 回 403 `PERMISSION_DENIED`，**不產生檔案、不燒錄浮水印、不記錄稽核**（操作即被拒，非稽核失敗情境）；見 [error-handling.md#permission](../error-handling.md#permission)。
- **稽核寫入失敗不阻斷（檢視）**：`LIFECYCLE_VIEW` 寫入暫時異常時不阻擋檢視，改進補償佇列重試補寫；不可竄改保證見 [error-handling.md#audit](../error-handling.md#audit)（比照 F023）。稽核不可修改/刪除（`AUDIT_IMMUTABLE`）。
- **未登入存取預覽網址**：拒絕並導回登入頁；見 [error-handling.md#public](../error-handling.md#public)。

## Related
- Data: [LIFECYCLE](../data-model.md#lifecycle-entity)、[LIFECYCLE_NODE](../data-model.md#node-entity)、[LIFECYCLE_EDGE](../data-model.md#edge-entity)（唯讀複用）、[ICSOP_DOCUMENT](../data-model.md#document-entity)（節點掛載文件數；第二入口之所屬循環來源）、[AUDIT_LOG](../data-model.md#auditlog-entity)（`LIFECYCLE_VIEW`／`LIFECYCLE_DOWNLOAD`／`LIFECYCLE_PRINT` 歸屬待架構師定案，見 OQ-E07-02）
- Depends on: [F007](F007-lifecycle-pool-crud.md)（循環資料/清單）、[F008](F008-dag-node-edge.md)（節點/邊模型與上到下佈局）、[F009](F009-node-drawer-maintenance.md)（節點名稱/掛載文件數）、[F017](F017-backend-document-list.md)（第二入口：文件清單樹狀圖圖示，帶入該文件所屬循環）、[F020](F020-watermark.md)（浮水印產生邏輯＋下載/列印燒錄手法）、[F023](F023-audit-logging.md)（調閱稽核機制）、[F025](F025-role-function-matrix.md)（「循環管理」唯讀可視範圍，不新增矩陣列）、[F001](F001-auth-login-session.md)、[F004](F004-org-sync.md)
- Related: [F024](F024-access-history-query.md)（三動作稽核是否納入調閱歷程查詢待定，見 OQ-E07-03）；編輯入口 [F008](F008-dag-node-edge.md)／[F009](F009-node-drawer-maintenance.md)；下載/列印燒錄手法參考 US-054（E06）
- Story: [US-025](../../stories/epics/E03-lifecycle-dag/US-025-lifecycle-tree-preview.md)
- NFR: [浮水印一致性](../nfr.md#watermark)（本頁含「檢視疊加」與「下載/列印燒錄」兩情境，正式擴充涵蓋見 OQ-NFR007c）
- OQ: OQ-E07-02（`LIFECYCLE_VIEW`/`LIFECYCLE_DOWNLOAD`/`LIFECYCLE_PRINT` 三動作稽核資料模型歸屬）、OQ-E07-03（是否併入 F024/US-061 查詢）、OQ-E03-07（切換器 `visibleOnly` API 契約＋第二入口 `?cycle` 值/反查）、OQ-E03-08（是否開放前台）、OQ-NFR007c（NFR-007 擴充涵蓋檢視疊加＋下載/列印燒錄兩情境）、OQ-E03-09（直角箭頭與 F008 畫布連線樣式一致性）
- 已定案（不再是未決）: **OQ-E08-03**（主管循環管理由「本部門相關」反向放寬為全公司唯讀，雙入口一致）、**OQ-E03-06**（主管本部門相關範圍已收斂，主管全公司可視、不需該定義）
