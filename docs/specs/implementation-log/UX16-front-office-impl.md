---
type: implementation-log
feature_id: UX16
feature_name: 前台工作線（項 5／6／7／9／10／11）＋ 項 16 匯出筆數降級（後續小工作）
lane: impl-front（接手自中斷之 impl-front；項 16 降級分支接手自陣亡之 impl-ojt）
status: complete
last_updated: 2026-09-22
---

# UX16 前台工作線 — 實作紀錄（項 5／6／7／9／10／11）

> 權威＝磁碟現檔：F019 `AC-UX13`～`AC-UX26`、F017 `AC-UX40`～`AC-UX44`、
> `architecture-spec.md` §16.2／§16.4／§16.10、`prototypes/03`／`04`／`30`。
> 🔒 **本輪未新增、未修改、未刪除任何測試檔**——`*.test.tsx`／`*.spec.ts`／測試 helper 一律
> 由 `ring-ux16b` 持有；本 lane 提報之兩件 test-dispute 見 §四。

## 一、測試結果（targeted，逐檔實跑）

### 後端（`npx jest --maxWorkers=2`）

| 範圍 | 結果 |
|---|---|
| `src/public` ＋ `src/business-categories` ＋ `src/documents`（69 suites） | **915 passed / 0 failed** |
| **全套 244 suites** | **3767 passed / 1 skipped / 0 failed** |
| `npx tsc --noEmit` | **零錯誤** |
| `npm run deps:check` | **零違規**（417 modules、1258 dependencies） |

環之逐檔確認：`public-document-detail.service.ux16.spec.ts`（5/5）、`public-list.ux16.spec.ts`、
`public-documents.service.ux16.spec.ts`、`public-list-filter-options.ux16.spec.ts`、
`public-filter-options.controller.spec.ts` 全綠。

### 前端（`npx vitest run`，config 已釘 `maxWorkers: 4`）

| 測試檔 | 結果 |
|---|---|
| `PublicCategoryTreePage.test.tsx`（項 5 導向鈕、項 7 class 契約） | ✅ |
| `PublicDocumentDetailPage.ux16.test.tsx`（項 9） | ✅ 4/4 |
| `PublicListPage.subtreeFilter.ux16.test.tsx`（項 5 chip） | ✅ 6/6 |
| `PublicListPage.ux16.test.tsx`（項 6 前往後台） | ✅ 3/3 |
| `PublicListPage.filterDelta.test.tsx`＋`PublicListPage.test.tsx`（項 10） | ✅ |
| `DocumentListPage.filterDelta.test.tsx`＋`DocumentListPage.export.test.tsx`（項 11） | ✅ |
| **上列 8 檔合計** | **142 passed / 0 failed** |

**前端全套（最終）：150 files／2559 tests，全部 passed、零紅。**
（過程中曾有 4 紅：2 紅＝`PublicDocumentDetailPage.test.tsx` test-dispute #2，`ring-ux16b` 已修正；
2 紅＝`OjtProgressPage.ux16.test.tsx` 之 `AC-UX55` 降級向量，已由本 lane 依 lead 指派接手完成，
見 §五之二。）

## 二、變更檔案

### 後端

| 檔案 | 類型 | 說明 |
|---|---|---|
| `business-categories/public-business-category.store.ts` | modified | 新增 `PublicDocumentBusinessCategory` 型別與**選填**方法 `listCategoriesForDocument?()`（項 9） |
| `business-categories/typeorm-public-business-category.store.ts` | modified | 實作上述方法：`BUSINESS_CATEGORY_DOC ⋈ NODE ⋈ CATEGORY`，🔴 **不過濾 `status`**、依 `businessCategoryId` 去重、依 `displayName` **碼位序**排序 |
| `public/public-document-detail.service.ts` | modified | DTO 新增 `businessCategories`；建構子新增 `@Optional() @Inject(PUBLIC_BUSINESS_CATEGORY_STORE)` **第 5 參數** |
| `public/public.module.ts` | modified | 🔴 **兩個 `useFactory` 各補一個引數**——見 §三之 ⑴ |
| `public/public-documents.controller.ts` | modified | 新增 `draftingDivisionId`／`bcSubtreeId`／`bcSubtreeNodeId` 三個 `@Query` 並接線 |
| `documents/documents.controller.ts` | modified | 新增 `draftingDivisionId: q.draftingDivisionId` 之逐欄映射 |

