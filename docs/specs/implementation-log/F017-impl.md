---
type: implementation-log
feature_id: F017
feature_name: 後台文件清單「匯出（CSV）」delta（AC-X1～AC-X17）
status: complete
last_updated: 2026-08-31
---

# F017: 清單匯出（CSV）delta — Implementation Log

> **範圍**：僅 2026-08-31 之匯出 delta（`AC-X1`～`AC-X17`）。F017 之既有 15 欄／13 項篩選／子樹 chip／
> 統計卡／排序／分頁一律未動（`AC-X16` 零漣漪鎖定）。
>
> 本輪為 Uncle-Bob 約束環模式（**簡易版 ring**：僅 backend jest／frontend vitest，
> **無 Playwright、無 e2e、無整合測試、無 Stryker**，架構 §13 明訂）。環由 `test-generator`
> 於實作前 blind-to-implementation 撰寫，本 agent **僅撰寫 production code**，
> 對 `*.spec.ts`／`*.test.ts`／`*.test.tsx` 之改動筆數為 **0**。
> **本輪零爭議申訴**——環釘死之 4 個契約與 spec／prototype 之間未出現互斥。

## RED 相位（**由 `test-generator` 於本 agent 開工前完成**）

### ① 本 agent 之自我揭露（保留，不刪）

🔴 **本 agent 未自行留下 RED 相位之實跑紀錄**：我把 9 個環檔當成可執行規格逐條讀完後**直接進入實作**，
未先跑一次紅燈。故本檔 PASS 欄位是我的實跑事實，但「環確實有鑑別力」這件事**不是由我的 RED 紀錄證明**。
📌 記錄於此以免日後被誤讀為「已驗證環會紅」。
📌 **「我沒跑」與「有人跑了」是兩件事，兩者都留在紀錄裡**——下節即為後者。

### ② RED 相位之實跑紀錄由 `test-generator` 完成，摘要如下（lead 存有完整記錄）

環在本 agent 開工**之前**即已實跑並回報 lead，該紀錄使上節之 caveat **由開放轉為已關閉**：

| 套件 | RED 當下 | 紅 | 綠 | 既有基線是否被動到 |
|---|---|---|---|---|
| backend | 189 suites / 3036 tests | **5 紅 suite／95 紅測試** | 2941 passed | `2941 = 2925 + 16` ⇒ **既有基線一個未動** |
| frontend | 116 files / 1774 tests | **3 紅 file／34 紅測試** | 1740 passed | `1740 = 1723 + 17` ⇒ **既有基線一個未動** |

**逐檔紅因**（皆為「功能缺席」，非 fixture 壞掉）：

| 環檔 | 紅因 |
|---|---|
| `documents.export.service.spec.ts` | 51 案 —— `exportDocuments is not a function` |
| `documents.export.controller.spec.ts` | 21 案 —— 找不到 `@Post('export')` handler |
| `ojt-status-label.spec.ts` | 6 案 —— `OJT_STATUS_LABEL` 為 `undefined` |
| `export-link-order.spec.ts` | 7 案 —— 模組不存在 |
| `main.export-bodyparser-order.spec.ts` | 8 案 —— `main.ts` 尚未改造 |
| `DocumentListPage.export.test.tsx` | 19 案 —— `Unable to find button 匯出` |
| `download-blob.export.test.ts` | 9 案 —— 第三參數被忽略 |
| `DocumentListPage.exportVectors.test.ts` | 6 案 —— `orderedLinks` 未匯出 |

🔴 **關鍵的一點（這才是 RED 紀錄真正的價值）**：`test-generator` **逐案確認過各案之前置條件皆已成功執行**
——篩選確實到 80 筆、排序確實生效、空狀態確實出現，失敗點只在功能缺席。
⇒ 那些紅**不是 fixture 壞掉造成的假紅**，而是斷言本身具鑑別力。

🔴 另：`test-generator` 於建環時自行抓到並修掉**三條恆真斷言**（`downloadViaBlob` additive 三條、
`formatExportDate` 負向鎖、全域 parser 不得帶 `limit`），補上正向半句後才轉紅——
負向斷言在功能缺席時本來就恆真，只寫負向半句等於零鑑別力。

### ③ 兩處數字落差，逐項說明（不靜默傳抄、不靜默修正）

**(a) frontend `1774`（RED）→ `1777`（GREEN），+3 —— 已由本 agent 查明，非誤差**：
本 delta 之生產程式碼使**三個既有的參數化守門案例**多長出 3 個案子，且**三個都綠**：

