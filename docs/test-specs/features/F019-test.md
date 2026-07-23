---
type: test-design-feature
feature_id: F019
feature_name: 前台清單瀏覽（排序/搜尋/篩選）
priority: P0-MVP
related_spec: docs/specs/features/F019-public-list-browsing.md
last_updated: 2026-07-23
status: draft
---

# F019 — 前台清單瀏覽（排序/搜尋/篩選）· Test Design
> source: docs/specs/features/F019-public-list-browsing.md · worktree: public（feature/public-F019-F022）· 2026-07-23

## 範圍聲明

本設計涵蓋 F019 全部 AC：後端強制基底條件（`status=有效 AND 公告日期≤今日`）、使用部門置頂＋編號降冪排序、關鍵字搜尋（編號＋名稱）、部門（子樹前綴）／狀態／循環三篩選之 AND 組合、分頁、查無結果、清除篩選，以及取代 `PublicPlaceholder` 之前台清單 UI。**不含**：F020 檢視器/浮水印（點擊文件後之下一步，另檔）、F021 RWD 斷點（橫向關注點，另檔）、F022 新視窗入口（另檔）、組織單位名稱之真實解析（見下方依賴缺口）。

### 依賴缺口（影響本設計之落地方式，非本 worktree 可解）

1. **`SessionUser`／JWT claims 未攜帶 `orgCode`**（`backend/src/auth/session-token.service.ts` 第 6-18 行僅含 `loginId/email/companyCode/roleCode`）。`ACCOUNT.orgCode` 已存在（`backend/src/database/entities/account.entity.ts`），但 `/auth/me` 尚未回傳、JWT claims 亦未攜帶。F019 之置頂排序需要「使用者所屬部門」，故**架構所定 `listPublicDocuments(userOrgUnitId, filters, page)` 之 `userOrgUnitId` 來源在本 worktree 開工前須先擴充 session**。本設計之服務層測試以 `userOrgCode` 為直接輸入參數（與架構函式簽章一致），與此擴充是否完成解耦；但端到端（含前端）測試需待此擴充落地才可貫通，見開放設計問題 OQ-F019-01。
2. **部門篩選下拉之組織樹資料來源未建讀取端點**：`ORG_UNIT.name`（DESC_CHI 簡稱）與 `tier`/`orgCode`/`parentCode` 已持久化（`backend/src/database/entities/org-unit.entity.ts`），資料齊備，但目前僅 `org-sync` 內部同步用途存取，**無對外「列出組織單位」查詢 API**。依 worktree guide 指示「org 名稱解析未建（Wave 3）...勿自建 org 讀取端點」，此為明確待決之範圍衝突，見 OQ-F019-02。
3. **`DocumentStore.list()`（`backend/src/documents/documents.store.ts`）未回傳 `usingDeptIds`、無分頁參數**：F017 現行清單查詢不含 `DOC_USING_DEPT` join，F019 之置頂比對與部門篩選皆需要此 join，屬全新查詢範圍，非重用 F017 既有實作可得。

## 測試策略（unit 用純函式＋FakeStore；真 MSSQL JOIN／index-seek／P95＝[integration]）