### 前端

| 檔案 | 類型 | 說明 |
|---|---|---|
| `api/types.ts` | modified | `PublicListItem`／`DocumentListItem` 各加 `draftingDivisionId?`／`draftingDivisionName?`；`PublicListPage` 加 `subtreeChip?`（＋新型別 `PublicSubtreeChip`）；`PublicListFilters` 加 `draftingDivisionId?`／`bcSubtreeId?`／`bcSubtreeNodeId?`；`PublicFilterOptions` 加 `draftingDivisions?`；`PublicDocumentDetail` 加 `businessCategories?`（＋新型別 `PublicDocumentBusinessCategory`） |
| `api/endpoints.ts` | modified | `getPublicDocuments()` 送出 `draftingDivisionId`；`bcSubtreeId`＋`bcSubtreeNodeId` **恆成對才送** |
| `pages/PublicListPage.tsx` | modified | 項 5 chip（＋清除）、項 6 前往後台、項 7 樹狀圖模式外殼、項 10 制定本部篩選 |
| `pages/PublicCategoryTreePage.tsx` | modified | 項 5 抽屜導向鈕＋`goSubtreeList()`；項 7 `flex-1 min-h-0 overflow-auto` |
| `pages/PublicDocumentDetailPage.tsx` | modified | 項 9：`所屬節點` 列就地換為 `業務/功能類別`（新元件 `BusinessCategoryField`） |
| `pages/DocumentListPage.tsx` | modified | 項 11：`FILTERS` 插入中段、`ComboKey`／`EMPTY_FILTERS` 同步、`divisionOptions()`、客端等值比對 |

## 三、架構決策（皆在規格邊界內）

**⑴ 🔴 最重要——`public.module.ts` 之 `useFactory` 是兩個「值人間蒸發」的現場**

`PublicDocumentsService` 與 `PublicDocumentDetailService` 皆以 `useFactory` 提供。
**`useFactory` 之 `inject` 陣列完全不看建構子上的 `@Inject()`／`@Optional()` 裝飾子**——
前一棒已在 `PublicDocumentsService` 宣告好 `@Optional() @Inject(PUBLIC_BUSINESS_CATEGORY_STORE)`
第 4 參數並寫完整套 `resolveSubtree()`，但 factory 仍只傳 3 個引數 ⇒ **正式環境下該欄位恆為
`undefined`、子樹篩選永遠靜默 no-op**（帶著 deep link 進來的使用者會看到全部文件、零錯誤訊息）。
🔴 **全部單元測試對此零鑑別力**（它們直接 `new` 服務、自己傳替身），本模組自己的註解也為同型
缺陷警示過一次（`TypeOrmOjtCompletionReader` 那段）。

處置：兩個 factory 各自 `new TypeOrmPublicBusinessCategoryStore(AppDataSource)`。
🔴 **反循環——自建而非 `import { BusinessCategoriesModule }`**：`business-categories.module.ts:8`
已 `import { PublicModule }`，反向 import 會是一條真實的 Nest 模組循環；自建窄 adapter 為本模組
既有慣例。`deps:check` 零違規已覆核。

**⑵ 控制層三個死參數**（同型、同一次修）

`public-documents.controller.ts` 未解析 `draftingDivisionId`／`bcSubtreeId`／`bcSubtreeNodeId`，
`documents.controller.ts` 未映射 `draftingDivisionId`——而 `public-list.ts#matchesPublicFilters()`
與 `documents/document-list-query.ts#applyDocumentQuery()` **兩處的比對邏輯都已寫好**。
少了控制層這一行，整條篩選端到端靜默無作用（與該檔 `appendixId`／`formId` 自立條起漏了一年之
同型缺陷逐字相同，其註解已記載）。

