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

## 〇之二、第七輪增量（2026-09-21，人類裁決：卡④ 閘門與環圖） {#round7}

### 閘門（四道，全量實跑）

| # | 閘門 | 結果 |
|---|---|---|
| 1 | backend `npx jest --maxWorkers=4` | ✅ **230 suites / 3664 tests 全綠** |
| 2 | frontend `npx vitest run` | ✅ **141 files / 2468 tests 全綠** |
| 3a | backend `npx tsc --noEmit` | ✅ exit 0 |
| 3b | frontend `npx vite build` | ✅ exit 0 |
| 4 | backend `npm run deps:check` | ✅ 零違規（409 modules / 1236 deps） |

### ① 卡④ 閘門改為讀矩陣（`AC-G17` 就地改寫）

`canViewDashboard(role)` → `canPerform(role, FunctionKey.OJT_PROGRESS_MANAGEMENT, 'read')`
⇒ 四種後台角色皆顯示卡④。🔒 `canViewDashboard` 本身**一行未動**（F042 之 TAB1 仍對主管／窗口隱藏，
`AC-G80` 回歸鎖續存）——本輪限縮的是**本檔之重用**。

🔴 **根因（值得記住的形狀）**：舊寫法重用了一個**答錯問題**的述詞——`canViewDashboard` 答「誰看得到
**那一個分頁**」，卡④ 問「誰看得到**這一個數字**」。兩個問題在某些角色上碰巧同值，不代表可以共用；
後果是**反轉的權限梯度**（`READ` 的 SysAdmin 看得到，`RESTRICTED_CRUD` 的主管／窗口反而看不到）。

🔒 **`查看明細` 不再自行判定一次閘門**：卡片的閘門**即**連結的閘門
⇒ 「同進同出」是**結構性**的，不是靠兩處 `canPerform` 保持同步。

### ② 卡④ 環圖（`AC-G97`）

- 新增純函式 `ojtOnTimeArc(numerator, denominator)`（`dashboard-analytics-view.ts`）：半徑 **26**
  （🔴 刻意不等於大環圖之 54）、比值兩端夾 `[0, 1]`、`rest` 由周長**減**出使 `length + rest` 恆等周長。
- 數值拆為**兩個**節點：環中央 `[data-ojt-ontime-rate]` ＝ `{Z}%`（🔴 `<svg>` **之外**之 HTML 文字）、
  環旁 `ojt-ontime-value` ＝ `已完成 {X} / 應完成 {Y}`（🔴 不含 `%`）；外層 `stat-value` 同時含住兩者。
  🔴 `AC-G24` 原本之「兩者 `textContent` 完全相同」已隨之作廢。
- `denominator === 0` ⇒ 三個節點**全部不進 DOM**，改 `empty-state`。

🔴 **一個刻意的不同源，不得「修」它**：**弧長採未捨入比值、環中央文字採 `coveragePercent()` 之整數**
——文字要可讀、弧長要準（`1/3` 應畫 33.33% 而非 33%），差距恆 < 周長 1%。
⚠ 常見向量（`0`／`3/4`／`4/4`）之整數百分比與真比值**恰好相等** ⇒ 對這個改動零鑑別力；
唯一的防線是環那條 `1/3`。

### 爭議與裁決（1 件，已解）

`AC-G97` 空狀態那條之末句 `expect(card.querySelectorAll('svg')).toHaveLength(0)` **不可滿足**：
`lucide-react` 把每一顆圖示都渲染成 `<svg>`，而卡④ 在空狀態下仍有四顆**各自被別的 AC／prototype
要求**的圖示（卡頭 `graduation-cap`／ⓘ 之 `info`／共用 `EmptyState` 之 `info`／`查看明細` 之
`arrow-right`），**沒有一顆是環**。🔴 **prototype 自己也過不了那一行。**
⇒ `ring-f044` 查證後認定量尺錯誤，改為只咬弧的兩條（`svg[viewBox="0 0 64 64"]` 與
`[stroke-dasharray]`），並各自補上正向孿生與「空狀態下卡內仍須有圖示」之自我守護。
🔒 實作端一行測試未動。

> 📌 **通則（`G44-34`）**：選一個「更嚴格」的代理量尺時，**先拿 prototype 自己跑一遍**；
> **prototype 過不了的量尺，一定是量尺錯。**

---

