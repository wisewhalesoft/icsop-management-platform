# F036: 循環樹狀圖預覽（唯讀＋浮水印）
Priority: P0-MVP | Status: 🟡 Implemented (unit-green; **CJK 燒錄字型已補**（@pdf-lib/fontkit + Noto Sans TC，樹圖 renderer + F020 burner 共用，見 implementation-log/F036-impl.md）; 第二入口＋真實 PDF/幾何/效能＝[integration]) | Last Updated: 2026-07-23
Epic/Story: E03 / US-025

> 🔴 **2026-09-02 delta（人類裁決）——Supervisor 自本 feature 之可視角色移除**：權威＝[F025](F025-role-function-matrix.md) 之「循環管理（DAG）」列，主管由「唯讀」改為「無」。本頁之閘門（`循環管理` **read**）一格未動，改變的是矩陣格值 ⇒ **預覽／下載／列印三端點、節點抽屜（`AC-D5`）與子樹文件清單對主管一律 403**，可視角色收斂為 **SysAdmin／ICSOPAdmin**。<br>⚠ **本檔下方多處條文仍寫著「Supervisor 全公司唯讀」（含 `AC-D5` 之核心警語）——那些是 `OQ-E08-03` 時期之定案，逐字保留供追溯，但自本 delta 起於角色集合上已被取代**；`AC-D5` 所保護的性質（**閘門是 `循環管理 read`，不得誤用 [F009](F009-node-drawer-maintenance.md) 之 ICSOPAdmin 寫入閘門**）**仍然完全成立且仍然重要**，只是它此刻放行的角色少了一個。<br>🔴 **建環注意（語料鑑別力）**：本輪之後 `循環管理 read` 與 `文件變更歷程 read` 之可通過角色集合**恰好相同**（皆 SysAdmin／ICSOPAdmin）⇒ 以角色作 F036/F038 對照之斷言**自本輪起零鑑別力**，須改以「兩端點掛的是不同 `functionKey`」之結構斷言承載（已於 `lifecycle-change-diff.controller.spec.ts` 就地改寫並留下逐字原文）。