**⑶ 新 `@Query` 一律附加於參數列最末、不插入中段**

`AC-UX22`／`AC-UX40` 所稱之「插入中段」是**畫面篩選列由左至右之順序**，與控制器方法之
TypeScript 參數位置無關（`@Query()` 依名稱繫結）。實測：把 `draftingDivisionId` 插在
`companyCode` 之後會把其後每個參數往後推一格，使既有以**位置引數**直呼本方法之
`public-documents.controller.spec.ts:71` 整組錯位——一次純粹自傷的轉紅。

**⑷ `AC-UX15` ⑤ 之成對性在控制層就兌現**

任一子樹參數缺席 ⇒ **完全不帶第五引數**呼叫 `svc.list()`，呼叫形狀與本 delta 導入前逐字相同
（additive 之字面意義）。🔒 服務層 `resolveSubtree()` 之同一項檢查**刻意保留**為第二層防線。

**⑸ chip 之渲染條件是「網址參數 ∧ 後端回應」兩者皆成立**

只看後端回應 ⇒ 按下 ✕ 後、下一次查詢回來之前，舊回應會讓一條已清掉的 chip 續留畫面；
只看網址參數 ⇒「參數帶了但類別／節點查無」時會畫出一條說不出名字的 chip，而結果集其實一份
都沒被篩掉。兩者取交集，兩種失效形狀同時被擋住。

**⑹ 項 7 之外殼只套在樹狀圖模式**

`PublicListPage` 是兩種模式共用之外殼，而 prototype 30（`<body class="h-screen flex flex-col">`）
只涵蓋樹狀圖頁。文件清單模式靠整頁捲動＋sticky header，套上 `h-screen` 會換掉它的捲動容器
（`AC-UX26` 零漣漪）。故外殼 class 依 `mode` 分支；`PublicCategoryTreePage` 之 `<section>`
（prototype 沒有的中間層）補 `flex-1 min-h-0 flex flex-col`，否則高度上界傳不到畫布。

**⑺ `PublicFilterOptions.draftingDivisions` 宣告為選填**

宣告為必要會讓 `PublicListPage.subcategory.test.tsx:158` 與 `PublicListPage.uxAudit.test.tsx:192`
之既有物件字面量成為編譯錯誤（測試檔非本 lane 可改）。沿用本檔既有慣例
（`hiddenCount?`／`businessCategories?`／`secondaryChiefIds?` 皆同）。
🔴 **鑑別力零損失**：`AC-UX23` 之「恰含六組選項鍵」是**後端回應契約**，回歸鎖住在
`backend/src/public/public-filter-options.controller.spec.ts`（`TS-F019-D5-206`）——放寬前端
鏡射型別不會讓後端少回一個鍵而不被發現。

**⑻ 項 11 之選項以複合鍵去重、非以本部名稱**

`DocumentListPage` 之既有三個組織維度以「值即顯示名」客端衍生；制定本部**刻意不同**——
不同公司可能有同名本部，以名稱去重會把它們併成一個選項，選了一個就會連帶篩出另一家的文件。
形狀比照同檔既有之 `bcOptionsFromRows()`（以 id 去重、取首見顯示名）。

**⑼ 兩句導向鈕文案刻意不同、不得共用**

新增 `formatPublicSubtreeJumpLabel()`（`PublicCategoryTreePage.tsx`）；
🔒 後台之 `formatSubtreeJumpLabel()`（`LifecycleTreePreviewPage.tsx:150`）**一行未改**
（`git diff` 該檔為空），其兩個後台呼叫端亦未動。

## 三之二、🔴 **與 §16／AC 字面之偏離（逐項列明；lead 2026-09-22 已逐項核准）**

