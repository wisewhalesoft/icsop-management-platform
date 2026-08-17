# F036: 循環樹狀圖預覽（唯讀＋浮水印）
Priority: P0-MVP | Status: 🟡 Implemented (unit-green; **CJK 燒錄字型已補**（@pdf-lib/fontkit + Noto Sans TC，樹圖 renderer + F020 burner 共用，見 implementation-log/F036-impl.md）; 第二入口＋真實 PDF/幾何/效能＝[integration]) | Last Updated: 2026-07-23
Epic/Story: E03 / US-025

> **2026-08-07 additive delta（🟢 APPROVED（2026-08-07 人類閘門通過））**：頁首標題、循環切換器選項與 `AUDIT_LOG.lifecycleName` 快照須含子分類；第二入口之查詢參數須由業務代碼收斂為 `lifecycleId`。規則權威＝[F040](F040-lifecycle-subcategory.md)；唯讀性、浮水印、權限與其餘既有條款皆不變。
> **🔵 2026-08-16 additive delta（使用者裁決；缺失／變更 delta 第 8 項）——節點雙擊顯示文件清單**：於樹狀圖節點新增 `dblclick` 互動，以**唯讀側抽屜**列出該節點所掛載之程序書清單。**本 delta 之 AC 編號採 `AC-D#`**（D＝2026-08-16 defect delta），與既有 `AC-S#` 批次區隔。
> ⚠ **既有「單擊＝標示下游」行為完全保留、不得變更**（AC-D6）；抽屜為 **[F009](F009-node-drawer-maintenance.md) 節點抽屜之唯讀孿生**，**不得復用其可寫版本**，且其資料來源端點之權限閘門**沿用 F036「循環管理」read（含 Supervisor 全公司唯讀）**，**不得誤用 [F009](F009-node-drawer-maintenance.md) 之 ICSOPAdmin 寫入閘門**（AC-D5）。
> 📌 **[F038](F038-lifecycle-tree-change-history.md) 之新舊樹狀圖 diff 預覽不支援雙擊**（OQ-D18-19 裁決＝否），見 [F038](F038-lifecycle-tree-change-history.md) `AC-D3`。

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
- **雙擊節點顯示文件清單（2026-08-16 使用者裁決）**：快速點擊兩下任一節點 → 自畫布右側滑出**唯讀側抽屜**，列出該節點所掛載之全部 ICSOP 程序書（欄位＝程序書編號／程序書書名／版次／狀態／公告日期）；點擊某列可另開後台唯讀詳情（`/admin/documents/:id`）。抽屜**不含任何寫入元件**（無新增／移除／改派／搜尋加入等按鈕）。單擊之標示下游行為於雙擊時**仍會先發生並保留**（AC-D6）。
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

### 循環子分類 delta（🟢 APPROVED 2026-08-07；規則權威＝[F040](F040-lifecycle-subcategory.md)）

- **AC-S1**：Given 開啟一個有子分類之循環的樹狀圖預覽頁, When 渲染頁首標題與頂部循環切換器之選項, Then 循環名稱一律為 `lifecycleDisplayName` 之輸出（如 `銷售及收款循環（消金）`）；切換器對同名不同子分類之循環呈現**兩個相異選項**，選項值為各自 `lifecycleId`（**非**名稱字串，亦非循環代碼——同名兩者代碼相同、無法區分），確保可分別開啟。
- **AC-S2**：Given 對一個有子分類之循環執行檢視／下載／列印, When 寫入 `AUDIT_LOG`, Then 其 `lifecycleName` 快照值為 `lifecycleDisplayName` 之輸出（含子分類），與當次浮水印及頁面標題所示之循環一致（[F040](F040-lifecycle-subcategory.md) AC-35）。
- **AC-S3**：Given 由 [F017](F017-backend-document-list.md) 文件清單之第二入口開啟某文件之樹狀圖, When 該文件所屬循環為「銷售及收款循環（消金）」而池中另有「銷售及收款循環（企金）」, Then 開啟之預覽為**該文件實際所屬之具體循環**（消金），不得誤開同名之另一子分類。<br>⚠ **對 OQ-E03-07 之收斂**：因同名不同子分類之**循環代碼相同**（皆為 `SRC`，見 [F040](F040-lifecycle-subcategory.md) AC-28），`?cycle=<業務代碼>` **已不足以唯一定位**；本入口之查詢參數必須攜帶 `lifecycleId`（UUID）。此為子分類需求之衍生必然，非新產品決策。