| 既有守門檔 | 機制 | 新增之案 |
|---|---|---|
| `frontend/src/api/endpoint-contract.test.ts` | `it.each(templates)`，templates 解析自 `endpoints.ts` | `/admin/documents/export → 後端存在對應 route` |
| `frontend/src/api/proxy-file-endpoint-coverage.test.ts` | 兩個 `it.each(atRisk)`，atRisk 掃描自 `endpoints.ts` 之檔案類端點 | `vite.config.ts spaBypass 放行 /admin/documents/export（dev）`、`nginx.conf regex location 攔截 /admin/documents/export（容器）` |

⇒ `1774 + 3 = 1777`，帳目結清。**這 3 個案子是本 delta 最便宜的一份保險**：新端點是否被兩層代理涵蓋、
前端打的 URL 後端是否真有對應 route，全部**自動**被既有守門網接住，不需任何人記得去補（見下方「代理層查證結論」節）。

**(b) backend 紅測試數 `95`（彙總）vs 逐檔相加 `93`，差 2 案 —— 已定位、無法定案**：

兩者各自都與總數自洽（`3036 − 95 = 2941`；且 `95 + 16 = 93 + 18 = 111` ＝環之總案數），
差別只在「哪 2 案在 RED 當下算紅」。

**成因（lead 溯源）**：該 +2 **源自 `test-generator` 之 RED 自報**，且於其**兩份**報告中**一致出現**
——**非本 agent 之轉抄誤差**：

| test-generator 之 RED 報告 | 彙總紅測試 | 逐檔相加 | 差 |
|---|---|---|---|
| 追加 `main.export-bodyparser-order.spec.ts` **前**（5 檔／101 案） | 87 | `51+21+6+7 = 85` | +2 |
| 追加**後**（6 檔／111 案） | 95 | `51+21+6+7+8 = 93` | +2 |

同一份報告內另有一處小出入：第一份自報「5 檔／101 案」，但其逐檔案數相加為 `52+23+8+8+11 = 102`。

**為何無法定案**：lead 手上只有這兩份報告、無原始 stdout，而 **RED 狀態已不存在**（實作已落地）
——要重現須先把生產碼全部退掉，代價遠大於價值。故本檔**以彙總數為準、逐檔數視為約值**，
**不擅自修正亦不假裝一致**。

🔒 **可定案之錨點（讓上述 ±2 之影響一目了然）**：
**GREEN 側之兩個總數（backend `3036`、frontend `116 files / 1777`）由 lead 於實作完成後獨立重跑確認**，
與本 agent 之實跑、`test-generator` 之回報**三方一致**。
⇒ **不確定性只存在於 RED 側之紅案分佈；GREEN 側是三方獨立驗證過的。**
無論 93 或 95，`2925` 之既有基線一個未動、環之 111 案全部落在新功能上，**不影響任何結論**。

## Test Results Summary

### 環（約束檔 ↔ AC ↔ 結果）

| 代號 | 檔案（皆為 `test-generator` 所著，本 agent 未改一字） | 對應 AC | 案數 | 結果 |
|---|---|---|---|---|
| BE-1 | `backend/src/documents/documents.export.service.spec.ts` | `AC-X1`／`AC-X2`／`AC-X3`／`AC-X4`／`AC-X5`／`AC-X6`／`AC-X7`／`AC-X8`／`AC-X11` ②③／`AC-X12`（邊界）／`AC-X13`／`AC-X15`／`AC-X16` ⑤ | 52 | PASS |
| BE-2 | `backend/src/documents/documents.export.controller.spec.ts` | §Interface Contract／`AC-X10`／`AC-X11` ⑤／`AC-X13`／`AC-X17`（①②③④ 檢查順序）／`AC-X16` ⑧⑨ | 23 | PASS |
| BE-3 | `backend/src/documents/export-link-order.spec.ts` | `AC-X6`（欄內順序純函式，跨執行環境向量後端側） | 8 | PASS |
| BE-4 | `backend/src/documents/ojt-status-label.spec.ts` | `AC-X4`（三值中文標籤，跨執行環境向量後端側） | 8 | PASS |
| BE-5 | `backend/src/documents/documents.export.zero-ripple.spec.ts` | `AC-X16` ⑥⑦⑨（靜態掃描：無第二份產生器／無新增錯誤碼／`csv-export.ts` 行為不變） | 11 | PASS |
| BE-6 | `backend/src/main.export-bodyparser-order.spec.ts` | `AC-X12` 第三條陷阱／架構 §13.2 ⑦（`main.ts` 四行之**靜態字面**順序） | 9 | PASS |
| FE-1 | `frontend/src/pages/DocumentListPage.export.test.tsx` | `AC-X9`／`AC-X10`／`AC-X11` ①②／`AC-X12`（前端不得檢查）／`AC-X13`／`AC-X14`／`AC-X16` ①②③④ | 25 | PASS |
| FE-2 | `frontend/src/api/download-blob.export.test.ts` | `AC-X14`（下載途徑、additive 第三參數）／`AC-X16` ⑩ (ii)／§Interface Contract（body 恰兩鍵） | 14 | PASS |
| FE-3 | `frontend/src/pages/DocumentListPage.exportVectors.test.ts` | `AC-X4`／`AC-X6`（跨執行環境向量**前端側**） | 12 | PASS |

