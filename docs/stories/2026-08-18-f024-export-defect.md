# F024 文件調閱歷程查詢後台「匯出」鈕失效 — Delta Story

> **狀態**：待人類閘門裁決（本檔僅收斂產品決策與待決問題，**不含 AC**——AC 由 spec-writer 於裁決後另行撰寫）
> **提出**：team-lead 委託 product-analyst 產出 | **日期**：2026-08-18
> **背景關聯**：本案即 [`open-questions.md`](../specs/open-questions.md) `OQ-D18-26` 之延續——該題已於 2026-08-16（F037/F038/F039 匯出 delta 期間，system-architect 查證）登錄為「既有缺口、本 delta 明確不修」，並留下三個選項待「下一輪」裁決。本檔即該下一輪。

---

## 1. 缺陷定性

### 1.1 現況事實（查證，來源：team-lead 提供並經本檔覆核程式碼）

- 前端 `frontend/src/pages/AccessHistoryPage.tsx:175-188` 之 `onExport()`：呼叫 `exportAccessHistory(buildFilters())` → **丟棄回傳值** → 無條件顯示 `{ tone: 'success', text: '已匯出查詢結果（CSV，草案格式）' }`。
- `frontend/src/api/endpoints.ts:604-610` 之 `exportAccessHistory()`：回傳型別為 `Promise<{ rows: AccessHistoryRow[]; total: number }>`，內部呼叫一般 JSON `apiFetch`（非下載）。
- `backend/src/audit/access-history.controller.ts:74-87` 之 `GET /admin/access-history/export`：回傳 `{ rows: result.items, total: result.total }`（JSON），非 CSV 位元組；亦無 `Content-Disposition`／`text/csv` 標頭。
- 對照組（同 repo 已上線之三個匯出，皆採 `fetch → Blob → object URL → 程式化 <a download>` 之 `downloadViaBlob()` 樣式，見 `frontend/src/api/download-blob.ts`）：`exportDocumentChanges()`（F037，`endpoints.ts:648`）回 `Promise<void>`；`AppendixManagementPage.tsx`（F039）已有對應 `export.test.tsx`。**確認 F024 為本 repo 四處「匯出」鈕中唯一未產生實體檔案者**。

⇒ 使用者點擊「匯出」，介面**無條件**顯示成功訊息，但實際上沒有任何檔案落地。

### 1.2 定性判斷：**既有功能之缺陷**，非「未完成之草案」（建議）

**建議預設值**：定性為缺陷修復（bug fix），而非新功能立項。

**理由**：
1. 按鈕已上線、可點擊、呼叫真實端點、且無條件顯示「已匯出」之成功訊息——UI 呈現方式是「已完成之功能」（無 disabled、無「即將推出」提示），使用者無從得知這是草案。
2. 使用者體感為「操作回報成功、但結果不存在」，是典型的缺陷模式（silent no-op 但仍回報成功），而非「功能未做」（未做的功能通常按鈕不存在、或有明確的 disabled/coming-soon 標示）。
3. 本專案權威文件已有定性先例：`OQ-D18-26` 之標題逐字為「🔴 **既有缺口**：F024 之『匯出』實際上不產生任何檔案」——使用「缺口」而非「未實作草案」措辭，分類欄位標記為 `[CLARIFY]`（既有缺口）。
4. F024 規格（`F024-access-history-query.md:22`）確實在 Alternative Flows 把匯出寫成「格式草案 CSV/Excel」——但這是**規格撰寫當時的免責用詞**，描述的是「格式尚未定案」，不代表「按鈕本身允許不產生檔案」。規格用詞與已上線行為之間的落差，正是本次要收斂的對象，不應反過來用規格的免責措辭去合理化「按了假裝成功」的現況。

**推論部分（非查證）**：定性為 bug-fix 或新功能，可能牽動優先權排序與是否需要走完整 US 立項流程——此為流程判斷，非本檔權責，僅供人類參考。無論如何分類，**新增「CSV 真的產生」這個可觀測行為，本質上仍需要新的 AC**（不是零行為變化的重構型修復）。

---

## 2. 使用者影響

- **直接影響**：SysAdmin／ICSOPAdmin（本頁僅此二角色可達）點擊匯出後，**得到一個虛假的成功訊息，實際沒有任何檔案**。若使用者依賴此功能做稽核留存、法遵佐證、離線分析，會在需要時才發現資料從未真正匯出過——且系統從未提示過任何異常。
- **信任面影響**：本頁是「文件調閱歷程」稽核查詢頁，其存在目的即為稽核與法遵佐證；一個聲稱成功但實際失敗的匯出功能，會直接損害此頁面「可信」的核心價值主張。
- **範圍**：僅影響 F024 本身之匯出（`GET /admin/access-history/export`）；F024 之「查詢」（`GET /admin/access-history`）功能正常，不受影響。