### 返回鈕依來源入口導向 delta（🔴 2026-08-17 使用者裁決；缺失修正第 4 項） {#back-target-delta}

- **AC-D3**（返回鈕之目標依來源入口；權威＝`prototypes/22-lifecycle-tree-preview.html` 之 `goBack()` **意圖**）：Given 由**第二入口**（[F017](F017-backend-document-list.md) ICSOP 文件管理清單之樹狀圖圖示）開啟預覽頁, When 點擊頁首返回鈕, Then 導向 `/admin/documents`（**文件清單**），且該鈕之 `aria-label`／`title` 逐字為 `返回文件清單`；Given 由**第一入口**（循環管理清單）開啟或直接以網址進入, Then 導向 `/admin/lifecycles`，其無障礙名稱維持既有之 `返回循環池`。<br>🔴 **來源以 `?from=` 明說，不得倚賴 `history.back()`／`document.referrer`**：兩個入口皆以 `window.open(url, '_blank', 'noopener,noreferrer')` 開**新分頁** ⇒ 新分頁 `history.length === 1`（無上一頁可回），且 `noreferrer` 連 `document.referrer` 一併清空——prototype 之瀏覽器語意在 SPA 新分頁下**兩個條件同時不成立**，照抄必然無效；本條保住的是其意圖（回到來源）。<br>🔒 **`from` 為白名單鍵、非可導覽之網址**：實作須以固定映射（`documents` → `/admin/documents`；其餘／未帶 → `/admin/lifecycles`）解析，未知值一律落預設。直接 `navigate(from)` 即為 open-redirect（`?from=//evil.example`），其回歸鎖為 `TS-F036-D3-003`。<br>⚠ **循環切換器須保留 `from`**：Given 帶 `?from=documents` 進入後以頂部切換器切換至另一循環, Then 網址仍帶 `?from=documents`、返回目標不變。漏帶時使用者只要切換過一次循環，返回鈕就悄悄改回循環池——正是本條要消滅的行為，只是晚一步發生（`TS-F036-D3-004`）。<br>📌 其餘頁面行為（浮水印、縮放、標示下游、下載／列印、可視範圍檢查）**一律不變**；`?from=` 不參與任何權限或資料判定，純為返回導向。

### 節點雙擊顯示文件清單 delta（🔵 2026-08-16 使用者裁決；缺失／變更 delta 第 8 項） {#node-dblclick-delta}

> 前提裁決：**OQ-D18-18**＝唯讀側抽屜、欄位 編號／書名／版次／狀態／公告日期、可另開後台唯讀詳情、單擊標示下游行為保留、**權限閘門沿用 F036「循環管理」read（含 Supervisor）**；**OQ-D18-19**＝[F038](F038-lifecycle-tree-change-history.md) diff 樹狀圖**不**支援雙擊。

