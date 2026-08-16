# F038: 循環樹狀圖變更歷程（新舊版預覽／下載燒錄浮水印）
Priority: P1 | Status: ✅ 完成（結構事件日誌＋查詢＋LIFECYCLE_SNAPSHOT 交易一致快照＋新舊重建＋diff＋雙頁燒錄下載＋前端新舊並列 modal；migration 1723161600000 已對 SOP 跑通；見 implementation-log/lifecycle-changelog-impl.md） | Last Updated: 2026-07-24
Epic/Story: E07 / US-063

> **2026-08-07 additive delta（🟢 APPROVED（2026-08-07 人類閘門通過））**：本 tab 之「循環別」查詢下拉與事件清單/預覽標題須反映循環子分類（以快照值呈現）。規則權威＝[F040](F040-lifecycle-subcategory.md)；查詢、diff、燒錄下載、權限與其餘既有條款皆不變。
> **🔵 2026-08-16 additive delta（使用者裁決；缺失／變更 delta 第 16／17／19 項）**：① 本 tab 提供「匯出」動作（CSV），**與 [F037](F037-document-change-history.md) tab 各自匯出、不合併**；② 新舊樹狀圖 diff 預覽**明文不支援節點雙擊**（OQ-D18-19）。**本 delta 之 AC 編號採 `AC-D#`**（D＝2026-08-16 defect delta），與既有 `AC-S#` 批次區隔。
> 📌 **#17（新舊樹狀圖浮水印不符三層式、欄位不完整）＝`BUG-IMPL`，不新增 AC**：既有 AC「取得伺服器端產生、浮水印已**燒錄於 PDF 內容層**（格式權威同 [NFR-007](../nfr.md#watermark)、**機密聲明另起一行**、比照 [F020](F020-watermark.md)）」與 Main Flow 4「整頁疊加浮水印（比照 [F036](F036-lifecycle-tree-preview.md) viewer 手法）」**已完整涵蓋**三層式要求。實作以 `white-space: nowrap` 直接渲染後端之線性字串（本檔全檔無 `watermarkLines` 等價函式），屬缺陷；修法應**復用 [F020](F020-watermark.md) delta 所要求之共用 `watermarkLines()`**，而非再寫一份。中文亂碼另受 `backend/Dockerfile` 缺 `assets` 之同一根因影響（見 [F020](F020-watermark.md#front-burn-scope-delta) #6 加註）。

> **獨立後台功能「文件變更歷程」**（獨立側選單項，非「文件調閱歷程」子頁；prototype `23-change-history.html`）之 **循環樹狀圖 tab**（與 ICSOP 程序書 tab [F037](F037-document-change-history.md) 併存，共兩 tab）。以 **append-only 結構變更事件日誌**追溯循環 DAG 結構異動，並可預覽/下載變更前後兩版本樹狀圖（燒錄浮水印）。權限依 [F025](F025-role-function-matrix.md) 獨立功能列「文件變更歷程」。稽核動作屬 [F036](F036-lifecycle-tree-preview.md)「循環」`LIFECYCLE_*` 家族之延伸。