---

## 3. 漣漪分析（哪些檔案／規格／既有測試會被牽動）

> 以下為**查證**結果（實際讀取程式碼與規格確認），非推測。

### 3.1 前端

| 檔案 | 現況 | 若修復需變動 |
|---|---|---|
| `frontend/src/pages/AccessHistoryPage.tsx` | `onExport()` 丟棄回傳值、無條件顯示固定成功訊息（175-188 行） | 改為呼叫 `downloadViaBlob`-based 匯出、依實際結果決定訊息（成功/上限超出/其他錯誤） |
| `frontend/src/api/endpoints.ts` | `exportAccessHistory()` 回 `Promise<{rows,total}>`（604-610 行），走 `apiFetch` | **破壞性簽章變更**：需改為比照 `exportDocumentChanges()` 回 `Promise<void>`、改用 `downloadViaBlob()` |
| `frontend/src/pages/AccessHistoryPage.test.tsx:141` | 既有單元測試斷言**現行（有缺陷）之行為**：呼叫 `exportAccessHistory` 並顯示既有成功訊息 | 此測試斷言的是缺陷本身之行為，修復後必須連同改寫，非「順便壞掉」 |

### 3.2 後端

| 檔案 | 現況 | 若修復需變動 |
|---|---|---|
| `backend/src/audit/access-history.controller.ts` | `exportHistory()` 回 JSON（74-87 行）；`EXPORT_MAX = 100000`（19 行，僅作為 pageSize 上限傳入查詢，**並無「超過即拒絕」之檢查邏輯**——此常數本身即不符合「不接受靜默截斷」原則，見 §4 問題4） | 改回 CSV bytes（`Content-Type: text/csv`、`Content-Disposition`）、改用共用產生器、改上限判斷邏輯 |
| `backend/src/storage/csv-export.ts` | **已存在、已測試**之共用 CSV 產生器（`toCsvBuffer`／`assertExportRowLimit`／`exportFileName`／`formatExportTimestamp`），目前供 F037/F038/F039 三處匯出共用 | 可直接複用，**技術上改動量小**（呼應 `OQ-D18-26` 選項 (a) 之「共用產生器已在」判斷） |
| `backend/src/audit/access-history.controller.spec.ts` | `TS-015`／`TS-005`／`TS-016` 三組既有單元測試斷言現行 JSON 回傳形狀與路由/權限 metadata（47、79-86、129-138 行） | 路由/權限斷言可保留，**回傳形狀斷言需重寫**為 CSV |
| `backend/test/int/access-history.itest.ts:273,283` | 既有整合測試呼叫 `/admin/access-history/export` | 需檢視其斷言是否綁定 JSON 回應形狀，若是則需同步改寫 |

### 3.3 🔴 關鍵：專門鎖定「不得修復」的既有回歸測試

`backend/src/change-history/change-history-export.routes.spec.ts` 第 97-122 行，`describe('🔒 F024 匯出「不外溢」回歸鎖定（F037 AC-D8／F039 AC-D10；範圍紀律 J）', ...)`：

此測試套件是 F037/F038/F039 那一輪 delta**刻意寫來禁止 F024 被順手改動**的「不外溢」回歸鎖，逐條斷言：
- `exportHistory()` 原始碼仍含 `'return { rows: result.items, total: result.total };'`
- 原始碼**不得** import `csv-export`／`toCsvBuffer`
- 原始碼**不得**含 `Content-Disposition`／`text/csv`／`0xEF`
- 仍掛既有權限 decorator ＋ `EXPORT_MAX` 常數仍存在

⇒ **若本次真的修復 F024 匯出，這整組測試會如預期般變紅**——但這是「設計上的預期紅燈」，不是意外破壞。此測試存在的目的正是「範圍紀律 J：F024 不在 F037/F038/F039 delta 範圍」，而本次 delta 的目的正是要推翻範圍紀律 J（把 F024 正式納入）。**這需要明確的人類裁決記錄**（比照本專案「就地改寫」之既有慣例），而非被當成一次意外的測試破壞來處理。

### 3.4 規格文件（若走「真正修復」路線）

| 文件 | 現況 | 需連動 |
|---|---|---|
| `docs/specs/features/F024-access-history-query.md` | Alternative Flows 第 22 行仍寫「格式草案 CSV/Excel」 | 待 spec-writer 改寫為定案敘述並新增 AC delta |
| `docs/specs/error-handling.md#export` | 第 240 行「對應 2026-08-16 使用者裁決之**三處**匯出」；第 262 行「⚠ 範圍紀律：F024 之既有匯出**不在本次範圍**」 | 若 F024 納入，此段落之「三處」與排除語句需修訂為「四處」 |
| `docs/specs/open-questions.md` `OQ-D18-26` | 標記 `[CLARIFY]`、本 delta 明確不修 | 待本輪裁決後正式結案，記錄採用之選項 |
| `docs/specs/data-model.md` `AUDIT_LOG.actionType` | **僅當**下方問題 5 裁決為「要稽核」時才需 additive 擴充枚舉 | 視裁決而定 |