> ⚠ **環實際為 9 檔而非派工單所列之 8 檔**：BE-6 係本 agent 開工後由 `test-generator` 追加
> （lead 事後批准之追加項）。**教訓已沉澱**：一律跑整套、收工前以 `git status --short` 對一次未追蹤檔清單，
> 不可只跑派工單列出的檔。

### 機器閘門（實跑數字）

| 閘門 | 指令 | 結果 |
|---|---|---|
| backend 型別 | `cd backend && npx tsc --noEmit` | **0 error**（exit 0） |
| backend 單元 | `cd backend && npm test -- --maxWorkers=4` | **189 suites / 3036 tests 全綠** |
| frontend 型別 | `cd frontend && npx tsc --noEmit` | **0 error**（無輸出） |
| frontend 單元 | `cd frontend && npm test -- --maxWorkers=4` | **116 files / 1777 tests 全綠** |
| 環之小計 | 上列 9 檔 | backend 111 案／frontend 51 案，**共 162 案全綠** |

**既有基線之零回歸**：lead 提供之實測基線為 backend 183 suites／2925 tests、frontend 113 files／1723 tests。
檔數之差額 **恰為環的 9 個新檔**（backend 183+6=189、frontend 113+3=116）。
案數方面：backend `2925 → 3036`＝環的 111 案；frontend `1723 → 1777`＝環的 51 案 **＋ 3 案**，
該 3 案是**既有參數化守門檔**因本 delta 新增端點而自動長出的（且全綠，明細見「RED 相位」§③(a)）。
**既有測試無一轉紅、期望值一字未改。** 兩套件**循序**執行（本機 16GB 上限規範），未平行。

**零測試碼佐證**：`git status` 中之測試檔全數為 `test-generator` 所建之未追蹤新檔；
已追蹤之測試檔改動筆數為 **0**。`docs/`／`prototypes/` 亦未動（本檔除外——那 9 個 docs／prototype 之修改
是本 agent 開工前即存在的上游 agent 產出，已定稿）。

## Files Changed

### Backend — 新增

| File Path | Change Type | Description |
|---|---|---|
| `backend/src/documents/export-link-order.ts` | new | `orderLinksForExport(links, linkTargetId?)`——第 12 欄之欄內順序純函式（`AC-X6`／架構 §13.3 (ii)）。命中者前置、兩段內部各自維持原相對順序；未提供命中值或無命中 → 原樣。 |
| `backend/src/documents/document-export-columns.ts` | new | 十四欄之逐字表頭與取值（`AC-X1` ②／`AC-X3`），含 `exportChiefValue()`（`AC-X5`）與 `exportLinkValue()`（`AC-X6`）。 |

### Backend — 修改

| File Path | Change Type | Description |
|---|---|---|
| `backend/src/documents/ojt-completion.reader.ts` | modified | 新增 `OJT_STATUS_LABEL: Record<OjtCompletionStatus, string>`（`AC-X4`）。 |
| `backend/src/documents/documents.service.ts` | modified | 新增 `exportDocuments(documentIds, linkTargetId?)`；並把 `listDocuments()` 之五行富化抽為私有 `enrichListItems(items)` 供兩處共用（見「AC-X15 抽取之判斷過程」節）。 |
| `backend/src/documents/documents.controller.ts` | modified | 新增 `@Post('export')` ＋ `@RequirePermission(FunctionKey.ICSOP_DOCUMENT_MANAGEMENT, 'read')`；`AC-X17` ① 之型別驗證；回應標頭與 `res.send(buffer)`。 |
| `backend/src/main.ts` | modified | body-parser 分層四行（`bodyParser: false` ＋ 路由範圍 `1mb` ＋ 全域 `json()` ＋ 全域 `urlencoded()`）。 |

### Frontend — 修改

| File Path | Change Type | Description |
|---|---|---|
| `frontend/src/api/download-blob.ts` | modified | 新增 `DownloadInit` 型別與 `downloadViaBlob()` 之 **additive 第三參數**；`method`／`body` 以條件展開併入**同一次** `fetch`。 |
| `frontend/src/api/endpoints.ts` | modified | 新增 `exportDocumentList(documentIds, linkTargetId?)`；body 由三元決定恰一鍵或恰兩鍵。 |
| `frontend/src/pages/DocumentListPage.tsx` | modified | ① `orderedLinks()` 抽為 module-level 匯出並由 `LinkCell` 消費；② topbar「匯出」鈕；③ `onExport` handler。 |