## Description
提供依循環（名稱／ID）與時間區間查詢之 DAG 結構變更歷程；每筆事件記錄異動類型（節點／連線／文件掛載之新增/刪除/改派/改名）、操作人員、時間、所屬循環。選擇某筆事件可**並列或可切換預覽「變更前／變更後」兩版本樹狀圖**（比照 [F036](F036-lifecycle-tree-preview.md) viewer：整頁沉浸式、上到下佈局、直角箭頭、對角平鋪浮水印；差異節點/連線以視覺標示新增/刪除），並可**下載**其 PDF（浮水印**燒錄進內容層**，比照 [F020](F020-watermark.md)／[NFR-007](../nfr.md#watermark)）。檢視/下載即記 `LIFECYCLE_CHANGELOG_VIEW`／`LIFECYCLE_CHANGELOG_DOWNLOAD` 稽核。變更事件由 DAG 維護功能產生：節點/連線（[F008](F008-dag-node-edge.md)）、節點名稱/文件掛載（[F009](F009-node-drawer-maintenance.md)）。

**與「僅保存當前版本」調和**：本功能為**輕量結構變更事件日誌**，非保留完整歷史版本檔；DAG 結構為輕量關聯式資料（節點＋連線），非大型檔案。呈現新舊樹狀圖需重建兩時點之完整結構——**採「結構化 diff 重放」或「完整結構快照」及其事件粒度（逐動作 vs 編輯階段聚合）屬架構決策，待 system-architect，見 OQ-E07-05**（本 spec 不敲定）。

## Preconditions
- 操作者具「文件變更歷程」功能存取權（**定案（OQ-E07-04）**：依 [F025](F025-role-function-matrix.md) **獨立功能列「文件變更歷程」**——僅 SysAdmin／ICSOPAdmin 全公司唯讀；**主管／部門窗口／一般使用者一律無權**（功能/tab 不顯示、直接呼叫 API 回 403）。與 F037 一致；**覆蓋原「比照循環管理／主管全公司唯讀」草案**——主管對本 tab 亦無權）。
- 結構變更事件已由來源功能（F008／F009）於其持久化時同步寫入變更日誌。

## Main Flow
1. 進入獨立後台功能「文件變更歷程」（`23-change-history.html`）→ 切換至「循環樹狀圖」tab。
2. 依循環（名稱/ID）與時間區間查詢 → 送出（後端強制驗證角色可視範圍）。
3. 回傳符合之結構變更事件清單（分頁，時間新到舊）：每筆顯示循環名稱、異動類型、操作人員、時間。
4. 選擇某筆事件 → 點「預覽」→ 以 F036 viewer 手法並列/可切換顯示「變更前／變更後」兩版本樹狀圖，差異視覺標示；整頁疊加浮水印。
5. 點「下載」→ 伺服器端產生涵蓋前後兩版本之 PDF，浮水印燒錄進內容層（比照 F020/US-054）。
6. 預覽/下載動作同步記 `LIFECYCLE_CHANGELOG_VIEW`／`LIFECYCLE_CHANGELOG_DOWNLOAD` 稽核（下載情境內容與燒錄浮水印一致）。

## Alternative Flows
- **變更事件產生（來源功能側，持久化時同步寫入）**：
  - 節點/連線（F008）：`NODE_ADDED`／`NODE_REMOVED`／`EDGE_ADDED`／`EDGE_REMOVED`（草案列舉），含操作人員/時間/所屬循環。
  - 節點名稱/文件掛載（F009）：`NODE_RENAMED`／`DOCUMENT_MOUNTED`／`DOCUMENT_REASSIGNED`／`DOCUMENT_UNMOUNTED`，含節點/文件識別與舊值/新值（如節點名稱新舊字串、改派來源/目標節點）。
- 下載 PDF 排版（單一 PDF 兩頁 vs 兩份獨立 PDF）：由架構師/UI-UX 決定，見 OQ-E07-06（**架構已定案＝單一 PDF 兩頁；2026-08-16 之匯出裁決不影響本子題**）。
- **匯出查詢結果（CSV，2026-08-16 使用者裁決＝納入）**：將**當前查詢條件之全部結構變更事件**（非僅當前頁）輸出為 CSV；**與 [F037](F037-document-change-history.md) tab 各自匯出、不合併**（兩者欄位結構完全不同）。見 [§循環樹狀圖 tab 匯出 delta](#export-delta)。

## Edge Cases
- 循環無任何歷史結構變更事件：開啟本 tab 顯示空狀態提示（非錯誤）。
- 短時間內連續多個原子操作（單一編輯階段）：產生之事件筆數依 OQ-E07-05 聚合策略定案（草案逐動作獨立記錄，可能列表項多/雜訊）。
- 部門窗口／一般使用者呼叫本功能 API：一律回 403。
- 差異涉及被刪除節點/連線：預覽以刪除線/半透明標示；下游遍歷與呈現比照 F036（DAG 禁環保證終止）。

## Postconditions
- 循環 DAG 結構異動可被逐事件、依時間追溯，並可取得帶浮水印之新舊樹狀圖佐證；未保留歷史版本檔。
- 每次預覽/下載留一筆不可竄改之 `LIFECYCLE_CHANGELOG_*` 稽核。

## Acceptance Criteria
- Given 具權限角色進入獨立功能「文件變更歷程」, When 切換至「循環樹狀圖」tab, Then 顯示依循環與時間區間查詢之介面，送出後回傳符合之結構變更事件清單（分頁，時間新到舊，每筆含循環名稱/異動類型/操作人員/時間）。
- Given 管理員於 DAG 畫布新增/刪除節點或連線（F008）, When 操作成功持久化, Then 記一筆對應結構變更事件（`NODE_ADDED`／`NODE_REMOVED`／`EDGE_ADDED`／`EDGE_REMOVED`），含操作人員/時間/所屬循環。
- Given 管理員經節點抽屜改節點名稱或掛載/改派文件（F009）, When 儲存完成, Then 記對應事件（`NODE_RENAMED`／`DOCUMENT_MOUNTED`／`DOCUMENT_REASSIGNED`／`DOCUMENT_UNMOUNTED`），含識別與舊值/新值。
- Given 於清單選擇某筆結構變更事件並點「預覽」, When 開啟, Then 以 F036 viewer 手法並列/可切換呈現變更前後兩版本樹狀圖（上到下、直角箭頭），差異節點/連線視覺標示新增/刪除，整頁疊加浮水印。
- Given 於新舊樹狀圖預覽點「下載」, When 完成, Then 取得伺服器端產生、浮水印已**燒錄於 PDF 內容層**（格式權威同 NFR-007、機密聲明另起一行、比照 F020）之檔案，非僅前端疊加。
- Given 預覽或下載完成, When 動作完成, Then 各記一筆稽核（`LIFECYCLE_CHANGELOG_VIEW`／`LIFECYCLE_CHANGELOG_DOWNLOAD`），含操作人員/員工編號/部門/處室/循環 ID·名稱/時間，下載情境與燒錄浮水印一致；寫入失敗不阻斷瀏覽，進補償佇列重試（比照 F023）。
- Given 登入角色為主管／部門窗口／一般使用者, When 查詢或開啟循環變更歷程（或直接呼叫 API）, Then 回 403（`PERMISSION_DENIED`）；本功能兩 tab 統一僅 SysAdmin／ICSOPAdmin 全公司唯讀（OQ-E07-04 定案，F025 獨立功能列「文件變更歷程」；**主管對本『循環樹狀圖變更』tab 亦無權**）。
- Given 循環無任何歷史結構變更事件, When 開啟本 tab, Then 顯示空狀態提示而非錯誤。

### 循環子分類 delta（🟢 APPROVED 2026-08-07；規則權威＝[F040](F040-lifecycle-subcategory.md)）

- **AC-S1**：Given 池中有「銷售及收款循環（消金）」與「銷售及收款循環（企金）」, When 展開本 tab 之「循環別」查詢下拉, Then 呈現**兩個相異選項**（各以 `lifecycleDisplayName` 顯示），查詢值為各自 `lifecycleId`（**非**名稱字串，亦非循環代碼——同名兩者代碼相同）；When 選定其一送出, Then 事件清單僅含該具體循環之事件，不含同名另一子分類之事件。
- **AC-S2**（**2026-08-08 使用者裁決 5 改寫**；原條文所指之 `LIFECYCLE_CHANGE_LOG.lifecycleName` 快照欄於 schema 中不存在）：Given 事件清單與新舊樹狀圖預覽/下載 PDF 之「循環別」欄與標題, When 呈現, Then 顯示字串由該事件之 `lifecycleId` **join `LIFECYCLE` 取當前之 `{ name, subcategory }`** 並經 `lifecycleDisplayName` 組合（含子分類）——`LIFECYCLE_CHANGE_LOG` **不存**循環名稱（[F040](F040-lifecycle-subcategory.md) AC-34）；Given 該循環之 `name`／`subcategory` 於事件寫入後才被修改, Then 既有事件之顯示**隨之變為新名稱**（**非**快照）。<br>⚠ **已明確接受之代價**：本 tab 之歷史事件不具人類可讀之名稱快照語意，改名後回看歷史將見新名稱；事件所屬循環仍可由 `lifecycleId` 唯一辨識。此為使用者 2026-08-08 裁定之取捨（不新增欄位與 migration），追溯見 [open-questions.md](../open-questions.md) OQ-E07-11。<br>※ 快照語意僅適用於 `AUDIT_LOG.lifecycleName`（[F040](F040-lifecycle-subcategory.md) AC-36），即本功能之**調閱**稽核紀錄，非事件本體。

### 循環樹狀圖 tab 匯出 delta（🔵 2026-08-16 使用者裁決；缺失／變更 delta 第 16／19 項） {#export-delta}

> 前提裁決：**OQ-D18-16**（格式與範圍，同 [F037](F037-document-change-history.md#export-delta)）；**OQ-D18-17**＝兩 tab 各自匯出；**OQ-D18-19**＝本 tab 之 diff 樹狀圖**不**支援節點雙擊。
> 🔴 **2026-08-16 事實更正（system-architect 查證）**：`OQ-D18-16` 原表述之「與 [F024](F024-access-history-query.md) 既有匯出**同構**」不成立——**F024 之匯出並不產生 CSV 檔案**（回傳 JSON、前端丟棄、僅跳 toast）。本 tab 之匯出格式基準改為**向 [error-handling.md#export](../error-handling.md#export) 之共用規則對齊**；實質格式要求不變。
> ⚠ **範圍紀律（不變）**：本 delta **不得改動 [F024](F024-access-history-query.md) 之任何 AC 或既有行為，亦不得為其「匯出不產生檔案」之缺口撰寫任何 AC**（已登錄為 [open-questions.md](../open-questions.md) `OQ-D18-26`）。

- **AC-D1**（匯出動作與範圍）：Given 具權限角色（SysAdmin／ICSOPAdmin）位於「循環樹狀圖」tab 且已送出查詢, When 檢視工具列, Then 存在無障礙名稱為 `匯出` 之按鈕（**與 [F037](F037-document-change-history.md) tab 之匯出鈕為兩個獨立控制項**，切換 tab 時各自匯出各自 tab 之結果）；When 點擊, Then CSV 恰含符合當前查詢條件之**全部結構變更事件**（非僅當前頁），列序與畫面一致（時間新到舊）。
- **AC-D2**（CSV 格式與欄位）：Given 匯出成功, When 檢視檔案, Then ① 位元組以 **UTF-8 BOM（`EF BB BF`）** 開頭；② 第 1 列表頭逐字為 `循環別,變更類型,變更摘要,操作人,時間`（＝畫面所見五欄；「預覽 / 下載」操作欄不匯出）；③ RFC 4180 逸出規則同 [F037](F037-document-change-history.md#export-delta) `AC-D2`；④ `循環別` 欄之值由該事件之 `lifecycleId` join `LIFECYCLE` 取**當前值**並經 `lifecycleDisplayName` 組合（沿用 `AC-S2` 之語意，**非快照**）。
- **AC-D3**（🔒 diff 樹狀圖不支援雙擊）：Given 位於本 tab 之新舊樹狀圖 diff 預覽, When 對任一節點快速點擊兩下, Then **不開啟任何抽屜或彈窗、無任何行為變化**（[F036](F036-lifecycle-tree-preview.md#node-dblclick-delta) 之節點雙擊能力**刻意不擴及本 feature**）。<br>📝 **理由（OQ-D18-19 裁決＝否）**：歷史快照中之「該節點文件清單」語意不明（是當時的還是現在的？），且會擴大改動規模；使用者只提「循環管理 > 樹狀圖檢視」。
- **AC-D4**（匯出上限／檔名／權限／稽核／空結果）：比照 [F037](F037-document-change-history.md#export-delta) `AC-D3`～`AC-D7`，惟 ① 檔名形狀為 `lifecycle_change_history_{YYYYMMDD}_{HHmmss}.csv`；② 匯出記一筆 `LIFECYCLE_CHANGELOG_VIEW` 稽核（**非** `CHANGE_LOG_VIEW`——本 tab 之稽核家族為 `LIFECYCLE_CHANGELOG_*`）；③ 超限一律回 **400 `EXPORT_ROW_LIMIT_EXCEEDED`**（上限 10,000，邊界值 10,000 通過）。
- **AC-D5**（🔴 CSV 注入防護；2026-08-16 lead 裁定）：Given 某結構變更事件之 `變更摘要` 或 `循環別` 為 `=cmd|'/c calc'!A1`, When 匯出, Then 該儲存格於 CSV 中之值為 `'=cmd|'/c calc'!A1`（**最前面多一個半形單引號**），再依 RFC 4180 包覆逸出；以 `+`／`-`／`@`／Tab（`\t`）／CR（`\r`）開頭者同樣加前綴；不以此六種字元開頭者**不加任何前綴**（恆等）。**表頭列不套用本規則**（`AC-D2` ② 之逐字表頭斷言不受影響）；`AC-D2` ③ 之 RFC 4180 逸出**須在本前綴之後**套用。<br>⚠ **對值層斷言之影響（test-generator 必讀）**：`AC-D2` 之「欄位＝畫面所見」僅約束**表頭與欄位集合**；**值層期望值一律為「畫面所見字串經本規則轉換後之結果」**，不得直接以畫面原字串斷言。規則權威＝[error-handling.md#export](../error-handling.md#export)。

- **AC-D6**（🔴 匯出鈕之選擇器與使用者可見回饋；**2026-08-16 補訂**，權威＝`prototypes/23-change-history.html`）：Given 位於「循環樹狀圖」tab, When 檢視 topbar, Then 匯出鈕之 DOM id 為 **`exportTree`**（與 [F037](F037-document-change-history.md#export-delta) `AC-D10` 之 `exportDoc` 為兩個獨立控制項）。<br>When 匯出成功, Then 成功回饋之文字**以逐字片段 `已匯出循環樹狀圖變更歷程（CSV，UTF-8 BOM）` 起始**。<br>When 符合筆數超過上限, Then 錯誤回饋之文字**含逐字片段** `符合條件之事件為 {N} 筆，超過匯出上限 10000 筆，請縮小查詢條件`，**且字串 `EXPORT_ROW_LIMIT_EXCEEDED` 出現於同一回饋容器內**（與 [F037](F037-document-change-history.md#export-delta) `AC-D10` 共用同一句式、同一錯誤碼與同一兩段式斷言方式）。<br>📝 **2026-08-16 斷言方式調整（ringC 回報 `ToastApi` 無 code 參數）**：原寫「並附錯誤碼標記 `EXPORT_ROW_LIMIT_EXCEEDED · 400`」隱含錯誤碼為獨立元素，該形狀不可達；改為兩段式，達成方式不拘。規則權威＝[error-handling.md#export](../error-handling.md#export)。<br>📌 **切 tab 時兩鈕僅顯示其一**——屬**設計裁量**，見 [open-questions.md](../open-questions.md) `OQ-D18-27`，**刻意不入 AC**（`AC-D1` 只要求「兩個獨立控制項、各自匯出各自 tab 之結果」，同時可見與否不影響該語意）。
- **AC-D7**（🔴 CSV 值層：列舉欄輸出中文標籤；**2026-08-16 補訂**，lead 裁示）：Given 匯出成功, When 檢視資料列之各儲存格值, Then 下列成立——
  - ① **`變更類型` 欄之值為畫面所見之中文標籤**，值域**恰為六者**（＝ `prototypes/23-change-history.html` 之「變更類型」篩選下拉選項，逐字）：`新增節點`／`移除節點`／`新增連線`／`移除連線`／`節點改名`／`文件掛載變更`。**不得**輸出列舉代碼（`NODE_ADDED` 等）。<br>**對映**：`NODE_ADDED`→`新增節點`、`NODE_REMOVED`→`移除節點`、`EDGE_ADDED`→`新增連線`、`EDGE_REMOVED`→`移除連線`、`NODE_RENAMED`→`節點改名`、**`DOCUMENT_MOUNTED`／`DOCUMENT_REASSIGNED`／`DOCUMENT_UNMOUNTED` 三者皆 →`文件掛載變更`**。<br>⚠ **已知且接受之代價**：後三者為**三對一**，CSV 之 `變更類型` 欄無法區分掛載／改派／解除——但這**與畫面完全一致**（篩選下拉本即只有六個選項），符合「欄位＝畫面所見」；細節仍可由**同列之 `變更摘要`** 讀出（如 `文件 ICSOP-… 由節點 A 改派至節點 B`）。若日後需區分，須**先改畫面之六值下拉**，不得只改 CSV。
  - ② **`時間` 欄之值為 `YYYY-MM-DD HH:mm:ss`**（UTC+8，**不附 `(UTC+8)` 字樣**；顯式 +8 位移，不得依賴行程 TZ）。
  - ③ **`循環別` 欄**沿用 `AC-D2` ④（join `LIFECYCLE` 取當前值經 `lifecycleDisplayName` 組合，非快照）。
  - ④ **🔴 對照表單一權威**：① 之對照表**只能有一份**，畫面篩選下拉與 CSV 不得各存一份；**可觀測不變式＝「CSV 某列 `變更類型` 之值，與畫面同一事件該欄之可見文字逐字相同」**。落點由 system-architect 定（與 [F037](F037-document-change-history.md#export-delta) `AC-D11` ④ 同一決策）。
## Error Scenarios
- **權限限縮**：主管／部門窗口／一般使用者→403（僅 SysAdmin／ICSOPAdmin，OQ-E07-04 定案）。見 [error-handling.md#permission](../error-handling.md#permission)。
- **匯出筆數超限**（2026-08-16）：`EXPORT_ROW_LIMIT_EXCEEDED`（400），不產生檔案；見 [error-handling.md#export](../error-handling.md#export)。
- **下載未授權**：無可視權限角色略過 UI 直接呼叫下載 API→403，不產檔、不燒錄、不留稽核（操作即被拒）。見 [error-handling.md#permission](../error-handling.md#permission)。
- **稽核寫入失敗不阻斷**：`LIFECYCLE_CHANGELOG_*` 寫入異常時不阻擋瀏覽，進補償佇列重試；稽核不可竄改（`AUDIT_IMMUTABLE`）見 [error-handling.md#audit](../error-handling.md#audit)。

## Related
- **循環子分類規則權威**: [F040](F040-lifecycle-subcategory.md)（查詢下拉選項；事件之循環名稱＝join `LIFECYCLE` 取當前值，非快照，見 F040 AC-34）
- Data: [LIFECYCLE](../data-model.md#lifecycle-entity)、[LIFECYCLE_NODE](../data-model.md#node-entity)、[LIFECYCLE_EDGE](../data-model.md#edge-entity)、[ICSOP_DOCUMENT](../data-model.md#document-entity)（掛載）、[AUDIT_LOG](../data-model.md#auditlog-entity)（`LIFECYCLE_CHANGELOG_*` 歸屬待架構師，見 OQ-E07-02）；**變更/快照實體（草案 `LIFECYCLE_CHANGE_LOG`、選採快照時另 `LIFECYCLE_SNAPSHOT`）為新實體、schema 待 system-architect（data-model 僅加指涉性註記，見 OQ-E07-05）**
- Depends on: [F008](F008-dag-node-edge.md)、[F009](F009-node-drawer-maintenance.md)（結構變更事件來源）、[F036](F036-lifecycle-tree-preview.md)（viewer/浮水印/`LIFECYCLE_*` 稽核家族基礎）、[F020](F020-watermark.md)（燒錄手法）、[F023](F023-audit-logging.md)（稽核機制）、[F024](F024-access-history-query.md)（查詢頁模式重用）、[F025](F025-role-function-matrix.md)（權限＝獨立功能列「文件變更歷程」，SysAdmin／ICSOPAdmin 唯讀、其餘無；OQ-E07-04 定案）、[F001](F001-auth-login-session.md)
- Related: 同區塊另一 tab [F037](F037-document-change-history.md)；下載燒錄手法參考 US-054（E06）
- Story: [US-063](../../stories/epics/E07-audit-trail/US-063-lifecycle-tree-change-history.md)
- NFR: [浮水印一致性](../nfr.md#watermark)（新舊樹狀圖下載為浮水印燒錄情境，涵蓋見 OQ-NFR007c）、[稽核與資料保留](../nfr.md#audit-retention)（保留政策見 OQ-NFR003）
- OQ: OQ-E07-05（DAG 儲存粒度＝diff/快照＋事件粒度＝逐動作/編輯階段聚合，待架構師）、OQ-E07-02（`LIFECYCLE_CHANGELOG_*` 併入 F036 `LIFECYCLE_*` 資料模型歸屬）、**OQ-E07-06（下載 PDF 排版；其「是否匯出」子題已於 2026-08-16 定案為「是」，排版子題維持原架構定案＝單一 PDF 兩頁）**、OQ-NFR003（保留期限）
- **2026-08-16 使用者裁決**: OQ-D18-16（匯出格式與範圍）、OQ-D18-17（兩 tab 各自匯出）、OQ-D18-19（本 tab 不支援節點雙擊）。見 [§循環樹狀圖 tab 匯出 delta](#export-delta)。#17（浮水印三層式）為 `BUG-IMPL`、不新增 AC（見檔頭加註）。
- **待 system-architect（本 delta 新增）**：匯出端點形狀（建議 `GET /admin/change-history/lifecycles/export`）；`watermarkLines()` 共用函式之落點（本 feature 之 `DiffBoard` 為其第三個消費者）。
- 已定案: OQ-E07-04（「文件變更歷程」為**獨立後台功能**，F025 新增獨立功能列；兩 tab 統一僅 SysAdmin／ICSOPAdmin 全公司唯讀、**主管對本 tab 亦無權**；覆蓋原「比照循環管理」草案）
- **待 system-architect**：DAG 變更之儲存粒度與事件邊界（OQ-E07-05）、變更/快照實體 schema、新舊樹狀圖重建與 diff 渲染、下載 PDF 排版。

## 待 system-architect（不在本 spec 敲定）
- 結構變更儲存法（結構化 diff 重放 vs 完整結構快照）與**事件/快照邊界**（逐原子操作 vs 編輯階段聚合）——OQ-E07-05。
- `LIFECYCLE_CHANGE_LOG`／`LIFECYCLE_SNAPSHOT` 是否新建、欄位結構、與 AUDIT_LOG／F036 `LIFECYCLE_*` 之歸屬關係。
- 新舊樹狀圖之重建演算法、並列/切換渲染、差異視覺標示、下載 PDF 排版（單一兩頁 vs 兩份）。