---

## 4. 待決問題表

> 每題含建議預設值與理由，供人類勾選或修正。標明**查證**（有明確程式碼/規格依據）或**推論**（本檔之產品判斷、無既有定案可循）。

| # | 問題 | 建議預設值 | 理由 | 依據 |
|---|---|---|---|---|
| **Q1** | 缺陷定性：既有功能壞掉，還是未完成草案？ | **既有功能之缺陷**（非新功能） | 見 §1.2：UI 呈現為已完成功能、無條件回報成功；`OQ-D18-26` 既有定性為「缺口」而非「草案」 | 查證＋推論（分類本身之流程意義為推論） |
| **Q2** | 匯出欄位清單，與畫面表格之對應關係？ | **相同**（非超集非子集）：匯出＝主表格 10 欄，逐欄同名同序——操作人員／員工編號／公司／部門／處室／角色／類型／對象／操作類型／操作時間 | 比照 F037/F038/F039「欄位＝畫面所見」原則（`error-handling.md#export`）；F024 主表格本身已含「對象」欄，其邏輯（`documentNumber \|\| lifecycleName \|\| formId \|\| '—'`）已滿足規格第 28 行「非文件類型無 `documentId` 時改以『對象』欄呈現」之要求，可直接複用 | 查證：`AccessHistoryPage.tsx:352-361`（表頭）、`:70-73`（`targetPrimary`） |
| **Q2a**（子問題） | 「操作類型」欄之值層格式：畫面顯示為複合格式 `VIEW · 檢視`（代碼＋中文標籤），但 `error-handling.md#export` 通則明訂「列舉/代碼欄一律輸出中文標籤，**不得**輸出屬性名或列舉代碼」（F037 `AC-D11`① 先例：只出標籤不出代碼） | **建議只出中文標籤**（如「檢視」），不含 `VIEW` 代碼——優先遵守通則，而非「逐字比照畫面」 | 若採此建議，CSV 該欄與畫面**不會逐字相同**（畫面多了代碼前綴），此落差需人類明確認可，不宜由 test-generator 自行判斷 | 查證：`AccessHistoryPage.tsx:397,447`（畫面複合格式）；`error-handling.md:250`（通則原文） |
| **Q3** | 明細（含浮水印快照）是否納入匯出？ | **不納入**——匯出範圍＝主表格，不含展開明細專屬之「浮水印快照」「對象名稱／說明」兩欄 | (1) F037/F038/F039 既有先例之匯出欄位皆對應主查詢列表，未見「展開明細」一併納入之前例；(2) 浮水印快照為單一長字串，與其餘短值欄位格式不一致，不利 Excel 閱覽；(3) **推論**：大量匯出（上限筆數下）情境將每筆完整浮水印字串（本質為姓名/員工編號/部門/處室/時間之聚合）批次落地成可攜出檔案，個資聚合風險高於「畫面上單筆展開查看」——本專案對「大量個資批次可攜出」尚無明文定案先例，故列為待決而非逕自排除 | 推論（無既有定案可查證；本專案「個資態度」散見於 F041 存在性隱藏、dev 環境遮罩等原則，但均非直接處理本情境） |
| **Q4** | 筆數上限行為：不接受靜默截斷 | **改採與 F037/F038/F039 一致之共用機制**：`storage/csv-export.ts` 之 `EXPORT_ROW_LIMIT = 10,000`＋`EXPORT_ROW_LIMIT_EXCEEDED`（400，訊息含上限值，不產生檔案）；**廢棄**現行 `EXPORT_MAX = 100000` 常數 | (1) 現行 `EXPORT_MAX` 語意是「查詢分頁上限」而非「匯出行數上限」，且**沒有任何「超過即拒絕」的檢查邏輯**——若真的修好匯出但沿用它，會產生「超過 10 萬筆時靜默只給前 10 萬筆」的新缺陷，正是使用者要求不接受的靜默截斷；(2) 沿用 F037/F038/F039 已核准之機制與錯誤碼可維持全站一致（`error-handling.md#export` 明訂「三處匯出共用同一組規則與同一錯誤碼」） | 查證：`access-history.controller.ts:19,84`（`EXPORT_MAX` 現況及其用法）；`csv-export.ts:20,36-42`（既有機制） |
| **Q4a**（子問題） | 上限數值本身是否維持 10,000，還是 F024（全公司三年保留之全部調閱紀錄）量級不同、需另訂數值？ | **建議先維持 10,000**（與三處一致），除非有查證顯示 F024 查詢結果量級明顯高於單一文件/循環之變更歷程 | 維持一致優先於各自為政；但此為**推論**，F024 之全公司調閱量體是否常態性超過萬筆，本檔未查證（需查詢近期資料量或由 system-architect 評估） | 推論（待查：F024 實際資料量級） |
| **Q5** | 匯出行為本身要不要記稽核？ | **建議記稽核**，但需新增動作代碼（非重用既有代碼） | 查證：`AUDIT_LOG.actionType` 現有列舉（`data-model.md:484`）為 `VIEW/DOWNLOAD/PRINT/LIFECYCLE_VIEW/LIFECYCLE_DOWNLOAD/LIFECYCLE_PRINT/CHANGE_LOG_VIEW/LIFECYCLE_CHANGELOG_VIEW/LIFECYCLE_CHANGELOG_DOWNLOAD/ALERT_RESOLVED`——**沒有任何代碼是為「查詢/匯出 AUDIT_LOG 本身」設計的**。F037/F038 匯出能重用既有代碼（`CHANGE_LOG_VIEW`／`LIFECYCLE_CHANGELOG_VIEW`），是因為那兩處匯出的「查詢對象」（文件/循環變更事件）本身早有「查詢即記一筆」的既有義務；**F024 沒有這個既有義務可以攀附**——事實上，查證 F023/F024 全部規格文本，**F024 的『查詢』動作本身目前也完全不記稽核**（不像 F037/F038 查詢即記 `CHANGE_LOG_VIEW`）。若要補「匯出記稽核」，等同要先決定「F024 查詢本身是否也該記稽核」這個更上層的問題。**這是唯一會牽動 schema（additive 擴充 `actionType` 枚舉）的裁決點**，其餘 Q2-Q4 皆不涉及 schema 變更 | 查證（枚舉現況）＋推論（是否記稽核之產品判斷、新代碼命名皆無既有定案） |
| **Q6** | 成功／失敗訊息之正確措辭 | 見下方詳述 | 比照 F037/F039 既有句式體例，並依 F024 自身之量詞/限定詞 | 查證＋草擬 |