> 🔴 **本節存在的全部理由**：沒被記下來的偏離，下一個人會以為是有人沒讀架構。
> 每一項皆註明「文件的字面說什麼」「實作做了什麼」「為何不同」「核准狀態」。

### 偏離 ①：`listCategoriesForDocument` 為**選填**方法，非架構字面之必要方法

| | |
|---|---|
| **§16.10 字面** | 於 `PublicBusinessCategoryStore` 介面新增 `listCategoriesForDocument(documentId: string): Promise<…>`（**必要**方法，程式碼區塊逐字如此） |
| **實作** | `listCategoriesForDocument?(documentId: string): Promise<PublicDocumentBusinessCategory[]>`（**選填**），消費端 `public-document-detail.service.ts` 以 `?.` 呼叫並降級為空陣列 |
| **為何不同** | `business-categories/public-business-category.service.spec.ts:32` 有 `class FakeStore implements PublicBusinessCategoryStore`。宣告為必要方法會讓一個 **additive** 能力變成**既有測試檔的編譯錯誤**，而測試檔非本 lane 可改。同介面既有之 `listEdges?` 即為同一情形之既有形狀（其 JSDoc 明載「**選填能力**——未提供之 fake store 一律降級」）⇒ 本項沿用該慣例，**不是為本輪發明的例外**。 |
| **行為差異** | 無。正式綁定之 `TypeOrmPublicBusinessCategoryStore` 實作了該方法，執行期行為與 §16.10 之意圖逐字一致。 |
| **核准** | 🟢 lead 2026-09-22：「正確，這是本 repo 的既有形狀，不是你發明的例外」 |

### 偏離 ②：另立 `PublicDocumentBusinessCategory`，未用 §16.10 所稱之 `PublicBusinessCategoryOption`

| | |
|---|---|
| **§16.10 字面** | 「其既有型別 `PublicBusinessCategoryOption`（`{id, name, subcategory, displayName}`）與 `AC-UX18` 之對外 DTO 訴求（`{id, displayName}`）**形狀已相容，不需新型別**」；程式碼區塊之回傳型別亦逐字寫作 `Promise<PublicBusinessCategoryOption[]>` |
| **實查** | 該型別**確實存在**且欄位與 §16.10 所列**逐字相符**（`{id, name, subcategory, displayName}`）。⚠ 惟 §16.10 把它歸在 `public-business-category.**store**.ts`，**實際住在 `public-business-category.service.ts:22`**。 |
| **實作** | 於 store port 新立 `PublicDocumentBusinessCategory { id: string; displayName: string }` |
| **為何不同（理由一，決定性）** | 🔴 **方向性**：`public-business-category.service.ts:7-12` **import 自** `public-business-category.store.ts`。若 store port 改用住在 service 的型別，就是 **store → service** 的反向 import ＝ 一條真實的循環相依，`deps:check` 之 `no-circular` 會**立即觸發**（非理論風險）。§16.10 之「不需新型別」建立在「該型別在 store 檔」這個**事實錯誤**之上；一旦檔案位置修正，該建議即不成立。 |
| **為何不同（理由二）** | 環之 `public-document-detail.service.ux16.spec.ts:89`＝`expect(dto.businessCategories).toEqual([{ id: 'bc1', displayName: '授信（消金）' }])`。`toEqual` 對物件要求**鍵集合相等** ⇒ 對外 DTO 必須**恰為** `{id, displayName}`；`PublicBusinessCategoryOption` 帶著 `name`／`subcategory` 兩個有值的鍵，`toEqual` 會紅。⇒ §16.10 所稱之「形狀已相容」對本環**不成立**（`{id,displayName}` 是它的**子集**，不是相等）。 |
| **判準（可推廣，🔒 lead 2026-09-22 定稿措辭）** | 🔒 **環是契約、§16 的型別名與檔案位置是敘述；敘述本身也可能有事實誤差，落地前須實查。** |
| **核准** | 🟢 lead 2026-09-22：逐字採用上述判準 |
| **📝 本節之自我更正** | 本檔初稿曾寫「repo 裡沒有叫 `PublicBusinessCategoryOption` 的型別」——**該陳述有誤**，已於同日實查後更正為上表。誤判來源＝只在 `public-business-category.store.ts`（§16.10 所指之檔）內找過。 |