- **AC-D1**（雙擊開啟唯讀側抽屜）：Given 具可視權限角色（SysAdmin／ICSOPAdmin／Supervisor）位於樹狀圖預覽頁, When 對任一節點快速點擊兩下（`dblclick`）, Then 自畫布**右側**滑出側抽屜（**非 modal**，不遮擋樹狀圖），其標題為該節點名稱；When 點擊抽屜之關閉鈕或按 `Escape`, Then 抽屜關閉、樹狀圖狀態不變。
- **AC-D2**（抽屜欄位）：Given 某節點掛載 3 份程序書, When 雙擊該節點, Then 抽屜列出恰 3 列，每列顯示欄位逐字為 `程序書編號`／`程序書書名`／`版次`／`狀態`／`公告日期` 五項；`程序書編號` 與 `版次` 以等寬字（`mono`）呈現；`狀態` 依 [F012](F012-document-status-toggle.md) 衍生規則顯示徽章（`已公告`／`進度中`／`失效`／`作廢`）。
- **AC-D3**（跳轉後台唯讀詳情）：Given 抽屜已列出程序書, When 點擊某一列, Then 開啟該文件之後台唯讀詳情（`/admin/documents/:id`）。
- **AC-D4**（🔒 純唯讀）：Given 抽屜已開啟, When 檢視其 DOM, Then **不存在任何寫入類互動元件**——無「新增文件」「移除掛載」「改派節點」「儲存」「刪除」等按鈕（逐字 `queryByText` 皆為 `null`），亦無任何 `<input>`／`<select>` 之可編輯欄位；既有 AC「不提供任何編輯互動元件（純唯讀）」之範圍**擴及本抽屜**。
- **AC-D5**（🔴 權限閘門）：Given 角色為 **Supervisor**（對「循環管理」為全公司唯讀）, When 雙擊節點並載入抽屜資料, Then **允許**（HTTP 2xx、清單正常回傳）；Given 角色為 DeptContact 或 User 直接呼叫該資料端點, When 請求, Then 回 **403 `PERMISSION_DENIED`**。<br>⚠ **不得沿用 [F009](F009-node-drawer-maintenance.md) 節點抽屜之權限閘門**——F009 為 ICSOPAdmin 寫入路徑，若誤用將使 Supervisor 於本頁遭 403，與本 feature「Supervisor 全公司唯讀」（OQ-E08-03 定案）矛盾。本抽屜之閘門＝功能鍵 `循環管理` **read**。
- **AC-D6**（🔒 單擊行為回歸鎖定）：Given 已對某節點雙擊並開啟抽屜, When 檢視畫布, Then 該節點與其**全部下游之醒目標示仍然存在**（單擊之既有行為於雙擊過程中先行觸發且**不被取消**）；Given 單擊任一節點（未雙擊）, Then 僅標示下游、**不開啟抽屜**；既有 AC「點擊任一節點 → 醒目標示該節點與其所有下游…再次點擊同節點或空白區則取消標示恢復預設」維持綠燈且期望值未經修改。
- **AC-D7**（節點無掛載文件）：Given 某節點之掛載程序書數為 0, When 雙擊該節點, Then 抽屜仍開啟並顯示空狀態提示（**非錯誤、非空白區塊**）。
- **AC-D8**（不新增稽核事件）：Given 雙擊節點開啟抽屜, When 檢視稽核, Then **不新增任何 `AUDIT_LOG` 紀錄**——本互動屬同一次 `LIFECYCLE_VIEW` 之頁內操作，不另記事件（比照既有「切換循環才另記一筆」之邊界；本 delta **不觸及稽核子系統**，[F023](F023-audit-logging.md)／[F024](F024-access-history-query.md) 不需 delta）。