### Q6 詳述：訊息措辭建議

**現況需先解決的事**：無論最終走哪個選項，現行文案「已匯出查詢結果（CSV，草案格式）」**在檔案不存在時仍宣稱成功**，此文案本身即為缺陷之一部分，必須更動。

**既有句式體例**（查證）：
- F037 `AC-D10`：成功訊息以逐字片段 `已匯出 ICSOP 程序書變更歷程（CSV，UTF-8 BOM）` 起始；超限訊息含逐字片段 `符合條件之事件為 {N} 筆，超過匯出上限 10000 筆，請縮小查詢條件`，且 `EXPORT_ROW_LIMIT_EXCEEDED` 字串需同容器可見。
- F039 `AC-D12`：成功訊息 `已匯出附錄清單（CSV，UTF-8 BOM）`；超限訊息 `符合條件之筆數為 {N} 筆，超過匯出上限 10000 筆，請縮小篩選條件`。
- F039 `AC-D12` 明文註記：F037/F038 用**限定詞**「查詢條件」＋**量詞**「事件」；F039 用**限定詞**「篩選條件」＋**量詞**「筆數」；**三處刻意不對齊為同一句**。

**F024 應落在哪一種句式**（推論，依現況畫面文案判斷）：
- **限定詞**：F024 頁面為「查詢條件」式介面（有送出查詢按鈕、非即時篩選式清單），比照 F037/F038 用「查詢條件」，而非 F039 的「篩選條件」。
- **量詞**：F024 畫面本身已使用「筆」（`AccessHistoryPage.tsx` 之「共 {result.total} 筆」「顯示...筆」），故建議量詞比照 F039 用「筆」，而非 F037 的「事件」。

**建議草案**（供 spec-writer 正式定稿，非 AC）：
- 成功：`已匯出文件調閱歷程（CSV，UTF-8 BOM）`
- 超限：`符合查詢條件之筆數為 {N} 筆，超過匯出上限 {X} 筆，請縮小查詢條件`（`{X}` 依 Q4a 裁決結果代入），且錯誤碼字串需同容器可見（兩段式斷言，比照 `error-handling.md#export`）。

---

## 5. 紀律自查

- 本檔未撰寫任何 AC，未觸碰任何程式碼或測試檔案。
- 所有「現況事實」章節之敘述已逐一重新查證程式碼與規格原文（見各處行號引註），未直接照搬 team-lead 訊息中的敘述而未覆核。
- 凡本檔提出但本專案無既有定案可查證者，已標明為「推論」；有明確程式碼/規格依據者標明「查證」。
- Q3（浮水印快照個資風險）與 Q5（匯出稽核義務）為本檔判斷風險最高之兩題——分別涉及「大量個資可攜出」與「稽核系統本身缺乏二階稽核」，建議人類優先審閱此二題。