### 偏離 ③：前台 URL 參數鍵名取 `mkdiv`（`AC-UX22` 未指定）

| | |
|---|---|
| **`AC-UX22` 字面** | 「🔒 **參數鍵名**由 system-architect 定案（⚠ 本頁既有鍵名為短名 `dept`／`section`／`chief`／`cycle`，宜與之同構）」——🔴 **架構 §16 通篇未定案此鍵名**（§16.4 只定了子樹側之 `bcSubtreeId`／`bcSubtreeNodeId`） |
| **實作** | 前台網址鍵 **`mkdiv`**（比照既有 `mkdept`）；🔒 **API 查詢鍵仍為 `draftingDivisionId`**（與後端 `PublicListFilters` 及 `AC-UX41` ① 之比對鍵同名，兩者不混用） |
| **為何這樣選** | 與同頁既有短名（`co`／`mkdept`／`section`／`chief`）同構且可預期；`mkdiv` 與 `mkdept` 成對，一眼看得出是同一組「制定 X」維度。 |
| **⚠ 供下一個人注意** | 值為複合鍵 `` `${公司代碼}__{本部代碼}` ``（如 `AS__A0000`）。`_` 為 RFC 3986 unreserved ⇒ 進網址不需 encode、不會與分隔符混淆（`AC-UX22` 🔒 已論證）。 |
| **核准** | 🟢 lead 2026-09-22：「採用，理由是與既有短名同構、可預期」 |

### 偏離 ④（territory，非規格）：`typeorm-public-business-category.store.ts` 之歸屬

`impl-cat` 之 territory 字面為 `business-categories/**`（除 `public-business-category-*`），而本檔以
`typeorm-` 開頭、落在該 glob 外緣。🔴 惟 **§16.10 明文把新方法之實作指派在此檔**（連 SQL 都逐字給了）。
本 lane 僅做 additive（＋1 方法、＋1 import），未動 `impl-cat` 既有之 `sortByOrderThenName` 相關程式碼。
🟢 **lead 2026-09-22 核准：以架構的指派為準，不算越界**（且 `impl-cat` 已陣亡，無併發衝突）。

### 偏離 ⑤（territory，非規格）：項 16 降級文案落在 `ojt-progress-view.ts`

交辦單劃給本 lane 的是 `api/endpoints.ts` ＋ `OjtProgressPage.tsx` 兩檔，但**降級文案的載體不在後者**
——詳見 §五之二之同名說明。

🟢 **lead 2026-09-22 核准**（交辦單原句「改 `OjtProgressPage.tsx` 之匯出 toast」經 lead 自陳為
「沒查就寫的方位錯誤」）。核准理由逐字：
- `AC-UX55` 之**四句 toast 全住在 `ojt-progress-view.ts`**；把第 1 句的降級版本寫進頁面元件，
  會讓**同一則 toast 的四句話散在兩個檔**——那正是本 repo 反覆記過的「同一不變式兩個定義點」。
- 該檔註解本來就明載它是「**使用者語言禁令之落點**」⇒ 降級句屬於同一組詞彙，本就該落在那裡。

⇒ **五項偏離全數核准**，本節無待決項。

## 四、提報之 test-dispute（🔴 本 lane 全程未動任何測試）