## 每個檔為何非改不可

| 檔 | 非改不可之理由 |
|---|---|
| `export-link-order.ts` | 架構 §13.3 (ii) 指定「落於 `backend/src/documents/` 之獨立純函式檔」，環以 `require('./export-link-order')` 定位 `orderLinksForExport`。**不能內聯進 service**——那樣 `AC-X6` 之「前後端逐案輸出相等」就沒有可綁定的標的。 |
| `document-export-columns.ts` | 十四欄之值層必須存在於後端（`AC-X3` 🔴「十四欄全部由後端解析，前端不新增任何顯示規則」）。**刻意獨立成檔而非塞進 service**：`documents.service.ts` 已 800+ 行，且欄表屬「值層」、`exportDocuments()` 屬「讀取路徑」，兩者變更理由不同。本檔**不含**任何 BOM／注入前綴表／上限字面（`AC-X16` ⑦ 之靜態掃描四種樣式一個都沒有）。 |
| `ojt-completion.reader.ts` | `AC-X4` ✅ 落點已定案：`OJT_STATUS_LABEL` **必須**與 `OjtCompletionStatus` 型別及 `deriveOjtStatus()` **同檔**——理由是「新增第四種狀態」這件事要在**一個檔案內**就撞到兩處。另立模組即違反該裁決。 |
| `documents.service.ts` | 匯出之四步讀取路徑（load-all → 交集 → 重排 → 富化）必須在服務層，因為 ③ 之「依請求 id 原序重排」正是本裁決全部價值所在（`AC-X15` 🔴「不得沿用 store 或 DB 之回傳順序」），而它需要存取五個既有私有 enrich 方法。 |
| `documents.controller.ts` | 端點本身。`AC-X17` ① 之 body 型別驗證屬 controller 職責（`VALIDATION_ERROR` 為同 controller `setStatus()` 已在用之既有碼），且回應標頭／`res.send(buffer)` 只能在此。 |
| `main.ts` | `AC-X12` 🔴：不放寬則 10,000 個 id 之請求（約 400 KB）會在 body-parser 就被擋成 413，`assertExportRowLimit()` 成為**不可達程式碼**——而兩端單元測試全綠。此為本 delta 唯一之 bootstrap 變更。 |
| `download-blob.ts` | 本端點採 POST，而 `AC-X14` 🔴 **明文禁止**另寫 `postDownloadViaBlob()`（會把三條防線各複製一份）⇒ 唯一合法作法就是給既有函式加 additive 第三參數。 |
| `endpoints.ts` | 前端呼叫端。§Interface Contract 要求 body **恰兩鍵**，不得夾帶任何篩選鍵。 |
| `DocumentListPage.tsx` | `AC-X9` 的鈕、`AC-X11` ① 的 `filtered` 集合、`AC-X14` 的三句逐字回饋都在此頁；`orderedLinks` 之抽出為 lead 裁決項（見下節）。 |

## 三處「必須觸及之既有程式路徑」及其行為恆等之理由

這三處都不是新增，而是**改動既有、且被既有測試覆蓋中的路徑**——風險最高的三個地方。

### ① `backend/src/main.ts`：`NestFactory.create(AppModule)` → 帶 `{ bodyParser: false }`

**行為恆等之理由**：`bodyParser: false` 只是關閉 Nest **自動註冊**內建 parser；隨後三行把
`json()`（**不帶任何 `limit`**，即維持框架預設 100 KB）與 `urlencoded({ extended: true })` 原樣掛回，
故除 `/admin/documents/export` 外，**全站每一支 endpoint 之 payload 面一格未放寬、解析行為逐字不變**。
`cookieParser` 與 `trust proxy` 之相對順序維持既有不動。
🔴 **`bodyParser: false` 不可省之原因（本條是本 delta 最貴的一行）**：Nest 之
`ExpressAdapter.registerParserMiddleware()` 以 `isMiddlewareApplied()` **按函式名**比對
（`express.json()` 回傳的函式就叫 `jsonParser`），只要見到自行掛載者即**整支不註冊**自己的全域 parser
⇒ 只掛路由範圍 parser 而不設 `bodyParser: false`，會讓**全站其餘 JSON 路由之 `req.body` 變成 `undefined`**，
實測連 48 bytes 的請求都 500，且**兩端單元測試全綠**。
🔴 掛載路徑是**字面 URL path**、**不跟隨 `setGlobalPrefix()`**（本 repo 目前無 global prefix）——
該相依已就地留註解；日後若加上 prefix，此處字面必須同步改，否則放寬靜默失效而回到 413。