## 〇、第六輪增量（2026-09-21，人類裁決第二輪：實作理由退出畫面） {#round6}

> 本節為 `AC-G94`／`AC-G95`／`AC-G96` 與 [§癸四](../features/F044-admin-dashboard-analytics.md#rationale-sites)
> 11 處逐字處置之增量紀錄；第一輪之內容一律保留於下方各節。

### 閘門（四道，全量實跑）

| # | 閘門 | 結果 |
|---|---|---|
| 1 | backend `npx jest --maxWorkers=4` | ✅ **230 suites / 3664 tests 全綠** |
| 2 | frontend `npx vitest run` | ✅ **141 files / 2451 tests 全綠** |
| 3a | backend `npx tsc --noEmit` | ✅ exit 0 |
| 3b | frontend `npx vite build` | ✅ exit 0 |
| 4 | backend `npm run deps:check` | ✅ 零違規（409 modules / 1236 deps） |

> ⚠ **本節之閘門 1 曾於同日稍早兩度為紅**（`src/auth/aad-hardening-scan.spec.ts` › `AC-E8`），
> 根因為當時 HEAD 之 `ca17a1d` 於兩支 `Dockerfile` 設了 `ENV NODE_EXTRA_CA_CERTS`。
> 🟢 **該衝突已由 lead 於同日修正**（改為只在 `RUN` 內設 `npm_config_cafile`，把信任範圍收窄到
> 「build 時的 npm registry 連線」，**不留行程層信任錨點**）⇒ 上表為修正落地後之實跑結果。
> 🔒 該紅燈**與 F044 無關**，本功能未觸及任何 `Dockerfile`；原始追蹤紀錄保留於 §六。

### 改動

| 側 | 檔案 | 改動 |
|---|---|---|
| BE | `dashboard/dashboard-analytics.ts` | `latestAnnouncements()` 回傳型別改為 `{ rows, total }`（`AC-G96`）；`total` ＝ **截斷前**同一個 `pool` 之長度 |
| BE | `dashboard/dashboard-analytics.service.ts` | additive `latestAnnouncementsTotal`；與 `latestAnnouncements` 於**同一次呼叫**內一起設、一起省略 |
| FE | `api/dashboard-analytics-types.ts` | additive `latestAnnouncementsTotal?` |
| FE | `pages/ojt-progress-view.ts` | ＋`excludedUnitCount()`（單一推導點）；`ojtOnTimeNote()`／`ojtOnTimeNoteSegments()` 改為 §癸四 第 1 列之鎖定四段；`OjtOnTimeNoteStats` 三個 `excluded*` 逐欄註明計數單位 |
| FE | `pages/DashboardHome.tsx` | ＋`InfoNote` 元件（`AC-G95`）；§癸四 11 處逐條處置 |

### 🔒 逐處處置對照（§癸四 11 列）

| # | 處置 | 落點 |
|---|---|---|
| 1 | 可見只留 `已排除 {a+b} 個單位`（🔴 恰前兩項）；口徑說明四段移入 ⓘ `ojt-ontime` | `OjtOnTimeCard` |
| 2 | 兩分支文案重寫，三個數字留可見；排序規則移入 ⓘ `{scope}-truncation` | `DonutRegion` |
| 3／5 | 可見 `desc` 與「進度中」說明**整段刪除**，併入同一個 ⓘ `donut-month`／`donut-cumulative` | `DONUT_META`／`DonutRegion` |
| 4 | 統計單位說明**整段刪除**，移入 ⓘ `category-distribution` | `CategoryDistribution` |
| 6 | 🟢 可見、原樣不改 | 環圖空狀態 `hint` |
| 7／8／9 | 🟢 可見、但重寫（去除 `即時聚合`／`儲存狀態為有效`／`降冪`／`掛載數為 0`） | 三處空狀態 `hint` |
| 10 | 可見 `共 {n} 份，這裡顯示最新的 {m} 份。`（`{n}` 取自 `latestAnnouncementsTotal`）；排序規則移入 ⓘ `latest-announcements` | `LatestAnnouncements` |
| 11 | 兩分支文案重寫；排序規則移入 ⓘ `category-truncation` | `CategoryDistribution` |

🔒 全部逐字照表、**未自行潤飾**；每一處皆留 `OLD>` 追溯註記。

### 爭議與裁決（1 件，已解）

`ojt-progress-view.f044.test.ts` 之 `AC-G89` 四列向量本輪未被加上第六輪指標，與 `AC-G94` 之禁用詞掃描
**互斥**：`NO_STATISTICS_TEXT` 逐字為 `尚無可統計之進度列`，**本身即含被禁字面 `進度列`**，而
`ojtOnTimeNote()` 之輸出自本輪起只進 ⓘ、ⓘ **恆在 DOM** ⇒ 必被掃描命中。
以**探針**證明（施加滿足 `AC-G89` ① 之唯一改法 → `AC-G94` 之 `ojtZero` 態翻紅 → 還原），
並附四種改法之窮舉。⇒ lead 裁定 **(b)**：`ojtOnTimeNote` 即 ⓘ 之產生者，`AC-G89` 就地改寫；
`ring-f044` 已改測試（🔒 實作端一行測試未動），現 198/198 全綠。

### 🔴 一項**無測試防護**之修正（下一個人最可能誤刪）

`InfoNote` 之 `onFocus`／`onBlur` 以 `flushSync` 包覆。**拿掉它不會讓任何測試翻紅**
（環已改用 `waitFor`，會等到下一拍）⇒ 該段註解是這個修正目前**唯一的防線**。
它守的不是測試，是「**可見狀態與 ARIA 狀態必須同一拍落地**」：焦點可完全不經 React 事件而改變
（原生 `Tab`／`element.focus()`／輔助技術），而 React 18 把 focus 歸在 continuous 車道、非同步排程
⇒ popover 已由 CSS 展開、`aria-expanded` 卻還停在 `"false"`，對螢幕閱讀器是**說謊的中間狀態**。

---

## 一、閘門實跑結果（2026-09-21，第一輪）

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

- 🟢 **已解決（2026-09-21 當日）**：`src/auth/aad-hardening-scan.spec.ts` › `AC-E8` ›
  `NODE_EXTRA_CA_CERTS 未出現於任何生產原始碼或部署檔` 之紅燈（**非 F044 引入**）。
  lead 之修正未放寬 `AC-E8`，而是**收窄信任範圍**：兩支 `Dockerfile` 改為在 `RUN` 內設
  `npm_config_cafile`（npm 自己的 CA 檔、只作用於該行 shell），🔴 **不再留任何行程層信任錨點**
  ——後者會讓執行中的容器對 Azure Blob／AAD／MSSQL 之**全部對外 TLS** 都信任該 MITM CA。
  🔒 兩支 Dockerfile 皆已加上「**不得改回行程層環境變數**」之逐字禁令。
  📌 原始追蹤紀錄（供追溯）：
  根因＝已推送之 `ca17a1d build(docker): 支援公司 TLS 攔截之根 CA` 在
  `backend/Dockerfile:18`／`backend/Dockerfile:34`／`frontend/Dockerfile:18` 加了
  `ENV NODE_EXTRA_CA_CERTS=...`，而 `AC-E8` 明文禁止該字面出現於部署檔。
  🔒 **本輪工作區之兩支 Dockerfile 與 HEAD 逐字相同**（`git status --porcelain` 零輸出）⇒ 該紅燈在 HEAD 即存在。
  ⚠ **失敗訊息會誤導**：它以 `findIndex` 取**第一個**命中行，故印出 `backend/Dockerfile:9`
  ——那一行是**註解**（`…必須走 NODE_EXTRA_CA_CERTS。`），真正的違規是第 18／34 行的 `ENV`。
  ⇒ 這是一個**安全 AC 與部署需求之衝突**，需 lead／system-architect 裁決（放寬 `AC-E8`、
  或改用不觸及該環境變數的作法），🔴 **不在本功能之授權範圍**。

- `frontend/tsconfig.json` 未納入 `@types/node`，使 12 個以 node 內建模組做原始碼掃描的
  **測試檔**與 `vite.config.ts` 在 `npx tsc --noEmit` 下恆紅（既有 32 行）。本輪之環新增之
  `f044-static-guards.test.ts` 落入同一類別（＋4 行）。🔴 屬既有債，修它會動到全站 tsconfig，
  不在本功能授權範圍。
- `GET /admin/dashboard/summary` 自本輪起**無執行期消費者**（`AC-G75` 明令保留）。
  建議另立追蹤項，待 `OQ-D44-04` 之保留理由失效時再清理（architecture-spec §15.12 四 ④）。