| # | 位置 | 性質 | 狀態 |
|---|---|---|---|
| 1 | `PublicListPage.filterDelta.test.tsx:202` `toHaveLength(5)` vs `:203` `toEqual([...FILTER_LABELS])`（六元） | 同一 `it`、同一 `controls` 變數上之**字面互斥**，任何實作不可能全綠 | ✅ `ring-ux16b` 已查證並修正為 `6` |
| 2 | `PublicDocumentDetailPage.test.tsx:202`（`DETAIL_FIELD_LABELS` 含 `'所屬節點'`）與 `:171`（`getByText('進件作業')`） | 與同環之 `PublicDocumentDetailPage.ux16.test.tsx:80`（`queryByText('所屬節點')` 須為 `null`）**互斥**；屬 `AC-UX25` 通則所稱「表外之同型絕對值鎖」 | ✅ `ring-ux16b` 已查證並修正（`'所屬節點'` → `'業務/功能類別'` 位置不動；`:171` 依建議改為限定容器＋結構性斷言，非只換字串） |

🔒 **兩件 dispute 皆由 `ring-ux16b` 自行裁決並修改測試；本 lane 全程未動任何測試檔一個字。**

## 五、🔴 機器證明不了、須實機覆核

1. **項 7 之捲軸固定**（`AC-UX17` 明文）：jsdom **不計算版面**（`offsetHeight`／`scrollHeight`
   恆為 0），環只鎖得住 class 契約。**綠燈不等於捲軸真的固定住了**——須以真實瀏覽器確認
   「樹狀圖內容高於視窗時，水平捲軸不需捲到最底即可看見並操作」。
   ⚠ 本輪新增之外殼分支（`h-screen` 只套樹狀圖模式）亦須順帶覆核**文件清單模式之捲動未受影響**。
2. **項 5 之完整導向路徑**：抽屜 →（按鈕）→ 切到文件清單 → chip 出現且文案正確 → 結果集確為
   該子樹 → 按 ✕ 只清 chip → 按「清除篩選」連 chip 一起清。
3. **項 9 之真實語料**：一份同時掛在**多個**類別（含一個 `status='inactive'` 之停用類別）的文件，
   確認停用類別之既有掛載**仍顯示**、且逐列全列不摺疊。
4. **項 10／11 之本部推導**：須在**真實 `parentCode` 鏈**上覆核「同一本部下之兩個不同部各一份
   文件，選定該本部時兩份皆回傳」——本 repo 之 fixture 若該本部下只有一個部，「上溯到本部」與
   「直接比對部」輸出相同，斷言恆真。
5. **⑴ 之 factory 接線**：單元測試對它零鑑別力。須在跑起來的服務上以 deep link 實測子樹篩選
   確實縮小了結果集、詳情頁的「業務/功能類別」欄確實有值（而非永遠 `—`）。

## 五之二、後續小工作：項 16 匯出筆數之降級（lead 2026-09-22 指派，impl-ojt 陣亡後接手）

### 變更檔案

| 檔案 | 類型 | 說明 |
|---|---|---|
| `api/endpoints.ts#exportOjtProgress()` | modified | 回傳型別 `{ count: number }` → **`{ count: number | null }`** |
| `pages/ojt-progress-view.ts` | modified | 新增 `OJT_EXPORT_COUNT_UNKNOWN_TEXT`；`ojtExportToastSentences()` 之 `exportedCount` 擴為 `number | null` |
| `pages/OjtProgressPage.tsx` | **未改** | `onExport` 本已 `ojtExportToastSentences(res.count, …)` 原樣傳遞，型別自然流過 |

⚠ **territory 例外之例外，請 lead 覆核**：交辦單劃給我的是 `api/endpoints.ts` 與
`OjtProgressPage.tsx` 兩檔，但**降級文案的載體不在後者**——`AC-UX55` 之四句 toast 文字全部集中在
`pages/ojt-progress-view.ts`（該檔註解明載「本函式之字串常數即為〔使用者語言禁令〕之落點」）。
把新句子寫進 `OjtProgressPage.tsx` 會讓同一則 toast 的四句話散在兩個檔——正是本 repo 反覆記過的
「同一不變式兩個定義點」。故就地擴充該檔（**純 additive**：＋1 常數、＋1 參數型別放寬），
其餘 OJT 檔案一格未動。

### 🔴 修掉的不只是文案——原實作有一個型別陷阱使降級分支根本走不到