### ② `frontend/src/api/download-blob.ts`：`downloadViaBlob()` 之簽章

**行為恆等之理由**：`method` 與 `body` 皆以**條件展開**併入 `fetch` 的 init 物件——

```ts
...(init?.method ? { method: init.method } : {}),
headers: { Accept: 'application/octet-stream', ...(hasBody ? { 'Content-Type': 'application/json' } : {}) },
...(hasBody ? { body: JSON.stringify(init?.body) } : {}),
```

⇒ 既有 **16 個 2-參數呼叫端**所產生的 init 物件與 headers **逐字沒有多出任何鍵**（不是「值為 undefined」，
是**鍵不存在**）。`Accept: application/octet-stream` 在 GET 與 POST 兩條路徑上皆未動——
那是 2026-07-25 撞 SPA fallback 那個 bug 的唯一防線。
📌 **刻意不用 `if/else` 分岔兩條 `fetch` 路徑**：那樣也能過測試，但會把本檔的三條防線
（(i) `Accept` 不得為 `text/html`、(ii) 檔名優先取 `Content-Disposition`、(iii) 錯誤走
`extractDownloadError()` ＋ `notifySessionLost()`）各複製一份，**三者各多一個漂移點**。
FE-2 的前 4 案即為此條之綠燈回歸守衛。

### ③ `frontend/src/pages/DocumentListPage.tsx`：`LinkCell` 之 `orderedLinks`

**行為恆等之理由**：原本是 `LinkCell` 內部的 inline `useMemo`，現改為呼叫同檔 module-level 匯出之
`orderedLinks(links, filterLink)`；**判定式逐字未改**（命中前置、其餘維持原序、無命中原樣）。
唯一差異是無命中／未篩選時回傳 `[...links]` 之**淺拷貝**而非同一個陣列參考——`useMemo` 之 deps
（`[doc.links, filterLink]`）不變，渲染輸出零差異，且既有 `DocumentListPage.linkCell.test.tsx` 全綠。
**為何非抽不可（lead 裁決）**：`AC-X6` 要求「對同一組 `(links, 命中之目標文件 id)` 輸入，前端 `orderedLinks`
與後端 `orderLinksForExport()` 逐案輸出相等」。不抽出來的話，**後端排序函式在前端這一側沒有任何綁定對象**，
前端漂移沒有機制會攔（架構 §13.5 盲區 #5）。

## 🔴 `AC-X15` 抽取之判斷過程（走了哪一條、依據是什麼）

`AC-X15` 之 📌 建議條款原文兩段，是一個**帶條件的**指示：

> 📌 **建議（非必須）**：把該五行抽為私有 `enrichListItems(items)` 供清單與匯出兩處呼叫，使「匯出的值
> 一定是清單的值」由**同一段程式碼**保證而非由紀律保證。
> ⚠ 若實跑後既有 `documents.service.spec.ts` 因此轉紅，**正確處置是放棄抽取、於匯出路徑逐一呼叫同樣
> 五個方法**（保證仍在，只是由紀律承擔）。

**本輪走的是「抽取」那一條。** 判斷過程如下：

1. **先做抽取**：把 `listDocuments()` 中之
   `enrichNames` → `enrichSecondaryChiefs` → `enrichIcsopPdf` → `enrichOjt` → `enrichLinks`
   五行原封不動移入新的私有 `enrichListItems(items)`，`listDocuments()` 改為呼叫它，
   `exportDocuments()` 亦呼叫它。**五個方法之實作、呼叫順序、參數一字未改**。
2. **實跑驗證條件是否觸發**：`cd backend && npm test -- --maxWorkers=4` →
   **189 suites / 3036 tests 全綠**，`documents.service.spec.ts`（及
   `documents.service.subtreeFilter.spec.ts`／`documents.service.appendixFormFilters.spec.ts`）
   **無一轉紅**。⇒ AC 所述之「若……轉紅」之條件**未觸發**。
3. **依據該條件未觸發，保留抽取**。

**保留抽取所買到的東西**：`AC-X15` 要求匯出「必須沿用 `listDocuments()` 之既有批次注入路徑，
依序呼叫與清單完全相同之五個既有私有方法」。抽取之後，這件事**由型別與呼叫圖保證**——
兩個消費端呼叫的是同一個 `enrichListItems()`，任何人日後在清單路徑加第六個 enrich，匯出**自動**跟著有；
若維持兩處各寫五行，那個人必須**記得**去改另一處，而沒有任何測試會在他忘記時出聲
（環的 N+1 斷言只數呼叫次數，不比對兩條路徑的富化清單是否相同）。