- **AC-D9**（🔴 抽屜之逐字文案與選擇器契約；**2026-08-16 補訂**，權威＝`prototypes/22-lifecycle-tree-preview.html`）：Given 樹狀圖預覽頁與其節點文件抽屜, When 檢視, Then 下列**逐字成立**——
  | 項目 | 逐字值 |
  |---|---|
  | 抽屜容器 | DOM id `nodeDocDrawer`；`aria-label` ＝ `節點掛載之程序書清單（唯讀）`；關閉時 `aria-hidden="true"`、開啟時 `"false"` |
  | 抽屜標題／筆數／內容 | DOM id 分別為 `ndTitle`（＝節點名稱）／`ndCount`／`ndBody` |
  | 抽屜筆數文字 | `掛載 {N} 份程序書`（`{N}` 為該節點掛載數，`掛載` 與數字間一個半形空格、數字與 `份` 間一個半形空格） |
  | 抽屜之唯讀徽章 | 可見文字逐字 `唯讀` |
  | 抽屜之程序書列 | 每列帶 `data-node-doc-row` 屬性，且為 `<button type="button">`（可鍵盤聚焦） |
  | 抽屜空狀態（`AC-D7`） | 帶 `data-node-doc-empty` 屬性之區塊，其可見文字逐字為 `此節點尚未掛載任何程序書` |
  | 節點徽章文字 | 掛載數 > 0 → `掛載 {N} 份程序書`；掛載數 ＝ 0 → 逐字 `尚未掛載程序書` |
  | 工具列提示句 | 含逐字片段 `雙擊節點＝檢視該節點掛載之程序書清單`（與既有 `點節點＝醒目標示其所有下游節點；點空白處取消；` 並列於同一行，既有片段一字不改） |

  📌 **本條之存在理由**：`AC-D1`～`AC-D8` 規範了互動、欄位與權限，但**未定義任何逐字文案或選擇器**。本輪約束環為簡化版（僅 jest/vitest、無 fidelity 測試）⇒ 未入 AC 之掛鉤，test-generator 只能自行臆造。

  - 🔴 **節點徽章與抽屜筆數之關係（2026-08-16 就地改寫；理由：原條文在架構上不成立）**：兩者**共用同一格式化函式**——存在單一具名純函式（形如 `formatMountedCount(n: number): string`），其對 `n > 0` 回 `掛載 ${n} 份程序書`、對 `n === 0` 回 `尚未掛載程序書`；**節點徽章與抽屜筆數列皆呼叫該函式，專案中不存在第二份組字邏輯**（斷言：以同一 `n` 分別驅動兩處，其文字逐字相同；且 `n = 0`／`n = 1`／`n = 12` 三值下皆成立）。
    - 📝 **被改寫之原條文**：「**兩者與抽屜筆數同一資料來源，不得各存一份**」。**該要求在架構上不可能滿足**——`architecture-spec.md` §10.5 採 **lazy 載入**：節點徽章之數字來自**樹狀圖預覽回應**之 `docCount`、抽屜筆數來自**雙擊時才呼叫**之 `GET /admin/lifecycles/:lifecycleId/nodes/:nodeId/documents` 所回陣列之長度 ⇒ **兩個資料來源為 lazy 設計之必然結果**，非疏漏。改採 eager（預覽時一併回傳全部節點之文件清單）會把 tree-preview 回應由「結構資料」放大為「近乎全文件清單」，而該回應落在 [NFR-001](../nfr.md#performance)「DAG 畫布載入/互動 < 500ms」之關鍵路徑上——**不改採 eager**。
    - ✅ **本條改為約束「格式一致」而非「同源」**：原條文真正要防的是「兩處各寫一份組字邏輯 → 文案漂移且無測試會抓到」，共用格式化函式即足以達成；**資料來源之數量不在本條約束範圍**。
    - 📌 **兩來源不一致時之處置（本條明確裁定）**：抽屜開啟後，**以抽屜實際回傳之筆數為準重繪該節點徽章**（斷言：Given 徽章顯示 `掛載 3 份程序書` 而抽屜端點回傳 2 筆, When 抽屜載入完成, Then 該節點徽章文字變為 `掛載 2 份程序書`）。**不另跳錯誤、不提示使用者**——不一致之成因為兩次請求之間的正常資料異動（他人同時掛載/解除），屬預期並發，非錯誤。徽章之更新僅限**當次已開啟之節點**，不觸發其餘節點之重取。
## Error Scenarios
- **權限不足**：部門窗口／一般使用者（無循環管理權）開啟預覽或直接呼叫 API（含第二入口由文件清單觸發）→ 回 403 `PERMISSION_DENIED`；見 [error-handling.md#permission](../error-handling.md#permission)。（主管對循環管理為全公司唯讀，無「主管非本部門→403」情境。）
- **節點文件清單載入失敗**（2026-08-16）：抽屜顯示錯誤提示但**不關閉、不影響樹狀圖既有渲染與標示狀態**；不寫稽核。
- **下載/列印未授權**：無可視權限角色略過 UI 直接呼叫下載/列印 API → 回 403 `PERMISSION_DENIED`，**不產生檔案、不燒錄浮水印、不記錄稽核**（操作即被拒，非稽核失敗情境）；見 [error-handling.md#permission](../error-handling.md#permission)。
- **稽核寫入失敗不阻斷（檢視）**：`LIFECYCLE_VIEW` 寫入暫時異常時不阻擋檢視，改進補償佇列重試補寫；不可竄改保證見 [error-handling.md#audit](../error-handling.md#audit)（比照 F023）。稽核不可修改/刪除（`AUDIT_IMMUTABLE`）。
- **未登入存取預覽網址**：拒絕並導回登入頁；見 [error-handling.md#public](../error-handling.md#public)。

## Related
- **循環子分類規則權威**: [F040](F040-lifecycle-subcategory.md)（標題／切換器顯示、稽核名稱快照、`?cycle` 收斂為 `lifecycleId`）
- Data: [LIFECYCLE](../data-model.md#lifecycle-entity)、[LIFECYCLE_NODE](../data-model.md#node-entity)、[LIFECYCLE_EDGE](../data-model.md#edge-entity)（唯讀複用）、[ICSOP_DOCUMENT](../data-model.md#document-entity)（節點掛載文件數；第二入口之所屬循環來源）、[AUDIT_LOG](../data-model.md#auditlog-entity)（`LIFECYCLE_VIEW`／`LIFECYCLE_DOWNLOAD`／`LIFECYCLE_PRINT` 歸屬待架構師定案，見 OQ-E07-02）
- Depends on: [F007](F007-lifecycle-pool-crud.md)（循環資料/清單）、[F008](F008-dag-node-edge.md)（節點/邊模型與上到下佈局）、[F009](F009-node-drawer-maintenance.md)（節點名稱/掛載文件數）、[F017](F017-backend-document-list.md)（第二入口：文件清單樹狀圖圖示，帶入該文件所屬循環）、[F020](F020-watermark.md)（浮水印產生邏輯＋下載/列印燒錄手法）、[F023](F023-audit-logging.md)（調閱稽核機制）、[F025](F025-role-function-matrix.md)（「循環管理」唯讀可視範圍，不新增矩陣列）、[F001](F001-auth-login-session.md)、[F004](F004-org-sync.md)
- Related: [F024](F024-access-history-query.md)（三動作稽核是否納入調閱歷程查詢待定，見 OQ-E07-03）；編輯入口 [F008](F008-dag-node-edge.md)／[F009](F009-node-drawer-maintenance.md)；下載/列印燒錄手法參考 US-054（E06）
- Story: [US-025](../../stories/epics/E03-lifecycle-dag/US-025-lifecycle-tree-preview.md)
- NFR: [浮水印一致性](../nfr.md#watermark)（本頁含「檢視疊加」與「下載/列印燒錄」兩情境，正式擴充涵蓋見 OQ-NFR007c）
- OQ: OQ-E07-02（`LIFECYCLE_VIEW`/`LIFECYCLE_DOWNLOAD`/`LIFECYCLE_PRINT` 三動作稽核資料模型歸屬）、OQ-E07-03（是否併入 F024/US-061 查詢）、OQ-E03-07（切換器 `visibleOnly` API 契約＋第二入口 `?cycle` 值/反查）、OQ-E03-08（是否開放前台）、OQ-NFR007c（NFR-007 擴充涵蓋檢視疊加＋下載/列印燒錄兩情境）、OQ-E03-09（直角箭頭與 F008 畫布連線樣式一致性）
- 已定案（不再是未決）: **OQ-E08-03**（主管循環管理由「本部門相關」反向放寬為全公司唯讀，雙入口一致）、**OQ-E03-06**（主管本部門相關範圍已收斂，主管全公司可視、不需該定義）
- **2026-08-16 使用者裁決**: OQ-D18-18（雙擊抽屜之呈現、欄位與權限閘門）、OQ-D18-19（[F038](F038-lifecycle-tree-change-history.md) 不支援雙擊）。見 [§節點雙擊顯示文件清單 delta](#node-dblclick-delta)。
- **待 ui-ux-designer（本 delta 新增）**：`prototypes/22-lifecycle-tree-preview.html` 之節點須加上 `dblclick` 與唯讀側抽屜版面（比照 [F009](F009-node-drawer-maintenance.md) 抽屜版型但**移除全部寫入元件**）。
- **待 system-architect（本 delta 新增）**：節點文件清單之資料來源端點（建議 `GET /admin/lifecycles/:lifecycleId/nodes/:nodeId/documents`，權限閘門＝功能鍵 `循環管理` read；是否改為預覽頁初次載入即一併回傳各節點文件清單以省一次往返，屬效能取捨）。