```ts
// OLD（原 endpoints.ts:1438-1439）
const raw = Number(headers.get('x-export-row-count'));
return { count: Number.isFinite(raw) ? raw : 0 };
```

`headers.get()` 未命中時回 **`null`**，而 `Number(null) === 0` 且 `Number.isFinite(0) === true`
⇒ **標頭缺席這條路徑永遠不會走到三元運算子的 `: 0` 分支**，它一路帶著一個看起來完全正常的 `0`
回到畫面，toast 顯示「共 0 筆」。（`Number('')` 同為 `0`，空字串標頭亦然。）
⇒ 這正是 `AC-UX55` ① 所禁止的「說了假話」的最糟形式：使用者會以為匯出失敗而重跑，
或以為資料真的沒了。現改為**先判標頭存在與否、再判值可否解析**，兩者皆收斂為 `null`。

### 四個環已鎖陷阱之對照

| 陷阱 | 處置 |
|---|---|
| 標頭缺失不得捏造數字／不得回退畫面列數 | 第 1 句改用 `OJT_EXPORT_COUNT_UNKNOWN_TEXT`，句中無任何數字；`onExport` 從未取用畫面列數 |
| `NaN`（標頭存在但不可解析）比照缺失 | `Number.isFinite()` 同時涵蓋 `null` 與 `NaN`，共用同一句 |
| 🔴 `count: 0` 與降級狀態**互斥** | 判準為 `exportedCount !== null && Number.isFinite(exportedCount)`，**明文禁止** `if (!exportedCount)`（`0` 為 falsy 會被誤送進降級分支）；已於程式碼註解逐字記明理由 |
| 降級文案不得含內部詞彙 | 逐字為 `已匯出 OJT 進度清單（CSV，UTF-8 BOM）；系統暫時無法確認筆數，請以下載檔案為準。`，無 `標頭`／`header`／`X-Export-Row-Count` |

🔒 `AC-UX55` ⑦：**只有第 1 句降級**，第 2 句（三項條件）與第 3 句（搜尋文件不影響匯出）之
出現條件完全未動。

### 結果

`OjtProgressPage.ux16.test.tsx` ＋ `OjtProgressPage.test.tsx` → **134 passed / 0 failed**。
**前端全套 150 files／2559 tests 全綠、零紅。**

## 六、交回 lead 之既有缺口（非本 lane 造成、未修）

- 🟢 **已由 lead 認領、本 lane 不修**（lead 2026-09-22：「不是你的問題，不要修，我會另外處置」；
  並指出其專案記憶**早在 F044 那一輪就記過同一件事**——生產碼零錯誤、全部落在測試檔與
  `vite.config.ts`，修法 additive 需授權）。
  🔴 **`frontend` 之 `npm run typecheck` 本來就不是零錯誤**：`@types/node` **未列於
  `frontend/package.json` 之相依**（`node_modules/@types/` 內確實沒有它），故
  `Icon.registry.test.tsx`／`PageHeader.callers.test.tsx`／`f044-static-guards.test.ts`／
  `AccessHistoryPage.export.test.tsx`／`change-label-authority.test.ts`／
  `DocumentEditPage.editionShared.test.tsx`／`typography-d9.test.ts`／`vite.config.ts` 共約 30 條
  `TS2307 node:fs`／`TS2304 __dirname`／`TS2591 process`，外加
  `DocumentEditPage.test.tsx:922 TS18047`。
  **舉證方式**：`git stash push -- frontend/src backend/src` 後重跑 `npm run typecheck`，同一批
  錯誤逐條重現 ⇒ 與本輪無關。本 lane 之增量為**零新錯誤**（扣除上述既有清單後輸出乾淨）。
  修法（新增 devDependency ＋ `tsconfig.types`）**超出本 lane 之 territory，未擅自執行**。
- `OjtProgressPage.ux16.test.tsx` 之 2 紅（`AC-UX55` 匯出 toast 之降級文案缺「請以下載檔案為準」）
  屬 `impl-ojt` lane。