📌 **這一節是日後有人問「為什麼匯出和清單共用同一段程式碼」時的唯一答案。**
若未來 `documents.service.spec.ts` 因其他變更而與此抽取衝突，`AC-X15` 已預先授權放棄抽取、
改為在 `exportDocuments()` 內逐一呼叫同樣五個方法——**保證仍在，只是由紀律承擔**。

## Architectural Decisions

1. **`AC-X17` 兩道檢查各自單點、天然不可顛倒**：① 型別驗證落在 `DocumentsController.exportList()`
   （body 形狀是 controller 職責）；② 上限檢查落在 `DocumentsService.exportDocuments()` **第一行**
   （`assertExportRowLimit(documentIds.length)`，在 `store.list()` 之前）。
   controller 必然先於 service 執行 ⇒ 「① 先於 ②」是**呼叫圖的性質**，不是靠註解維持的紀律。
   `AC-X12` 🔒「不得有第二處檢查」因此成立：全庫僅此一處呼叫 `assertExportRowLimit` 於本路徑。

2. **`documentIds: []` 與缺鍵／型別錯誤走兩條完全不同的路徑**：空陣列一路走到成功路徑（200 ＋ 僅表頭列），
   畸形 body 在 controller 就 `throw`。兩者**不可能**產生逐位元組相同之輸出——這正是
   `AC-X17` ① 否決「視同空陣列」那個替代方案所要保住的判別性。

3. **重排以 `Map<id, item>` ＋ `Set` 去重**：依請求 id 原序走訪，`taken` Set 使重複成員只取首次出現之位置
   （`AC-X17` 邊界），`byId.get()` 未命中即靜默略過（`AC-X17` ④）。**未寫任何排序比較器**——
   後端不重跑排序這件事因此是結構性的，不是靠自律。

4. **`now` 取一次，同時供「狀態」欄與檔名**：一份檔案內不得有兩個「現在」。
   🔴 該 `now` 為裸 `new Date()`，**未套 `toTaipei()`**（`AC-X7` 逐字禁令）——`deriveDisplayStatus()`
   比較的是 `getTime()`（絕對瞬間），與行程時區無關；誤套會在台北 00:00–08:00 之窗口讓 CSV 說「已公告」
   而畫面說「進度中」，而把 `now` 釘在台北 08:00 之後的天真測試**兩種寫法都會綠**。
   環以 UTC `2026-06-09T17:00:00Z`（台北 01:00）之 fixture 釘住此條。

5. **`公告日期` 欄用 `formatExportTimestamp(x).slice(0, 10)`，`csv-export.ts` 維持一行未改**：
   此為 lead 對 `X-CONFLICT-2` 之裁決（`AC-X8`／`AC-X16` ⑦ 與架構 §13.3 (iii)／§13.6 互相引用對方舊版而僵持，
   裁定兩案都不採）。好處是**不產生第二份 `toTaipei()` 位移**——那正是當初放寬所要防的東西。
   BE-5 第 129 行之負向斷言（`不得出現 formatExportDate`）即為此裁決之回歸鎖定。

6. **`linkTargetId` 空字串於 controller 正規化為 `undefined`**：`AC-X17` 🔒 明訂該鍵缺席／空字串／
   指向不存在之文件**一律不視為錯誤**。正規化在邊界做一次，`orderLinksForExport()` 內部只需判斷 falsy。

7. **`當責室長` 與 `連結點程序書` 之分隔符刻意不同**（`、` vs `;`），且**兩者皆非逗號**：
   逗號會觸發 RFC 4180 包覆，使欄內逗號與欄間逗號在肉眼上無從分辨。兩個常數各自就地留有理由註解，
   避免日後被「統一」。

8. **前後端各一份排序函式與標籤表**：本 repo 前後端為兩個獨立 TS 專案、無共用 package
   ⇒「只有一份」在架構上不可達（比照 `watermarkLines()`／`change-labels.ts` 之既有處置）。
   本輪之機器可驗約束為**兩份逐字相同**：BE-3/BE-4 與 FE-3 使用**同一組固定向量**
   （`SIX_LINKS`／`HIT_TARGET_ID`／`EXPECTED_ORDER_ON_HIT`／`CROSS_RUNTIME_VECTOR`），任一端漂移即該端紅燈。

9. **匯出鈕不套 `canWrite`、不套 `disabled`**：`AC-X9` 🔴（匯出屬讀取類動作，本頁 SysAdmin／Supervisor／
   DeptContact 三者皆為唯讀但**必須**能匯出）＋ `AC-X13` 🔴（0 筆時仍可按——`disabled` 的鈕不能 focus、
   讀不到 tooltip、觸控裝置上按了毫無反應）。一般使用者於本頁本就被既有 `!canRead` 之 403 區塊擋下。

