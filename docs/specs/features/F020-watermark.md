# F020: 文件浮水印（網頁疊加＋下載/列印燒錄）
Priority: P0-MVP | Status: 部分（unit 綠；快照/稽核/端點完成；**CJK 燒錄字型已補**（@pdf-lib/fontkit + Noto Sans TC 嵌入，asciiSafe '□'→'?' bug 修正，見 implementation-log/F036-impl.md）；**<3s 燒錄計時已補 int 迴歸測試**（`test/int/watermark-burn-timing.itest.ts`，TS-HD-WM-001/002 取代 TS-F020-028 佔位；暖機後 10 頁 CJK 燒錄本機實測 ≈250ms ≪ 3s NFR，門檻設 8000ms 迴歸警戒線）；真實中文 PDF 視覺/位元組驗證仍 [integration]） | Last Updated: 2026-07-24
Epic/Story: E06 / US-053, US-054

> 合併理由：網頁檢視器（US-053）與下載/列印 PDF 燒錄（US-054）共用同一浮水印內容產生邏輯與稽核觸發，須格式完全一致。<br>📝 **2026-08-20 措辭更正（`OQ-D9-32`）**：原文為「網頁檢視器**疊加**（US-053）」——自本日起檢視器不再疊加 DOM 圖層，改由內容層燒錄承載，故「疊加」二字已移除；**US-053 之需求本體（使用者於檢視器看得到浮水印）未變**。
> **🟢 2026-08-11 restrictive delta（APPROVED，人類閘門通過）**：「業務」子分類之一般使用者，其檢視器／PDF 代理／下載／列印之**授權檢查層**須加入「使用部門相符」判斷。規則權威＝[F041](F041-user-subtype-business-scope.md)；**本 delta 之 AC 編號採 `AC-U#`**。⚠ 本 delta 影響的是**授權檢查層**（是否允許執行），**不改變浮水印內容產生層**——[NFR-007](../nfr.md#watermark) 之字串格式、欄位取值規則、三處一致性要求**完全不變**。
> **🔴 2026-08-16 CHANGE delta（使用者裁決；缺失／變更 delta 第 5b 項 ＋ 同日第二次閘門之 `OQ-D18-25`）——前台下載燒錄範圍擴張至附錄與使用表單**：前台文件詳情頁下載之 **PDF 格式附錄**與 **PDF 格式使用表單**自本日起**必須燒錄浮水印**（分別推翻 [F039](F039-appendix-management.md#front-burn-delta) 與 `OQ-E05-03`／[F018](F018-usage-form-management.md#front-burn-delta) 之既有定案，權威改寫落於各該檔；本檔為燒錄能力側之宣告）；非 PDF 格式維持原檔並於 UI 明示（策略 A）。**本 delta 之 AC 編號採 `AC-D#`**（D＝2026-08-16 defect delta）。
> 🛑 ~~**後台一律維持 RAW、不燒錄**——[F026](F026-role-field-matrix.md) 之 **OQ-FM-01 人類裁決（2026-07-24）於 2026-08-16 經再次確認為維持有效、不得推翻**；使用者已明確裁定「只做前台，後台維持 RAW」（缺失 delta 第 12／13／15 項**不做**）。前台/後台之分流以 **AC-D3** 之可觀測行為契約鎖定。~~<br>🔴 **本行已於 2026-08-20 由 `OQ-D9-08`（選項 B）全面推翻**（原文逐字保留於上，供追溯）。**現行定案＝後台下載一律燒錄浮水印、一律寫調閱稽核、無例外角色**（含 ICSOPAdmin，`OQ-D9-09` 選項 B＝不保留任何原始檔下載路徑）。權威見 [§後台燒錄範圍 delta](#backend-burn-delta)。**`AC-D3` 之「前台/後台分流」與 `AC-D4` 之「後台 RAW 回歸鎖定」已同步就地改寫。**
> 📌 **本 feature 自本日起明確為「跨路徑共用之燒錄能力」**，其消費者為：前台檢視器 VIEW／DOWNLOAD／PRINT（既有）、**前台文件詳情頁之附件下載**（ICSOP PDF・OJT，＝#5a，既有 AC 已涵蓋、屬 BUG-IMPL）、**前台文件詳情頁之附錄下載**（＝#5b，本 delta 新增）、**前台文件詳情頁之使用表單下載**（＝`OQ-D18-25`，同日第二次閘門新增；**其專屬端點 `GET /public/documents/:documentId/usage-forms/:formId/download` 由 [F018](F018-usage-form-management.md#front-burn-delta) `AC-D22` 定義**——⚠ 先前補記時曾假設沿用既有共用 route，該假設已於容器驗收證實不可行，見 `OQ-D18-33`）、[F036](F036-lifecycle-tree-preview.md) 樹狀圖下載/列印、[F038](F038-lifecycle-tree-change-history.md) 新舊樹狀圖下載。**不含任何後台路徑**。
> ✅ **前台燒錄範圍自此為一致之四路徑**（檢視器／附件／附錄／使用表單），**同一詳情頁上不再有「這個燒、那個不燒」之分歧**。
>
> ---
>
> **🔴 2026-08-20 D9 delta（缺失／變更 delta 9 項之第 1／2／3／4／5 項；來源 [stories/2026-08-20-defect-delta-9.md](../../stories/2026-08-20-defect-delta-9.md)，人類閘門逐題裁決見 [open-questions §D9](../open-questions.md#d9--2026-08-20-缺失變更-delta來源stories2026-08-20-defect-delta-9md)）——本 delta 之 AC 編號採 `AC-N#`**（N＝New delta 2026-08-20，與既有 `AC-D#`／`AC-E#`／`AC-U#` 批次區隔、不重號）。四個子題落於本檔：
> - **#1 浮水印顏色加深**（`OQ-D9-01`→選項 C：色值轉深＋提高不透明度，並訂量化目標；🔴 **原「≥ 3:1」門檻已於 2026-08-20 同日由使用者調整為「≥ 1.7:1」**，見 `OQ-D9-31`；`OQ-D9-02`→選項 B：**5 處全動**——⚠ 其中「前台檢視器疊加」一處已因 `OQ-D9-32` 整個移除，實際落地為 **4 處**，見 `AC-N2`）⇒ [§D9 浮水印呈現 delta](#d9-watermark-delta) `AC-N1`～`AC-N3`。
> - **#2 移除檢視器套件之下載／列印鈕（無浮水印漏洞）**（`OQ-D9-03`→選項 A：認定為**安全缺陷 BUG-IMPL**；`OQ-D9-04`→選項 A：改採 **pdf.js／react-pdf 自繪 canvas 渲染**取代 `<iframe>`，使用者已明確接受新增前端相依之代價；🔴 `OQ-D9-32`→**`/public/documents/:id/pdf` 改回傳已燒錄位元組**，且**前台檢視器之 DOM 疊加層一併移除** ⇒ 檢視器自此為**單層浮水印＝只靠 PDF 內容層燒錄**）⇒ `AC-N4`～`AC-N7` ＋ `AC-N66`～`AC-N68`。<br>🔴 **範圍界線（最易做錯，逐字遵守）**：「移除疊加層」**僅限前台檢視器 `PublicViewerPage`**；`ChangeHistoryPage` 與 `LifecycleTreePreviewPage` 兩處疊加層**必須保留**並照樣加深色值——該兩頁渲染的是 **HTML 而非 PDF、沒有內容層可燒錄，DOM 疊加層是其唯一浮水印載體**（`AC-N7` 負向／`AC-N66` 正向雙向斷言）。
> - **#4 縮放模糊**（`OQ-D9-05`→選項 A：與 #2 同批，同根因同一次架構變更）⇒ `AC-N8`／`AC-N9`。
> - **#3 浮水印公司簡稱**（`OQ-D9-06`→選項 A：**新增浮水印專用簡稱常數**，全稱三處消費點逐字不動，並訂 **INV-C2** 鎖定鍵集合恆等；`OQ-D9-07`→逐一提供字面：`AS`→`和潤企業`、`AE`→`和潤電能`）⇒ `AC-N10`～`AC-N13`。
> - 🔴 **#5 後台全面燒錄**（`OQ-D9-08`→**選項 B：全面推翻，四類皆燒錄**）⇒ [§後台燒錄範圍 delta](#backend-burn-delta) `AC-N14`～`AC-N21`。
>
> **🔴 2026-08-20 同日第二輪（spec-writer 提報之 `OQ-D9-28`～`OQ-D9-33` 六題已全數裁決；AC 編號沿用 `AC-N#` 接續 `AC-N65` 往下編）**：`OQ-D9-31`（**使用者**）＝**推翻 spec-writer 定稿之 3:1 門檻，降為 ≥ 1.7:1、定稿值 `#334155` @ `opacity 0.30`**（`AC-N1`／`AC-N2` 已就地改寫，原值逐字保留）｜`OQ-D9-32`（**使用者**）＝**半採納半推翻**——`/pdf` 改燒錄（採納）、**DOM 疊加層移除**（推翻原「雙層保留」；`AC-N7` 已反轉）｜`OQ-D9-33`（lead）＝採納原案，`AC-N20` 之 `[ASSUMPTION]` 已解除。
> 🔴 **本 delta 推翻 `OQ-FM-01`（2026-07-24）與 `OQ-D18-01`（2026-08-16）**：「後台維持 RAW、不接線 PdfBurner」之定案**自 2026-08-20 起正式失效**。本檔上方兩行「後台一律維持 RAW」之宣告與 `AC-D3`／`AC-D4`／`AC-D7` ④ 皆已就地改寫，**被推翻之原條文逐字保留供追溯**。
> 📌 **「跨路徑共用之燒錄能力」之消費者自本日起擴為前後台全部下載路徑**（見 [§後台燒錄範圍 delta](#backend-burn-delta) 之端點清單）。
> **🔴 2026-08-27 UX delta（使用者裁決；三項之第 ① 項）——全域浮水印格式文字「顏色淡一點點、字放大一點點」**：色值 `#334155`（slate-700）→ **`#475569`**（slate-600）；DOM 疊加字級 `14px` → **`16px`**；後端燒錄字級 `12pt` → **`14pt`**（連帶 `WATERMARK_LINE_STEP` `24` → **`28`**、`WATERMARK_TILE_STEP_Y` `198` → **`208`**）；`prototypes/05` canvas `WM_FONT_SIZE` `14` → **`16`**（`WM_LINE_STEP` `28` → **`32`**、`stepY` `144` → **`154`**）。**不透明度 `0.30`、行高倍數 `2`、字串格式／欄位順序／三層式結構一律不變。** 對比度隨之由 ≈1.716 降為 ≈**1.613** ⇒ `AC-N1` 門檻依該條既有明文由 `1.70` **下修為 `1.60`**。⚠ **本輪未新增 AC 編號**——全部以**就地改寫**落在既有 `AC-N1`／`AC-N2`／`AC-T2`／`AC-T4` 上（舊值一律以 `OLD>` 保留）。同日之另兩項裁決（樹狀圖疊加層滿版、直排節點換欄方向）屬 [F036](F036-lifecycle-tree-preview.md#ux-20260827-delta) `AC-T50`／`AC-T51`。
> **🔴 2026-08-21 CHANGE delta（使用者裁決；三項裁決第 1 項）——全域三行式浮水印加大行高**：**四個載體之行距比一律為 `2.0`**——前端 DOM 疊加層 `line-height` ＝ `2.0`；後端 PDF 燒錄每行位移 ＝ `WATERMARK_FONT_SIZE(12) × WATERMARK_LINE_HEIGHT(2)` ＝ **`24`**、平鋪 `stepY` `180` → **`198`**（同日第三輪裁決，`OQ-T3-01` 選項 (c) ＋ `OQ-T3-02`；📝 OLD> 第一輪之 `size + 8`＝`20` 已作廢，它只有 1.667 倍）。**本 delta 之 AC 編號採 `AC-T#`**（`AC-T1`～`AC-T5`），權威見 [§三行式浮水印行高 delta](#line-height-delta)。⚠ **色值／不透明度／字串格式／三層式結構一律不變**——本輪只動行距與其連動之平鋪間距。

## Description
🔴 **2026-08-20 就地改寫（`OQ-D9-32`，使用者裁決）**：使用者於網頁檢視器開啟文件時，**其所見之 PDF 位元組已於伺服器端燒錄浮水印**（`AC-N6`），檢視器**不再疊加任何 DOM 浮水印圖層**（`AC-N7`）；下載/列印時同樣於伺服器端將浮水印**燒錄**進 PDF 內容層。<br>📝 **被推翻之原條文逐字保留供追溯**：「使用者於網頁檢視器開啟文件時疊加浮水印；下載/列印時於伺服器端將浮水印**燒錄**進 PDF 內容層。」<br>⚠ **僅前台檢視器改為單層**；[F036](F036-lifecycle-tree-preview.md) 樹狀圖預覽與 [F037](F037-document-change-history.md)／[F038](F038-lifecycle-tree-change-history.md) 變更歷程之 DOM 疊加層**維持不變**（`AC-N66`）。浮水印格式（權威，[NFR-007](../nfr.md#watermark)）：`{員工編號}-{姓名}-{公司名稱}-{部門}-{處/室}-{僅供內部使用非經許可不得複製翻印或轉製成其他形式呈現}-{當下時間}`，由伺服器端當下動態產生；其中「僅供內部使用非經許可不得複製翻印或轉製成其他形式呈現」為固定機密聲明字串（非變數）；於檢視器疊加與 PDF 燒錄呈現時，該機密聲明**另起一行**（獨立一行）顯示，惟線性稽核快照字串之欄位順序不變。三種操作（查看/下載/列印）皆觸發稽核（F023）。

## 浮水印欄位取值規則（契約 §8，定案 2026-07-20）

| 欄位 | 取值規則 |
|---|---|
| 員工編號 | 該登入帳號（`USERID`）對應之 `EMPNO`。一人多帳號時各帳號各自呈現其 `EMPNO`，屬預期行為 |
| 姓名 | `USERNM` |
| **公司名稱** | 🔴 **2026-08-20 就地改寫（`OQ-D9-06` 選項 A／`OQ-D9-07`）＝浮水印專用簡稱** `COMPANY_SHORT_NAMES[COMPID]`（`AS`→`和潤企業`、`AE`→`和潤電能`）。<br>📝 **被推翻之原條文逐字保留供追溯**：「`VW_HRCOMF.COMPFULLNM` **全稱**（例：**和潤企業股份有限公司**，非簡稱「和潤企業」）」。<br>⚠ **推翻範圍嚴格限於浮水印**：帳號管理公司下拉／`GET /companies`／[F024](F024-access-history-query.md) 調閱稽核公司欄**三處仍用全稱、逐字不動**（`AC-N13` 回歸鎖定）。 |
| **部門** | 由使用者部門代碼推導之**部層**（`LEFT(CODE,2)+'000'`）之 `DESC_FULL`（如「營運管理部」）。**Fallback**：若無部層 → 取本部層 `DESC_FULL`；再無 → Root |
| **處/室** | 使用者所屬部門 `DESC_CHI` 之**最末段**（以 `/` 切分後取最後一段），即**最細單位**名稱 |
| 固定機密聲明 | 固定字串（非變數），呈現時另起一行 |
| 當下時間 | 伺服器端動態產生 |

### 「處/室」欄之單一規則（契約 §8.3）
上游組織實為 5 層（多出「課」層），浮水印格式僅有「部門」「處/室」兩欄。定案採**單一規則、無特例**：一律取使用者所屬之**最細單位**名稱。
- 處/室層使用者（實測 854 人，77%）→ 顯示室名（如「審查室」）
- 課層使用者（實測 166 人，15%）→ 顯示**課名**（如「醫療一課」），略過中間的處層（如「北區綜合處」）

取值來源為 `DESC_CHI` 而非 `DESC_FULL`：`DESC_FULL` 為串接全名（「營運管理部審查室」）無分隔符不可拆；`DESC_CHI` 以 `/` 明確分段（「營管部/審查室」→「審查室」）。

### 🔴 無下層者之分隔符收合（契約 §8.4）
掛於部層（84 人）、本部層（8 人）、Root（2 人）者，共 **94 人（8.4%）** 無處/室：

- **「處/室」欄留空，並自動收合分隔符**，呈現為
  `{員工編號}-{姓名}-{公司名稱}-{部門}-{固定機密聲明}-{當下時間}`
- **不得出現連續分隔符**（如 `…-營運管理部--僅供內部使用…`）。
- 🔴 **2026-08-20 就地改寫（`OQ-D9-32`）**：**PDF 燒錄（含檢視器所見之位元組）與稽核快照必須套用同一收合規則**，確保 [NFR-007](../nfr.md#watermark) 之字串一致性不被破壞。<br>📝 **被推翻之原條文逐字保留供追溯**：「**檢視器疊加、PDF 燒錄、稽核快照三者必須套用同一收合規則**」——「檢視器疊加」已不存在（`AC-N7`），其角色由「檢視器所見之已燒錄位元組」承接，**收合規則本身一字未改**。<br>⚠ [F036](F036-lifecycle-tree-preview.md)／[F038](F038-lifecycle-tree-change-history.md) 之樹狀圖疊加仍為第三個必須套用同一規則之載體（`AC-N66`）。

## Preconditions
- 使用者已登入（F001）；文件已有 ICSOP PDF（F016）；身分/部門/公司資料來自 F004 同步結果。

## Main Flow
1. 讀取當下登入身分與伺服器時間，依上述取值規則（含部層推導、`DESC_CHI` 最末段擷取、空欄收合）組裝浮水印快照；**該快照為 PDF 燒錄（含檢視器所見位元組）、樹狀圖疊加、稽核紀錄之唯一共同來源**。<br>📝 **2026-08-20 就地改寫（`OQ-D9-32`）**，原文逐字保留：「**該快照為檢視器疊加、PDF 燒錄、稽核紀錄之唯一共同來源**」。
2. 網頁檢視（VIEW）：🔴 **2026-08-20 就地改寫（`OQ-D9-32`）**——回傳**已燒錄浮水印之 PDF 位元組**供前端自繪渲染（`AC-N6`），**不疊加任何 DOM 圖層**（`AC-N7`），亦不提供「另存無浮水印原檔」途徑。<br>📝 **被推翻之原條文逐字保留供追溯**：「網頁檢視（VIEW）：回傳疊加浮水印圖層之預覽，不提供「另存無浮水印原檔」途徑。」
3. 下載/列印（DOWNLOAD/PRINT）：取原始 PDF → 伺服器端以 PDF 處理套件燒錄浮水印文字圖層 → 回傳檔案（浮水印內嵌內容層）。
4. 以同一份身分/時間快照寫入稽核（F023），操作類型明確區分 VIEW/DOWNLOAD/PRINT。

## Alternative Flows
- 列印與下載技術上可共用同一份已燒錄 PDF，但稽核仍須區分兩種操作類型。

## Edge Cases
- **使用者掛於部層／本部層／Root（無下層，實測 94 人／8.4%）**：「處/室」欄留空並收合分隔符，浮水印字串不得出現連續分隔符。
- **使用者掛於課層（實測 166 人／15%）**：「處/室」欄顯示課名（最細單位），略過中間處層。
- 使用者部門查無部層上層（實測 57 個處/室中有 1 筆查無）：依 fallback 取本部層 `DESC_FULL`；再無則取 Root。
- 使用者為孤兒帳號（`DEPTID` 於部門主檔查無）：「部門」與「處/室」皆留空並收合分隔符，不得顯示原始代碼或 `null`。
- 一人多帳號：以當次登入之 `USERID` 對應之 `EMPNO` 呈現，不同帳號浮水印之員工編號可能不同，屬預期行為。
- 同使用者相隔時間兩次開啟同文件：時間戳記不同（各自當下伺服器時間）。
- 未登入直接存取檢視器/下載網址：拒絕並導回登入頁。
- 開發工具移除浮水印 DOM：屬 NFR-007 已知限制，非本 feature 完全防禦範圍。<br>🔴 **2026-08-20 範圍縮減（`OQ-D9-32`）**：本項自本日起**不再適用於前台文件檢視器**——該頁已無 DOM 疊加層，浮水印存在於 **PDF 內容層**，開發工具移不掉。本項**僅餘**適用於 [F036](F036-lifecycle-tree-preview.md) 樹狀圖預覽與 [F037](F037-document-change-history.md)／[F038](F038-lifecycle-tree-change-history.md) 變更歷程之 HTML 疊加（該三頁無內容層可燒錄，見 `AC-N66`）。
- 未授權角色直接呼叫下載 API：依 F025 拒絕。

## Postconditions
- 取得之檔案脫離系統後浮水印仍存在；稽核內容與浮水印一致。

## Acceptance Criteria
- 🛑 ~~Given 一般使用者開啟文件, When 檢視器載入, Then 疊加浮水印顯示員工編號/姓名/公司名稱/部門/處室/固定機密聲明/時間（伺服器端動態產生，格式見上）。~~<br>🔴 **2026-08-20 由 `OQ-D9-32`（使用者裁決）推翻並就地改寫，原條文逐字保留於左供追溯**：Given 一般使用者開啟文件, When 檢視器載入, Then 其所見之 PDF **內容層**已燒錄浮水印，顯示員工編號/姓名/公司名稱/部門/處室/固定機密聲明/時間（伺服器端動態產生，格式見上）；**頁面 DOM 中不存在任何浮水印疊加層**（`AC-N7`）。<br>🔴 **本條原載體（`data-testid="watermark-overlay"`／`watermark-text` 之 DOM 斷言）自本日起失效**；**新載體＝ `AC-N6` 之 `PdfBurner.burnPdf` spy 斷言 ＋ `AC-N67` 之頁尾格式字幕斷言**。⚠ **既有測試須就地改寫為新行為之背書、不得刪除**。
- Given 相隔時間兩次開啟同文件, When 各自產生浮水印, Then 時間戳記不同。
- Given 使用者下載文件, When 下載完成, Then PDF 內容層已燒錄浮水印（非僅前端疊加）。
- Given 使用者列印, When 產生列印用 PDF, Then 內容層同樣已燒錄浮水印。
- Given 查看/下載/列印各操作, When 完成, Then 各自記錄對應類型稽核，且與浮水印內容一致。
- Given 未登入使用者存取檢視器網址, When 請求, Then 拒絕並導回登入頁。
- Given 未授權角色呼叫下載 API, When 請求, Then 依 F025 拒絕。
- 🛑 ~~Given 使用者所屬公司為 AS, When 產生浮水印, Then 公司名稱顯示 `COMPFULLNM` 全稱「和潤企業股份有限公司」，非簡稱。~~ → 🔴 **2026-08-20 由 `OQ-D9-06`／`OQ-D9-07` 推翻，就地改寫**：Given 使用者所屬公司為 `AS`, When 產生浮水印, Then 公司名稱欄逐字為 **`和潤企業`**（浮水印專用簡稱，見 `AC-N10`～`AC-N12`）。原條文逐字保留於左供追溯。
- Given 使用者部門代碼為 `JAC00`（處室層）, When 產生浮水印, Then 「部門」為部層 `JA000` 之 `DESC_FULL`（營運管理部）、「處/室」為 `DESC_CHI` 最末段（審查室）。
- Given 使用者部門代碼為 `BJAA0`（課層）, When 產生浮水印, Then 「處/室」顯示課名（醫療一課），不顯示中間處層名稱。
- Given 使用者掛於部層或本部層（無下層）, When 產生浮水印, Then 「處/室」欄留空且分隔符自動收合，浮水印字串中不存在連續分隔符。
- 🛑 ~~Given 同一無下層使用者同時執行查看/下載/列印, When 三者各自產生浮水印, Then 檢視器疊加、PDF 燒錄內容層、稽核快照三者之收合後字串完全一致（僅時間戳記依當下產生）。~~<br>🔴 **2026-08-20 由 `OQ-D9-32` 推翻並就地改寫，原條文逐字保留於左供追溯**：Given 同一無下層使用者同時執行查看/下載/列印, When 三者各自產生浮水印, Then **PDF 燒錄內容層（三種操作皆是）與稽核快照**之收合後字串完全一致（僅時間戳記依當下產生）。<br>📌 **「三者一致」之第三方由「檢視器疊加」換為「檢視（VIEW）路徑之已燒錄位元組」**——比對對象數量未變，**收合規則與字串格式一字未改**；本條之驗證載體由「DOM 文字 vs 燒錄字串」改為「三次 `buildWatermarkSnapshot` 輸出逐字相等」，仍為純函式可測。
- Given 使用者部門無對應部層, When 產生浮水印, Then 「部門」依 fallback 取本部層 `DESC_FULL`。

### 業務子分類授權檢查 delta（🟢 APPROVED 2026-08-11 人類閘門通過；規則權威＝[F041](F041-user-subtype-business-scope.md)）

> 前提選項均經 2026-08-11 人類裁決確認：**OQ-E08-06→C**（檢視器／下載列印本輪納入收斂）、**OQ-E06-04→A**（後端服務層權威）、**OQ-E08-10→A**（不記錄拒絕稽核）、**OQ-E06-03→A**（拒絕回 404）。
> 逐題裁決結果與未採選項之追溯見 [F041 §OQ 裁決紀錄](F041-user-subtype-business-scope.md#oq-dependency)。
> **本 delta 之作用點＝授權檢查層**（`WatermarkService` 之 `view`／`getOriginalPdf`／`download`／`print` 四個入口，
> 於取得原始 PDF **之前**），**非**浮水印內容產生層——既有 `buildWatermarkSnapshot` 純函式與其全部 AC 完全不動。

- **AC-U1**：Given 業務子分類之一般使用者（`roleCode='User'`、`userSubtype='business'`、`orgCode='JAC00'`）嘗試開啟一筆已公告但使用部門不相符（如 `usingDeptIds=['JAD00']`）之文件檢視器（`view`）或 PDF 代理（`getOriginalPdf`）, When 請求送出, Then 拒絕；**不組裝浮水印快照**（`buildSnapshot` 所依賴之組織查找 spy 呼叫次數為 0）、**不回傳文件編號／書名**、**不回傳任何 PDF 位元組**。〔[F041](F041-user-subtype-business-scope.md) AC-25〕
- **AC-U2**：Given 同上使用者嘗試 `download` 或 `print`, When 請求送出, Then 拒絕；`WatermarkPdfSource.getOriginalPdf` 之 spy **呼叫次數為 0**（不從 Blob 取回原始位元組）、`PdfBurner.burnPdf` 之 spy **呼叫次數為 0**（不產生任何燒錄浮水印之檔案位元組）。〔[F041](F041-user-subtype-business-scope.md) AC-26〕
- **AC-U3**：Given AC-U1／AC-U2 之拒絕路徑, When 檢視稽核, Then **未寫入任何 `VIEW`／`DOWNLOAD`／`PRINT` 成功事件**（調閱事實未發生），且 **`AuditWriter` 完全未被呼叫**（✅ OQ-E08-10 定案為選項 A＝不新增拒絕稽核事件）。**本 feature 因此完全不觸及稽核子系統**：`AUDIT_LOG` 不動、[F023](F023-audit-logging.md)／[F024](F024-access-history-query.md) 皆不需 AC delta。〔[F041](F041-user-subtype-business-scope.md) AC-27／AC-28〕
- **AC-U4**（**回歸鎖定**）：Given 業務子分類使用者存取**使用部門相符**之文件、或任一「其他」子分類／非 `'User'` 角色之使用者存取任一已公告文件, When 執行 `view`／`download`／`print`, Then 三者行為與本 delta 導入前**完全一致**——浮水印快照字串逐字相同（僅時間戳記依當下產生）、燒錄位元組正常產生、三類稽核各寫入一筆；既有 `watermark.service.spec.ts`／`watermark.spec.ts` 之全部案例維持綠燈，**不得修改任何既有期望值**。〔[F041](F041-user-subtype-business-scope.md) AC-29〕
- **AC-U5**（**後端權威**）：Given 測試**直接呼叫 `WatermarkService` 之四個方法**（繞過 controller 與前端）、viewer 為業務子分類且文件不相符, When 呼叫, Then 仍被拒絕——授權檢查位於**服務層**，前端不顯示連結僅為體驗優化、不構成防護（沿用 [F026](F026-role-field-matrix.md) Technical Notes 既有原則，OQ-E06-04 選項 A）。〔[F041](F041-user-subtype-business-scope.md) AC-30〕

### 前台下載燒錄範圍擴張 delta（🔴 2026-08-16 使用者裁決；缺失／變更 delta 第 5a／5b／6／7 項） {#front-burn-scope-delta}

> 前提裁決：**OQ-D18-01**→只做前台、後台維持 RAW（OQ-FM-01 維持有效）；**OQ-D18-02**→策略 A（僅 PDF 燒錄，非 PDF 維持原檔且 UI 明示）；**OQ-D18-03**→前台燒錄後**仍寫調閱稽核**（比照前台既有慣例，[F039](F039-appendix-management.md) AC-27／[F018](F018-usage-form-management.md) `AC-D14` 不變）；**OQ-D18-04**→analyst 建議之「讓共用端點具備燒錄能力」**已由 lead 推翻**，改採**前台/後台路徑分流**（分流之技術方案由 system-architect 決定，本檔僅鎖定可觀測行為）；**OQ-D18-25**（同日第二次閘門）→**前台使用表單之 PDF 亦燒錄**，推翻 `OQ-E05-03`。
> 📌 **本節之「前台附屬檔案」一詞，統指前台文件詳情頁上之三類檔案：附件（ICSOP PDF・OJT）、附錄、使用表單**——三者於燒錄與 UI 明示上規則完全一致，不再分歧。

#### 📌 加註（不新增 AC，指向既有 AC）

- **#5a 前台詳情頁「附件」下載繞過燒錄＝`BUG-IMPL`**：`prototypes/04-public-document-detail.html:105` 逐字「ICSOP PDF · **檢視/下載將燒錄浮水印**」，本檔既有 AC「**Given 使用者下載文件, When 下載完成, Then PDF 內容層已燒錄浮水印（非僅前端疊加）**」**已完整涵蓋**前台詳情頁之附件（ICSOP PDF／OJT）下載路徑。實作改走短效期 SAS 原檔 URL 而繞過燒錄，屬**缺陷**，**不新增 AC**——新增只會製造兩份權威。
- **#6 中文亂碼（PDF 燒錄之 CJK 字型缺失）＝`BUG-IMPL`**：使用者已確認外觀為「**中文全變 `?`**」（OQ-D18-24），根因＝`backend/Dockerfile` 未 COPY `assets/`（build 與 runtime 兩 stage 皆無），致 `loadCjkFontBytes()` 於容器內回 `null` 而退化為 `StandardFonts.Helvetica` → `asciiSafe`。**屬部署層缺陷，不新增 AC**；既有 AC「PDF 內容層已燒錄浮水印（格式權威同 [NFR-007](../nfr.md#watermark)）」即涵蓋「浮水印字串須與規格逐字相同」之要求。⚠ **單元測試恆綠（ts-jest 以 repo 根執行，`existsSync` 恆真），驗證必須在容器內實跑**。同一根因亦劣化 [F036](F036-lifecycle-tree-preview.md) 樹狀圖 PDF 與 [F038](F038-lifecycle-tree-change-history.md) 新舊樹狀圖 PDF。<br>📌 **`ICSOP_REQUIRE_CJK_FONT` 之值語意（2026-08-16 補訂，ringA 提報）**：該旗標採 **fail-safe 讀法**——**唯有值恰為字串 `'false'` 時方為關閉**；未設定、空字串、`'0'`、`'no'`、大小寫變體（`'False'`／`'FALSE'`）或任何其他值**一律視為開啟**（即要求 CJK 字型必須可載入，否則 fail-fast）。理由：本旗標之作用是**防止再次靜默退化為 `?` 亂碼**，其預設必須是嚴格側；「拼錯環境變數值就悄悄關掉保護」正是本 delta 第 6 項所修之同類錯誤。
- **#7 三層式浮水印與欄位不完整＝`BUG-IMPL`**：三層式（①身分資料列 ②固定機密聲明 ③時間戳）已於 `prototypes/05-public-viewer-watermark.html:110` 與本檔 Description「該機密聲明**另起一行**（獨立一行）顯示」明確定義，**不新增 AC**。欄位不完整（無姓名／員工編號）之處置依 **OQ-D18-14**：姓名為 [F003](F003-account-role-management.md) `AC-P` 必填，為空即屬資料/同步缺陷須修；**員工編號對手動帳號可能天然為空，維持 §8.4「留空並收合分隔符」規則、不以 `loginId` 頂替**（頂替會產生看似員工編號實則不是的值，反而傷害追溯可信度）。已存在正確參考實作（`LifecycleTreePreviewPage` 之 `watermarkLines()`），修法應**抽為共用函式**，而非再寫第三、第四份。<br>🔴 **2026-08-20 消費者清單就地更正（`OQ-D9-32`）**：原文為「供**三處消費**（viewer／tree preview／change-history diff）」——**viewer 已於本日移除其 DOM 疊加層（`AC-N7`），不再是消費者** ⇒ 前端之 `watermarkLines()` 現為**兩處消費**（tree preview／change-history diff）。<br>🔴 **三層式呈現契約本身未被推翻，但其於檢視器路徑之載體已轉移**：檢視器之三層式改由**後端燒錄側**承載——`backend/src/public/pdf-burner.ts` 之 **`toDisplayLines(snapshot)`**（燒錄行拆分）即為新載體，其輸出行數與內容須與前端 `watermarkLines()` 逐行相同（`AC-N68`）。

#### 新增 AC

- **AC-D1**（前台附屬檔案之 PDF 燒錄）：Given 一般使用者於**前台**文件詳情頁下載一份 `format = pdf` 之**附錄**或**使用表單**, When 下載完成, Then 回應之檔案位元組其 **PDF 內容層已燒錄浮水印**（非僅前端疊加），其浮水印字串、欄位順序、收合規則與機密聲明另起一行之呈現，與本 feature 之檢視器／下載路徑**完全一致**（格式權威同 [NFR-007](../nfr.md#watermark)）。<br>🔴 **本條推翻兩處既有定案**：① [F039](F039-appendix-management.md) AC-29「未疊加或燒錄浮水印（已定案）」、F039 §下載浮水印、F039 端點表（附錄側）；② `OQ-E05-03`「使用表單暫不燒錄浮水印」（使用表單側，`OQ-D18-25` 同日第二次閘門）。**推翻範圍嚴格限於前台路徑**。權威改寫分別落於 [F039 §front-burn-delta](F039-appendix-management.md#front-burn-delta) 與 [F018 §front-burn-delta](F018-usage-form-management.md#front-burn-delta)，本條為燒錄能力側之對應宣告。
- **AC-D2**（策略 A：非 PDF 不燒錄且 UI 明示）：Given 某**附件、附錄或使用表單**之格式**非 PDF**（`xlsx`／`xls`／`jpg`／`png`）, When 於**前台**文件詳情頁下載, Then 回應為**原始檔位元組、未經任何浮水印處理**（不轉檔、不失真）；且 When 渲染該檔案所在之清單列, Then 該列顯示逐字文案 **`此格式不支援浮水印`**（`queryByText('此格式不支援浮水印')` 於該列內可命中）；PDF 格式之列**不得**出現該文案。**三類檔案（附件／附錄／使用表單）適用同一規則、同一文案，不得分歧。**
- **AC-D3**（🔴 前台/後台分流之可觀測行為契約；**🛑 2026-08-20 由 `OQ-D9-08` 選項 B 就地推翻**）：<br>🛑 ~~Given **同一份** PDF 檔案（同一 `blobPath`；可為 ICSOP PDF、OJT、**附錄**或**使用表單**）, When 由**前台**文件詳情頁下載, Then 取得**已燒錄浮水印**之位元組；When 由**後台**下載（ICSOP 文件管理清單「檔案」欄／後台唯讀詳情／編輯頁／**附錄管理頁**個別下載／**使用表單管理頁**個別下載）, Then 取得**原始檔（RAW）位元組、未燒錄浮水印**，且兩者之位元組**不相等**。~~（原條文逐字保留供追溯）<br>🔴 **現行條文（2026-08-20 起）**：Given **同一份** `format = pdf` 之檔案（同一 `blobPath`；可為 ICSOP PDF、OJT、附錄或使用表單）, When 由**前台**文件詳情頁下載、或由**後台任一畫面**下載, Then **兩者皆取得已燒錄浮水印之位元組**；兩者之浮水印字串各自反映**該次操作者本人**之身分快照（`AC-N18`），故位元組通常不相等，惟**「前台燒、後台不燒」之分流語意已不存在**。**端點分流本身（`/public/...` 前台命名空間 vs 後台既有路徑）維持不變**——分流之理由自本日起僅剩「F041 可見性檢查與稽核 `targetType` 落值不同」，不再是「燒不燒」。<br>📌 **本條刻意只規範可觀測行為、不綁定端點實作方式**——前台/後台如何分流（獨立端點、端點參數、或呼叫端上下文判定）由 **system-architect** 決定。<br>⚠ **不得**採用「讓既有共用端點 `GET /documents/attachments/download` 一律具備燒錄能力」之作法：該端點之呼叫端**同時含後台三頁與前台詳情頁**，直接改造將使後台亦被燒錄，違反 OQ-FM-01。
- **AC-D3a**（🔴 **前台一律代理串流，非 PDF 亦然**——刻意之傳輸模式例外；2026-08-16 lead 裁定採 architect 方案）：Given 一般使用者於**前台**文件詳情頁下載**任一**附件／附錄／使用表單（**含 `xlsx`／`xls`／`jpg`／`png` 等非 PDF**）, When 請求送出, Then 回應之 body 為**由應用層代理回傳之檔案位元組本身**，**不得**為短效期 SAS URL、不得為 3xx 轉址至 Blob（`Content-Type` 為該檔之 MIME、`Content-Disposition: attachment`，回應 body 之位元組即 `AC-D2` 所斷言之原始檔位元組）。When 由**後台**下載同一檔案, Then 回應之 body **同為代理回傳之檔案位元組**（`Content-Type` 為該檔之 MIME、`Content-Disposition: attachment` 且檔名為**上傳時之原始檔名**），差別僅在**不燒錄浮水印、不寫調閱稽核**（`AC-D4`）。<br>🔴 **2026-08-17 修訂（使用者裁決；缺失修正第 5／6 項）**：本子句原文為「維持**既有 SAS 核發**（伺服器不經手位元組）」，該作法**已於線上失效**——前端 `window.open(sasUrl)` 是對 `*.blob.core.windows.net` 的 top-level 導覽，Chrome Safe Browsing 對該網域出示**「偵測到危險網站」紅底攔截頁**，使用者根本下載不到檔案。原措辭之兩條理由（稽核可靠性、燒錄分支一致性）**本就只對前台成立**，故後台側從未被它們保護；而「省頻寬／伺服器不經手位元組」的考量在此站不住：**全體員工走的前台早已代理同一批檔案**，僅四種後台角色使用的路徑改走代理，負載嚴格更低。<br>📌 **順帶關閉之第二個缺陷**：SAS 直連時瀏覽器只看得到 blobPath 末段，而該段是 `randomUUID()`（見 `buildAttachmentBlobPath`／`buildFormBlobPath`／`buildAppendixBlobPath`）⇒ 使用者存到的是 `<uuid>.pdf`，原始檔名整個丟失。代理串流以 `Content-Disposition` 帶回原始檔名（含中文，RFC 5987 編碼）。<br>📌 **涵蓋之四條後台端點**（全部改為代理串流，**無一例外**——留任何一條就是留一個仍會跳攔截頁的入口）：`GET /documents/attachments/download`、`GET /documents/:documentId/usage-forms/:formId/download`、`GET /admin/usage-forms/:formId/download`、`GET /admin/appendices/:appendixId/download`。<br>🔒 **`AC-D4` 之後台 RAW 硬邊界完全未動**：四條端點一律不呼叫 `burnIfPdf`、`burnPdf` spy 恆為 0、不寫任何調閱稽核——**本修訂只換傳輸方式，不碰內容與稽核**。<br>📌 **本條為 architecture-spec §5.2「非浮水印檔案走 SAS Token」之刻意例外**（自 2026-08-17 起適用於**前後台兩側**），日後**不得**以「與 §5.2 不一致」為由改回 SAS。兩項理由（缺一不可）：<br>① **稽核可靠性**：SAS 直連時實際下載發生於 Blob 端，應用層無從確知是否成功——前台之調閱稽核義務（`AC-D5`／[F039](F039-appendix-management.md) AC-27／[F018](F018-usage-form-management.md) `AC-D14`）會退化為「核發了 URL」而非「檔案確實被取得」，追溯鏈失真。<br>② **分支一致性**：一律代理，「PDF 燒錄／非 PDF 原檔」才能在**同一個處理器內**依同一份伺服器端事實（`format`／副檔名，見 architecture-spec §10.3）一致決定；混合模式（PDF 代理、非 PDF 走 SAS）會使該判定分裂於兩條傳輸路徑，日後白名單擴充時必然漂移。<br>⚠ **前端觸發方式（前後台皆適用）**：因回應為 binary stream，前端**不得**以 `window.open(url)` 或 `<a href>` 觸發（top-level navigation 送 `Accept: text/html` 會撞 SPA fallback，使用者將下載到副檔名為 `.pdf` 但內容是 app shell 的檔案——本專案 2026-07-25 瀏覽器煙霧測試已踩過同型 bug）；須以 `fetch` 取 Blob 後程式化觸發下載（`frontend/src/api/download-blob.ts` 之 `downloadViaBlob`）。實作細節見 architecture-spec §10.1。<br>📌 **兩個禁令、同一結論**：`window.open` 在**前台**會撞 SPA fallback（拿到 app shell），在**後台**（2026-08-17 修訂前）會撞 Safe Browsing 攔截頁；代理串流 ＋ `downloadViaBlob` 同時消滅兩者。
- **AC-D4**（🛑 **已於 2026-08-20 由 `OQ-D9-08` 選項 B 全面推翻並反轉，就地改寫為 `AC-N14`～`AC-N17`**）：<br>🛑 ~~（🔒 後台 RAW 回歸鎖定；OQ-FM-01 維持有效）Given 本 delta 實作完成, When 以任一角色（含 ICSOPAdmin／SysAdmin／Supervisor／DeptContact）自**任一後台畫面**下載 ICSOP PDF／OJT／**使用表單**／**附錄**, Then 一律取得**原始檔位元組**、`PdfBurner.burnPdf` 之 spy **呼叫次數為 0**、且**不寫入任何調閱稽核**；[F026](F026-role-field-matrix.md) 之後台 RAW 語意與 `field-matrix-test-design.md` 之「不具備燒錄能力」基準線**維持有效、不得反向重寫**。⚠ **本條為本批兩次裁決之共同硬邊界**：前台燒錄範圍雖兩度擴大（附錄 → 使用表單），**後台側始終一格未動**。~~（原條文逐字保留供追溯）<br>🔴 **本條之期望值自 2026-08-20 起完全反轉**：後台一律燒錄、一律寫稽核、`burnPdf` spy 對 PDF 恆為 **1**（非 0）。**「不具備燒錄能力」之基準線（`docs/specs/test-design/field-matrix-test-design.md` `TS-FM-001`／`TS-FM-002`）已失去有效性，必須反向重寫**——該文件原標註之「不得反向重寫」隨本裁決一併失效。現行條文見 [§後台燒錄範圍 delta](#backend-burn-delta) `AC-N14`～`AC-N17`。
- **AC-D5**（前台燒錄後仍寫稽核；OQ-D18-03）：Given AC-D1 之前台下載成功（含燒錄）, When 檢視稽核, Then 各該 feature 之既有稽核 AC **完全不變**——附錄側為 [F039](F039-appendix-management.md) AC-27（`targetType='APPENDIX'`／`actionType='DOWNLOAD'`／`appendixId`＋`documentId` 落列）、使用表單側為 [F018](F018-usage-form-management.md) `AC-D14`（`targetType='USAGE_FORM'`／`formId` 落列）；**燒錄與否不改變稽核義務**。非 PDF 之前台下載（AC-D2）**同樣寫入該筆稽核**。<br>📌 **`AUDIT_LOG.watermarkSnapshot` 之落值規則**：已燒錄（PDF）→ 落值且與該次浮水印逐字相同；未燒錄（非 PDF）→ `null`。見 [data-model AUDIT_LOG](../data-model.md#auditlog-entity)。
- **AC-D6**（🔴 **共用附件下載端點之閘門收斂**；2026-08-16 lead 裁定，關閉既有資安缺口 `OQ-D18-A1`）：Given 前台已改走專屬燒錄路徑（`AC-D3`）後，共用端點 `GET /documents/attachments/download` 僅剩後台三頁（ICSOP 文件管理清單／後台唯讀詳情／編輯頁）為呼叫端, When 以 `roleCode = 'User'` 之帳號（**`userSubtype` 為 `business` 或 `other` 皆然**）直接呼叫該端點（縱使持有合法且屬於某筆現存附件之 `blobPath`）, Then 一律回 **403 `PERMISSION_DENIED`**（路由層功能閘門），**不核發任何短效期 URL、不回傳任何位元組、不寫稽核**；Given 以 SysAdmin／ICSOPAdmin／Supervisor／DeptContact 呼叫, Then **維持既有行為**（允許，回 RAW 之短效期 URL）。<br>📌 **實作方式＝收斂該端點之功能閘門**：由 `下載列印文件` read（五角色皆可）改為 **`ICSOP 文件管理` read**——該功能列之矩陣值為 SysAdmin `READ`／ICSOPAdmin `CRUD`／Supervisor `READ`／DeptContact `READ`／**User `NONE`**，與 `AC-D4` 所列之後台四角色**逐格吻合**。**[F025](F025-role-function-matrix.md) 矩陣本身逐格不變**（僅端點改綁既有功能列，未新增列、未改任何格值）。<br>🔴 **本條所關閉之既有缺口（非本 delta 引入）**：`AttachmentsService.getDownloadUrl()` 現況**完全沒有 [F041](F041-user-subtype-business-scope.md) 可見性檢查**，僅驗「`blobPath` 屬於某筆現存附件」——業務子分類 `User` 一旦取得任一 `blobPath` 即可**繞過 F041 部門限制取得 RAW 原檔**（該端點不在 F041 原本收斂之四個接縫內）。<br>📌 **一般使用者之下載能力不因此受損**：前台之下載一律改走 `AC-D3` 之前台專屬路徑（該路徑內含 F041 可見性檢查與燒錄），[F026](F026-role-field-matrix.md) 矩陣「ICSOP PDF＝唯讀（可下載）」對 User **仍然成立**。<br>⚠ **被否決之替代方案**：「保留閘門、僅於該端點補一道 F041 檢查」——lead 裁定採收斂（前台已無呼叫端，收斂比再補一道檢查更徹底、且不需在後台路徑上維護一個永遠為真的判斷）。**兩者不得皆不做。**

- **AC-D7**（🔴 前台詳情頁三類清單之逐字文案與選擇器契約；**2026-08-16 補訂**，權威＝`prototypes/04-public-document-detail.html`）：Given 前台文件詳情頁渲染完成, When 檢視「附件」「使用表單」「附錄」三類清單, Then 下列**逐字成立**——
  - ① **每一列皆帶一個浮水印註記元素**（`data-wm-note` 屬性），其可見文字為**二擇一**：`format = pdf` → 逐字 `檢視/下載將燒錄浮水印`（**正向文案**）；非 PDF → 逐字 `此格式不支援浮水印`。**三類清單使用同一組文案，不得分歧**（`AC-D2` 之延伸）。
  - ② **`檢視/下載將燒錄浮水印` 為本檔既有文案之擴用**：原僅出現於附件區之 ICSOP PDF 列（`04:105`），本 delta 將其一致化沿用至附錄與使用表單之 PDF 列；**該字串一字未改**。
  - ③ **列選擇器**：附件列帶 `data-attachment-item`、使用表單列帶 `data-usage-form-item`、附錄列帶既有之附錄列掛鉤；`within(row).getByText(...)` 可據此定位到該列之 `data-wm-note`。
  - ④ 🛑 ~~**後台不得出現**：後台清單／唯讀詳情／編輯頁**一律不渲染** `data-wm-note` 與上述兩條文案（後台恆 RAW，顯示「將燒錄」或「不支援」皆為誤導）——`queryByText('檢視/下載將燒錄浮水印') === null` 與 `queryByText('此格式不支援浮水印') === null` 於後台三頁皆成立。~~<br>🔴 **2026-08-20 就地推翻（`OQ-D9-08` 選項 B 之直接後果）**：後台自本日起亦燒錄 ⇒ 本子句之**唯一理由（「後台恆 RAW，顯示皆為誤導」）已失效**，若維持禁令則變成「後台會燒、卻不告訴使用者」——恰為誤導之反面。現行條文見 `AC-N20`（後台亦渲染同一組 `data-wm-note` 與同一組逐字文案）。原條文逐字保留於左供追溯。<br>✅ **本子句之失效已於 2026-08-20 經 lead 裁決確認**（[open-questions](../open-questions.md) `OQ-D9-33` ＝採納 spec-writer 原案）；`AC-N20` 之 `[ASSUMPTION]` 已解除。
  
  📌 **本條之存在理由**：`AC-D2` 只規定了非 PDF 之負向文案，**未規定 PDF 之正向文案、亦未定義任何列選擇器**——test-generator 無從定位「該列」，也無從驗證 PDF 列之呈現。本輪約束環為簡化版（僅 jest/vitest、無 fidelity 測試）⇒ AC 是唯一防線。<br>📌 **旗標來源**：文案之選擇依伺服器端旗標（見 `AC-D2` 之註），**前端不得自行以 `format` 字串重算**。
- **AC-D8**（🔴 前台附件下載端點之權限閘門與可觀測契約；**2026-08-16 補訂**，test-generator ringC 提報 `G-L2-02`）：`architecture-spec.md` §10.1 為前台附件下載新增**兩個專屬端點**，其 handler 名稱與權限閘門原**未入任何 AC**，致約束環無從建立 route-metadata 斷言。端點形狀**以 §10.1 為準、不另立**：
  | 方法 | 路徑 | 權限閘門 | handler |
  |---|---|---|---|
  | GET | `/public/documents/:documentId/attachments/icsop-pdf/download` | 功能 `下載列印文件` **read** | `downloadIcsopPdf` |
  | GET | `/public/documents/:documentId/attachments/ojt/download` | 功能 `下載列印文件` **read** | `downloadOjt` |

  - ① **閘門值**：兩者皆為功能鍵 `下載列印文件`（`DOCUMENT_DOWNLOAD_PRINT`）之 **`'read'`**——**與既有前台下載路徑（`/public/documents/:id/download`）完全相同**，五種角色（含一般使用者）皆通過功能層。<br>⚠ **不得**誤用 `ICSOP_DOCUMENT_MANAGEMENT`（那是 `AC-D6` 所收斂之**後台**共用端點之閘門，其 User 為 `NONE`）——誤用會使一般使用者連前台附件都下載不到，直接架空 [F026](F026-role-field-matrix.md) 矩陣「ICSOP PDF／OJT＝唯讀（可下載）」。
  - ② **不接受客戶端傳入 `blobPath`**：伺服器自 `(documentId, type)` 反查儲存位置；請求中出現 `blobPath` 參數一律忽略（§10.1 之路徑分流前提——客戶端只能選擇呼叫哪個端點，不能指定取哪個位元組）。
  - ③ **[F041](F041-user-subtype-business-scope.md) 可見性檢查於服務層生效**：業務子分類使用者對使用部門不相符之文件呼叫此二端點, Then 回 **404 `DOCUMENT_NOT_FOUND`**（沿用 `AC-U1`／`AC-U2` 之既有語意），**不回傳任何位元組、不寫稽核**。
  - ④ **可觀測契約沿用既有 AC**：燒錄／非 PDF 原檔／UI 明示＝`AC-D1`／`AC-D2`；代理串流（不回 SAS URL、不 3xx）＝`AC-D3a`；稽核＝`AC-D5`。**本條只補齊「端點存在、handler 名稱、閘門值」三項 route-metadata**，不重複規範上述行為。

### D9 浮水印呈現 delta（🔴 2026-08-20 使用者裁決；缺失／變更 delta 第 1／2／3／4 項） {#d9-watermark-delta}

> 前提裁決（全部落於 [open-questions §D9](../open-questions.md#d9--2026-08-20-缺失變更-delta來源stories2026-08-20-defect-delta-9md)）：
> **`OQ-D9-01`→選項 C**（色值轉深＋提高不透明度**兩者皆調**，並訂可機器驗證之量化目標）〔使用者〕；🔴 **量化門檻已於 2026-08-20 同日由使用者調整為「與白底對比度 ≥ 1.7:1」**（`OQ-D9-31`）——**被推翻之原門檻逐字保留供追溯**：「**與白底對比度 ≥ 3:1**（WCAG non-text contrast）」。**改採之 ≥ 1.7:1 為本專案專用之數值門檻**（非 WCAG 條文值），**仍為純數值、可機器驗證，不是主觀判斷**｜
> **`OQ-D9-02`→選項 B**（**5 處全動**：`PublicViewerPage`／`ChangeHistoryPage`／`LifecycleTreePreviewPage` 三處前端疊加 ＋ `pdf-burner.ts` 燒錄 ＋ 對應 prototype）〔使用者〕｜
> **`OQ-D9-03`→選項 A**（`/pdf` 端點回未燒錄位元組供瀏覽器原生工具列直取＝**安全缺陷 BUG-IMPL**，最高優先）〔lead 預設〕｜
> **`OQ-D9-04`→選項 A**（改用 **pdf.js／react-pdf 自繪 canvas 渲染**取代 `<iframe>`；縮放依倍率**重新渲染**；使用者已明確接受新增前端相依之代價）〔使用者〕｜
> **`OQ-D9-05`→選項 A**（#2 與 #4 併同一批）〔lead 預設〕｜
> **`OQ-D9-06`→選項 A**（**新增浮水印專用簡稱常數**，全稱三處消費點逐字不動；另訂 **INV-C2**）〔使用者〕｜
> **`OQ-D9-07`**（`AS`→`和潤企業`、`AE`→`和潤電能`；⚠ `AE` 全稱之既有 `[ASSUMPTION]`（`OQ-E01-10`）**不因本輪而解除**）〔lead 預設〕。
>
> ⚠ **本節不改變浮水印之字串格式、欄位順序與收合規則**（[NFR-007](../nfr.md#watermark) 逐字不變）——僅改變 ① 呈現之**色值／不透明度**、② **公司名稱欄之取值來源**、③ 檢視器之**渲染技術與其可觀測 DOM 契約**。

#### #1 顏色加深與對比度目標

- **AC-N1**（🔴 對比度門檻，可計算之量化驗收；🔴 **2026-08-27 就地改寫——門檻由 `1.70` 再降為 `1.60`**，2026-08-27 UX ① 使用者裁決「顏色淡一點點」；🔴 2026-08-20 曾由 `3.0` 降為 `1.70`，`OQ-D9-31` 使用者裁決）：Given 浮水印之呈現色值與不透明度, When 以 sRGB alpha 合成於**純白背景**（`#FFFFFF`）求其有效色，並依 **WCAG 2.1 相對亮度公式**計算該有效色與 `#FFFFFF` 之對比度, Then 其值 **≥ 1.60**（含邊界）。<br>📝 **被推翻之原門檻逐字保留供追溯**：「Then 其值 **≥ 3.0**（含邊界）。」｜「Then 其值 **≥ 1.70**（含邊界）」（2026-08-20～2026-08-27，對應色值 `#334155` @ `0.30`、實算 ≈ 1.716）。**推翻理由（使用者裁決）＝ 3:1 之可讀性代價過高**——lead 已獨立驗算並確認原算式正確（3:1 ⇒ 有效色不得淺於 `rgb(149,149,149)` ⇒ `#334155` 需 `opacity ≈ 0.57`），但使用者判定該不透明度會過度遮蓋文件內容。<br>📌 **驗證載體**：純函式單元測試——被測輸入為 `AC-N3` 所要求之具名常數（色值＋不透明度），測試自備合成與對比度計算之工具函式（**不得**改為讀取瀏覽器計算樣式，jsdom 不做 alpha 合成）。<br>📌 **合成與亮度公式（供測試逐字實作，避免各自臆造）**：`effective = 255 − alpha × (255 − channel)`，逐通道套用（**不四捨五入為整數亦可，兩種算法於本定稿值下皆落在 1.612～1.613，同樣 ≥ 1.60**）；相對亮度 `L = 0.2126·R' + 0.7152·G' + 0.0722·B'`，其中 `C' = c/255 ≤ 0.03928 ? (c/255)/12.92 : ((c/255 + 0.055)/1.055)^2.4`；對比度 `= 1.05 / (L + 0.05)`。<br>⚠ **門檻為 `≥ 1.60`、不是 `≈ 1.61`**——請以**不等式**斷言，**不得**寫成對某個小數點後兩位之相等比較（浮點與四捨五入差異會使等值斷言脆裂）。
- **AC-N2**（🔴 定稿值與各載體一致；🔴 **2026-08-20 兩處就地改寫——不透明度 `0.57`→`0.30`（`OQ-D9-31`）、載體由 5 處減為 4 處（`OQ-D9-32`）**）：Given 本 delta 實作完成, When 檢視**下表各載體**之色值／不透明度常數, Then **逐字為下列定稿值**——

  | # | 載體 | 檔案 | 色值（定稿） | 不透明度（定稿） |
  |---|---|---|---|---|
  | ~~1~~ | 🛑 ~~前台檢視器疊加~~ | 🛑 ~~`frontend/src/pages/PublicViewerPage.tsx`~~ | **該載體已整個移除** | **不適用** |
  | 2 | 變更歷程新舊並列疊加 | `frontend/src/pages/ChangeHistoryPage.tsx` | **`#475569`** | **`0.30`** |
  | 3 | 循環樹狀圖預覽疊加 | `frontend/src/pages/LifecycleTreePreviewPage.tsx` | **`#475569`** | **`0.30`** |
  | 4 | PDF 燒錄（內容層；**檢視器所見位元組亦由此產生**） | `backend/src/public/pdf-burner.ts` | **`rgb(0.2784, 0.3333, 0.4118)`**〔＝`#475569` 之 0–1 正規化〕 | **`0.30`** |
  | 5 | Prototype 權威 | `prototypes/22-*`、`prototypes/23-*` ＋ **`prototypes/00-design-system.html` 之浮水印示範**（🔴 2026-08-20 第三輪**追認納入**：`00` 為設計系統之文件，留著舊值會與全部四個實際載體矛盾；**它非行為載體、無回歸風險**，lead 已核可）（⚠ `prototypes/05-public-viewer-watermark.html` 之 `.wm-layer` **整段移除**，見 `AC-N7`；惟其 canvas 燒錄之 `WM_COLOR` 同為本欄定稿值） | **`#475569`** | **`0.30`** |

  📝 **被推翻之現行值（逐字保留供追溯）**：前端三處＝`#64748B`＋`opacity: 0.12`（`PublicViewerPage.tsx:229-231`、`ChangeHistoryPage.tsx:992,1000`、`LifecycleTreePreviewPage.tsx:509,516`）；後端＝`rgb(0.4, 0.45, 0.5)`＋`opacity = 0.12`（`pdf-burner.ts:42,56`）。
  <br>🔴 **2026-08-27 就地改寫（使用者裁決 UX ①「浮水印格式文字顏色淡一點點」）**：色值由 Tailwind slate-700 淡一階為 **slate-600**；不透明度不動。
  <br>📌 **現行定稿值之驗算**：`#475569` @ `0.30` ⇒ 有效色 `rgb(199.8, 204.0, 210.0)`、對比度 **≈ 1.613:1**，滿足就地下修後之 `AC-N1` 門檻 ≥ 1.60。**ui-ux-designer 逐字照抄，不得自行發明**（比照 [F018](F018-usage-form-management.md#edit-number-action) 之既有慣例）。<br>📝 **被推翻之前一版定稿值逐字保留供追溯**：`#334155` @ `0.30`（有效色 `rgb(193.8, 198.0, 204.0)`、對比度 ≈ **1.716:1**）｜`#334155` @ `0.57`（有效色 ≈ `rgb(138.7, 146.7, 158.1)`、對比度 ≈ **3.115:1**，為滿足原 ≥ 3.0 門檻之最小不透明度）。<br>⚠ **與 lead 裁決備忘之數字差異（如實記錄）**：lead 之裁決文字記為「≈ 1.73:1」；spec-writer 以本條所載公式重新驗算為 **≈ 1.716:1**（整數化合成色後為 ≈ 1.715）。**兩者皆滿足 ≥ 1.70 之門檻，裁決不受影響**；本檔採實算值 1.716，以免測試把 1.73 當成期望值而恆紅。若人類決定調整門檻，**只需改本表兩個字面值與 `AC-N1` 之門檻數字**，其餘 AC 一字不動。
  <br>✅ **`OQ-D9-31` 已於 2026-08-20 由使用者裁決結案**：原提報之風險（`0.12 → 0.57` 近 5 倍不透明度、明顯遮蓋內容）**經使用者採納**，門檻降為 ≥ 1.7:1、不透明度定為 `0.30`（仍為現況 `0.12` 之 2.5 倍，可辨識度顯著提升而不致遮蔽內容）。<br>📌 **若日後再次調整門檻，改動範圍僅 `AC-N1` 之數字與本表之不透明度欄**，其餘 AC 一字不動——`AC-N3`「必須為具名常數」正是為此而立。
- **AC-N3**（單一來源與可測性前提）：Given 上表**各有效載體**（4 處；第 1 列已移除）之任一前端或後端載體, When 檢視其實作, Then 其色值與不透明度**必須取自該側之具名匯出常數**（前端一份、後端一份；**不得**以字面值散落於 JSX inline style 或 `drawText` 呼叫處）。<br>🔴 **本條是 `AC-N1`／`AC-N2` 的可測性前提**——常數若不可 import，前述兩條就沒有斷言載體，只能退化為「讀原始碼字串」之脆弱測試。<br>📌 **前後端為兩個獨立 TS 專案、無共用 package ⇒「只有一份」在現行 build 管線下不可達**；沿用 `watermarkLines()`（architecture-spec §10.14）與 `change-labels.ts`（`OQ-D18-34`）之既有處置＝**各側各一份，兩側各自對本檔宣告之字面值斷言**。

#### #2／#4 檢視器渲染契約（自繪 canvas 取代 iframe）

- **AC-N4**（🔴 不得存在瀏覽器原生 PDF 檢視器容器）：Given 前台檢視器頁（`/public/documents/:id/view`）載入完成且非錯誤／非載入中, When 檢視其 DOM, Then 文件預覽區內**不存在**任何 `<iframe>`、`<embed>` 或 `<object>` 元素——`container.querySelector('iframe, embed, object') === null` 逐字成立；且預覽內容由頁面自行渲染之 `<canvas>` 承載（`container.querySelector('[data-pdf-canvas]') !== null`；**掛鉤契約見 `AC-N71`**）。<br>📌 **本條即 #2「移除套件下載/列印鈕」之可斷言等價**：瀏覽器原生工具列渲染於 browser chrome 層、非本系統 DOM，無法直接斷言其不存在；但它**只會伴隨上述三種容器出現**，故消除容器即消除工具列。
- **AC-N5**（🔒 系統自身之下載／列印鈕不受影響——回歸鎖定）：Given 前台檢視器頁, When 檢視 header 動作區, Then 本系統自身之「下載」與「列印」動作**仍存在且可觸發**，其目標仍為既有之受控端點（`documentDownloadUrl`／`documentPrintUrl`，皆已燒錄且皆寫稽核）；本 feature 既有 AC「使用者下載文件 → PDF 內容層已燒錄浮水印」「查看/下載/列印各自記錄對應類型稽核」**逐字維持綠燈**。<br>⚠ **不得**以「移除工具列」為由順手移除或停用本系統之下載／列印鈕。
- **AC-N6**（🔴 PDF 代理端點改回傳已燒錄位元組；✅ **`OQ-D9-32` 已於 2026-08-20 由使用者裁決＝採納本條**，`[ASSUMPTION]` 已解除）：Given 任一已授權使用者呼叫 `GET /public/documents/:id/pdf`（檢視器之位元組來源）, When 回應產生, Then 其 body 為**已燒錄浮水印**之 PDF 位元組——`PdfBurner.burnPdf` 之 spy **呼叫次數為 1**，且其浮水印字串與同一使用者於同一時刻經 `download` 取得者**逐字相同**（僅時間戳依當下產生）。<br>🔴 **理由（不得省略）**：`OQ-D9-03` 已裁定 `/pdf` 回未燒錄位元組為**安全缺陷**。單純換掉渲染器**只移除了工具列這一個入口**——瀏覽器開發者工具之 Network 面板仍可直接另存該回應之位元組，缺陷本體（未燒錄原件離開系統）**完全未被關閉**。<br>📌 **本條使檢視器成為單層浮水印之前提**：正因位元組已燒錄，`AC-N7` 之移除疊加層才不造成浮水印消失。**兩條必須同批實作**——只做 `AC-N7` 不做 `AC-N6` 會使檢視器完全無浮水印。
- **AC-N7**（🔴 **前台檢視器之 DOM 疊加層移除——負向斷言**；🔴 **2026-08-20 由 `OQ-D9-32`（使用者裁決）完全反轉**）：Given `AC-N6` 之已燒錄位元組被渲染於 canvas, When 檢視前台檢視器頁（`/public/documents/:id/view`）之 DOM, Then **不存在任何浮水印疊加層**——`queryByTestId('watermark-overlay') === null` **且** `queryAllByTestId('watermark-text').length === 0` 逐字成立。<br>📝 **被推翻之原條文逐字保留供追溯**：「（DOM 疊加層保留；與 `AC-N6` 並存不衝突）Given `AC-N6` 之已燒錄位元組被渲染於 canvas, When 檢視 DOM, Then 既有之 DOM 疊加層**仍然存在**（`data-testid="watermark-overlay"` 與 `data-testid="watermark-text"` 皆可命中），其字串與內容層燒錄者**逐字相同**…**雙層非冗餘**…」<br>🔴 **推翻理由（使用者裁決）**：`AC-N6` 使檢視器底下已是燒錄過的 PDF，DOM 疊加層變成**純冗餘**（同一份浮水印疊兩次）。<br>🔴 **範圍界線——本條僅適用前台文件檢視器 `PublicViewerPage`**，正向對應條款見 **`AC-N66`**（`ChangeHistoryPage` 與 `LifecycleTreePreviewPage` 之疊加層**必須保留**）。**兩條為同一界線之負向與正向雙向斷言，必須同批驗證**——只驗負向者，實作者極可能一次刪三處。
- **AC-N8**（🔴 縮放不得以 CSS 點陣縮放達成）：Given 檢視器之縮放控制項, When 使用者調整倍率至任一值, Then 預覽容器之 `style.transform` **不含 `scale(`**（`expect(previewEl.style.transform).not.toMatch(/scale\(/)`）。<br>📝 **被修正之現行實作（逐字保留供追溯）**：`frontend/src/pages/PublicViewerPage.tsx:197-211` 之 `transform: scale(${zoom})` 作用於**已包含 iframe 之外層容器**，屬點陣拉伸 ⇒ 放大即模糊（＝缺失第 4 項之根因）。
- **AC-N9**（縮放觸發以新倍率之重新渲染）：Given 檢視器已完成首次渲染, When 縮放倍率由 `z1` 變更為 `z2`（`z1 ≠ z2`）, Then 頁面渲染函式**再次被呼叫**且其接收之縮放參數等於 `z2`（渲染呼叫累計次數 ≥ 2，最後一次之參數為 `z2`）。<br>✅ **可測性前提已於 2026-08-20 第三輪滿足（原風險解除）**：ui-ux-designer 已於 `prototypes/05-public-viewer-watermark.html` 建立可觀測之渲染紀錄 seam；其契約與實作端之對應要求見 **`AC-N73`**。<br>📝 **原風險註記逐字保留供追溯**：「**若渲染完全封裝於第三方元件內部而不暴露任何 seam，本條將無執行期載體**——屆時須退回以 `AC-N8` 之負向斷言為唯一保障。」**該退路已不需動用。**

- **AC-N66**（🔴 **另兩頁之疊加層必須保留——正向斷言**；`OQ-D9-32` 之範圍界線）：Given 後台**變更歷程頁**（`ChangeHistoryPage`，新舊並列 diff）與**循環樹狀圖預覽頁**（`LifecycleTreePreviewPage`）渲染完成, When 檢視 DOM, Then 兩頁之浮水印疊加層**必須存在**——
  - `ChangeHistoryPage`：`getByTestId('watermark-overlay-before')` 與 `getByTestId('watermark-overlay-after')` **皆可命中**（現行為 `data-testid={\`watermark-overlay-${side}\`}`，`side` 之值域為 `'before' | 'after'`，見 `ChangeHistoryPage.tsx:990` 與其 `DiffBoard` 之 `side` prop `:1070,1078`）。⚠ **該頁之浮水印 `<span>` 目前不帶 `data-testid`**，故本條**不得**以 `watermark-text` 定位它；若實作補上掛鉤，須先入 AC。
  - `LifecycleTreePreviewPage`：`getByTestId('watermark-overlay')` 可命中，且 `getAllByTestId('watermark-text').length > 0`（`LifecycleTreePreviewPage.tsx:507,514`）。
  - 兩頁之色值／不透明度為 `AC-N2` 表列之**現行定稿值**（**`#475569`／`0.30`**；📝 OLD> `#334155`／`0.30`）。
  <br>🔴 **本條與 `AC-N7` 為同一界線之正向與負向雙向斷言，必須同批驗證。**
  <br>🔴 **保留理由（不得省略，亦不得日後「順手統一」而刪除）**：這兩頁渲染的是 **HTML（diff 表格／DAG 節點），不是 PDF——沒有「內容層」可以燒錄**；DOM 疊加層是它們**唯一**的浮水印載體。若因 `AC-N7` 而一併移除，這兩頁將**完全失去浮水印**，直接牴觸 [NFR-007](../nfr.md#watermark) AC3 之情境 3。
  <br>📌 **檢視器與這兩頁之差異是「底下有沒有可燒錄的內容層」，不是「要不要浮水印」**——三頁都要有浮水印，只是承載層不同。
  <br>⚠ 此處**不含** [F036](F036-lifecycle-tree-preview.md)／[F038](F038-lifecycle-tree-change-history.md) 之**下載/列印 PDF** 路徑——那條路徑本就走燒錄（`pdf-burner.ts`），不受本條與 `AC-N7` 影響。
- **AC-N67**（🔒 檢視器頁尾「浮水印格式字幕」與 `/view` 端點必須保留——回歸鎖定）：Given 前台檢視器頁載入完成, When 檢視頁尾, Then——
  - ① **格式字幕仍存在**：`getByTestId('watermark-format')` 可命中，其文字**逐字等於伺服器回傳之線性浮水印快照**（`frontend/src/pages/PublicViewerPage.tsx:260`；標籤逐字為 `浮水印格式（與稽核快照一致）：`）。<br>⚠ **本元素不在 `AC-N7` 之移除範圍內**——它不是疊加圖層，而是「所見浮水印字串之可讀對照」，且是 `AC-N6` 燒錄字串於前端**唯一**可斷言之投影。**不得**因清理疊加層而一併刪除。
  - ② **`GET /public/documents/:id/view` 端點不得被移除**：疊加層移除後，該端點**仍有四項不可替代之職責**——(a) 供給 ① 之格式字幕字串；(b) 回傳檢視器標題列之 `documentNumber`／`documentName`（`G-PUB-032`）；(c) **它是 `VIEW` 稽核之唯一觸發點**（本 feature 既有 AC「檢視器載入 → 產生 1 筆 `VIEW` 紀錄」與 [F023](F023-audit-logging.md) 皆依賴之）；(d) 它是 [F041](F041-user-subtype-business-scope.md) `AC-U1` 之 `view` 授權入口（業務子分類可見性檢查）。
  - **逐字斷言**：Given 檢視器載入完成, Then `AUDIT_LOG` 恰新增一筆 `actionType='VIEW'` 之紀錄，且 `getByTestId('watermark-format')` 之文字與該筆之 `watermarkSnapshot` **逐字相同**。
  - 📝 **端點路徑之更正（如實記錄）**：lead 之裁決備忘記為 `GET /public/documents/:id/watermark`；**本 repo 實際不存在該路徑**，對應端點為 **`GET /public/documents/:id/view`**（`backend/src/public/watermark.controller.ts:50`，前端 `getDocumentWatermark()`，`frontend/src/api/endpoints.ts:786`）。**語意完全相同，僅路徑字面不同**；本條以實際路徑為準。⇒ **該端點並非孤兒，不需提報新 OQ。**
- **AC-N68**（三層式呈現契約之新載體）：Given 任一浮水印快照字串, When 於**檢視器路徑**呈現（＝ `AC-N6` 之已燒錄位元組）, Then 其三層式結構（①身分資料列 ②固定機密聲明**另起一行** ③時間戳）由 `backend/src/public/pdf-burner.ts` 之 **`toDisplayLines(snapshot)`** 承載——該純函式對同一輸入之回傳**恰為 3 行**，且**逐行與前端 `watermarkLines(snapshot)` 之對應行字串相同**。
  <br>🔴 **本條之存在理由**：`AC-D7` #7 之三層式契約原以 `prototypes/05-public-viewer-watermark.html:110` 之 DOM 疊加為權威載體；`AC-N7` 移除該疊加後，**該契約於檢視器路徑失去載體**。本條明確指定新載體，避免「契約還在、但沒有東西驗它」。
  <br>📌 **前端 `watermarkLines()` 並未消失**——它仍為 `AC-N66` 兩頁之消費對象；本條要求的是**兩份實作對同一輸入逐行相等**（沿用 `access-history-labels.ts` 檔頭所載「兩份逐字相同」之既有不變式寫法，前後端無共用 package 之既定處置）。

#### #3 浮水印公司簡稱

- **AC-N10**（簡稱常數之字面值）：Given 浮水印專用簡稱對照表（建議常數名 `COMPANY_SHORT_NAMES`，落點與 `COMPANY_FULL_NAMES` 同模組）, When 逐鍵取值, Then 其內容**逐字為** `{ AS: '和潤企業', AE: '和潤電能' }`。<br>📌 `AE` 之短稱與其全稱同值——其全稱本身即為短稱形態；⚠ **`AE` 全稱之既有 `[ASSUMPTION]`（[open-questions](../open-questions.md) `OQ-E01-10`）不因本輪而解除**，日後全稱覆核若改變 `AE` 之值，須同時覆核本表。
- **AC-N11**（🔴 **INV-C2**：短稱表鍵集合 ≡ 全稱表鍵集合）：Given `COMPANY_SHORT_NAMES` 與 `COMPANY_FULL_NAMES`, When 比對兩者之鍵集合, Then **完全相等**（`Object.keys` 排序後逐項相同）；且每一鍵之短稱值**非空字串、非 `null`**。<br>🔴 **本條之存在理由（不得省略）**：`OQ-D9-06` 選項 A 以「新增第二份公司對照表」換取「不波及全稱三處消費點」，其代價是**新增公司時可能只登錄全稱、漏登短稱** ⇒ 浮水印公司名稱靜默退化為 `null`／空欄（且因 §8.4 之分隔符收合規則，**看起來像正常留空**，不會有人發現）。本不變式比照既有 **INV-C1** 之寫法，是本裁決唯一的防漂移機制。<br>📌 **實作建議（非規格鎖定）**：以 `COMPANY_FULL_NAMES` 之鍵導出短稱表之型別（`Record<keyof typeof COMPANY_FULL_NAMES, string>`），使漏登在 `tsc` 即失敗；縱使如此，**本 AC 仍須保留為執行期載體**（型別在 build 產物中不存在）。
- **AC-N12**（浮水印快照使用短稱）：Given 使用者所屬公司為 `AS`, When 呼叫 `buildWatermarkSnapshot` 產生線性快照, Then 其「公司名稱」欄逐字為 **`和潤企業`**（**非** `和潤企業股份有限公司`）；Given 公司為 `AE`, Then 逐字為 `和潤電能`；Given 公司代碼查無於短稱表, Then 該欄比照既有 `resolveCompanyName` 之寬容處置**留空並套用 §8.4 分隔符收合**（不得輸出 `null`、不得回退為全稱）。<br>📌 **三處呈現一致**：檢視器疊加、PDF 燒錄內容層、`AUDIT_LOG.watermarkSnapshot` 三者之公司名稱欄**同時**改為短稱（既有「三者字串完全一致」之 AC 不得因本項而破）。
- **AC-N13**（🔒 全稱三處消費點回歸鎖定）：Given 本 delta 實作完成, When 檢視下列三處, Then 其顯示字串**逐字未變、仍為全稱**——① [F003](F003-account-role-management.md) 帳號建立／編輯之公司下拉與清單公司欄（`AS` 顯示 `和潤企業股份有限公司`）；② `GET /companies` 之回應（`companyName` 欄為全稱）；③ [F024](F024-access-history-query.md) 調閱歷程之「公司」欄與其 CSV 匯出值。且 `COMPANY_FULL_NAMES` 之**值**逐字未被修改、**INV-C1**（`SELECTABLE_COMPANIES ≡ Object.keys(COMPANY_FULL_NAMES)`）維持成立。<br>🔴 **本條是 `OQ-D9-06` 選 A 而非選 B 的唯一保障**：選 B（直接改短 `COMPANY_FULL_NAMES`）會使這三處連帶改變，屬波及既有已驗收功能之變更，使用者已明確否決。

#### 🔴 prototype 載體之權威化（2026-08-20 第三輪；來源＝`docs/ui-ux-design-overview.md` §A.6.7）

> **本節之存在理由（與本 repo 頭號教訓互為反面）**：既往之失誤是「**補了 AC ≠ AC 有載體**」；
> 本節處理的是它的**反面**——**載體已存在於 prototype，卻沒有任何 AC 賦予它權威**。
> 本輪約束環為簡化版（**僅 backend jest ＋ frontend vitest，無 Playwright／fidelity**），test-generator 只認 spec ＋ prototype：
> 未入 AC 之掛鉤與文案，它要嘛**不建約束**（實作者刪掉也沒人發現），要嘛**自行臆造斷言**（建出規格從未授權之約束）。兩者皆為缺陷。
> 📌 **共同載體形狀**：prototype 為**權威**，實際斷言落於**實作端**之 vitest 測試（比照 `AC-D10`／`AC-E8`／`AC-D15` 之既有慣例）。

- **AC-N71**（🔴 檢視器之 DOM 契約與翻頁控制項；權威＝`prototypes/05-public-viewer-watermark.html`）：Given 前台檢視器頁載入完成, When 檢視 DOM, Then 下列**逐字成立**——
  | 元素 | 契約 |
  |---|---|
  | 頁面畫布 | `<canvas>` 帶 **`data-pdf-canvas`**；其 `aria-label` 以逐字片段 `文件預覽（第 ` 起始並含 `浮水印已燒錄於內容層`；`role="img"` |
  | 目前頁容器 | 帶 **`data-viewer-page="{N}"`**，`{N}` 為 1-based 目前頁碼，**隨翻頁即時更新** |
  | 上一頁／下一頁鈕 | DOM id **`prevBtn`**／**`nextBtn`**；`aria-label` 逐字為 `上一頁`／`下一頁`；位於首／末頁時該鈕為 `disabled` |
  | 頁碼輸入框 | DOM id **`pageInput`**；`aria-label` 逐字為 `頁碼`；輸入越界值時**夾回合法範圍**、不崩潰 |
  | 總頁數 | DOM id **`pageTotal`**，其文字為總頁數之十進位整數 |
  | 安全資訊帶 | DOM id **`securityBand`**（文案見 `AC-N72`） |
  📌 **`data-viewer-page` 與翻頁控制項所實作之「單頁翻頁」為 ui-ux-designer 依 `architecture-spec` §11.2 之授權裁量**（理由與已明文接受之取捨見 overview §A.6.2：`AC-N9` 需要確定性之渲染呼叫計數、jsdom 無 `IntersectionObserver`、記憶體護欄、翻頁成本低）。**本條只鎖可觀測掛鉤與無障礙名稱，不鎖「單頁 vs 連續捲動」之選擇**——日後若升級為連續捲動屬 additive，`renderPage(page, zoom)` 之 seam 簽章不需改。
  📌 **明列為設計裁量、刻意不入 AC 者**：翻頁控制項之視覺形狀與排列、窄螢幕之 fit-to-width 初始倍率算法、`#stage` 之置中手法（overview §A.6.4 #4／#5／#12）。
- **AC-N72**（🔴 安全資訊帶之逐字文案；**推翻既有錯誤宣告**）：Given 前台檢視器頁載入完成, When 檢視 `#securityBand` 之文字（空白正規化後）, Then **逐字為**——<br>`浮水印由伺服器端依當下登入身分與時間動態產生，並燒錄進 PDF 內容層；您正在檢視的預覽即是已燒錄的位元組，與下載／列印所得完全一致，脫離系統仍存在。本檢視器由頁面自繪 canvas 呈現，不使用瀏覽器內建 PDF 工具列；縮放為依倍率重新渲染而非放大點陣圖。未登入存取本檢視器將被拒並導回登入頁。`
  <br>📝 **被推翻之原文案逐字保留供追溯**（`frontend/src/pages/PublicViewerPage.tsx:170-173`）：「浮水印由**伺服器端**依當下登入身分與時間動態產生；下載／列印時將**燒錄進 PDF 內容層**（非僅前端疊加），脫離系統仍存在。未登入存取本檢視器將被拒並導回登入頁。」
  <br>🔴 **必須改寫之理由（不得省略）**：原文案說「**下載／列印時**將燒錄」，隱含**檢視當下未燒錄**——那正是 `OQ-D9-03` 認定之安全缺陷所在，也是本 repo 反覆出現之「**系統陳述了一件與實際不符的事**」同型缺陷（比照 F024 匯出鈕）。`AC-N6` 使檢視當下即為已燒錄位元組後，**不改文案就會從「說得比做的多」翻轉為「做得比說的多」，同樣是錯的**。
  <br>📌 **本條之驗證載體**：實作端 vitest 對 `#securityBand` 之 `textContent` 逐字比對（空白正規化）。
- **AC-N73**（🔴 渲染 seam 之可觀測紀錄；`AC-N9` 之載體）：Given 檢視器之頁面渲染函式, When 任一次渲染發生, Then 該次呼叫之 **`{ page, scale }` 被記錄於一個可自測試讀取之序列**；序列之每一筆含 `page`（1-based 頁碼）與 `scale`（縮放倍率），**順序即呼叫順序**。
  <br>📌 **prototype 之等價實作＝ `window.__pdfRenderCalls`**（`prototypes/05-public-viewer-watermark.html:191,194`），為本條之權威參考形狀。
  <br>🔴 **實作端不得沿用 `window` 全域**：React 側須以**可注入或可 `vi.mock` 之模組級 seam** 暴露同一序列（具體形狀由 system-architect 定，見 `AC-N9`）——把診斷用序列掛上 `window` 會在正式版洩漏內部狀態，且無法在測試間隔離。
  <br>📌 **本條使 `AC-N9`（縮放觸發以新倍率之重新渲染）自「可能無載體」轉為確定可測**：斷言＝該序列長度 ≥ 2 且最後一筆之 `scale === z2`。

### 後台燒錄範圍 delta（🔴 2026-08-20 使用者裁決；缺失／變更 delta 第 5 項——**全面推翻 `OQ-FM-01`／`OQ-D18-01`**） {#backend-burn-delta}

> 前提裁決：
> 🔴 **`OQ-D9-08`→選項 B：全面推翻，四類皆燒錄**〔使用者〕——`OQ-FM-01`（2026-07-24）與 `OQ-D18-01`（2026-08-16）**正式失效**。後台**文件本體、附件（ICSOP PDF／OJT）、附錄、使用表單**之全部下載端點一律燒錄浮水印。｜
> **`OQ-D9-09`→選項 B：不保留**任何「真正原始檔（無浮水印）」下載路徑，**無例外角色**（含 ICSOPAdmin）〔使用者〕｜
> **`OQ-D9-10`→選項 A：寫稽核，比照前台**〔使用者〕｜
> **`OQ-D9-11`：浮水印身分＝執行下載動作之操作者本人**（比照前台既有慣例）〔lead 預設〕。
>
> 🔴 **明確接受之代價（`OQ-D9-09` 選 B 之直接後果，不得隱藏）**：ICSOP 管理員**自此無任何介面途徑取得真正原始檔位元組**——內容維運場景（覆蓋上傳前比對舊檔、核對上傳是否正確、重製附件前取原件）須改由直接存取 Azure Blob 後台完成。使用者已於逐題裁決時明確選擇此選項。
> 📌 **本節之「後台下載」統指下列四條既有端點**（皆已於 2026-08-17 改為代理串流，見 `AC-D3a`）：`GET /documents/attachments/download`（ICSOP PDF／OJT，後台三頁共用）、`GET /documents/:documentId/usage-forms/:formId/download`（後台唯讀／編輯頁）、`GET /admin/usage-forms/:formId/download`（表單池管理頁）、`GET /admin/appendices/:appendixId/download`（附錄管理頁）。

- **AC-N14**（🔴 後台 PDF 一律燒錄）：Given 任一後台角色（**ICSOPAdmin／SysAdmin／Supervisor／DeptContact 四者皆然**）自上列四條端點任一者下載一份 `format = pdf` 之檔案（文件本體 ICSOP PDF、OJT、使用表單或附錄）, When 下載完成, Then 回應之 body 位元組其 **PDF 內容層已燒錄浮水印**、`PdfBurner.burnPdf` 之 spy **呼叫次數為 1**，且其浮水印字串之格式、欄位順序、收合規則與機密聲明另起一行之呈現，與前台路徑**完全一致**（格式權威同 [NFR-007](../nfr.md#watermark)）。<br>🔴 **本條反轉 `AC-D4`**：`burnPdf` spy 之期望值由 **0** 改為 **1**。
- **AC-N15**（策略 A 於後台亦適用）：Given 某後台下載之檔案格式**非 PDF**（`xlsx`／`xls`／`jpg`／`png`）, When 下載完成, Then 回應之 body 與 Blob 中之原始檔**逐位元組相同**、`PdfBurner.burnPdf` 之 spy **呼叫次數為 0**（不轉檔、不失真）。<br>📌 **格式判定之權威與前台相同**：以上傳時經白名單驗證之伺服器端事實（`format`／副檔名）為準，**非** client-supplied `content-type`；本輪同樣**不做 magic-byte 嗅探**（比照 [F039](F039-appendix-management.md#export-delta) `AC-D2` 之既有邊界宣告）。
- **AC-N16**（🔴 **無例外角色**——`OQ-D9-09` 選項 B）：Given 以 **ICSOPAdmin** 呼叫上列四條端點任一者下載 `format = pdf` 之檔案, When 下載完成, Then **同樣取得已燒錄位元組**（`burnPdf` spy ＝ 1）；系統**不提供**任何「原始檔（無浮水印）」下載入口——不存在 `?raw=true` 之類旁路參數、不存在僅對特定角色開放之第二條端點、亦不核發可直取原件之 SAS URL。<br>📌 **可測形狀**：以四種後台角色 × 四條端點之組合逐案斷言 `burnPdf` 呼叫次數為 1，**不得**有任一組合為 0。
- **AC-N17**（🔴 後台下載寫調閱稽核——`OQ-D9-10` 選項 A）：Given `AC-N14`／`AC-N15` 之任一後台下載成功, When 檢視稽核, Then `AUDIT_LOG` **恰新增一筆**，其欄位落值為——`actionType='DOWNLOAD'`；`targetType` 依檔案類別為 `DOCUMENT`（ICSOP PDF／OJT，`documentId` 必填）／`USAGE_FORM`（`formId`＋`documentId` 必填；經表單池管理頁下載者 `documentId` 為 `null`）／`APPENDIX`（`appendixId`＋`documentId` 必填；經附錄管理頁下載者 `documentId` 為 `null`）；身分快照欄取自**執行下載之操作者本人**；`watermarkSnapshot` 於已燒錄（PDF）時**落值且與該次浮水印逐字相同**、於未燒錄（非 PDF）時為 `null`。<br>📌 **不新增任何 `targetType`／`actionType` 列舉值**——四條後台端點之稽核完全沿用既有列舉（見 [data-model AUDIT_LOG](../data-model.md#auditlog-entity)）。<br>⚠ **`documentId` 為 `null` 之兩種情形**（表單池／附錄池管理頁之個別下載，其脈絡不隸屬任何文件）**與既有「條件必填」規則相容**：該規則要求 `targetType ∈ {DOCUMENT, USAGE_FORM, APPENDIX, DOCUMENT_CHANGE_LOG}` 時 `documentId` 必填——本項為該規則之**唯一例外**，已於 [data-model](../data-model.md#auditlog-entity) 就地登錄。<br>🔴 **稽核寫入失敗不阻斷下載**（沿用 [error-handling.md#audit](../error-handling.md#audit) 之補償佇列既有規則，與前台一致）。
- **AC-N18**（浮水印身分＝操作者本人——`OQ-D9-11`）：Given ICSOPAdmin 帳號 `A` 自後台下載某文件之 ICSOP PDF, When 檢視所得位元組之浮水印與該筆稽核之 `watermarkSnapshot`, Then 兩者之員工編號／姓名／公司名稱／部門／處室**皆為 `A` 本人**之身分快照（**非**文件之當責室長、**非**制定部門、**非**任何其他人）；Given 同一份檔案由 Supervisor 帳號 `B` 下載, Then 其浮水印為 `B` 之身分快照，且與 `A` 之位元組**不相等**。
- **AC-N19**（🔒 前台側零漣漪回歸鎖定）：Given 本 delta 實作完成, When 執行前台四條燒錄路徑（檢視器／詳情頁附件／詳情頁附錄／詳情頁使用表單）之全部既有 AC（`AC-D1`／`AC-D2`／`AC-D3a`／`AC-D5`／`AC-D6`／`AC-D7` ①②③／`AC-D8`、[F018](F018-usage-form-management.md#front-burn-delta) `AC-D11`／`AC-D12`／`AC-D14`／`AC-D22`、[F039](F039-appendix-management.md#export-delta) `AC-D1`／`AC-D2`、[F041](F041-user-subtype-business-scope.md) 相關之 `AC-U1`～`AC-U5`）, Then **全數維持綠燈、期望值一字未改**——本 delta **只加後台、不動前台**。<br>⚠ 特別鎖定：`AC-D6`（共用附件下載端點對 `roleCode='User'` 一律 403 `PERMISSION_DENIED`）之期望值**不得**因「後台也燒錄了、所以可以放寬」而鬆動——燒錄與否和 F041 可見性檢查是兩個正交維度，該端點仍無可見性檢查。
- **AC-N20**（後台亦渲染浮水印註記文案；✅ **`OQ-D9-33` 已於 2026-08-20 由 lead 裁決＝採納本條**，`[ASSUMPTION]` 已解除）：Given 後台之 ICSOP 文件清單頁／唯讀詳情頁／編輯頁／使用表單管理頁／附錄管理頁渲染完成, When 檢視各檔案列, Then 每一列帶一個 `data-wm-note` 元素，其可見文字為**二擇一**且**與前台同一組逐字文案**——`format = pdf` → 逐字 `檢視/下載將燒錄浮水印`；非 PDF → 逐字 `此格式不支援浮水印`。<br>🛑 **本條就地推翻 `AC-D7` ④**（原禁止後台出現該兩條文案），原條文逐字保留於 `AC-D7` ④。<br>✅ **`OQ-D9-33` 已定案（2026-08-20，lead）＝採納**：後台亦渲染同一組 `data-wm-note` 與同一組逐字文案，`AC-D7` ④ 之禁止條款就地失效（該處已加追溯註記）。
- **AC-N21**（🔒 傳輸模式不變）：Given 本 delta 實作完成, When 檢視上列四條後台端點之回應, Then 其形狀**仍為 `AC-D3a` 所定之代理串流**——body 為檔案位元組本身、`Content-Type` 為該檔 MIME、`Content-Disposition: attachment` 且檔名為**上傳時之原始檔名**（含中文，RFC 5987 編碼）；**不得**回 SAS URL、不得 3xx 轉址至 Blob。<br>⚠ 唯一例外之既有殘留＝ `GET /documents/:documentId/usage-forms/:formId/download` 現行回 `{ url }` JSON（[F018](F018-usage-form-management.md#front-burn-delta) `AC-D23`）——**該形狀已與燒錄不相容**（回 URL 就無從燒錄），必須改為代理串流；`AC-D23` 已就地改寫。
### 三行式浮水印行高 delta（🔴 2026-08-21 使用者裁決；三項裁決第 1 項） {#line-height-delta}

> **裁決逐字（人類，2026-08-21 第一輪）**：前端 DOM 疊加層 `line-height` → **`2.0`**；後端 PDF 燒錄每行位移 `size + 3` → `size + 8`；`prototypes/05` canvas 內容層之每行位移 → `WM_FONT_SIZE(14) × 2.0` ＝ **`28`**，且平鋪 `stepY` `132` → **`144`**（維持 tile 間隙不變）。
> **🔴 裁決（人類，2026-08-21 第三輪；結案 `OQ-T3-01` 選項 (c) ＋ `OQ-T3-02`）——後端側就地改寫**：後端字級為 `12` ⇒ 第一輪之 `size + 8`（＝`20`）僅為 **1.667 倍**，與另三個載體之 `2.0` **不同構**（spec-writer 於第一輪提報、lead 確認為出選項時之算術失誤）。**現行定稿＝後端行距由行高常數推導**——`WATERMARK_LINE_STEP` ＝ `WATERMARK_FONT_SIZE × WATERMARK_LINE_HEIGHT` ＝ `12 × 2.0` ＝ **`24`**；後端平鋪 `stepY` `180` → **`198`**（三行區塊長高 `2 × 9 = 18`，維持 tile 間隙不變，與 `05` 之 `132 → 144` 同一理由）；`stepX` 維持 `260`。
> ⇒ **四個載體之行距比自此全部同構為 `2.0`**：DOM 疊加 `2.0`／canvas `28 ÷ 14`／PDF 燒錄 `24 ÷ 12`。
> 📝 **已作廢（⚠ 不得用於斷言）**：OLD> 後端每行位移 `size + 3`（＝`15`，本 delta 前之原始值）｜OLD> 後端每行位移 `size + 8`（＝`20`，**2026-08-21 第一輪之定稿值，曾進入 `AC-T4`**）｜OLD> 後端 `stepY = 180`。
> 🔒 **`prototypes/05` 與三個 DOM prototype 不受第三輪裁決影響**（它們本即為 `2.0`）——**ui-ux-designer 無需改動任何檔案**。
> **本 delta 之 AC 編號採 `AC-T#`**（T ＝ 2026-08-21 三項裁決；**跨三檔不重號**——`AC-T1`～`AC-T5` 屬本檔，`AC-T10`～`AC-T27` 屬 [F036](F036-lifecycle-tree-preview.md)，`AC-T40`～`AC-T48` 屬 [F017](F017-backend-document-list.md)），與既有 `AC-D#`／`AC-N#`／`AC-U#` 批次區隔。
> ⚠ **本節不改變**浮水印之字串格式、欄位順序與收合規則（[NFR-007](../nfr.md#watermark) 逐字不變）、色值 `#334155` 與不透明度 `0.30`（`AC-N1`／`AC-N2`／`AC-N3` 逐字不變）、三層式結構（`AC-N68` 不變）——**僅改行距**。
> 🔒 **`17-access-history` 之 `wm(r)` 線性單行快照不適用本節**：它產生的是以 `-` 串接之單行稽核欄字串，不是三行式呈現載體。
> 📌 **權威＝ `docs/ui-ux-design-overview.md` §A.7.1／§A.7.2 ＋ 四份 prototype**（已由 ui-ux-designer 傳播並經 lead 逐項驗收）。

- **AC-T1**（🔴 單一定稿常數＝本節之可測性前提）：Given 前端側與後端側各自之浮水印呈現常數, When 檢視其實作, Then 各側**恰一個具名匯出常數**承載行距定稿值，且**不得**以字面值散落於 JSX inline style 或 `drawText` 呼叫處——
  | 側 | 具名匯出常數 | 定稿值 | 落點 |
  |---|---|---|---|
  | 前端 | `WATERMARK_LINE_HEIGHT` | `2`（**無單位倍數**，非 `'2px'`／`'200%'`） | 與 `AC-N3` 所要求之前端側色值／不透明度常數**同一模組**（模組落點由 system-architect 定；🔴 **兩者不得分居兩檔**——一致性條款若散在兩個模組，改一個忘一個沒有測試會抓到） |
  | 後端 | `WATERMARK_LINE_HEIGHT`、`WATERMARK_FONT_SIZE`、`WATERMARK_LINE_STEP` | `2`（**無單位倍數**）、`12`、**`24`** | `backend/src/public/pdf-burner.ts`（與既有 `WATERMARK_RGB`／`WATERMARK_OPACITY` 同檔，比照 `AC-N3` 之既有處置） |

  🔴 **後端亦持有 `WATERMARK_LINE_HEIGHT` 且 `WATERMARK_LINE_STEP` 必須由它推導**（`OQ-T3-01` 選項 (c) 之核心）：
  <br>**斷言＝ `WATERMARK_LINE_STEP === WATERMARK_FONT_SIZE * WATERMARK_LINE_HEIGHT`**（而**不僅是** `=== 24`）。
  <br>📌 **為何不只匯出一個 `WATERMARK_LINE_STEP = 24`**：那樣 `24` 就成了魔術數字——日後若行高由 `2.0` 調為 `1.8`，必須有人記得回去手算 `12 × 1.8`，而**沒有任何測試會在他忘記時轉紅**。本輪之算術失誤（`size + 8` 於 `size = 12` 只有 1.667 倍）**正是這個形狀**：偏移量寫死後，它與「行高」之關係只存在於人的腦中。持有 `2.0` 並要求推導，等於把該關係搬進可斷言的位置。
  <br>⚠ **後端之 `WATERMARK_LINE_HEIGHT` 與前端那份為「兩份、值相同」，不是「同一份」**——兩側之一致性如何斷言見 `AC-T3` ③。

  📌 **前後端為兩個獨立 TS 專案、無共用 package ⇒「全系統只有一份」在現行 build 管線下不可達**；沿用 `AC-N3` 之既有處置＝**各側各一份，兩側各自對本節宣告之字面值斷言**。
  <br>⚠ **斷言請用數值比較**（`Number(el.style.lineHeight) === WATERMARK_LINE_HEIGHT`），**不得**用字串相等（`'2'` vs `'2.0'` 之差異會使斷言脆裂而與行為無關）。

- **AC-T2**（各載體逐一綁定；數值逐字）：Given 本 delta 實作完成, When 檢視下表各載體, Then 其行距**逐字為下列定稿值**——

  | # | 載體 | 檔案 | 型別 | 定稿值 | 約束環是否斷言 |
  |---|---|---|---|---|---|
  | 1 | 變更歷程新舊並列疊加 | `frontend/src/pages/ChangeHistoryPage.tsx` | DOM `line-height` | `2` | ✅ 是（`AC-T2`／`AC-T3`） |
  | 2 | 循環樹狀圖預覽疊加 | `frontend/src/pages/LifecycleTreePreviewPage.tsx` | DOM `line-height` | `2` | ✅ 是（`AC-T2`／`AC-T3`） |
  | 3 | PDF 燒錄（內容層；**檢視器所見位元組亦由此產生**，`AC-N6`） | `backend/src/public/pdf-burner.ts` | 每行 y 位移 | `WATERMARK_FONT_SIZE × WATERMARK_LINE_HEIGHT` ＝ **`14 × 2.0`** ＝ **`28`**（🔴 2026-08-27 UX ① 就地改寫：字級 `12`→`14`；📝 OLD> `12 × 2.0` ＝ `24`、OLD> `size + 8` ＝ `20`、OLD> `size + 3` ＝ `15`） | ✅ 是（`AC-T4`） |
  | 4 | Prototype DOM 權威 | `prototypes/00-design-system.html`／`22-lifecycle-tree-preview.html`／`23-change-history.html` 之 `.wm-layer span` | CSS `line-height` | `2.0` | ❌ 否（設計權威，見 `AC-T5`） |
  | 5 | Prototype canvas 權威（＝後端燒錄之視覺代理） | `prototypes/05-public-viewer-watermark.html` | `WM_LINE_STEP`／`stepY` | **`32`**（＝`WM_FONT_SIZE 16 × WM_LINE_HEIGHT 2.0`）／**`154`**（📝 OLD> `28`／`144`） | ❌ 否（設計權威，見 `AC-T5`） |

  🔴 **「4 個前端載體 ＋ 1 個後端燒錄點」之對照說明（裁決之計數 vs 實作之計數）**：裁決所稱之 4 個前端載體係 **prototype 計數**（`00`／`22`／`23` 之 DOM ＋ `05` 之 canvas）。**實作側之前端 DOM 疊加載體恰 2 個**——前台檢視器之疊加層已由 `OQ-D9-32`／`AC-N7` **整個移除**，`00` 為設計系統文件（無實作對應物），`05` 之 canvas 在實作側對應的就是**後端 `pdf-burner`**（檢視器渲染的是後端已燒錄之位元組，`AC-N6`）。⇒ **實作側之有效載體＝前端 2 ＋ 後端 1，與裁決不矛盾，只是計數基準不同。**
  <br>📌 **選擇器契約（本條授權新增之掛鉤）**：兩個前端 DOM 載體之三行式文字 `<span>` 皆須帶 `data-testid="watermark-text"`。`LifecycleTreePreviewPage.tsx` 已有此掛鉤；`ChangeHistoryPage.tsx` **需補上**（其外層疊加容器既有之 `data-testid="watermark-overlay-{side}"` 逐字不動）。**行距掛在該 `<span>` 上**（即 `.wm-layer span` 之對應物），不是掛在疊加容器或內層 `display:block` 之單行 `<span>` 上。

- **AC-T3**（🔴 **INV-WM-LH ＝ 跨載體一致性不變式**；本節最關鍵之一條）：Given 於**同一個測試檔**內分別渲染 `ChangeHistoryPage` 與 `LifecycleTreePreviewPage`, When 蒐集兩頁全部 `[data-testid="watermark-text"]` 之 `line-height` 並取其**相異值集合**, Then 該集合之 `size` **恰為 `1`**，且其唯一元素 **等於 `WATERMARK_LINE_HEIGHT`**。
  <br>🔴 **為何寫成集合大小而非在各載體各寫一條**：本專案已因「兩處各算一次」吃過虧（見本檔 `supportsWatermark` 之 🔴 註記與 `AC-N3` 之立條理由）。**各載體各一條互不相干的 AC，全綠時仍可能三個值互不相同**——`00` ＝ `1.5`、`22`／`23` ＝ `1.6`、`05` ＝ `i*22`（≈ `1.571`）**正是本 delta 前之實況**，三種值同時存在而沒有任何一條 AC 會紅。集合大小 `=== 1` 是唯一能讓「不一致」本身轉紅的形狀。
  <br>📌 **負向回歸鎖**：同一測試須額外斷言該唯一值 **不等於任一被作廢舊值**——`1.5`、`1.6`、`22/14`（≈ `1.5714`）。
  <br>⚠ **本條 ①②（集合）之涵蓋範圍僅限 DOM 疊加載體**（型別相同、單位相同、可直接比大小）。燒錄載體（canvas／PDF）之行距落在**不同單位系統**（px vs PDF point；2026-08-27 起字級 canvas `16` vs PDF `14`，📝 OLD> `14` vs `12`），**刻意不納入本集合**；其定稿值由 `AC-T4` 單獨鎖定。
  <br>🔴 **③ 跨側之行高常數等值（2026-08-21 第三輪新增；`OQ-T3-01` 選項 (c) 之連帶）**：前端與後端**各自**之 `WATERMARK_LINE_HEIGHT` **值皆為 `2`**。
  <br>⚠ **③ 不得寫成單一測試**：前後端為兩個獨立 TS 專案、兩個 runner、無共用 package ⇒ **沒有任何一個測試 import 得到兩側的常數**。沿用 `AC-N3` 之既有處置——**兩側各自對本檔宣告之字面值 `2` 斷言**（前端 vitest 一條、後端 jest 一條），**本檔即為單一權威**。
  <br>🔴 **③ 也不得併入 ①② 的集合**：即使四個載體現在都是 `2.0`，把 PDF point 的行距與 DOM 的無單位 `line-height` 放進同一個 `Set` 比較，比的是兩種單位系統下**恰好相等的數字**，而不是同一個量——`WM_FONT_SIZE` 一旦不同（canvas 16 vs PDF 14），該集合就會無故轉紅或無故轉綠。**③ 比的是「行高倍數」這個無單位量，①② 比的是 DOM 載體的實際 `line-height`，兩者是不同的斷言。**

- **AC-T4**（後端燒錄之每行位移與平鋪間距；🔴 **2026-08-21 第三輪就地改寫**，`OQ-T3-01` 選項 (c) ＋ `OQ-T3-02`）：Given `PdfLibBurner.burnPdf` 對一份三行式快照燒錄, When 檢視其每頁每個 tile 之三行文字, Then 第 `i` 行（`i` 由 `0` 起）之 y 座標為 `y − i × WATERMARK_LINE_STEP`，其中 `WATERMARK_LINE_STEP` **逐字為 `28`**（＝`WATERMARK_FONT_SIZE(14) × WATERMARK_LINE_HEIGHT(2)`；🔴 2026-08-27 UX ① 就地改寫，📝 OLD> `24`）；且 `drawText` 之 `size` 逐字為 `WATERMARK_FONT_SIZE`。
  <br>🔴 **平鋪列距 `WATERMARK_TILE_STEP_Y` 逐字為 `208`**（📝 OLD> `180`、OLD> `198`），其調整規則恆為「**把三行區塊長出來的墨跡高度原數補回去**」——不變式 `WATERMARK_TILE_STEP_Y − (2 × WATERMARK_LINE_STEP + WATERMARK_FONT_SIZE) === 138` 必須成立（`180−42`、`198−60`、`208−70` 三者皆為 `138`）。**該不變式比「等於某個字面值」更能擋住「重新挑一個看起來差不多的密度」之退化，應一併斷言。** `WATERMARK_TILE_STEP_X` 逐字維持 `260`（三行文字沿 45° 對角繪出，相鄰 tile 為平行線列、垂距 ≈ 184pt，字級放大不致相撞）。
  <br>📌 **可斷言形狀（比照 `AC-N3` 之既有處置與 `pdf-burner.spec.ts` 之既有慣例）**：以 `import` 直接斷言具名匯出常數——`WATERMARK_FONT_SIZE === 14`、`WATERMARK_LINE_HEIGHT === 2`、`WATERMARK_LINE_STEP === 28`，**且** `WATERMARK_LINE_STEP === WATERMARK_FONT_SIZE * WATERMARK_LINE_HEIGHT`（**推導關係本身也要斷**，見 `AC-T1`），**不需**真的解析 PDF 位元組。
  <br>📌 **負向回歸鎖（🔴 兩個作廢值都要鎖）**：`WATERMARK_LINE_STEP !== 15`（＝`size + 3`，本 delta 前之原始值）**且** `WATERMARK_LINE_STEP !== 20`（＝`size + 8`，**2026-08-21 第一輪之定稿值，曾進入本條 AC**——不鎖住它，實作者照第一輪 AC 寫出 `20` 也會綠）**且** `WATERMARK_LINE_STEP !== 24`（＝字級 `12` 之已作廢定稿值，2026-08-21～2026-08-27 曾進入本條 AC）。
  <br>⚠ **「燒錄迴圈確實消費該常數」在 unit 層無直接斷言載體**（`drawText` 由 `pdf-lib` 內部持有，既有 `pdf-burner.spec.ts` 亦僅斷言常數本身）。本條之殘留缺口與既有 `AC-N3` **完全同型**，非本 delta 引入；`AC-T1` 之「不得以字面值散落於 `drawText` 呼叫處」即為其唯一防線。
  <br>🔴 **平鋪間距**：後端 `stepY` **逐字為 `198`**（📝 OLD> `180`）——三行區塊之墨跡高度隨行距由 `15` 增為 `24` 而長高 `2 × 9 = 18`，`stepY` 同步 `+18` 使 **tile 間隙與本 delta 前完全相同**（與 `prototypes/05` 之 `132 → 144` 為同一理由與同一算式）。🔒 **`stepX` 逐字維持 `260`**（水平方向未受行距影響）。
  <br>📌 **`stepY` 亦須為具名匯出常數**（`WATERMARK_TILE_STEP_Y = 198`、`WATERMARK_TILE_STEP_X = 260`），理由同 `AC-T1`——否則它會以字面值躺在雙層迴圈裡，而它與行距之連動關係無人可斷。
  <br>✅ **`[ASSUMPTION]` 已解除**：本條前一版以 `[ASSUMPTION]` 鎖 `stepY = 180` 並提報 `OQ-T3-02`；該題已於 2026-08-21 第三輪由人類裁決，本條改為逐字定案值。

- **AC-T5**（Prototype 權威登錄與作廢舊值；**非約束環斷言對象**）：Given `AC-T2` 表列第 4／5 列之 prototype 載體, When 人工比對或日後改動, Then 其值**逐字為**——`00`／`22`／`23` 之 `.wm-layer span` `line-height:2.0`；`05` 之 `WM_FONT_SIZE = 14`、`WM_LINE_HEIGHT = 2.0`、`WM_LINE_STEP = 28`、`stepY = 144`。
  <br>🔒 **`prototypes/05` 與三個 DOM prototype 不受 2026-08-21 第三輪裁決影響**（它們本即為 `2.0` 倍）——第三輪只動後端側之三個數字，**ui-ux-designer 無需改動任何檔案**。
  <br>📝 **已作廢（僅供追溯，⚠ 不得用於斷言）**：`00` OLD> `line-height:1.5`｜`22`／`23` OLD> `line-height:1.6`｜`05` OLD> 每行位移 `22px`、OLD> `stepY = 132`｜後端 OLD> 每行位移 `size + 3`（＝`15`）、OLD> 每行位移 `size + 8`（＝`20`，第一輪定稿值）、OLD> `stepY = 180`。
  <br>📌 **為何標為非斷言對象**：本 repo 之測試**從未以 `fs` 讀取 `prototypes/*.html`**（既有 `AC-N2` 第 5 列亦同）；prototype 是設計權威與人工比對基準，不是執行期載體。test-generator **不需**為本條產生測試；若日後建立 prototype 靜態掃描，本條即為其逐字期望值來源。

## Error Scenarios
- 未授權存取/未登入：見 [error-handling.md#public](../error-handling.md#public)、[#file](../error-handling.md#file)。防竄改與已知限制：[NFR-007](../nfr.md#watermark)。
- **業務子分類之使用部門不相符**（🟢 APPROVED）：一律回 **404 `DOCUMENT_NOT_FOUND`**（✅ OQ-E06-03 定案，既有錯誤碼、不新增），見 [error-handling.md#dept-restriction](../error-handling.md#dept-restriction)；規則權威＝[F041](F041-user-subtype-business-scope.md)。

### 檔案動作載體遷移 delta（🔴 2026-08-26 真人回報） {#file-action-carrier-delta}

- **AC-D3b**：Given session 已逾時, When 點擊本 feature 之前台詳情頁與檢視器之「下載」「列印」, Then 使用者**不得**看到後端
  JSON 錯誤被當成網頁呈現，而應被導回登入頁（[F001](F001-auth-login-session.md#session-lost-redirect-delta)
  `AC-S1`／`AC-S5`）。載體由 `<a href>`（top-level navigation）改為代理串流
  （`downloadViaBlob`／`openPdfViaBlob`）；**端點、燒錄與稽核行為逐項不變**，僅取得位元組之方式改變。
  📝 已作廢（⚠ 不得復原）：`<a href={documentDownloadUrl(id)}>`／`<a href={documentPrintUrl(id)} target="_blank">`
  ⚠ 列印之新分頁須於 click handler 內、任何 `await` **之前**同步 `window.open('', '_blank')` 取得，
  否則會被彈出視窗封鎖器擋下。

## Related
- **來源契約: [upstream-hr-source-contract.md](../upstream-hr-source-contract.md)**（§5.3 `COMPFULLNM`、§8 浮水印欄位對應定案、§8.2 取值規則、§8.3 最細單位、§8.4 無下層者留空收合）
- Diagram: [../diagrams/F020-watermark-audit.mmd](../diagrams/F020-watermark-audit.mmd)
- Data: [DOCUMENT_ATTACHMENT](../data-model.md#attachment-entity), [AUDIT_LOG](../data-model.md#auditlog-entity)
- Depends on: [F016](F016-pdf-ojt-attachment.md), [F019](F019-public-list-browsing.md); Blocks: [F023](F023-audit-logging.md)
- **使用者子分類（業務／其他）規則權威**: [F041](F041-user-subtype-business-scope.md)（授權檢查層之使用部門判斷；🟢 APPROVED 2026-08-11 人類閘門通過）
- NFR: [浮水印一致性](../nfr.md#watermark), [檔案下載效能](../nfr.md#performance)
- OQ: OQ-NFR007a（視覺樣式）, OQ-NFR007b（時區/格式）
- **2026-08-16 使用者裁決**: OQ-D18-01（只做前台、後台維持 RAW）／OQ-D18-02（策略 A）／OQ-D18-03（前台燒錄後仍寫稽核）／OQ-D18-04（**analyst 建議已被 lead 推翻**，改採前台/後台分流）／OQ-D18-14（員工編號留空不頂替）／OQ-D18-24（亂碼根因＝Dockerfile 缺 `assets`）／**OQ-D18-25（同日第二次閘門：前台使用表單 PDF 亦燒錄，推翻 `OQ-E05-03`）**。見 [§前台下載燒錄範圍擴張 delta](#front-burn-scope-delta)。
- **前台附錄燒錄之權威**：[F039](F039-appendix-management.md#front-burn-delta)（其 AC-29 與端點表已就地改寫）
- **前台使用表單燒錄之權威**：[F018](F018-usage-form-management.md#front-burn-delta)（`AC-D11`～`AC-D14`；`OQ-E05-03` 已就地改寫為推翻）
- **2026-08-20 使用者裁決（D9 delta）**：`OQ-D9-01`（色深＋不透明度皆調、對比度 ≥ 3:1）／`OQ-D9-02`（5 處全動）／`OQ-D9-03`（`/pdf` 未燒錄＝安全缺陷）／`OQ-D9-04`（pdf.js 自繪 canvas）／`OQ-D9-05`（#2＋#4 同批）／`OQ-D9-06`（浮水印專用簡稱常數）／`OQ-D9-07`（`AS`→和潤企業、`AE`→和潤電能）／**`OQ-D9-08`（🔴 全面推翻 `OQ-FM-01`／`OQ-D18-01`，後台四類皆燒錄）**／`OQ-D9-09`（不保留原始檔路徑）／`OQ-D9-10`（後台寫稽核）／`OQ-D9-11`（浮水印身分＝操作者）。見 [§D9 浮水印呈現 delta](#d9-watermark-delta)、[§後台燒錄範圍 delta](#backend-burn-delta)。
- **🔴 待 system-architect（2026-08-20 D9 delta 新增）**：① **pdf.js／react-pdf 之具體選型與 CJK 字型策略**（既有燒錄側已嵌 Noto Sans TC，前端渲染側需另行驗證中文顯示；⚠ 本 repo 之 CJK 缺字曾以「單元測試恆綠、容器內才炸」形態出現，見 `AC-D7` #6 註）；② **`AC-N9` 之渲染 seam 形狀**（縮放參數必須可 spy，否則該 AC 無執行期載體）；③ **後台全面燒錄對 [NFR-001](../nfr.md#performance) 之影響**——後台下載自本日起每次皆需取回原件＋燒錄（既有實測暖機後 10 頁 CJK ≈ 250ms，但後台清單頁可能連續多次下載），是否需快取或串流式燒錄；④ **`GET /documents/:documentId/usage-forms/:formId/download` 由 `{url}` JSON 改為代理串流**之呼叫端調和（`AC-N21`／[F018](F018-usage-form-management.md) `AC-D23`）；⑤ `COMPANY_SHORT_NAMES` 之落點（建議與 `COMPANY_FULL_NAMES` 同模組以利 **INV-C2** 之型別層防護）。
- **⚠ 待 ui-ux-designer（2026-08-20 D9 delta；🔴 已依同日第二輪裁決更新）**：① `prototypes/22-*`／`23-*` 之浮水印色值與不透明度**逐字改為 `AC-N2` 現行定稿值**（**`#334155`／`0.30`**，⚠ **非**先前版本之 `0.57`），不得自行發明；② `prototypes/05-public-viewer-watermark.html`：預覽區由 `<iframe>` 改為 canvas 佔位（`AC-N4`），**且 `.wm-layer` 疊加層整段移除**（`AC-N7`；該頁改以「內容層已燒錄」表達浮水印），**頁尾之浮水印格式字幕必須保留**（`AC-N67` ①）；③ 後台五頁之 `data-wm-note` 列內註記（`AC-N20`，`OQ-D9-33` 已定案＝採納）。<br>🔴 **不得順手移除 `22-*`／`23-*` 之疊加層**——該兩頁無內容層可燒錄，疊加層是其唯一浮水印載體（`AC-N66`）。
- **待 system-architect（2026-08-16 delta）**：① **前台/後台下載路徑之分流設計**（現行 `GET /documents/attachments/download` 為前後台共用、核發 SAS 由前端直取 Blob，伺服器不經手位元組；燒錄要求位元組流經應用層 ⇒ 端點語意由「回傳 URL」變為「回傳串流」，僅前台側改變）；② 燒錄之延遲與 Blob 出向流量對 [NFR-001](../nfr.md#performance) 之影響；③ `watermarkLines()` 共用函式之落點（供 viewer／tree preview／change-history diff 三處消費）。