> **2026-08-07 additive delta（🟢 APPROVED（2026-08-07 人類閘門通過））**：頁首標題、循環切換器選項與 `AUDIT_LOG.lifecycleName` 快照須含子分類；第二入口之查詢參數須由業務代碼收斂為 `lifecycleId`。規則權威＝[F040](F040-lifecycle-subcategory.md)；唯讀性、浮水印、權限與其餘既有條款皆不變。
> **🔵 2026-08-16 additive delta（使用者裁決；缺失／變更 delta 第 8 項）——節點雙擊顯示文件清單**：於樹狀圖節點新增 `dblclick` 互動，以**唯讀側抽屜**列出該節點所掛載之程序書清單。**本 delta 之 AC 編號採 `AC-D#`**（D＝2026-08-16 defect delta），與既有 `AC-S#` 批次區隔。
> ⚠ **既有「單擊＝標示下游」行為完全保留、不得變更**（AC-D6）；抽屜為 **[F009](F009-node-drawer-maintenance.md) 節點抽屜之唯讀孿生**，**不得復用其可寫版本**，且其資料來源端點之權限閘門**沿用 F036「循環管理」read（含 Supervisor 全公司唯讀）**，**不得誤用 [F009](F009-node-drawer-maintenance.md) 之 ICSOPAdmin 寫入閘門**（AC-D5）。
> 📌 **[F038](F038-lifecycle-tree-change-history.md) 之新舊樹狀圖 diff 預覽不支援雙擊**（OQ-D18-19 裁決＝否），見 [F038](F038-lifecycle-tree-change-history.md) `AC-D3`。
> **🔴 2026-08-21 CHANGE delta（使用者裁決；三項裁決第 2／3 項）——抽屜擴為子樹 ＋ 子樹 deep link**：雙擊抽屜由「本節點」擴為「**本節點 ＋ 其所有下游節點**」並依節點分組；抽屜 footer 新增導向鈕，導向 `/admin/documents?lifecycleId=..&nodeSubtreeId=..`（後端子樹篩選參數之權威＝[F017](F017-backend-document-list.md#subtree-filter-delta)）。**本 delta 之 AC 編號採 `AC-T#`**（`AC-T10`～`AC-T27`），權威見 [§抽屜擴為子樹 ＋ 子樹 deep link delta](#subtree-drawer-delta)。
> **🔴 2026-08-27 UX delta（使用者裁決；三項之第 ②③ 項）**：② 樹狀圖預覽之**浮水印疊加層須滿版**（畫板比螢幕寬時不得只覆蓋中央一條斜帶）；③ 下載／列印之**直排節點換欄方向改為往 x 軸正向（往右）**。**AC 編號沿用 `AC-T#` 接續 `AC-T49` 往下編**（`AC-T50`／`AC-T51`），權威見 [§2026-08-27 UX delta](#ux-20260827-delta)。①（全域浮水印色值／字級）之權威在 [F020](F020-watermark.md#d9-watermark-delta) `AC-N1`／`AC-N2`／`AC-T2`／`AC-T4`。
> 🔴 **本 delta 就地修訂了 `AC-D9`／`AC-D4`／`AC-D7`／`AC-D3b`／`AC-D3c` 五處既有條文**（副標題語意、格式化函式不再共用、徽章重繪之比對對象、`aria-label`、工具列提示句、唯讀之唯一例外、空狀態觸發條件、opener 述詞收斂）——**皆為修訂而非回歸**，舊字面已於各條以 `OLD>` 標記保留，**不得再用於斷言**。

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

### 預覽分頁之離開語意與分頁不增生 delta（🔴 2026-08-17 使用者裁決；缺失修正第 4 項） {#back-target-delta}

> **本節經兩輪裁決。** 第一版（僅「返回鈕依 `?from=` 導覽」）由使用者當場指出仍然不對：在 `window.open` 開出的分頁內導覽回清單，會留下**與來源一模一樣的第二個清單分頁**，且每看一次樹狀圖就多一個。定案語意改為**關閉分頁**＋**具名分頁重用**，逐條如下。

- **AC-D3a**（🔴 **預覽分頁不得增生**）：Given 使用者自任一入口連續開啟 **N 個不同循環**之樹狀圖預覽, When 第 2..N 次觸發, Then **一律取代同一個預覽分頁**（`window.open` 之第二引數為固定視窗名稱 `icsopTreePreview`），瀏覽器分頁總數恆為 **2**（來源清單 ＋ 預覽），**不隨 N 增加**。<br>🔴 **`noopener`／`noreferrer` 一律不得出現於該 `window.open`**（2026-08-17 真實 Chrome 實測）：帶了之後具名 target **完全失效**——連開三次得到三個各自獨立的分頁，因為 HTML 規格於 `noopener` 為真時直接把 target 視為 `_blank`。兩者於此亦**無安全效益**（目標為本站同源之自家頁面；`noopener` 防的是不受信任之目標頁經 `window.opener` 反向操作來源頁），且保留 opener 是 `AC-D3b`／`AC-D3c` 的前提。其回歸鎖為「`window.open` 恰兩個引數」之逐字斷言。
- **AC-D3b**（離開語意＝**關閉本分頁**；🔴 **2026-08-21 就地修訂——述詞收斂、字面不變**）：Given 預覽頁**係由清單以 `window.open` 開出且該來源分頁仍可用**（**`openedAsPopup()` 回 `true`**，見 `AC-T19`；📝 OLD> `window.opener` 為真）, When 點擊頁首該鈕, Then 呼叫 `window.close()` 關閉本分頁、**不在本分頁內導覽**；該鈕之 `aria-label`／`title` 逐字為 `關閉預覽`，圖示為 `x`。<br>🔴 **為何不是導覽**：來源清單分頁仍在背後開著，於本分頁導覽回清單會產生**兩個內容一模一樣的清單分頁**；關閉則直接露出原本那個，其**篩選／排序／頁碼原封不動**——後台清單這些狀態存於 component state，導覽離開即全部重置（13 項篩選，代價顯著）。<br>📌 `window.close()` 已於真實 Chrome 實測：即使使用者在本頁切換過多次循環（`history.length > 1`）仍可成功關閉。
- **AC-D3c**（**fallback**：無可用來源分頁或關閉被拒；🔴 **2026-08-21 就地修訂——述詞收斂、三個標籤字面一格不動**）：Given **`openedAsPopup()` 回 `false`**（三種情形：① 直接貼網址／書籤進入 ⇒ `window.opener` 為 `null`；② 來源分頁已被關掉 ⇒ `opener.closed === true`；③ 跨源／被瀏覽器切斷 ⇒ 存取即擲例外。見 `AC-T19`；📝 OLD> `window.opener` 為假——**只看屬性存在與否，情形 ②③ 會被誤判為 popup**）, When 點擊該鈕, Then 改為**導覽**至 `?from=` 所指之來源——`documents` → `/admin/documents`（無障礙名稱 `返回文件清單`）、其餘／未帶 → `/admin/lifecycles`（`返回循環池`），圖示為 `arrow-left`。Given 為 popup 但 `window.close()` 遭瀏覽器拒絕, Then 逾時後退回同一導覽目標（使用者不得「按了沒反應」）。<br>🔴 **判定須經 `openedAsPopup()`（🔴 2026-08-21 就地修訂；📝 OLD> 以 `window.opener` 之真值（truthy）為之）、且僅於掛載時取樣一次**：① 真實瀏覽器直連進入時為 `null`，但 jsdom 為 `undefined`，寫 `!== null` 會恆真（實測導致四個「直連」案同時紅）；② 來源分頁被關閉時 `window.opener` 會變 `null`，若每次 render 重算，按鈕會在使用者眼前從「關閉預覽」變成「返回」。<br>📌 **上列兩點於 2026-08-21 後仍完全成立**：① 之 truthy 要求已內含於 `openedAsPopup()` 之實作（`!!(window.opener && !window.opener.closed)`，故 jsdom 之 `undefined` 同樣回 `false`）；② 之「僅掛載時取樣一次」**逐字不變**——收斂的是**判定內容**，不是取樣時機。<br>🔴 **行為差異僅出現在舊寫法本來就會出錯的邊界**：opener 曾存在但已被使用者關掉時，舊寫法顯示「關閉預覽」且 `close()` 被瀏覽器拒絕；新寫法顯示正確之返回標籤並直接導覽。**三個標籤（`關閉預覽`／`返回文件清單`／`返回循環池`）與圖示切換規則逐字不動 ⇒ 這是修訂、不是回歸。**<br>🔒 **`from` 為白名單鍵、非可導覽之網址**：須以固定映射解析，未知值一律落預設。直接 `navigate(from)` 即為 open-redirect（`?from=//evil.example`），其回歸鎖為 `TS-F036-D3-003`。
- **AC-D3d**（循環切換器須保留 `from`）：Given 帶 `?from=documents` 進入後以頂部切換器切換至另一循環, Then 網址仍帶 `?from=documents`、fallback 目標不變。漏帶時使用者只要切換過一次循環，退路就悄悄改回循環池（`TS-F036-D3-004`）。
- 📌 其餘頁面行為（浮水印、縮放、標示下游、下載／列印、可視範圍檢查）**一律不變**；`?from=` 不參與任何權限或資料判定，純為 fallback 導向。
- ⚠ **`prototypes/22` 之原 `goBack()`（`document.referrer` → `history.back()`）已被推翻**：`window.open` 開出的分頁 `history.length === 1`（無上一頁可回）。三份 prototype（10／13／22）已同步至本節語意。

### 節點雙擊顯示文件清單 delta（🔵 2026-08-16 使用者裁決；缺失／變更 delta 第 8 項） {#node-dblclick-delta}

> 前提裁決：**OQ-D18-18**＝唯讀側抽屜、欄位 編號／書名／版次／狀態／公告日期、可另開後台唯讀詳情、單擊標示下游行為保留、**權限閘門沿用 F036「循環管理」read（含 Supervisor）**；**OQ-D18-19**＝[F038](F038-lifecycle-tree-change-history.md) diff 樹狀圖**不**支援雙擊。

- **AC-D1**（雙擊開啟唯讀側抽屜）：Given 具可視權限角色（SysAdmin／ICSOPAdmin／Supervisor）位於樹狀圖預覽頁, When 對任一節點快速點擊兩下（`dblclick`）, Then 自畫布**右側**滑出側抽屜（**非 modal**，不遮擋樹狀圖），其標題為該節點名稱；When 點擊抽屜之關閉鈕或按 `Escape`, Then 抽屜關閉、樹狀圖狀態不變。
- **AC-D2**（抽屜欄位）：Given 某節點掛載 3 份程序書, When 雙擊該節點, Then 抽屜列出恰 3 列，每列顯示欄位逐字為 `程序書編號`／`程序書書名`／`版次`／`狀態`／`公告日期` 五項；`程序書編號` 與 `版次` 以等寬字（`mono`）呈現；`狀態` 依 [F012](F012-document-status-toggle.md) 衍生規則顯示徽章（`已公告`／`進度中`／`失效`／`作廢`）。
- **AC-D3**（跳轉後台唯讀詳情）：Given 抽屜已列出程序書, When 點擊某一列, Then 開啟該文件之後台唯讀詳情（`/admin/documents/:id`）。
- **AC-D4**（🔒 純唯讀；🔴 **2026-08-21 就地加註唯一例外**）：Given 抽屜已開啟, When 檢視其 DOM, Then **不存在任何寫入類互動元件**——無「新增文件」「移除掛載」「改派節點」「儲存」「刪除」等按鈕（逐字 `queryByText` 皆為 `null`），亦無任何 `<input>`／`<select>` 之可編輯欄位；既有 AC「不提供任何編輯互動元件（純唯讀）」之範圍**擴及本抽屜**。
  <br>🔴 **唯一例外＝footer 之 `[data-subtree-jump]` 導向鈕**（2026-08-21 裁決 3，見 `AC-T17`）：它是**導覽**不是寫入——不改任何資料、不寫稽核、不呼叫任何 mutation 端點。**除該一顆按鈕與既有之關閉鈕、程序書列（`[data-node-doc-row]`，本即為導覽用 `<button>`）外，抽屜內不得再出現任何按鈕**。
  <br>📌 **可斷言形狀（避免「例外」被無限擴張）**：抽屜內 `<input>`／`<select>`／`<textarea>` 計數 **恆為 `0`**（本條原有之斷言，逐字不變）；且抽屜內 `<button>` 之集合恰為 `{關閉鈕} ∪ {[data-node-doc-row] × N} ∪ ({[data-subtree-jump]} 若子樹合計 > 0)`——**不得出現不屬於此三類之任何 `<button>`**。
  <br>⚠ **分組標題列亦受本條約束**：`[data-node-group-title]` 必須是純顯示 `<div>`，**不得**為 `<button>`／`<details>`／`<summary>`（不可展開折疊）；其 chevron 圖示須標 `aria-hidden="true"`，不得暗示可互動（`AC-T16`）。
- **AC-D5**（🔴 權限閘門）：Given 角色為 **Supervisor**（對「循環管理」為全公司唯讀）, When 雙擊節點並載入抽屜資料, Then **允許**（HTTP 2xx、清單正常回傳）；Given 角色為 DeptContact 或 User 直接呼叫該資料端點, When 請求, Then 回 **403 `PERMISSION_DENIED`**。<br>⚠ **不得沿用 [F009](F009-node-drawer-maintenance.md) 節點抽屜之權限閘門**——F009 為 ICSOPAdmin 寫入路徑，若誤用將使 Supervisor 於本頁遭 403，與本 feature「Supervisor 全公司唯讀」（OQ-E08-03 定案）矛盾。本抽屜之閘門＝功能鍵 `循環管理` **read**。
- **AC-D6**（🔒 單擊行為回歸鎖定）：Given 已對某節點雙擊並開啟抽屜, When 檢視畫布, Then 該節點與其**全部下游之醒目標示仍然存在**（單擊之既有行為於雙擊過程中先行觸發且**不被取消**）；Given 單擊任一節點（未雙擊）, Then 僅標示下游、**不開啟抽屜**；既有 AC「點擊任一節點 → 醒目標示該節點與其所有下游…再次點擊同節點或空白區則取消標示恢復預設」維持綠燈且期望值未經修改。
- **AC-D7**（🔴 **2026-08-21 就地修訂：觸發條件由「本節點 0 份」改為「整個子樹 0 份」**）：Given 某節點**與其全部下游節點**之掛載程序書數合計為 `0`, When 雙擊該節點, Then 抽屜仍開啟並顯示空狀態提示（**非錯誤、非空白區塊**），其可見文字逐字為 `此節點與其下游節點皆未掛載程序書`，且 `[data-node-group]` 之數量為 `0`、`[data-subtree-jump]` **不存在於 DOM**（`AC-T18`）。
  <br>📝 **OLD>「Given 某節點之掛載程序書數為 0, When 雙擊該節點, Then 抽屜仍開啟並顯示空狀態提示」＋逐字文案 `此節點尚未掛載任何程序書`**。
  <br>🔴 **這不是把舊條文放寬，而是把它縮緊**：改版後「本節點 0 份、但下游有 3 份」**不再**觸發空狀態（抽屜會列出下游那 3 份，且**不產生本節點之分組**，`AC-T12`）。此為最容易被沿用舊測試漏掉之處，請務必以「本節點 0 份 ＋ 下游 > 0 份」單獨建一個案例。
- **AC-D8**（不新增稽核事件）：Given 雙擊節點開啟抽屜, When 檢視稽核, Then **不新增任何 `AUDIT_LOG` 紀錄**——本互動屬同一次 `LIFECYCLE_VIEW` 之頁內操作，不另記事件（比照既有「切換循環才另記一筆」之邊界；本 delta **不觸及稽核子系統**，[F023](F023-audit-logging.md)／[F024](F024-access-history-query.md) 不需 delta）。

- **AC-D9**（🔴 抽屜之逐字文案與選擇器契約；**2026-08-16 補訂**，權威＝`prototypes/22-lifecycle-tree-preview.html`）：Given 樹狀圖預覽頁與其節點文件抽屜, When 檢視, Then 下列**逐字成立**——
  | 項目 | 逐字值 |
  |---|---|
  | 抽屜容器 | DOM id `nodeDocDrawer`；`aria-label` ＝ `節點與其下游節點之程序書清單（唯讀）`（🔴 **2026-08-21 就地修訂**，`AC-T15`；📝 OLD> `節點掛載之程序書清單（唯讀）`）；關閉時 `aria-hidden="true"`、開啟時 `"false"` |
  | 抽屜標題／筆數／內容 | DOM id 分別為 `ndTitle`（＝節點名稱）／`ndCount`／`ndBody` |
  | 抽屜筆數文字（＝副標題） | `子樹共 {N} 份程序書`（🔴 **2026-08-21 就地修訂**，`AC-T15`；`{N}` 改為**去重後之子樹文件總數**、含 `0`，`子樹共` 與數字間一個半形空格、數字與 `份` 間一個半形空格；並帶 `data-subtree-total="{N}"`，見 `AC-T16`）<br>📝 OLD> `掛載 {N} 份程序書`（`{N}` 為該節點掛載數）——**此字面自 2026-08-21 起只屬於節點徽章**，見本表「節點徽章文字」列 |
  | 抽屜之唯讀徽章 | 可見文字逐字 `唯讀` |
  | 抽屜之程序書列 | 每列帶 `data-node-doc-row` 屬性，且為 `<button type="button">`（可鍵盤聚焦） |
  | 抽屜空狀態（`AC-D7`） | 帶 `data-node-doc-empty` 屬性之區塊，其可見文字逐字為 `此節點與其下游節點皆未掛載程序書`（🔴 **2026-08-21 就地修訂**，`AC-T15`；**觸發條件亦已改為「整個子樹 0 份」**，見下方 `AC-D7` 之就地修訂）<br>📝 OLD> `此節點尚未掛載任何程序書` |
  | 節點徽章文字 | 🔒 **逐字不動**（2026-08-21 一格未改）：掛載數 > 0 → `掛載 {N} 份程序書`；掛載數 ＝ 0 → 逐字 `尚未掛載程序書`。⚠ 此處之 `{N}` 恆為**本節點掛載數**，**與抽屜副標題之子樹合計非同一語意** |
  | 抽屜副標題與節點徽章之關係 | 🔴 **2026-08-21 就地修訂**：兩者**語意已分家、不再共用格式化函式**，見本條下方 🔴 段落 |
  | 工具列提示句 | 含逐字片段 `雙擊節點＝檢視該節點與其下游節點之程序書清單`（🔴 **2026-08-21 就地修訂**，`AC-T15`；📝 OLD> `雙擊節點＝檢視該節點掛載之程序書清單`）。與既有 `點節點＝醒目標示其所有下游節點；點空白處取消；` 並列於同一行，**既有片段一字不改** |
  | 節點 `title` 屬性 | 逐字 `單擊＝標示所有下游節點；雙擊＝檢視此節點與其下游節點之程序書清單`（🔴 **2026-08-21 新增**，`AC-T15`） |

  📌 **本條之存在理由**：`AC-D1`～`AC-D8` 規範了互動、欄位與權限，但**未定義任何逐字文案或選擇器**。本輪約束環為簡化版（僅 jest/vitest、無 fidelity 測試）⇒ 未入 AC 之掛鉤，test-generator 只能自行臆造。

  - 🔴 **節點徽章與抽屜筆數之關係（🔴 **2026-08-21 第二次就地改寫**；理由：裁決 2 使兩者語意分家）**：兩者**不再共用格式化函式**——節點徽章量的是**本節點掛載數**、抽屜副標題量的是**整個子樹之去重合計**，強行共用會使其中一方之文案必然錯誤。現行要求為**兩個各自具名之純函式**，且**各自恰一份**：<br>① `formatMountedCount(n: number): string` — `n > 0` 回 `掛載 ${n} 份程序書`、`n === 0` 回 `尚未掛載程序書`；**唯一消費者＝節點徽章**（🔒 兩個字面逐字不動）。<br>② `formatSubtreeCount(n: number): string` — 回 `子樹共 ${n} 份程序書`（**含 `n === 0`，無第二種字面**）；**唯一消費者＝抽屜副標題 `#ndCount`**。<br>**斷言**：`n = 0`／`n = 1`／`n = 12` 三值下，① 與 ② 之輸出**逐字互不相同**（防止「順手統一」把兩者又併回一個函式）；且專案中不存在第三份組字邏輯（兩處 DOM 文字分別等於對應函式之輸出）。
    - 📝 **被改寫之原條文（2026-08-16 版，逐字保留供追溯）**：「兩者**共用同一格式化函式**——存在單一具名純函式（形如 `formatMountedCount(n: number): string`），其對 `n > 0` 回 `掛載 ${n} 份程序書`、對 `n === 0` 回 `尚未掛載程序書`；**節點徽章與抽屜筆數列皆呼叫該函式，專案中不存在第二份組字邏輯**（斷言：以同一 `n` 分別驅動兩處，其文字逐字相同；且 `n = 0`／`n = 1`／`n = 12` 三值下皆成立）。」<br>⚠ **推翻理由不是「原條文寫錯」**——2026-08-16 當時兩處確實量同一個數，共用是對的。是 2026-08-21 裁決 2 把副標題改為子樹合計，**共用才變成缺陷**：同一函式無法同時對「本節點 2 份、子樹 8 份」給出兩個正確字串。
    - 📝 **被改寫之原條文**：「**兩者與抽屜筆數同一資料來源，不得各存一份**」。**該要求在架構上不可能滿足**——`architecture-spec.md` §10.5 採 **lazy 載入**：節點徽章之數字來自**樹狀圖預覽回應**之 `docCount`、抽屜筆數來自**雙擊時才呼叫**之節點文件端點所回之筆數 ⇒ **兩個資料來源為 lazy 設計之必然結果**，非疏漏。<br>🔴 **2026-08-21 就地更正端點名**（`architecture-spec.md` §12.2 決策 C2）：該 lazy 端點自本日起為 **`GET /admin/lifecycles/:lifecycleId/nodes/:nodeId/subtree-documents`**（📝 OLD> `.../documents`），而與節點徽章比對之數字為**該回應中本節點那一組之 `documents.length`**（＝ `[data-node-group-self="true"]` 之 `data-node-group-count`），**不是** `totalCount`。**「兩個資料來源、lazy 設計、不改採 eager」之論述完全不變**——換的只是端點與比對對象。改採 eager（預覽時一併回傳全部節點之文件清單）會把 tree-preview 回應由「結構資料」放大為「近乎全文件清單」，而該回應落在 [NFR-001](../nfr.md#performance)「DAG 畫布載入/互動 < 500ms」之關鍵路徑上——**不改採 eager**。
    - ✅ **本條改為約束「格式一致」而非「同源」**：原條文真正要防的是「兩處各寫一份組字邏輯 → 文案漂移且無測試會抓到」，共用格式化函式即足以達成；**資料來源之數量不在本條約束範圍**。
    - 📌 **兩來源不一致時之處置（🔴 **2026-08-21 就地修訂：比對對象改變**）**：抽屜開啟後，以**本節點那一組之份數**為準重繪該節點徽章——即 `[data-node-group-self="true"]` 之 `data-node-group-count`（該組不存在時視為 `0`），**不是**抽屜副標題之子樹合計。<br>📝 **OLD>「以抽屜實際回傳之筆數為準」**——2026-08-21 前抽屜筆數＝本節點掛載數，兩者同義；改為子樹合計後若沿用原文，`a1` 之徽章會被子樹合計 `8` 覆寫成 `掛載 8 份程序書`（實際只掛 2 份）＝**用一個更錯的數覆蓋原本正確的數**。<br>**斷言**：Given 節點徽章顯示 `掛載 3 份程序書`、抽屜之 `[data-node-group-self="true"]` 之 `data-node-group-count` 為 `2` 而子樹合計為 `8`, When 抽屜載入完成, Then 該節點徽章文字變為 `掛載 2 份程序書`（**不得**為 `掛載 8 份程序書`）。**不另跳錯誤、不提示使用者**——不一致之成因為兩次請求之間的正常資料異動（他人同時掛載/解除），屬預期並發，非錯誤。徽章之更新僅限**當次已開啟之節點**，不觸發其餘節點之重取。
### 抽屜擴為子樹 ＋ 子樹 deep link delta（🔴 2026-08-21 使用者裁決；三項裁決第 2／3 項） {#subtree-drawer-delta}

> **裁決逐字（人類，2026-08-21）**
> **裁決 2**：節點雙擊抽屜改帶**整個子樹**——本節點 ＋ 其所有下游節點，**依節點分組**；本節點恆第一組並標 `（本節點）`；掛載 0 份之節點不產生分組；副標題為子樹合計。
> **裁決 3**：抽屜新增導向鈕，導向 `/admin/documents?lifecycleId=..&nodeSubtreeId=..`，**後端新增子樹篩選參數**（後端側權威＝[F017](F017-backend-document-list.md#subtree-filter-delta)）。
> **裁決 3 第二輪（導向方式）**：有可用來源分頁 → 導 **opener 分頁** ＋ `opener.focus()` ＋ `window.close()` 自關；無可用來源分頁 → **同分頁 navigate 且不得呼叫 `window.close()`**；判定收斂為單一述詞 `openedAsPopup()`。
>
> **本 delta 之 AC 編號採 `AC-T#`**（T ＝ 2026-08-21 三項裁決；**跨三檔不重號**——`AC-T1`～`AC-T5` 屬 [F020](F020-watermark.md#line-height-delta)，`AC-T10`～`AC-T27` 屬本檔，`AC-T40`～`AC-T48` 屬 [F017](F017-backend-document-list.md#subtree-filter-delta)），與既有 `AC-S#`／`AC-D#`／`AC-N#`／`AC-U#`／`AC-P#` 批次區隔。
> **權威＝ `docs/ui-ux-design-overview.md` §A.7.2（逐字文案）／§A.7.3（選擇器契約）＋ `prototypes/22-lifecycle-tree-preview.html`**（已由 ui-ux-designer 傳播並經 lead 逐項驗收）。
> 🔴 **就地修訂之既有條文（勿當回歸）**：`AC-D9`（抽屜副標題字面／格式化函式不再共用／徽章重繪之比對對象／`aria-label`／工具列提示句）、`AC-D4`（純唯讀之唯一例外）、`AC-D7`（空狀態觸發條件與文案）、`AC-D3b`／`AC-D3c`（述詞收斂、字面不變）——**四處皆已於本檔上方就地改寫**。
> ⚠ **本輪之約束環為簡化版（僅 vitest／jest 單元＋元件測試，無 Playwright fidelity、無 e2e）**：以下每一條 AC 皆須能於 **jsdom** 斷死；凡只能在真瀏覽器量測者已明文標出（`AC-T23`）。
> 🔒 **本 delta 不觸及**：權限閘門（`AC-D5`）、稽核（`AC-D8`，開抽屜仍不記事件）、每列五欄與點列跳轉（`AC-D2`／`AC-D3`）、單擊標示下游（`AC-D6`）、浮水印（除行距，見 [F020 `AC-T2`](F020-watermark.md#line-height-delta)）、`?from=` 白名單、`AC-D3a` 之具名分頁不增生。

#### 子樹範圍與分組呈現（裁決 2）

- **AC-T10**（抽屜內容＝整個子樹，依節點分組）：Given 具可視權限角色雙擊節點 `r`, When 抽屜開啟, Then 抽屜列出 **`r` 及其所有下游節點**（沿 parent→child 方向可達之全部後代）**所掛載之全部程序書**，並以**節點為單位分組**呈現；每一分組為一個 `[data-node-group="{nodeId}"]` 區塊，其內之程序書列沿用既有 `[data-node-doc-row]`（每列五欄與點列跳轉 `/admin/documents/:id` **逐字不變**，`AC-D2`／`AC-D3`）。
  <br>📌 **資料來源＝ `AC-T25` ④ 之子樹端點**（單次請求、已分組已排序已去重）；抽屜自 2026-08-21 起**不再**呼叫單節點端點。
- **AC-T11**（🔴 分組順序，三層 tie-break、無隨機性）：Given 抽屜已開啟, When 依 DOM 順序讀取全部 `[data-node-group]`, Then ① **第一個分組恆為本節點**且其 `data-node-group-self="true"`；② **全抽屜恰有 0 或 1 個 `data-node-group-self="true"`**（0 之情形＝本節點掛載 0 份而下游有文件，見 `AC-T12`）；③ 其餘分組之順序為**畫布視覺順序**——`pos.y` 遞增（由上而下）→ 同值再 `pos.x` 遞增（由左而右）→ 仍相同者以**節點 id 字典序**打破平手。
  <br>🔴 **④ 排序之歸屬＝後端（2026-08-21 就地修訂；`architecture-spec.md` §12.2 決策 C2）**：①②③ 之順序**由後端計算並直接反映於回應之 `groups` 陣列順序**，排序鍵取自後端既有之 `buildTreeLayout()` 純函式所算出之 `{x, y}`。**前端不得再排一次**——DOM 之 `[data-node-group]` 順序**必須逐一等於回應 `groups` 之陣列順序**。
    <br>📝 **OLD>「排序鍵取自佈局座標（`lifecycle-tree-layout` 之 `pos`）」未指明歸屬**，在 C2 之前隱含由前端做；C2 定案後歸屬為後端。⚠ **`OQ-T3-03` 原文之「後端沒有座標」不成立**——`backend/src/lifecycle/lifecycle-tree-layout.ts` 早有 `buildTreeLayout()` 副本（現供 F036 唯讀預覽／F038 diff 之 PDF 匯出使用），重用為零額外成本。
  <br>📌 **可斷言形狀（兩層，缺一即為缺口）**：
    <br>**(a) 後端 unit**——給定一個下游含「同列兩節點（`y` 同、`x` 異）」與「`x`／`y` 皆相同之兩節點」之 fixture，斷言回應 `groups` 之 `nodeId` 陣列逐一等於期望陣列（三層 tie-break 皆被覆蓋）。
    <br>**(b) 前端元件（🔴 反漂移，防「前端偷排」）**——以一個**刻意不符座標排序**之 mock `groups` 陣列（例如把本節點放在陣列第 2 個、其餘故意亂序）驅動渲染，斷言 DOM 順序**照抄該陣列**。若前端自行排序，本斷言即紅。**只寫 (a) 不寫 (b) 時，前端偷排一次不會被任何東西攔截**（後端測試綠、前端測試若也用「已排好」的 mock 就同樣綠）。
  <br>⚠ **刻意不採 `descendants()` 之走訪順序**——那是 stack pop 序，與畫面無關且會隨邊之插入順序改變（`AC-T28` 亦明文不綁定走訪順序）。
  <br>📌 **不要求後端佈局與使用者當下畫布之像素位置逐一相符**：`buildTreeLayout()` 為確定性純函式，兩端各自對同一份 `nodes`／`edges` 呼叫必然同構；「抽屜排序與畫布視覺之像素級一致感」屬 UX 觀感層面，**本輪環（無 e2e）測不到亦不要求**（§12.4 #3，已登錄於 [OQ-T3-05](../open-questions.md#t3-2026-08-21)）。
- **AC-T12**（掛載 0 份之節點不產生分組）：Given 子樹含節點 `m` 而 `m` 掛載 0 份程序書, When 抽屜開啟, Then **DOM 中不存在 `[data-node-group="m"]`**；且此情形下 `[data-node-group]` 之數量**可小於**子樹節點數（例：子樹 5 節點、僅 1 個有文件 ⇒ 分組數為 `1`）。
  <br>🔴 **本條與 `AC-T14` 必須一起讀**：分組數 ≠ 子樹節點數是**預期**，故 `AC-T14` 之不變式**不得**寫成「分組集合 ＝ 醒目標示集合」（那會恆紅）。
  <br>🔴 **④ 過濾之歸屬＝後端（2026-08-21 就地修訂；C2）**：0 份之節點**由後端在建構 `groups` 時即不產生該組**；**前端不得自行過濾空組**——若後端誤回一個 `documents: []` 之組，前端應照常渲染而使該缺陷顯形（前端若順手過濾掉，後端的漏過濾就被畫面遮蔽、永遠沒人發現）。
    <br>📌 **可斷言形狀（兩層）**：**(a) 後端 unit**——子樹含 0 份節點之 fixture，斷言回應 `groups` 不含該 `nodeId`；**(b) 前端元件**——以含一個 `documents: []` 之 mock `groups` 驅動，斷言該空組**仍被渲染**（`[data-node-group="m"][data-node-group-count="0"]` 存在）。(b) 斷的是「前端沒有偷偷過濾」，不是產品行為——正常路徑下後端不會回空組。
- **AC-T13**（去重、組內排序與合計自洽）：Given 抽屜已開啟, When 檢視其內容, Then ① 去重鍵為 **`程序書編號`**（承載於 `[data-node-doc-row][data-doc-num="{程序書編號}"]`），**首次出現者勝**（依 `AC-T11` 之分組順序）；② 組內排序為 `程序書編號` **遞增**（`localeCompare`）；③ **`#ndCount` 之 `{N}` 恆等於全抽屜 `[data-node-doc-row]` 之數量**，亦等於各組 `data-node-group-count` 之總和。
  <br>🔴 **④ 去重與組內排序之歸屬＝後端（2026-08-21 就地修訂；C2）**：①② **皆由後端在建構 `groups` 時完成**——去重必須在**看得到全子樹**的聚合層執行，後端天然具備該視角；**前端不得再去重、再排序一次**（否則同一段邏輯兩份實作，與 `AC-T14` ① 同型的分家風險）。③ 之 `{N}` 前端取自回應之 `totalCount`，**不得自行 count 一次**。
    <br>📌 **可斷言形狀（兩層）**：**(a) 後端 unit**——以「同一 `documentNumber` 掛在子樹內兩個不同節點」之 fixture，斷言只出現於**分組順序中首次出現**的那一組、且 `totalCount === Σ groups[i].documents.length`；**(b) 前端元件**——以一個 `totalCount` 與實際列數**一致**之 mock 驅動，斷言 `#ndCount` 之 `{N}`、`data-subtree-total`、全抽屜 `[data-node-doc-row]` 數量、各組 `data-node-group-count` 之總和**四者相等**。
  <br>🔴 **③ 之防禦情境是真實成因，不是假設性顧慮（system-architect 查證）**：`ICSOP_DOCUMENT.documentNumber` 之唯一性**僅比對「有效＋作廢」兩狀態**（`OQ-E04-01b`），**「失效」文件之編號可被重新使用** ⇒ **同一 `documentNumber` 完全可能對應兩筆不同 `id` 之文件列**，分別掛載於子樹內不同節點。⇒ 「首次出現者勝」不是形式主義，它決定了副標題的 `N` 會不會與實際列數對不上（「說 8 份、數出 9 列」）。
    <br>⚠ **連帶提醒**：去重鍵為 `documentNumber` 而**非** `id` ⇒ 上述情形下**會有一筆文件不出現在抽屜裡**。這是本裁決明文選定之行為（`AC-T13` ①），非缺陷；若日後認為應改以 `id` 去重（兩筆都顯示），須新的裁決。
- **AC-T14**（🔴 **INV-SUBTREE ＝ 抽屜之子樹節點集合 ≡ 單擊醒目標示之集合**；本 delta 最關鍵之一條）：Given 對節點 `r` 雙擊, When 同時檢視畫布與抽屜, Then——
  1. **單一走訪（🔴 2026-08-21 就地修訂：範圍限縮為「單一執行環境內」）**：**同一執行環境內不得存在第二份子樹走訪**——前端之子樹語意只有 `descendants(edges, rootId): Set<string>` 一份（`frontend/src/pages/lifecycle-tree-layout.ts`，既有），後端亦只有一份（`backend/src/lifecycle/lifecycle-tree-layout.ts` 之同名匯出，`architecture-spec.md` §12.1 決策 C1），且後端那一份為 `AC-T25` 之子樹端點與 `AC-T40` 之清單篩選**兩個呼叫端共用**，不因兩個消費場景各寫一次。
    <br>📝 **OLD>「專案中不得存在第二份子樹走訪」**——逐字讀會與 C1（後端另留一份）及本專案之 `AC-T40`（明文要求後端具備同語意能力）矛盾。**跨執行環境兩份為本 repo 之既定架構，不是妥協**：monorepo 無共用 TS package，且已有兩個前例——`watermarkLines()`／`toDisplayLines()`（§10.14）與 **`buildTreeLayout()`（`backend/src/lifecycle/lifecycle-tree-layout.ts` 早已存在之後端副本）**。
    <br>🔴 **跨端一致性改由固定測試向量承擔，見 `AC-T28`**——「兩邊程式碼看起來一樣」不是保證（§10.14 之既有教訓）。
  2. **`S_hl`**（醒目標示集合）＝ 全部帶 `data-highlighted="true"` 之節點元素之 `data-node-id` 集合；**`S_hl === descendants(edges, r)`**（前端那一份）。
  3. **`S_grp ⊆ S_hl`（🔴 2026-08-21 就地修訂：改由元件測試層級保證）**：**`S_grp`**（分組集合）＝ 全部 `[data-node-group]` 之屬性值集合；**`S_grp ⊆ S_hl`**，且 **`S_grp === { n ∈ S_hl : n 之分組文件數 > 0 }`**。
    <br>📌 **斷言形狀（C2 之後必須這樣寫）**：測試自建一組 `edges` 與根節點 `r`，(a) 直接呼叫**前端** `descendants(edges, r)` 得 `S_hl`；(b) 以**同一語意**構造 mock 之後端 `subtree-documents` 回應（其 `groups` 之 `nodeId` 取自 `S_hl` 中掛載數 > 0 者）；(c) 渲染元件後斷言 DOM 之 `S_grp` 與 `S_hl` 之上述兩個關係成立。
    <br>🔴 **為何 C2 之後這仍是有效的不變式，而非變成「測試在自證」**：C2 把抽屜分組移到後端後，前端 `descendants()` 之呼叫端**只剩醒目標示一處**——`S_grp` 與 `S_hl` 自此**來自兩個不同的執行環境**（後端回應 vs 前端純函式）。本條斷的正是「這兩個獨立來源對同一 `edges`／`r` 是否給出相容的答案」，而**兩端各自的走訪語意由 `AC-T28` 之向量釘死**。⇒ 本條 ＋ `AC-T28` 合起來，才等價於修訂前那句「不得存在第二份」原本想保證的事；**只做其中一條即為缺口**。
  <br>🔴 **為何非寫不可**：抽屜與畫布若各走訪一次而語意分家，畫面就會出現「標示 5 個節點、抽屜列出 6 個節點」而**兩邊的測試各自都綠**。本 repo 已於 `supportsWatermark`（[F020](F020-watermark.md)）與 `formatMountedCount`（本檔 `AC-D9`）兩度吃過同型的虧。
  <br>📌 **選擇器契約（本條授權新增之掛鉤）**：節點元素須帶 **`data-node-id="{nodeId}"`**（既有 `data-testid="tree-node-{nodeId}"`／`data-selected`／`data-highlighted` **逐字不動**）。理由：由 `data-testid` 反解 id 需字串前綴切割，fixture 換名即碎，而不變式斷言必須穩固。

#### 逐字文案與選擇器契約（比照 `AC-D9` 之既有做法）

- **AC-T15**（🔴 抽屜與畫布之逐字文案；權威＝§A.7.2）：Given 預覽頁與其子樹抽屜, When 檢視, Then 下列**逐字成立**——
  | # | 落點 | 逐字值 |
  |---|---|---|
  | 1 | 抽屜副標題（`#ndCount`） | `子樹共 {N} 份程序書`（`子樹共` 與數字間一個半形空格、數字與 `份` 間一個半形空格；`{N}` ＝去重後之子樹文件總數，**含 `0`**） |
  | 2 | 分組標題 · 本節點（`[data-node-group-name]`） | `{節點名稱}（本節點）`（**全形括號、前後無空白**） |
  | 3 | 分組標題 · 其餘節點（`[data-node-group-name]`） | `{節點名稱}`（**不加任何後綴**） |
  | 4 | 分組份數徽章（`[data-node-group-count-text]`） | `{N} 份`（數字與 `份` 間一個半形空格） |
  | 5 | 抽屜空狀態（`[data-node-doc-empty]`） | `此節點與其下游節點皆未掛載程序書` |
  | 6 | footer 導向鈕（可見文字＝`aria-label`＝`title`，**三者同值**） | `在文件管理中檢視這 {N} 份程序書` |
  | 7 | 抽屜容器 `aria-label` | `節點與其下游節點之程序書清單（唯讀）` |
  | 8 | 工具列提示句片段 | `雙擊節點＝檢視該節點與其下游節點之程序書清單`（與既有 `點節點＝醒目標示其所有下游節點；點空白處取消；` 並列於同一行，**既有片段一字不改**） |
  | 9 | 節點 `title` 屬性 | `單擊＝標示所有下游節點；雙擊＝檢視此節點與其下游節點之程序書清單` |

  📝 **已作廢（⚠ 不得用於斷言）**：OLD> `掛載 {N} 份程序書`（副標題）｜OLD> `此節點尚未掛載任何程序書`｜OLD> `節點掛載之程序書清單（唯讀）`｜OLD> `雙擊節點＝檢視該節點掛載之程序書清單`。
  <br>🔒 **逐字不動（回歸鎖定，本輪一格未改）**：節點徽章 `掛載 {N} 份程序書`／`尚未掛載程序書`；抽屜唯讀徽章 `唯讀`；抽屜 footer 說明句 `點任一列可另開該程序書之後台唯讀詳情。本抽屜為唯讀檢視，不提供任何 DAG 編輯互動；開啟本抽屜不另記稽核事件。`；每列五欄 `程序書編號`／`程序書書名`／`版次`／`狀態`／`公告日期`；單擊 chip `已標示「{節點名稱}」及其 {N} 個下游節點`；返回鈕三標籤 `關閉預覽`／`返回文件清單`／`返回循環池`。

- **AC-T16**（🔴 選擇器契約；權威＝§A.7.3）：Given 抽屜已開啟, When 以下列掛鉤定位, Then **逐一存在且承載所述語意**——
  | 掛鉤 | 承載語意 |
  |---|---|
  | `[data-node-group="{nodeId}"]` | 一個節點分組區塊；**只有分組文件數 > 0 之節點會產生**（`AC-T12`）；**DOM 順序＝呈現順序**（`AC-T11`） |
  | `[data-node-group-self="true\|false"]` | 該組是否為本節點；全抽屜恰 0 或 1 個 `true`，為 `true` 時**必為第一個** `[data-node-group]`。🔴 **由前端以 `group.nodeId === 請求之 nodeId` 推導**（`isSelf` **不在 wire 上**，`AC-T25` ④）——**不得**改以「取陣列第 0 個」判定，那依賴「陣列順序恰好正確」之隱性假設，後端排序一旦出錯，這個屬性會跟著錯到同一個地方而互相掩蓋 |
  | `[data-node-group-count="{N}"]` | 該組之文件筆數（數值屬性），**恆等於該組內 `[data-node-doc-row]` 之數量**。🔴 **由前端以 `group.documents.length` 推導**（`count` **不在 wire 上**，`AC-T25` ④） |
  | `[data-node-group-title]` | 分組標題列容器；**必須為純顯示 `<div>`**（非 `button`／`details`／`summary`，`AC-D4`） |
  | `[data-node-group-name]` | 分組標題之節點名稱文字（本節點帶 `（本節點）` 後綴） |
  | `[data-node-group-count-text]` | 分組標題右側之份數徽章文字（`{N} 份`） |
  | `[data-node-doc-row][data-doc-num="{程序書編號}"]` | 掛於既有之程序書列上；供斷言去重與組內排序而**不必解析可見文字** |
  | `#ndCount[data-subtree-total="{N}"]` | 子樹文件總數（字串屬性）；**與 `#ndCount` 文字中之 `{N}` 為同一數**，且**兩者皆取自回應之 `totalCount`**（`AC-T13` ④：前端不得自行 count） |
  | `[data-node-id="{nodeId}"]` | 節點元素之 id 掛鉤（`AC-T14` 之載體） |

  🔒 **沿用未改**：`#nodeDocDrawer`（`aria-hidden` 兩態）／`#ndTitle`（＝節點名稱）／`#ndBody`／`[data-node-doc-row]`／`[data-node-doc-empty]`／`data-testid="tree-node-{nodeId}"`／`data-selected`／`data-highlighted`。
  <br>📌 **新增容器**：`#ndFooterAction` ＝ 導向鈕之容器；**其內容為空即代表「無入口」**（`AC-T18`）。

#### 導向鈕（裁決 3）

- **AC-T17**（導向鈕之存在、位置與目標網址）：Given 子樹合計 `N > 0` 之抽屜已開啟, When 檢視抽屜 footer, Then 存在**恰一個** `[data-subtree-jump]` 元素，且——
  1. 為 **`<button type="button">`**，位於抽屜 footer 之 `#ndFooterAction` 容器內；
  2. 其可見文字、`aria-label`、`title` **三者同值**且逐字為 `在文件管理中檢視這 {N} 份程序書`（`{N}` ＝ 子樹合計，與 `#ndCount` 同數，**皆取自回應之 `totalCount`**）；
  3. 帶 `data-lifecycle-id="{lifecycleId}"` 與 `data-node-subtree-id="{nodeId}"`；
  4. 帶 **`data-subtree-jump-href`**，其值**逐字為** `/admin/documents?lifecycleId={lifecycleId}&nodeSubtreeId={nodeId}`——**兩參數皆經 `encodeURIComponent`、順序固定 `lifecycleId` 在前**；
  5. 該網址由**單一具名組字函式**（形如 `subtreeJumpHref(lifecycleId, nodeId)`）產生，`data-subtree-jump-href` 與實際導覽**共用它**，**專案中不存在第二份組字邏輯**。
  <br>📌 **④ 使下游不必真的開分頁即可斷言目標**——本輪環是 vitest／jsdom，`window.close()`／`opener` 只能靠 spy，光靠點擊斷言太脆。
- **AC-T18**（🔴 子樹合計為 0 ⇒ 導向鈕**自 DOM 移除**）：Given 某節點與其全部下游合計 0 份（回應之 `totalCount === 0`，其 `groups` 亦為空陣列）, When 抽屜開啟, Then `document.querySelector('[data-subtree-jump]')` **為 `null`**，且 `#ndFooterAction` 之內容為空。
  <br>🔴 **必須是自 DOM 移除，不得以 `disabled` 或 CSS 隱藏達成——理由要寫進測試意圖**：本條之斷言形狀為 `queryByLabelText(/在文件管理中檢視這 \d+ 份程序書/) === null`；若實作改以 CSS 隱藏（`display:none`／`hidden` class／`visibility`）保留該按鈕，**jsdom 之 `queryBy*` 仍找得到它 ⇒ 斷言由「查無」變成「查得到」而轉紅**；反之若實作改以 `disabled` 保留，`queryBy*` 同樣找得到。**真正的假綠風險在相反方向**：若本條被寫成「按鈕不可見」之弱形式（例如只檢查 `toBeVisible()`），jsdom 不做版面計算，該斷言將對「移除」「隱藏」「根本沒實作」三種情形**同時為真**＝零鑑別力（本 repo 已於 `offsetParent` 與 `queryByLabelText('編輯編號')` 兩度吃過此虧，見 `docs/ui-ux-design-overview.md` §A.6.9）。**⇒ 本條之斷言必須是 `=== null` 的存在性檢查，且必須配一條 `N > 0` 時 `!== null` 的正向對照**，兩條合起來才有鑑別力。
- **AC-T19**（🔴 `openedAsPopup()` ＝全檔唯一之 opener 述詞）：Given 預覽頁之實作, When 檢視其 opener 偵測, Then 存在**單一具名述詞** `openedAsPopup(): boolean`，其回 `false` 之情形恰為三種——① `window.opener` 為 `null`／`undefined`；② `opener.closed === true`；③ 存取 `window.opener` 或其屬性時擲例外（跨源／被瀏覽器切斷）——並且**其消費者恰三處**：返回鈕之離開動作（`AC-D3b`）、返回鈕之標籤／圖示決定（`AC-D3c`）、導向鈕之派送（`AC-T20`／`AC-T21`）。
  <br>🔴 **專案中不得出現第二套 opener 偵測**：兩份判斷各自演化，就會出現「返回鈕以為自己是彈出頁、導向鈕以為不是」。
  <br>📌 **可斷言形狀（jsdom）**：以四種 opener 替身分別驅動——`null`／`{ closed: false, location: { href: '' }, focus }`／`{ closed: true }`／存取即 `throw` 之 `Proxy`——斷言 `openedAsPopup()` 依序為 `false`／`true`／`false`／`false`。
- **AC-T20**（導向 · **主路徑**：導回 opener 分頁並自關）：Given `openedAsPopup()` 為 `true`, When 點擊 `[data-subtree-jump]`, Then **依序**——① `window.opener.location.href` 被設為 `data-subtree-jump-href` 之同一字串（實作路由）；② `window.opener.focus()` 被呼叫**恰 1 次**；③ `window.close()` 被呼叫**恰 1 次**；且**本分頁不得自行導覽**（`location.href` 未被改寫）。
  <br>📌 **`opener.location.href = …` 與 `opener.location = …` 語意等價**（`location` 之 setter 即 `href`）；**本 AC 採 `.href` 形式**，使 jsdom 之 opener 替身可用 `{ location: { href: '' } }` 這種最直白的形狀被斷言。裁決逐字所寫之 `opener.location = …` 兩種寫法皆滿足本條。
- **AC-T21**（導向 · **退化路徑**：同分頁 navigate 且**不得**自關）：Given `openedAsPopup()` 為 `false`（`AC-T19` 三種情形之任一）, When 點擊 `[data-subtree-jump]`, Then 於**本分頁**導覽至 `data-subtree-jump-href` 之目標，且 **`window.close()` 之呼叫次數恆為 `0`**。
  <br>🔴 **`closedSelf === false` 是本條之硬性斷言**（`AC-T22`）：舊寫法在「opener 已被關掉」時仍會呼叫 `close()`，被瀏覽器拒絕後使用者「按了沒反應」。
  <br>📌 **導覽手段不指定**（`react-router` 之 `navigate()` 或 `location.href` 皆可）——本 AC 只鎖「導到哪裡」與「沒有自關」；`AC-T22` 之 seam 之 `href` 必等於 `appHref`。
- **AC-T22**（🔴 可觀測 seam 之契約）：Given 任一次導向派送（主路徑或退化路徑）, When 檢視 seam, Then 其序列**恰新增一筆**紀錄，欄位逐字為 `{ mode, href, appHref, closedSelf }`——`mode` ∈ `'opener' | 'self'`；`appHref` ＝ 實作端路由（`AC-T17` ④ 之字串）；`href` ＝ 該次實際導覽之目標（**實作端 `href === appHref`**；原型端因無應用路由而為同參數之原型檔名）；`closedSelf` ＝ 該次有無呼叫 `window.close()`（**退化路徑必為 `false`**）。順序即派送順序。
  <br>🔴 **實作端不得沿用 `window.__subtreeJumpCalls` 全域**：`window.__subtreeJumpCalls`（`prototypes/22:508-509`）為本條之**權威參考形狀**，但比照既有 [F020 `AC-N73`](F020-watermark.md#d9-watermark-delta) 之明文處置——React 側須以**可注入或可 `vi.mock` 之模組級 seam** 暴露同一序列（具體形狀由 system-architect 定）。把診斷用序列掛上 `window` 會在正式版洩漏內部狀態，且無法在測試間隔離。
  <br>📌 **本條使 `AC-T20`／`AC-T21` 由「需真的導覽才驗得到」轉為 jsdom 可斷言**：斷言＝序列長度為 `1`、`mode` 為期望值、`appHref` 逐字相符、`closedSelf` 為期望布林。
  <br>🔴 **負向鎖定：不得以渲染時之 `data-*` 模式旗標取代本 seam**（如 `data-subtree-jump-mode="opener|self"`）。那是**渲染當下之投影**——opener 若在渲染後才被關掉，屬性會與實際行為不符 ⇒ 製造一條**會說謊的斷言**。本條要求的是「**點擊當下判定 ＋ 派送後記錄**」，斷言的是真正發生的事。
- **AC-T23**（⚠ **只能在 jsdom 建的分支——test-generator 不得漏掉**）：Given `AC-T19` 之情形 ②（`opener.closed === true`）, When 建立測試, Then 必須以 **`{ closed: true }` 之 opener 替身**明確建一個案例，**不得**指望真實瀏覽器實測會走到該分支。
  <br>🔴 **理由（ui-ux-designer 於 §A.7.7 實測提報）**：**Chromium 在來源分頁關閉後會把 `window.opener` 直接設為 `null`** ⇒ 該情形實際落在 ① 而非 ②。②**在 Chromium 下量不到**，屬防禦性程式碼（其他引擎會保留參照）。⇒ 若只做瀏覽器實測，這條分支**永遠不會被覆蓋**，而它正是「按了沒反應」缺陷的修復點。
- **AC-T24**（🔒 導向鈕為 `<button>`，**不得**改為 `<a href>`）：Given 導向鈕, When 檢視其標籤名, Then 為 `BUTTON` 且**不帶 `href` 屬性**。
  <br>📌 **理由**：主路徑需 `preventDefault` 才能改導 opener 並自關；且 `<a>` 之中鍵／`Ctrl` 點擊會**再開第三個分頁**——正是 `AC-D3a`（分頁不增生）與本裁決要消滅的行為。目標網址改以 `data-subtree-jump-href` 承載，**可斷言性不減**。

#### 資料來源、權限與回歸

- **AC-T25**（🔴 權限閘門於子樹範圍下不變、亦不得放寬）：Given 抽屜之資料來源需涵蓋**整個子樹**之文件, When 載入, Then ① 權限閘門**仍為功能鍵 `循環管理` read**（`AC-D5` 逐字不變，含 Supervisor 全公司唯讀；**不得**誤用 [F009](F009-node-drawer-maintenance.md) 之 ICSOPAdmin 寫入閘門）；② **子樹之全部節點必屬同一循環**——實作**不得**因擴大範圍而回傳跨循環之文件；③ DeptContact／User 直接呼叫該資料端點仍回 **403 `PERMISSION_DENIED`**。
  <br>🔴 **④ 資料來源之具體契約（2026-08-21 就地補完；權威＝`architecture-spec.md` §12.2 決策 C2，`OQ-T3-03` 已結案）**——📝 本條前一版為「取得方式＝system-architect 之接縫，本 AC 刻意不指定」，該留白已由 C2 填實：

  | 項目 | 契約 |
  |---|---|
  | 端點 | **`GET /admin/lifecycles/:lifecycleId/nodes/:nodeId/subtree-documents`**（**新端點**，掛於既有 `NodeDocsController`，不新增 controller／module） |
  | 權限閘門 | `LIFECYCLE_MANAGEMENT` **read**（與既有單節點端點同一閘門，即本條 ①；🔒 **不得**誤用 [F009](F009-node-drawer-maintenance.md) 之寫入閘門） |
  | 節點不存在 | **404 `NODE_NOT_FOUND`**（沿用既有 `listNodeDocuments()` 行為） |
  | 回應形狀 | `{ nodeId, totalCount, groups: [{ nodeId, nodeName, documents }] }`——`nodeId` 回顯請求之根節點；`totalCount` ＝去重後之子樹文件總數（＝`AC-T15` #1 之 `{N}`，＝ Σ 各組 `documents.length`）；`documents` 為既有 `NodeMountedDoc` 形狀 |
  | 🔴 排序／去重之歸屬 | **分組順序（`AC-T11`）、去重與組內排序（`AC-T13`）皆已由後端完成**——前端**不得**再排一次、也不得再去重一次（見 `AC-T11` ④、`AC-T13` ④） |
  | 🔴 不上線之欄位 | **`isSelf` 與 `count` 刻意不在 wire 上**：前端以 `group.nodeId === 請求之 nodeId` 推導 `data-node-group-self`（**比「取陣列第 0 個」更穩固**，不依賴「陣列順序恰好正確」之隱性假設），以 `documents.length` 推導 `data-node-group-count` |

  <br>🔒 **本條之措辭不隱含既有單節點端點已被移除**：`GET /admin/lifecycles/:lifecycleId/nodes/:nodeId/documents`（§10.5 之既有端點）**本輪保留、不刪**——system-architect 建議退休，**lead 已裁決本輪不退休**（理由與後續處理見 [OQ-T3-07](../open-questions.md#t3-2026-08-21)）。本輪只新增一條路由，既有路由與其既有測試**逐字不動**。
  <br>📌 **子樹全部節點必屬同一循環（本條 ②）為結構性保證、非執行期檢查**：`listNodes(lifecycleId)`／`listEdges(lifecycleId)` 本即以 `WHERE lifecycleId = :lc` 限定，跨循環之邊不可能被納入走訪（§12.2）。本條 ② 之測試仍應存在（以含兩個循環之 fixture 斷言不越界），但其綠燈來自查詢條件而非額外防呆碼。
- **AC-T26**（🔒 既有行為回歸鎖定）：Given 本 delta 實作完成, When 執行既有測試, Then 下列**逐項維持綠燈且期望值未經修改**——`AC-D1`（雙擊開抽屜／`Escape` 關閉／標題＝節點名稱）、`AC-D2`（五欄與 `mono`／狀態徽章）、`AC-D3`（點列開 `/admin/documents/:id`）、`AC-D5`（權限）、`AC-D6`（單擊標示下游於雙擊後仍存在；單擊**不**開抽屜）、`AC-D8`（開抽屜不新增 `AUDIT_LOG`）、`AC-D3a`（`window.open` 恰兩個引數、具名分頁不增生）、`AC-D3d`（切換循環保留 `?from=`）、`AC-S1`～`AC-S3`（子分類顯示與第二入口）。
  <br>🔒 **既有單節點端點本輪保留、不退休**（2026-08-21 lead 裁決，見 [OQ-T3-07](../open-questions.md#t3-2026-08-21)）：`GET /admin/lifecycles/:lifecycleId/nodes/:nodeId/documents` 及其既有測試（`node-docs-controller-routes.spec.ts`／`node-docs-list.service.spec.ts`）**逐字不動**。⚠ 本輪只**新增**一條子樹路由，**不刪任何既有路由**——退休它屬回歸範圍擴張，而三項裁決無一需要它被刪掉，且本輪環（無 e2e／無整合測試）驗不到刪端點的回歸風險。
  <br>⚠ **`AC-D9`／`AC-D4`／`AC-D7`／`AC-D3b`／`AC-D3c` 之期望值本輪已就地修訂**（見各條），**其變更屬修訂而非回歸**——舊字面已標 `OLD>`，**不得**再用於斷言。
- **AC-T27**（🔒 [F038](F038-lifecycle-tree-change-history.md) diff 預覽不受本 delta 影響）：Given 變更歷程頁之新舊樹狀圖 diff 預覽, When 對其節點雙擊, Then **不開啟任何抽屜、不存在 `[data-subtree-jump]`**——`OQ-D18-19`（diff 樹狀圖不支援雙擊）本輪**未變更**，[F038](F038-lifecycle-tree-change-history.md) `AC-D3` 逐字有效。若期待兩頁行為一致，**須新的人類裁決**。
- **AC-T28**（🔴 **走訪語意之雙執行環境綁定；`AC-T14` ① 之一致性保證載體**；2026-08-21 新增，權威＝`architecture-spec.md` §12.1 決策 C1）：Given 前端與後端**各自**之 `descendants(edges, startId): Set<string>`, When 以下列 **5 組固定向量**驅動, Then **兩端回傳之集合逐一相等於同一組期望值**——

  | Fixture | `edges` | 期望 |
  |---|---|---|
  | **F1**（鏈） | `A→B, B→C, C→D` | `descendants(A) = {A,B,C,D}`；`descendants(C) = {C,D}`；`descendants(D) = {D}` |
  | **F2**（菱形匯流） | `A→B, A→C, B→D, C→D` | `descendants(A) = {A,B,C,D}`（`D` 經兩路徑可達，**計入一次**） |
  | **F3**（分支排除） | `A→B, A→C, B→D, C→E` | `descendants(B) = {B,D}`（**不含** `C`／`E`，旁支不涵蓋） |
  | **F4**（葉節點） | `A→B` | `descendants(B) = {B}`（無出邊，回最小集） |
  | **F5**（重複邊防禦） | `A→B, A→B` | `descendants(A) = {A,B}`（不因重複邊而重複計入或無窮成長） |

  🔴 **落地要求＝兩端各一個測試檔，缺一即為缺口（本條之核心，請逐檔核對）**：
  | 執行環境 | 測試檔 | 動作 |
  |---|---|---|
  | 前端（vitest） | `frontend/src/pages/lifecycle-tree-layout.spec.ts`（既有） | **新增** `descendants` 之 F1–F5 區塊 |
  | 後端（jest） | `backend/src/lifecycle/lifecycle-tree-layout.spec.ts`（既有，現僅測 `buildTreeLayout`） | **擴充**新增 `descendants` 之 F1–F5 區塊 |

  🔴 **這是本輪唯一「必須做、但沒有任何機制自動保證會做」的項目**（system-architect 如實提報）：**只在一端建立向量測試，另一端的語意漂移不會被任何東西攔截**——兩端各自的測試都會全綠。⇒ **驗收時請逐檔核對上表兩個檔案皆已擴充**，不得以「其中一端已測」視為滿足本條。
  <br>📌 **語意契約（供兩端實作與測試共同依循，逐條可對應上表向量）**：① `descendants(edges, r)` **恆含 `r` 自身**（`{r}` 為最小回傳值）；② **僅沿 `source → target`（parent→child）**，反向邊不追隨；③ 回傳型別為 `Set`，經多條路徑可達者僅計入一次、且僅被展開一次；④ 同一 `(source, target)` 重複出現不影響結果；⑤ 異常資料（self-loop／成環，F008 已於寫入時禁止）下仍須以 `set.has()` 守衛為第二道防線，**不得無窮迴圈或拋錯**。
  <br>🔒 **走訪順序刻意不綁定**：本條只約束**最終 `Set` 成員**，BFS／DFS／任何策略皆可——後端**不需**複製前端之 DFS-via-stack 實作細節。這與 `AC-T11` 之註記一致（分組順序取自佈局座標，**刻意不採** `descendants()` 之走訪順序）。
  <br>⚠ **不得以「兩份程式碼看起來一樣」代替本條**：`watermarkLines()`／`toDisplayLines()`（§10.14）之既有教訓即為此——目視比對不是保證，固定向量才是。

## Error Scenarios
- **權限不足**：部門窗口／一般使用者（無循環管理權）開啟預覽或直接呼叫 API（含第二入口由文件清單觸發）→ 回 403 `PERMISSION_DENIED`；見 [error-handling.md#permission](../error-handling.md#permission)。（主管對循環管理為全公司唯讀，無「主管非本部門→403」情境。）
- **節點文件清單載入失敗**（2026-08-16）：抽屜顯示錯誤提示但**不關閉、不影響樹狀圖既有渲染與標示狀態**；不寫稽核。
- **下載/列印未授權**：無可視權限角色略過 UI 直接呼叫下載/列印 API → 回 403 `PERMISSION_DENIED`，**不產生檔案、不燒錄浮水印、不記錄稽核**（操作即被拒，非稽核失敗情境）；見 [error-handling.md#permission](../error-handling.md#permission)。
- **稽核寫入失敗不阻斷（檢視）**：`LIFECYCLE_VIEW` 寫入暫時異常時不阻擋檢視，改進補償佇列重試補寫；不可竄改保證見 [error-handling.md#audit](../error-handling.md#audit)（比照 F023）。稽核不可修改/刪除（`AUDIT_IMMUTABLE`）。
- **未登入存取預覽網址**：拒絕並導回登入頁；見 [error-handling.md#public](../error-handling.md#public)。

### 檔案動作載體遷移 delta（🔴 2026-08-26 真人回報） {#file-action-carrier-delta}

- **AC-T49**：Given session 已逾時, When 點擊本 feature 之樹狀圖預覽之「下載」「列印」, Then 使用者**不得**看到後端
  JSON 錯誤被當成網頁呈現，而應被導回登入頁（[F001](F001-auth-login-session.md#session-lost-redirect-delta)
  `AC-S1`／`AC-S5`）。載體由 `<a href>`（top-level navigation）改為代理串流
  （`downloadViaBlob`／`openPdfViaBlob`）；**端點、燒錄與稽核行為逐項不變**，僅取得位元組之方式改變。
  📝 已作廢（⚠ 不得復原）：`<a href={lifecycleTreeDownloadUrl(id)}>`／`<a href={lifecycleTreePrintUrl(id)} target="_blank">`
  ⚠ 列印之新分頁須於 click handler 內、任何 `await` **之前**同步 `window.open('', '_blank')` 取得，
  否則會被彈出視窗封鎖器擋下。

### 2026-08-27 UX delta（🔴 使用者裁決；三項之第 ②③ 項） {#ux-20260827-delta}

- **AC-T50**（🔴 **浮水印疊加層須滿版**——UX ②）：Given 任一循環之樹狀圖預覽已渲染（畫板寬 `W`、高 `H`，含 `W ≫ H` 之寬圖）, When 檢視浮水印疊加層之幾何, Then 其**旋轉後之矩形涵蓋畫板四角**——即疊加層為**邊長 ≥ `(W + H) × cos45°` 之正方形**且**以畫板中心為中心**（`transform: rotate(-45deg)` 之原點即中心）。
  <br>🔴 **根因為幾何、不是密度**（本條之立條理由，不得刪）：已作廢之 `inset: -40%` 使疊加層為 `1.8W × 1.8H`（**兩邊各自**等比放大）；但旋轉 45° 後要蓋住原矩形，**兩軸半徑都必須 ≥ `(W + H)/2 × cos45°`**（畫板四角 `(±W/2, ±H/2)` 逆旋轉 45° 後為 `(0.707(x − y), 0.707(x + y))`，其極值即該值）。長寬比一拉開，`1.8H` 遠小於該值 ⇒ 疊加層退化成一條斜向細帶。例：`4000 × 600` 之畫板於 `y = 0` 這條線上只覆蓋 `x ∈ [−764, 764]`，而畫板是 `[−2000, 2000]`。**使用者所見之「浮水印只集中在中間」即此。**
  <br>📌 **驗證載體**：純函式單元測試（幾何計算），以**畫板四角是否落在旋轉後之疊加層內**為斷言——**不得**退化為「tile 枚數 > 某個數」：舊實作之 `wmCount` 一直有值，只是那些 tile 全落在畫板外，該形狀的斷言**永遠不會紅**。另須一條**負向對照**，把已作廢之 `1.8W × 1.8H` 幾何餵進同一套判定並斷言其於極寬圖上失敗。
  <br>📌 **鋪滿之落地契約**：tile 由**左上角起逐列鋪滿**（列內 `flex-wrap: nowrap`），溢出由疊加層自身之 `overflow: hidden` 裁掉；列欄數之推算須**低估 tile 尺寸並各多算一格**（估小只是多鋪幾枚被裁掉，估大就是右緣一條沒有浮水印的空白）。<br>⚠ **不得**改回 `flex-wrap: wrap` ＋ `align-content: center` ＋ 固定枚數——tile 寬度由內容決定，wrap 之下每列排得下幾枚無從預期，最後一列排不滿即右緣一條空白（旋轉後就是一條斜白帶）。
  <br>📝 已作廢（⚠ 不得復原）：OLD> `inset: '-40%'` ＋ `display:flex; flexWrap:'wrap'; alignContent:'center'; justifyContent:'center'` ＋ `wmCount = Math.min(160, Math.max(40, Math.round((boardW * boardH) / 16000)))`。
  <br>🔒 **不影響**：疊加層之色值／不透明度／行高（[F020](F020-watermark.md) `AC-N2`／`AC-T2` 之定稿值）、`data-testid="watermark-overlay"`／`watermark-text` 兩個掛鉤（`AC-N66` 之正向鎖定）、三行式拆行（`AC-N68`）。
  <br>⚠ **本條僅適用 `LifecycleTreePreviewPage`**。[F038](F038-lifecycle-tree-change-history.md) 之 `DiffBoard` 迷你畫板同屬 `inset:-40%` 寫法，**本輪裁決未涵蓋**（使用者所提為樹狀圖預覽頁）；其畫板為 modal 內之小圖，長寬比未拉開故未顯形。**日後若要一併收斂，須另行入 AC，不得逕自順手改。**

- **AC-T51**（🔴 **直排節點之換欄方向改為往右**——UX ③）：Given 下載／列印路徑之列印幾何（`textOrientation: 'vertical'`，節點名 1 字 1 行）, When 某節點名長度超過 `LINES_CAP` 而需分欄, Then **第一欄畫在最左、後續欄往 x 軸正向（右）遞增**——`verticalNodeColumns()` 之回傳 `[0]` 為最左欄，相鄰欄之 x 差恰為 `PRINT_TREE_CONST.COL_W`，且同欄內各字之 x 相同。
  <br>📝 已作廢（⚠ 不得復原）：OLD> `colX = blockLeft + (columns.length - 1 - col) * COL_W`——第一欄畫在**最右**、往左換欄（中文直排由右至左之古典排版慣例，2026-08-26 UX ④ 之原始實作）。**推翻理由（使用者裁決）**：本系統之節點名多為含英數與專有名詞之現代混排，由右至左反而讀不順。
  <br>📌 **驗證載體**：以假 `PDFPage` 收集 `drawText` 之 x 座標（`drawVerticalNode` 僅用到該方法）——欄位 x 是本裁決之**唯一**可觀測量，位元組層取回文字位置需 PDF 解析器（[integration] 範疇）。須含**負向回歸鎖**（第一欄不得在最右）。
  <br>🔒 **不影響**：`verticalNodeLines()` 之逐字拆行與截斷、`buildPrintGeometry()` 之節點寬高與全圖統一高度、A4 縮放分頁（2026-08-26 UX ④ 之另一半），以及**畫面幾何**（`TREE_LAYOUT_CONST`，橫排）。

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
- **2026-08-21 使用者裁決（三項裁決第 1／2／3 項）**: 三行式浮水印行高（[F020 `AC-T1`～`AC-T5`](F020-watermark.md#line-height-delta)）｜抽屜擴為子樹＋導向鈕（本檔 `AC-T10`～`AC-T27`）｜後端 `nodeSubtreeId` 篩選參數與 `13` 之 chip（[F017 `AC-T40`～`AC-T48`](F017-backend-document-list.md#subtree-filter-delta)）。傳播紀錄＝`docs/ui-ux-design-overview.md` §A.7。
- **✅ system-architect 已定案（2026-08-21，`architecture-spec.md` 第 12 章 C1／C2）**：① 抽屜資料來源＝**新端點** `GET .../nodes/:nodeId/subtree-documents`，分組／排序／去重皆由後端完成（`AC-T25` ④ 已補完，`OQ-T3-03` 結案）；③ 後端子樹走訪＝ `backend/src/lifecycle/lifecycle-tree-layout.ts` 之 `descendants()`（**非**遞迴 CTE），語意由 `AC-T28` 之 F1–F5 向量釘死。<br>**⚠ 仍待 system-architect**：② `AC-T22` 之模組級 seam 形狀（比照 [F020 `AC-N73`](F020-watermark.md#d9-watermark-delta) 之處置，**不得掛 `window`**）——第 12 章未涵蓋此項。
- **待 ui-ux-designer（本 delta 新增）**：`prototypes/22-lifecycle-tree-preview.html` 之節點須加上 `dblclick` 與唯讀側抽屜版面（比照 [F009](F009-node-drawer-maintenance.md) 抽屜版型但**移除全部寫入元件**）。
- **待 system-architect（本 delta 新增）**：節點文件清單之資料來源端點（建議 `GET /admin/lifecycles/:lifecycleId/nodes/:nodeId/documents`，權限閘門＝功能鍵 `循環管理` read；是否改為預覽頁初次載入即一併回傳各節點文件清單以省一次往返，屬效能取捨）。