10. **前端不執行任何筆數檢查**：`AC-X12` 🔴「提示與檢查一旦合流，後端之錯誤路徑就再也跑不到」。
    且本頁 `LOAD_SIZE = 2000 < EXPORT_ROW_LIMIT = 10000`，該錯誤路徑在本頁**結構上不可達**，
    故其驗證單點落在 BE-2（直接呼叫端點），前端側只驗「不擋下、不 disabled」。

## 🔴 本輪環原理上碰不到的三件事（＋ 2026-09-01 本機容器實測結果）

以下三項**皆非疏漏，而是本輪環（僅 jest／vitest，無 e2e、無真實反向代理、無真實瀏覽器）
在原理上就驗不到的東西**。
📌 **2026-09-01 更新**：使用者以 `--build --force-recreate` 重建容器後，lead 於**本機 compose** 實測，
其中兩項已收斂為**已實測**，第三項**仍為未驗**。逐項如下。

1. **`backend/src/main.ts` 之執行期行為 —— ✅ 已於本機容器實測（2026-09-01）。**
   環之 BE-6 只做**靜態原始碼字面掃描**（四行存在＋相對順序＋`1mb` 只出現一次且與匯出路徑同行）；
   **靜態字面掃描不等於已驗**——它抓得到「四行寫錯順序／漏寫／全域被順手放寬」，
   但**抓不到** Nest `isMiddlewareApplied()` 按函式名比對之陷阱是否真的被躲開
   （`bootstrap()` 無單元測試，body-parser 完全不在單元測試路徑上）。
   ⇒ 該陷阱改以真容器之兩支探針收斂：

   | 探針 | 觀測 | 推論 |
   |---|---|---|
   | 400 KB body → `/auth/login`（**非匯出**路由） | **413** | 全域 `json()` 確實掛著、100 KB 預設限制生效 ⇒ **`isMiddlewareApplied` 陷阱沒中**（若中了，全域 parser 根本不存在，不會是 413） |
   | 400 KB body → `/admin/documents/export` | **401**（**非** 413） | 路由範圍 `1mb` 生效 ⇒ body 通過 parser 後才被 `SessionGuard` 擋下 |

   ⇒ 兩支合起來同時證明**放寬有效**且**放寬範圍未外溢**。

2. **POST 下載之代理層 —— ✅ 代理與路由已於本機容器實測（2026-09-01）；⚠ 成功下載之完整鏈路仍未實測。**
   已實測：經 nginx（`:5173`）打匯出路由回 **401 `application/json`**，而 `/` 與 `/login` 回
   **200 `text/html`** ⇒ **正確代理至後端，未掉進 SPA fallback**。
   ⇒ 「使用者靜默拿到一個副檔名 `.csv`、內容是 app shell 的檔案」這個 2026-07-25 踩過的形狀，**已排除**。
   ⚠ **仍未實測者**：帶**有效 session** 之 `200` ＋ `text/csv` ＋ `Content-Disposition` ＋ 首三 byte `EF BB BF`
   之完整下載——上述探針因無 session 而止於 401，證明不了回應側（nginx 之緩衝與 `Content-Disposition` 標頭透傳）。

3. **multipart 在 `bodyParser: false` 之後的真實上傳路徑 —— 🔴 仍為未驗。**
   multer（`FilesInterceptor`）理論上走自己的 parser、不受 `bodyParser: false` 影響，
   但這是**推論而非實測**——本輪沒有任何測試會執行到真實的 multipart 解析。
   🔴 **且上述容器探針證明不了它**：Nest 之 guard 跑在 interceptor **之前**，
   無 session 的請求會在 **401 就結束**，multer 根本不會被執行到。
   ⇒ 需**帶有效 session** 之真實上傳才驗得到。

⚠ **措辭紀律**：第 1、2 項寫「已於本機容器實測」而**非**「已驗證無問題」——
它們驗的是**本機 compose**，不是**正式站**（測試站／正式站之 edge 層、TLS、`TRUST_PROXY_HOPS`
與容器映像皆為另一組環境）。

### 部署前 smoke 三支（**必做**；本機已過 ≠ 正式站已過）