- **[unit] 排序管線**：依 `docs/specs/diagrams/F019-public-list-sorting.mmd`，以純函式 `splitAndSort(items, userOrgCode)` 驅動（輸入含 `usingDeptIds` 之文件陣列＋使用者部門代碼，輸出置頂區/其餘區合併陣列），比照 `backend/src/documents/documents.service.spec.ts` 之 `FakeStore`（記憶體陣列）風格，不需真實 MSSQL。
- **[unit] 篩選管線**：部門子樹前綴比對重用 `backend/src/org-sync/org-hierarchy.ts` 之 `deriveCodePrefix()`（純函式，已存在），以 JS `String.startsWith(prefix)` 模擬 `LIKE 'prefix%'` 語意於 FakeStore 資料上驗證；狀態/循環篩選為簡單相等比對；三者 AND 組合、關鍵字子字串比對（含萬用字元跳脫）亦以純函式／FakeStore 驗證。
- **[unit] 強制基底條件**：以可注入之「當下時間」（比照 F004/F009 injectable clock 慣例）驗證 `status=有效 AND 公告日期≤今日` 之後端強制無法被呼叫端傳入之其他條件繞過。
- **[unit] RBAC／未登入閘門**：`FunctionKey.PUBLIC_BROWSING` 於 `backend/src/rbac/function-matrix.ts` 對 5 種角色皆為 `READ`（第 101 行），故**唯一有意義之拒絕情境為未登入**（`SessionGuard` 層），無角色別 403 情境需覆蓋（比照 F016 `SessionGuard` 測試手法）。
- **[unit] 前端清單頁元件**：以假 API 回應（固定分頁 JSON）驅動 `React Testing Library` 渲染，斷言清單卡片欄位、篩選/搜尋控制項、分頁控制項、空狀態呈現、清除篩選行為；部門篩選下拉之組織樹資料以假資料/hardcode stub 呈現（依 OQ-F019-02 待定前之過渡設計）。
- **[integration]**：真 MSSQL 之 `DOC_USING_DEPT` JOIN 正確性、`orgCode LIKE 'prefix%'` 實際執行計畫確認 index-seek（非 remote/table scan）、跨頁排序在真實分頁（`OFFSET`/`FETCH`）下之一致性、[NFR-001](../../specs/nfr.md#performance) P95<2s／首屏<3s 實測、萬用字元跳脫於真實 SQL 參數化查詢之防注入驗證。這些項目本設計僅標記，不在 unit 範圍內斷言。

## Test Scenarios

### A. 排序：使用部門置頂 + 編號降冪

#### TS-F019-001 使用者部門與文件使用部門完全相符 → 置頂 [unit]
- Given：使用者 `orgCode=JAC00`；文件 D1 `usingDeptIds=[JAC00]`、D2 `usingDeptIds=[JCHA0]`
- When：套用排序管線
- Then：D1 位於置頂區，D2 位於其餘區
- 對應 AC / 錯誤碼：AC1（Main Flow 2）

#### TS-F019-002 置頂區與其餘區各自依文件編號降冪 [unit]
- Given：置頂區含編號 `A003`/`A001`；其餘區含 `B010`/`B002`
- When：排序
- Then：置頂區輸出順序 `A003, A001`；其餘區 `B010, B002`；置頂區整體排在其餘區之前
- 對應 AC / 錯誤碼：AC2

#### TS-F019-003 使用者部門查無相符文件 → 無置頂區塊，純編號降冪 [unit]
- Given：使用者 `orgCode=JAC00`，所有文件之 `usingDeptIds` 皆不含 `JAC00`（無論子樹與否）
- When：排序
- Then：全數文件依編號降冪呈現於單一區塊，不因「無置頂」產生錯誤或空區塊異常
- 對應 AC / 錯誤碼：Edge Case（使用者部門查無相符文件）

#### TS-F019-004 文件使用部門為多部門，其一相符 → 仍列入置頂 [unit]
- Given：文件 D1 `usingDeptIds=[JCHA0, JAC00]`；使用者 `orgCode=JAC00`
- When：排序
- Then：D1 列入置頂區（僅需集合中任一相符）
- 對應 AC / 錯誤碼：Edge Case（使用部門為多部門，其一相符）

#### TS-F019-005 置頂比對是否套用子樹展開（同 OQ-F019-03） [unit]
- Given：使用者 `orgCode=JAC00`（處室層）；文件 D1 `usingDeptIds=[JA000]`（其上層之部層，非精確相符）
- When：排序
- Then：**本設計依 spec Main Flow 2 字面（「文件使用部門含使用者部門」）採精確集合成員比對，D1 不列入置頂**；若後續定案改採子樹展開語意（比照 §9 部門篩選規則），本案例期望須反向調整（見 OQ-F019-03，兩種語意互斥，需 architect 定案）
- 對應 AC / 錯誤碼：Main Flow 2（語意待確認）

### B. 部門篩選：子樹前綴展開（契約 §9）

#### TS-F019-006 選定本部層 `J0000` → 涵蓋整個子樹 [unit]
- Given：`deriveCodePrefix('J0000')='J'`；文件使用部門橫跨 `JA000`/`JAC00`/`JCHA0`
- When：套用部門篩選 `J0000`
- Then：三筆文件皆列入（`orgCode.startsWith('J')`）
- 對應 AC / 錯誤碼：AC「選定營運管理部涵蓋所有下層」之上層版本（本部層）

#### TS-F019-007 選定部層 `JA000` → 涵蓋 `JAC00`/`JCHA0` [unit]
- Given：`deriveCodePrefix('JA000')='JA'`
- When：套用部門篩選 `JA000`
- Then：使用部門為 `JA` 開頭者皆列入，`J` 開頭但非 `JA` 者（如另一部 `JB000` 下之文件）不列入
- 對應 AC / 錯誤碼：AC（部門篩選選定「營運管理部」）

#### TS-F019-008 選定處室層 `JAC00` → 僅該處室，不含其他處室 [unit]
- Given：`deriveCodePrefix('JAC00')='JAC'`；另一同部下處室 `JAD00`
- When：套用部門篩選 `JAC00`
- Then：僅 `JAC` 開頭之文件列入，`JAD00` 之文件不列入
- 對應 AC / 錯誤碼：AC（部門篩選選定處室層）

#### TS-F019-009 選定最細課層 `JCHA0` → 僅該課，不誤含同處室其他課 [unit]
- Given：`deriveCodePrefix('JCHA0')='JCHA'`；同處室另一課 `JCHB0`
- When：套用部門篩選 `JCHA0`
- Then：僅 `JCHA` 開頭之文件列入
- 對應 AC / 錯誤碼：Edge Case（選擇最細單位）

#### TS-F019-010 Root（`00000`）之有效前綴為空字串 → 不施加部門限制 [unit]
- Given：`deriveCodePrefix('00000')=''`
- When：選定 Root 作為部門篩選（若 UI 允許選 Root）
- Then：等同不套用部門篩選，全部文件通過此條件
- 對應 AC / 錯誤碼：部門篩選之層級與子樹展開章節「Root 有效前綴為空字串，代表全域」

#### TS-F019-011 篩選前綴含萬用字元 `%`/`_` → 正確跳脫 [unit]
- Given：（假設性）部門代碼或比對字串含 `%`/`_` 特殊字元之邊界輸入
- When：套用部門篩選
- Then：字元視為字面值而非 SQL LIKE 萬用字元，不產生非預期擴大比對範圍
- 對應 AC / 錯誤碼：Edge Case（篩選關鍵字或前綴含 %／_）

### C. 狀態／循環篩選 + AND 組合

#### TS-F019-012 狀態篩選之可選值語意（見 OQ-F019-04） [unit]
- Given：後端已強制基底條件鎖定 `status=有效 AND 公告日期≤今日`（即結果集合恆為「已公告」）
- When：UI 呈現「狀態」篩選下拉
- Then：**本設計假設下拉僅含單一有效值「已公告」，選取後結果集合不變（no-op）**；此為 spec 字面「部門/狀態/循環三種篩選」與「基底條件已鎖定單一狀態」間之語意落差，實作前需確認狀態篩選是否應予保留、或移除、或另有其他語意（見 OQ-F019-04）
- 對應 AC / 錯誤碼：AC（同時選部門+狀態+循環）語意前提

#### TS-F019-013 循環篩選（lifecycleId 相等） [unit]
- Given：文件分屬循環 `LC-A`/`LC-B`
- When：套用循環篩選 `LC-A`
- Then：僅 `LC-A` 之文件列入
- 對應 AC / 錯誤碼：AC（同時選部門+狀態+循環，三條件交集）之循環維度

#### TS-F019-014 部門＋狀態＋循環三條件交集（AND） [unit]
- Given：資料集包含各維度重疊與不重疊之組合
- When：同時套用三篩選
- Then：僅回傳同時滿足三條件之交集，非聯集
- 對應 AC / 錯誤碼：AC「同時選部門+狀態+循環，回傳三條件交集」

#### TS-F019-015 篩選 AND 關鍵字同時套用 [unit]
- Given：已套用部門篩選，另輸入關鍵字
- When：套用
- Then：回傳同時符合（AND）之結果，非個別聯集
- 對應 AC / 錯誤碼：AC「已套用篩選，同時輸入關鍵字，回傳同時符合」

### D. 關鍵字搜尋（編號＋名稱）+ 萬用字元跳脫

#### TS-F019-016 關鍵字為文件編號部分字串 [unit]
- Given：文件編號 `ICSOP-2026-001`
- When：搜尋關鍵字 `2026-001`
- Then：命中該文件，維持排序規則
- 對應 AC / 錯誤碼：AC「關鍵字為文件編號或名稱之部分字串」

#### TS-F019-017 關鍵字為文件名稱部分字串 [unit]
- Given：文件名稱「消費金融作業程序書」
- When：搜尋「消費金融」
- Then：命中該文件
- 對應 AC / 錯誤碼：同上（OQ-DATA-01：文件名稱為正式可讀標題欄位，涵蓋搜尋）

#### TS-F019-018 關鍵字含 `%` `_` `'` → 正確跳脫，無錯誤/注入 [unit]
- Given：關鍵字 `100%_test'`
- When：搜尋
- Then：字元視為字面值比對，不觸發 SQL 錯誤、不產生非預期擴大比對、亦不產生注入風險（純邏輯層以跳脫函式驗證；實際 SQL 參數化防注入為 [integration]）
- 對應 AC / 錯誤碼：Edge Case（關鍵字含 % _ '）／[error-handling.md#public](../../specs/error-handling.md#public)

#### TS-F019-019 關鍵字查無符合 → 空狀態非錯誤畫面 [unit]
- Given：搜尋一個不存在之編號片段
- When：搜尋
- Then：回傳空陣列，前端呈現「查無符合結果」，非錯誤畫面
- 對應 AC / 錯誤碼：AC「查無符合，顯示查無符合結果，非錯誤畫面」

### E. 強制基底條件（不可繞過）

#### TS-F019-020 一般查詢僅回傳已公告文件 [unit]
- Given：資料集含 已公告／進度中（有效但公告日期未到）／失效／作廢 四類
- When：呼叫前台清單查詢（不帶任何額外條件）
- Then：僅回傳「已公告」（`status=有效 AND announcedDate≤今日`）之文件
- 對應 AC / 錯誤碼：AC「一般使用者開啟前台清單，僅回傳已公告文件」

#### TS-F019-021 呼叫端夾帶 `status=進度中`／`status=失效` 等參數企圖繞過 → 後端強制忽略 [unit]
- Given：同上資料集；請求另外挾帶 `status` 查詢參數指向非「有效」狀態
- When：呼叫查詢
- Then：後端仍僅回傳已公告文件，**不因前端傳入條件而放寬**（OQ-E06-02 定案）
- 對應 AC / 錯誤碼：Edge Case「一律由後端過濾（不可依前端傳入條件繞過）」

#### TS-F019-022 「有效」但公告日期＝今日（邊界） [unit]
- Given：文件 `status=有效`、`announcedDate=今日`（以注入時鐘之「今日」為準）
- When：查詢
- Then：視為「已公告」（≤ 含當日），列入結果
- 對應 AC / 錯誤碼：定義「有效且公告日期≤今日」之邊界（含當日）

#### TS-F019-023 「有效」但公告日期＝明日（邊界） [unit]
- Given：`announcedDate=明日`
- When：查詢
- Then：視為「進度中」，不列入前台結果
- 對應 AC / 錯誤碼：同上（未到）

### F. 分頁

#### TS-F019-024 第二頁載入排序規則維持一致 [unit]
- Given：合併排序後之完整清單（置頂區在前）跨頁
- When：分別請求第 1 頁與第 2 頁
- Then：第 2 頁銜接第 1 頁末筆之後之排序位置，不重複、不遺漏、不因分頁重新洗牌
- 對應 AC / 錯誤碼：Edge Case（分頁載入第二頁，排序規則維持一致）

#### TS-F019-025 每頁筆數與總筆數/總頁數之分頁中繼資料正確性 [unit]
- Given：總筆數 105、每頁 50
- When：查詢第 1/2/3 頁
- Then：第 1/2 頁各 50 筆、第 3 頁 5 筆，`hasNext` 於第 3 頁為 false
- 對應 AC / 錯誤碼：NFR「文件清單首屏（每頁 50 筆）」隱含之分頁契約（頁碼/hasNext 形狀待 tdd-developer 定案，本設計假設比照既有 `Page<T>` 慣例，見 `backend/src/audit/audit.types.ts` Page 介面）

### G. RBAC／未登入

#### TS-F019-026 未登入呼叫前台清單 API → 拒絕 [unit]
- Given：無有效 session
- When：呼叫前台清單查詢端點
- Then：401，前端導回登入頁（SPA 層之全域 `unauthenticated` 狀態已存在於 `frontend/src/App.tsx` 第 69-75 行，`/public` 路由本身即落在該登入閘門之後，無需額外前端守衛）
- 對應 AC / 錯誤碼：[error-handling.md#public](../../specs/error-handling.md#public)

#### TS-F019-027 任一已登入角色（5 種）皆可查詢前台清單 [unit]
- Given：分別以 SysAdmin/ICSOPAdmin/Supervisor/DeptContact/User 呼叫
- When：查詢前台清單
- Then：`canPerform(role,'前台瀏覽','read')` 對全 5 角色皆為 true（`function-matrix.ts` 第 101 行），皆成功回傳
- 對應 AC / 錯誤碼：F025 矩陣「前台瀏覽：可（全角色）」

### H. 清除篩選／前端元件

#### TS-F019-028 已套用篩選後點擊「清除篩選」→ 回復預設排序與完整清單 [unit]
- Given：已套用部門+關鍵字篩選之清單頁
- When：點擊清除篩選
- Then：篩選條件重置、清單回復未篩選之完整清單（仍套用置頂+編號降冪預設排序）
- 對應 AC / 錯誤碼：AC「已套用篩選，點擊清除篩選，回復完整清單與預設排序」

#### TS-F019-029 清單卡片顯示最低必要欄位 [unit]
- Given：假 API 回應含編號/名稱/制定部門/使用部門/狀態/公告日期/內容摘要
- When：渲染清單頁
- Then：每筆卡片至少呈現編號、名稱、制定部門、使用部門、狀態、公告日期（內容摘要可選）
- 對應 AC / 錯誤碼：AC「每筆至少顯示編號/名稱/制定部門/使用部門/狀態/公告日期」

#### TS-F019-030 制定部門／使用部門顯示為 org 名稱佔位（TODO）而非崩潰 [unit]
- Given：org 名稱解析未建（本 worktree 明確不自建讀取端點）
- When：渲染清單頁
- Then：制定部門／使用部門欄位以既有可得識別（如 orgCode 或明確 TODO 佔位字串）呈現，不得顯示 `undefined`/`null`/空白造成誤解，亦不阻斷渲染
- 對應 AC / 錯誤碼：worktree guide「org 名稱解析未建...先以 ID 或既有欄位顯示、留 TODO」

#### TS-F019-031 部門篩選下拉呈現完整 5 層組織樹 [unit]
- Given：假資料組織樹（本部＞部＞處/室＞課）
- When：展開部門篩選下拉
- Then：可選擇任一層級之單位（非僅葉節點）
- 對應 AC / 錯誤碼：AC「部門篩選下拉，可選擇本部/部/處室/課任一層級」；資料來源見 OQ-F019-02

#### TS-F019-032 點擊文件卡片進入詳情（銜接 F020） [unit]
- Given：清單已渲染
- When：點擊某文件卡片
- Then：導向該文件詳情/檢視器路由（實際浮水印/PDF 行為屬 F020，另檔設計）
- 對應 AC / 錯誤碼：Main Flow 5「點擊文件進入詳情/檢視器」

### I. 真實 MSSQL（[integration]）

#### TS-F019-033 `DOC_USING_DEPT` 真實 JOIN 之置頂/篩選結果與 unit 層 FakeStore 結果一致 [integration]
- Given：真實 MSSQL，`ICSOP_DOCUMENT`／`DOC_USING_DEPT`／`ORG_UNIT` 皆有實際資料
- When：呼叫真實查詢（含置頂排序＋部門篩選）
- Then：結果與 TS-001～011 之 FakeStore 預期一致，驗證真實 JOIN 邏輯與純函式設計無落差
- 對應 AC / 錯誤碼：AC1／AC11／AC12 之真實資料層驗證

#### TS-F019-034 `orgCode LIKE '前綴%'` 執行計畫確認 index-seek（非 table/remote scan） [integration]
- Given：`ORG_UNIT.orgCode` 已建索引（`IX_ORG_UNIT_orgCode`，`backend/src/database/entities/org-unit.entity.ts` 第 18 行）
- When：對部門篩選之查詢取得執行計畫
- Then：確認為 index-seek，非全表掃描（呼應 [NFR-006](../../specs/nfr.md#integration) AC5 之查詢下推精神，雖該 AC 原指跨 linked server 情境，本地 `ORG_UNIT` 表之前綴查詢仍應驗證 index 有效性）
- 對應 AC / 錯誤碼：AC13「子樹展開以前綴比對實作，不使用遞迴 CTE 或 closure table」之效能面驗證

#### TS-F019-035 真實分頁（`OFFSET`/`FETCH`）跨頁排序一致性，含並發寫入下之穩定性 [integration]
- Given：真實 MSSQL，資料量達代表性規模（見 [NFR-001](../../specs/nfr.md#performance) 實測規模基準）
- When：連續請求第 1～3 頁，期間穿插一筆新文件寫入
- Then：既有分頁結果不因新寫入而重複/遺漏既有筆數之相對順序（新筆數之排序位置依規則插入即可，不要求絕對即時一致性）
- 對應 AC / 錯誤碼：Edge Case（分頁載入第二頁，排序規則維持一致）之真實資料庫層驗證

#### TS-F019-036 查詢類 API P95 < 2 秒、清單首屏 < 3 秒（代表性資料規模） [integration]
- Given：[NFR-001](../../specs/nfr.md#performance) 實測規模基準（AS 公司約 1,114 使用者、114 部門）與待補之實際文件數量級
- When：負載測試量測前台清單 API
- Then：P95 < 2 秒（[NFR-001](../../specs/nfr.md#performance)）；⚠ NFR 原文明載「上線前負載測試須以實際文件數重驗」，文件數/循環數量級尚待業務單位提供（OQ-NFR001），本 TS 之精確資料規模待補
- 對應 AC / 錯誤碼：[NFR-001](../../specs/nfr.md#performance) 效能與可擴展性

## AC → TS 覆蓋對照表

| AC/來源 | 內容摘要 | 對應 TS |
|---|---|---|
| AC1 | 使用部門含 X 的文件置頂 | TS-001, TS-004, TS-005 |
| AC2 | 置頂區以外依編號降冪 | TS-002 |
| AC3（清單顯示） | 每筆至少顯示編號/名稱/制定部門/使用部門/狀態/公告日期 | TS-029, TS-030 |
| AC4 | 關鍵字為編號/名稱部分字串 | TS-016, TS-017 |
| AC5 | 篩選+關鍵字 AND | TS-015 |
| AC6 | 部門+狀態+循環三條件交集 | TS-012, TS-013, TS-014 |
| AC7 | 查無符合顯示「查無符合結果」 | TS-019 |
| AC8 | 清除篩選回復完整清單 | TS-028 |
| AC9 | 一般使用者僅回傳已公告；夾帶其他條件不可繞過 | TS-020, TS-021, TS-022, TS-023 |
| AC10 | 部門篩選下拉可選任一層級 | TS-031 |
| AC11 | 選定營運管理部涵蓋所有下層 | TS-006, TS-007 |
| AC12 | 選定處室層僅列入該處室 | TS-008 |
| AC13 | 子樹展開以 `orgCode LIKE 前綴%` 實作，非遞迴 CTE | TS-006～010, TS-034（執行計畫驗證） |
| Edge：無相符置頂 | 純編號降冪 | TS-003 |
| Edge：多部門其一相符 | 仍置頂 | TS-004 |
| Edge：最細單位 | 不誤含同處室其他課 | TS-009 |
| Edge：萬用字元跳脫（篩選/關鍵字） | 正確跳脫 | TS-011, TS-018 |
| Edge：分頁排序一致 | TS-024, TS-035 |
| Error（未登入/RBAC） | error-handling#public | TS-026, TS-027 |
| Postconditions（詳情銜接） | 點擊進入詳情 | TS-032 |
| NFR-001（分頁筆數／效能） | Page 中繼資料；P95<2s／首屏<3s | TS-025, TS-036 |
| 真實 JOIN 一致性 | DOC_USING_DEPT／ORG_UNIT 真實資料層 | TS-033 |

## 開放設計問題

- **OQ-F019-01**：`SessionUser`（`backend/src/auth/session-token.service.ts`）與 `/auth/me`（`frontend/src/api/types.ts` `SessionUser`）目前未攜帶 `orgCode`。F019 之置頂排序（架構 `listPublicDocuments(userOrgUnitId, ...)`）需要此值，屬本 feature 開工前之明確前置依賴，但**擴充 session claims 屬 auth 模組變更，是否落在本 worktree 範圍內（`git-worktree-guide.md` 未明列）需與 architect/其他 worktree 協調**，避免與 doc-edit/auth 相關分支之 session shape 衝突。

- **OQ-F019-02（與 worktree guide 明確指示存在張力）**：部門篩選下拉需要「列出組織單位（含 5 層階層）」之查詢能力。`ORG_UNIT` 資料本身已齊備（`name`/`tier`/`orgCode`/`parentCode` 皆已持久化），但目前無對外讀取端點；worktree guide 明確指示「org 名稱解析未建（Wave 3 org-foundation）...勿自建 org 讀取端點（避免與 Wave 3 撞）」。然而**部門篩選之組織樹下拉若無任何組織單位清單來源，AC「部門篩選下拉可選擇任一層級」將無法真正落地**（僅能以寫死之測試假資料模擬，非可用功能）。需 architect 決策：(a) 本 worktree 建立一個**最小、唯讀、僅回傳 `id/orgCode/name/tier/parentCode`** 之組織樹端點（不含 Wave 3 之完整 org 名稱解析/管理功能，範圍明確切割），或 (b) 前台部門篩選延後至 Wave 3 org-foundation 完成後才啟用（F019 本輪僅支援關鍵字+狀態+循環篩選，部門篩選以佔位/disabled 呈現）。兩者對 TS-031 及部門篩選相關 TS-006～011 之「資料來源」處理方式不同，需定案後由 tdd-developer 依循。

- **OQ-F019-03（語意衝突）**：F019 Main Flow 2「文件使用部門含使用者部門」拆置頂區之判定，究竟是（a）**精確集合成員比對**（使用者 orgCode 逐字存在於文件 `usingDeptIds` 集合中），或（b）**依 §9 子樹前綴規則展開後之比對**（如使用者掛於 `JAC00`，文件使用部門若設為其上層 `JA000`，是否仍視為相符）？Spec 原文僅在「部門篩選」章節（§9）明確定義子樹展開規則，並未明言置頂比對規則是否比照。兩者語意差異直接影響 TS-005 之期望值與實作複雜度（(a) 為單純 `IN` 查詢；(b) 需額外前綴比對邏輯）。**需 architect 或 product owner 定案**；本設計暫依 spec 字面採 (a)，並於 TS-005 明確標註此為待確認假設。

- **OQ-F019-04**：「狀態」篩選之語意在前台情境下有落差——後端基底條件已強制鎖定 `status=有效 AND 公告日期≤今日`（即結果恆為「已公告」），此前提下「狀態」篩選下拉若沿用 F017 後台之 4 值集合（已公告/進度中/失效/作廢）將產生使用者選擇後**必然查無結果**（進度中/失效/作廢皆被基底條件排除）之矛盾 UX。是否應（a）前台「狀態」篩選僅保留單一值「已公告」（近乎裝飾性、無實質篩選作用），或（b）此篩選項在前台情境下應移除、AC 文字為由後台 F017 篩選集合複製貼上時之遺漏？需與 spec-writer/product owner 確認，避免實作出一個選了會導致「查無符合結果」空狀態的誤導性篩選項。

- **OQ-F019-05**：`DocumentListFilters`（`backend/src/documents/documents.store.ts`）與 `DocumentListItem` 現行皆不含 `usingDeptIds`／部門篩選欄位，F017 既有 `DocumentStore.list()` 亦無分頁參數。F019 是否應**擴充既有 `DocumentStore` 介面**（新增 `usingDeptIds`/分頁/前台篩選參數），或**依架構 `PublicBrowseModule` 設計另建獨立查詢路徑**（唯讀 join `DocumentModule` 資料，如架構 §3 所述「無持久資料，唯讀組合 DocumentModule 資料」）？worktree guide 明確要求「公開讀取盡量放新 `PublicDocumentsController`／public module，勿改 `documents.service.ts`（避免撞 doc-edit）」，故本設計傾向後者，但 `DocumentStore` 介面本身是否需要新增唯讀方法（如 `listWithUsingDepts`）供 `PublicBrowseModule` 呼叫，或 `PublicBrowseModule` 直接自行查詢，屬待 architect 定案之介面邊界問題，影響 TS-001～025 之 Fake 實作形狀。
