---
type: implementation-log
feature_id: F044
feature_name: 後台首頁儀表板改版（統計卡／環圖／最新公告／類別分布）
status: complete
last_updated: 2026-09-21
---

# F044: 後台首頁儀表板改版 — 實作紀錄

> 🔴 **本檔記載的是「約束環全綠」，不是「功能已驗收」。** [architecture-spec §15.10](../architecture-spec.md#ch15-blindspots)
> 之 **12 項盲區**本輪機器全數驗不到（無整合測試、無 e2e、無視覺回歸、無效能閘門），
> 逐項覆核狀態見 [§盲區](#blindspots)。🔴 其中 **#8（`副本部長`／`副總經理`）永遠無法覆核，
> 本檔與任何交付報告中皆不得列為「已驗證」**。

## 一、閘門實跑結果（2026-09-21）

| # | 閘門 | 指令 | 結果 |
|---|---|---|---|
| 1 | 後端單元測試全量 | `npx jest --maxWorkers=4` | ✅ **230 suites / 3659 tests 全綠** |
| 2 | 前端單元測試全量 | `npx vitest run` | ✅ **140 files / 2297 tests 全綠** |
| 3a | 後端型別 | `npx tsc --noEmit -p tsconfig.json` | ✅ exit 0 |
| 3b | 前端建置 | `npx vite build` | ✅ exit 0（2080 modules transformed） |
| 4 | 相依結構 | `npm run deps:check` | ✅ `no dependency violations found (409 modules, 1236 dependencies cruised)` |

⚠ **`frontend/npx tsc --noEmit` 為既有紅燈，本輪未惡化**：本功能導入前（`git stash` 實測）即有
**32** 行錯誤，導入後為 **36** 行；差額 **4 行全部來自環自己的新檔**
`frontend/src/domain/f044-static-guards.test.ts`（`node:fs`／`node:path`／`__dirname` 於前端
`tsconfig.json` 無 `@types/node`，與既有 `Icon.registry.test.tsx`／`PageHeader.callers.test.tsx`／
`proxy-coverage.test.ts` 等 11 個檔案同一成因）。🔴 **本輪之生產程式碼貢獻 0 個型別錯誤**；
該既有債為測試檔與 `vite.config.ts` 之 node 型別缺漏，不在本功能授權範圍內。

## 二、約束環之爭議與裁決

| # | 爭議 | 我方舉證 | `test-generator` 之裁決 |
|---|---|---|---|
| 1 | `OjtProgressPage.f044.test.tsx` 之 `groupOrder()` helper 以**單數** `screen.findByText(TAB_SESSIONS_TEXT)` 定位，在 TAB2 為當前分頁時**必然**命中 2 個元素 ⇒ 12 條案例在**任何實作下**都紅在 `Found multiple elements` | 實跑輸出列出兩個命中元素：`<span>OJT 資料清單</span>`（`PageHeader` breadcrumb，`OjtProgressPage.tsx:543`，本輪一行未改、逐字對應 prototype 25 之 `crumbTab`）與 `<button data-ojt-tab="sessions" role="tab">`（`AC-G21`／`AC-G80` 鎖住之分頁鈕）。兩者皆為既有設計文案 ⇒ 實作側無合法改法 | ✅ **採納**：helper 改為 `findAllByText`（與同檔 `switchToSessionsTab()` 之 role 查詢並存）。修後 **21/21 全綠** |
| 2 | （回報，非爭議）`DashboardHome.test.tsx` 之 `'端點失敗 → 空狀態且不阻斷儀表板（快速進入卡片仍在）'` 之最後一句必然因 `AC-G25` 翻紅；`AC-G84` 已明文其載體須更換 | 該案不在 lead 指名之 `KPI 卡（GAP-07-1）` describe 內 | ✅ **已由 `test-generator` 一併處理**（含 automock 之前瞻性 stub，見該檔 `stubF044Endpoints()`） |

🔒 **實作側對測試檔之改動＝零**：`git diff --name-only | grep -E '\.(spec|test)\.tsx?$'` 僅命中
`frontend/src/pages/DashboardHome.test.tsx`，其 diff 逐字標示「由 test-generator 加入」。

## 三、檔案清單

### 新增（🟢 ＝零 IO 純函式檔，本輪之全部鑑別力集中於此）

| 側 | 檔案 | 內容 |
|---|---|---|
| BE | 🟢 `backend/src/ojt-progress/add-months-clamped.ts` | `addMonthsClamped`（前後端孿生，8 列向量表雙鎖） |
| BE | 🟢 `backend/src/ojt-progress/ojt-ontime.ts` | `ojtOnTimeRate(rows, today, orphanedCount?)` |
| BE | 🟢 `backend/src/dashboard/default-org-dimension.ts` | `defaultOrgDimension`（逐字白名單、完整字串相等） |
| BE | 🟢 `backend/src/dashboard/division-resolver.ts` | `divisionOf` ＋ `orgSegmentOf` ＋ `indexOrgUnitsByCompany` |
| BE | 🟢 `backend/src/dashboard/dashboard-analytics.ts` | `countCards`／`monthWindow`／`donutSlices`／`latestAnnouncements` |
| BE | 🟢 `backend/src/dashboard/category-distribution.ts` | `categoryDistribution(pairs, today)` |
| BE | `backend/src/dashboard/dashboard-analytics.service.ts` | 編排層（各子聚合各自 try/catch、省略鍵） |
| BE | `backend/src/dashboard/dashboard-analytics.sources.ts` | 5 個唯讀 provider（只做投影） |
| BE | `backend/src/dashboard/category-distribution.source.ts` | 一次 join ＋ `DISTINCT`（`ARCH-G0` 之唯一例外） |
| FE | 🟢 `frontend/src/pages/dashboard-analytics-view.ts` | `topNWithOther`／`donutSegments`／`barWidths`／`normalizeDefaultDimension` |
| FE | `frontend/src/api/dashboard-analytics-types.ts` | 三個端點之回應型別（見下方「刻意獨立成檔」） |

### 修改（全部為 additive）

| 側 | 檔案 | 改動 |
|---|---|---|
| BE | `dashboard/dashboard.controller.ts` | ＋2 個 `@Get`（`analytics`／`category-distribution`）、建構子 ＋1 注入、＋`analyticsSessionOf()` |
| BE | `dashboard/dashboard.module.ts` | ＋1 個 `useFactory` provider |
| BE | `ojt-progress/ojt-progress.controller.ts` | ＋1 個 `@Get('admin/ojt-progress/ontime-summary')` |
| BE | `ojt-progress/ojt-progress.service.ts` | ＋`OjtOnTimeSummary` 型別、＋公開方法 `getOnTimeUnitStats()`（重用既有 `private aggregate()` 與 `countOrphanedRows()`） |
| FE | `api/endpoints.ts` | ＋3 個端點函式 |
| FE | `pages/DashboardHome.tsx` | 整頁改版（詳見 §四） |
| FE | `pages/ojt-progress-view.ts` | ＋`addMonthsClamped`（`trainingDueDate` 改委派）、＋`ojtOnTimeNote`、＋`sortGroupsIncompleteFirst`、＋`readTabParam`／`readSortParam`、＋chip 之 6 個逐字常數 |
| FE | `pages/OjtProgressPage.tsx` | ＋`useSearchParams`；`tab` 改初始化函式取樣、＋`sortIncompleteFirst` 狀態與 chip |
| FE | `pages/DocumentListPage.tsx` | ＋`readSortParams()`；`sortBy`／`sortDir` 改初始化函式取樣 |

🔒 **零 migration**（`AC-G74`）、🔒 `frontend/package.json` 相依**零新增**（`AC-G48`，圖表自繪 SVG）、
🔒 三個新端點皆在既有 `/admin` 前綴下 ⇒ `vite.config.ts`／`nginx.conf` 代理白名單零修改。

## 四、實作決策（皆在規格與架構之邊界內）

1. **`frontend/src/api/dashboard-analytics-types.ts` 刻意獨立成檔，不併入 `api/types.ts`**。
   理由：`AC-G90` ③ 之**軸向守門**（`f044-static-guards.test.ts`）要求具名例外之四檔
   （含 `api/types.ts`／`api/endpoints.ts`）**不得**同時出現職位識別子與「環圖維度」詞彙；
   `DashboardAnalytics` 需要 `defaultDimension` 這個鍵，放進 `api/types.ts` 會使該守門條件
   **結構上不可能成立**。`endpoints.ts` 只引用型別**名稱**，不含維度詞彙，故守門仍成立。
2. **端點呼叫一律以 `Promise.resolve().then(() => fn())` 起頭**，而非 `fn().then(...)`。
   理由：後者在 `fn` 同步拋錯（含 automock 回 `undefined` 之情形）時會**同步**炸掉整個 effect，
   連帶讓其餘三個區塊一起消失——那正是 `AC-G23`「一個失敗不得把其他人一起帶走」要防的形狀。
3. **卡④ 之空狀態不渲染 `ojt-ontime-value`**（prototype 07 之 `ojtCardHtml()` 在空狀態下仍掛該
   `data-testid`）。理由＝F044 §子 DOM 契約表末段明文：「分母為 0 時卡④ 呈現 `empty-state`，
   此時兩個節點**一併不存在**」，且環之斷言據此撰寫。⇒ **以規格為準、不照抄原型**。
4. **`ojtOnTimeNote()` 與 `exclusionNote()` 緊鄰而立、互相指名、刻意不合流**（`ARCH-G6`）：
   頭句、排除列舉（二 vs 三個原因）、尾句三段皆不同；共用只會把兩個口徑不同的數字綁死在同一支
   文案產生器上。共用點僅限 `coveragePercent()` 與 `NO_STATISTICS_TEXT`。
5. **`sort=incomplete-first` 僅於「以使用單位分組」生效**（`AC-G92`）——prototype 25 只實作一種
   分組模式，該分支於本輪補上；🔴 不得以「原型沒有這個分支」作為不實作的理由。
6. **`DocumentListPage` 之 `sortDir` 出現卻不可辨識時整組 no-op**，缺席時退回既有預設 `asc`
   （`AC-G59` ③ 之兩種情形不同，環以兩組向量分別鎖住）。

## 五、盲區與未覆核事項（🔴 交人類／部署驗證） {#blindspots}

> 逐項對應 [architecture-spec §15.10](../architecture-spec.md#ch15-blindspots) 之 12 項。
> **本輪機器閘門對下列每一項皆為零鑑別力**；下表之「狀態」欄一律為 ⬜，**不得**改寫為「已驗證」。

| # | 盲區 | 狀態 |
|---|---|---|
| 1 | `category-distribution.source.ts` 之 join ＋ `DISTINCT (businessCategoryId, documentId)` 是否正確 | ⬜ 待實機（純函式層仍自行以 `documentId` 去重，為 SQL 被改壞時之第二道） |
| 2 | 文件投影（`status='active'` 之 8 欄）是否漏欄／漏列 | ⬜ 待實機比對卡① 與 `/admin/documents` 不套篩選之已公告計數 |
| 3 | `ORG_UNIT` 全表載入與**每公司分群**索引 | ⬜ **最高優先**：實機確認同一 5 碼代碼於不同公司底下顯示各自公司之名稱 |
| 4 | `ACCOUNT.jobPositionCode` 回查與 `JOB_POSITION` 解析 | ⬜ 待實機；🔴 特別確認 **AD 之 `B01`（本處長）落在「依制定部門」** |
| 5 | `pendingPublish` 之 SQL 與 `deriveDisplayStatus` 是否**真的**等價 | ⬜ 本輪之回歸鎖由 **fake provider** 驅動，比較的是兩支 JS，**從未比對真實 SQL** |
| 6 | NFR-F044-1 之 P95 ≤ 2 秒 | ⬜ 簡化環無效能閘門；🔴 若不達標須由 system-architect 決定策略，不得由實作者自行加快取 |
| 7 | 弧長／長條寬度**是否真的被接到 `<svg>` 上** | ⬜ 純函式只驗幾何輸出，無視覺回歸 |
| 8 | `副本部長`／`副總經理` 之白名單條目 | ❌ **永遠無法覆核**（真實語料無載體），🔴 **不得列為已驗證** |
| 9 | 新端點之 HTTP 層（Guard 順序、403 實際狀態碼、回 JSON 而非 SPA `index.html`） | ⬜ 待實機（以部門窗口登入確認 `category-distribution` 根本沒被發出；curl 直打確認 403） |
| 10 | 首頁不再呼叫 `/admin/dashboard/summary` 之後果 | ⬜ 待實機（確認無殘留 loading／console error，且該端點直打仍回 5 個鍵） |
| 11 | 部門維度在正式站之實際段數（可達 40+）與圖例可捲動性 | ⬜ 待實機目視 |
| 12 | 月界行為（每月 1 日 UTC 00:00 起卡③ 歸零） | ⬜ `AC-G69` 已明文接受此代價；覆核時只需確認沒有人改成 `Asia/Taipei` |

## 六、已知之非本輪問題（不修，供追蹤）

- `frontend/tsconfig.json` 未納入 `@types/node`，使 12 個以 node 內建模組做原始碼掃描的
  **測試檔**與 `vite.config.ts` 在 `npx tsc --noEmit` 下恆紅（既有 32 行）。本輪之環新增之
  `f044-static-guards.test.ts` 落入同一類別（＋4 行）。🔴 屬既有債，修它會動到全站 tsconfig，
  不在本功能授權範圍。
- `GET /admin/dashboard/summary` 自本輪起**無執行期消費者**（`AC-G75` 明令保留）。
  建議另立追蹤項，待 `OQ-D44-04` 之保留理由失效時再清理（architecture-spec §15.12 四 ④）。