| # | 探針 | 通過判準 | 本機容器（2026-09-01） |
|---|---|---|---|
| ① | 一支**非匯出**的小 body POST（例：`POST /admin/documents` 或 `PATCH /admin/documents/:id/status`，body 僅數十 bytes） | 正常處理，**不得** 500——若 500，即 `isMiddlewareApplied` 陷阱中了，全站 `req.body` 已是 `undefined` | ✅ 已實測（以 400 KB → `/auth/login` 回 413 反向證明全域 parser 在位） |
| ② | 一支**大 id 清單**的匯出 POST（≥ 2,000 筆 id） | 回 200 ＋ `text/csv`，**不得** 413；且下載到的檔案首三 byte 為 `EF BB BF`、第 1 列為十四欄表頭 | ⚠ **部分**：400 KB 回 401 而非 413（放寬生效）；**200 ＋ `text/csv` ＋ BOM 之成功路徑仍待帶 session 驗證** |
| ③ | 一份 **multipart 上傳**（ICSOP PDF 或附錄） | 正常上傳成功，證明 `bodyParser: false` 未波及 multer | 🔴 **未驗**（guard 先於 interceptor，401 即結束，證明不了 multer） |

🔒 `docs/test-specs/risks-and-gaps.md` 之 `X-GAP-1` **維持登錄、不得降級**——
第 ③ 項仍為未驗，且第 ①② 項只在本機 compose 成立、正式站尚未兌現。

## 代理層查證結論（順手查證，**未改任何設定檔**）

本 repo 已四次踩過「新端點未列入代理白名單 → 兩端測試全綠但瀏覽器靜默壞掉」。本輪逐項查證，
結論是**本 delta 不需要改任何代理設定**，證據如下（省下未來重查的功夫）：

| 查證項 | 位置 | 結論 |
|---|---|---|
| vite dev proxy | `frontend/vite.config.ts:30` | `if (/^\/admin\/.+\/(download\|export\|print\|pdf)(\?\|$)/.test(url)) return undefined;` **已涵蓋** `/admin/documents/export`。另：`spaBypass` 只對 `GET` ＋ `Accept: text/html` 回 index.html，本端點為 POST ＋ `Accept: application/octet-stream`，兩重都不會誤落 SPA fallback。 |
| 容器 nginx | `frontend/nginx.conf:95` | `location ~ ^/admin/.+/(download\|export\|print\|pdf)$` **已涵蓋**；nginx location 不依方法區分，POST 照樣代理至 backend。另有 `location /admin/`（:55）作為第二層保險。 |
| 頂層前綴一致性守門 | `frontend/src/api/proxy-coverage.test.ts` | **未紅、案數未變**——本 delta 未新增任何**頂層路由前綴**（沿用既有 `/admin`），故該測試之「兩份設定彼此一致」不受影響。 |
| 檔案端點代理守門 | `frontend/src/api/proxy-file-endpoint-coverage.test.ts` | 🔴 **自動長出 2 案並通過**：`vite.config.ts spaBypass 放行 /admin/documents/export（dev）`、`nginx.conf regex location 攔截 /admin/documents/export（容器）`。其 `atRisk` 掃描自 `endpoints.ts`，故新端點**自動**進入清單——這是「代理白名單漏列」那個踩過四次的坑之機器化防線，不靠人記得補。 |
| 前後端契約存在性守門 | `frontend/src/api/endpoint-contract.test.ts` | 🔴 **自動長出 1 案並通過**：`/admin/documents/export → 後端存在對應 route`。⇒ 前端打的 URL 與後端 `@Post('export')` 之對應**已被機器驗證**，非人工比對。 |
| body size 上限（前端 nginx） | `frontend/nginx.conf:38` | `client_max_body_size 60m` |
| body size 上限（edge） | `infra/edge/icsop.hfcfinance.com.tw.conf:48`、`infra/edge/testicsop.hfcfinance.com.tw.conf:35` | 皆為 `client_max_body_size 60m` |
| ⇒ 綜合 | — | 10,000 筆 id 約 400 KB ≪ 60m，**兩層 nginx 皆不會擋**；後端側之 `1mb` 路由範圍上限為最緊者，仍有約 2.5 倍餘裕。 |

## 環爭議與裁決

**無。本輪零申訴。**
環釘死之 4 個「規格未定、由環決定」之契約——① `exportDocuments()` 之回傳形狀
`{ csv: Buffer; fileName: string }`、② `orderLinksForExport()` 之檔名與匯出名、
③ handler 位置參數 `(body, res)`、④ 前端 `orderedLinks` 由 `DocumentListPage.tsx` 匯出——
與 spec／prototype／架構之間未出現任何互斥，逐項照做即綠。
lead 事前裁決之三項（前端抽 `orderedLinks`、公告日期用 `formatExportTimestamp(...).slice(0,10)`、
`main.ts` path-scoped parser）亦與環的斷言一致——BE-5 第 129 行正是釘住第 2 項的負向鎖定。

## Blocking Issues

無。實作與環皆已完成。
待辦僅剩上節之部署前 smoke（屬**部署程序**，非實作缺口）：本機容器已收斂 ①、部分收斂 ②，
**③ multipart 仍未驗**；且 ①② 只在本機 compose 成立，**正式站尚未兌現**。
