---
type: test-design-feature
feature_id: F017
feature_name: 後台文件清單與搜尋
priority: P0-MVP
related_spec: docs/specs/features/F017-backend-document-list.md
last_updated: 2026-07-23
status: draft
---

# F017 — 後台文件清單與搜尋 · Test Design
> source: docs/specs/features/F017-backend-document-list.md · worktree: doc-edit · 2026-07-22

## 範圍聲明（列已被現有 *.spec 覆蓋、不重設之基線）

`feature-status.md` 標記 F017 為 🟡 部分：「統計卡＋關鍵字/狀態篩選＋衍生狀態＋未指派警示可用；14 欄只做 ~7、9 篩選只做 2（缺循環別/編號/書名/制定/室長/連結 combobox）；**無分頁**（後端 take 2000）」。已覆蓋、不重新設計：

- `backend/src/documents/documents.service.spec.ts`（`describe('listDocuments（F017）')`）：篩選參數傳遞與依 `status` 篩選之基本行為。
- `backend/src/documents/display-status.spec.ts`：`deriveDisplayStatus` 全部邊界（本檔會**重用**此純函式於狀態篩選之語意，見下方 TS-F017-009 與 OQ-F017-01，不重複測其邊界本身）。
- `frontend/src/pages/DocumentListPage.test.tsx`：載入後渲染文件列（編號/書名）、統計卡顯示總數、ICSOPAdmin 顯示建立按鈕與每列狀態下拉、Supervisor 唯讀（無建立/無狀態下拉/顯示唯讀說明）、變更狀態呼叫 `setDocumentStatus`。目前前端已實作之 7 欄（編號/書名/狀態/循環別/版次/公告日期/節點警示）與既有 2 篩選（關鍵字 keyword／狀態 status，皆前端 client-side 過濾）之渲染正確性，本檔不重新設計。
- `backend/src/documents/documents.store.ts` / `typeorm-documents.store.ts`：既有 `list(filters)` 對 `lifecycleId`／`status`（原始儲存值）／`keyword`（documentNumber/documentName 之 LIKE 部分比對）三個查詢參數之支援，以及 `take(2000)` 上限、`lifecycleName` 之 join 解析模式（本檔會沿用此 join 模式設計 `draftingCompanyId` 等欄位之名稱解析）。

本檔聚焦缺口：14 欄中缺的 7 欄（制定公司/部門/室別名稱解析、當責室長、檔案下載、樹狀圖圖示連結、連結點程序書、內容摘要顯示已存在但截斷/title 行為未測）；9 篩選中缺的 7 個（循環別雖有 `lifecycleId` 查詢參數但前端未接、程序書編號/書名之**精確**下拉選取、制定部門/室別/當責室長/制定公司、連結點程序書）；分頁（後端硬編 `take(2000)`、無 `skip`/`limit`/`page` 參數、前端無分頁 UI）；排序（依編號/公告日期，目前完全無 sort 參數）。

## 測試策略（unit＝假 store；需真 DB＝[integration] 序列化暫不自動化）

- **unit**：延伸 `FakeStore.list()` 支援新增之篩選/排序/分頁參數（純邏輯於記憶體陣列上操作，等價於 SQL `WHERE`/`ORDER BY`/`OFFSET-FETCH`）；`draftingCompanyId`／`draftingDeptId`／`draftingSectionId` 之名稱解析比照既有 `lifecycleName` 之 Map-join 模式（`ORG_UNIT` 表已存在，見 `backend/src/database/entities/org-unit.entity.ts`，可複用同一 join 手法）。前端增量渲染測試比照 `DocumentListPage.test.tsx` 既有風格。
- **[integration]**：真實 MSSQL 之 `skip`/`take` 分頁正確性（尤其排序穩定性——同排序鍵值時的 tie-breaker，避免分頁重複/漏筆）、`draftingCompanyId`/`draftingDeptId`/`draftingSectionId` 與 `ORG_UNIT` 表真實 join 之效能（14 欄 + 多篩選之查詢複雜度）。
- **當責室長姓名解析為已知限制**：`icsop-document.entity.ts` 對 `primaryChiefId` 之欄位註解明寫「員編；PERSON 表待建」，`grep PERSON` 於全 backend 無任何對應資料表/entity。故「當責室長」欄僅能顯示原始員編字串，無法解析為姓名——本檔測試場景會明確斷言「顯示原始 id」而非「顯示正確姓名」，並於開放設計問題中註記此為已知限制、非本 wave 可修正之缺陷。

## Test Scenarios

### 14 欄：名稱解析

#### TS-F017-001 制定公司/部門/室別之 id 正確 join `ORG_UNIT` 解析為顯示名稱 [unit]
- Given：文件 `draftingCompanyId='org-co'、draftingDeptId='org-dept'、draftingSectionId='org-sec'`，`ORG_UNIT` 表存在對應列
- When：呼叫 `listDocuments({})`
- Then：清單項目含 `draftingCompanyName`／`draftingDeptName`／`draftingSectionName`（或等效鍵名，介面待定）為對應之 `ORG_UNIT.name`，比照既有 `lifecycleName` 之 Map-join 模式（避免 N+1）
- 對應 AC / 錯誤碼：F017 Main Flow「14 欄」第 1-3 項

#### TS-F017-002 制定室別為空（掛於部層，無室別）時該欄顯示空狀態 [unit]
- Given：文件 `draftingSectionId=null`
- When：呼叫清單
- Then：`draftingSectionName` 為 `null`／空字串，前端顯示「—」而非錯誤（比照 prototype 13 之 `d.section?esc(d.section):'—'`）
- 對應 AC / 錯誤碼：資料模型（`draftingSectionId` nullable，制定組織可掛於部層）

#### TS-F017-003 當責室長欄顯示原始員編字串（已知限制，非姓名） [unit]
- Given：文件 `primaryChiefId='E12345'`
- When：呼叫清單
- Then：清單項目之當責室長欄回傳原始 `'E12345'`（**不**斷言為某個姓名，因無 PERSON 表可解析；此為明確標記已知限制之場景，防止日後誤把「顯示員編」當作 bug 修掉又踩入無資料可用的窘境）
- 對應 AC / 錯誤碼：F017 Main Flow「14 欄」第 4 項；限制見「開放設計問題」

### 篩選：組織/人員維度

#### TS-F017-004 依「制定部門」篩選（精確比對） → 僅回傳符合文件 [unit]
- Given：文件 A `draftingDeptId='deptX'`、文件 B `draftingDeptId='deptY'`
- When：`listDocuments({ draftingDeptId: 'deptX' })`
- Then：僅回傳 A
- 對應 AC / 錯誤碼：F017 Main Flow「9 個可搜尋下拉篩選」制定部門

#### TS-F017-005 依「制定室別」篩選 → 僅回傳符合文件 [unit]
- Given：同上模式，改用 `draftingSectionId`
- When：`listDocuments({ draftingSectionId: 'secX' })`
- Then：僅回傳符合者
- 對應 AC / 錯誤碼：制定室別篩選

#### TS-F017-006 依「制定公司」篩選 → 僅回傳符合文件 [unit]
- Given：同上模式，改用 `draftingCompanyId`
- When：`listDocuments({ draftingCompanyId: 'coX' })`
- Then：僅回傳符合者
- 對應 AC / 錯誤碼：制定公司篩選

#### TS-F017-007 依「當責室長」篩選（`primaryChiefId` 精確比對） → 僅回傳符合文件 [unit]
- Given：文件 A `primaryChiefId='E12345'`、文件 B `primaryChiefId='E67890'`
- When：`listDocuments({ primaryChiefId: 'E12345' })`
- Then：僅回傳 A（因無 PERSON 表，篩選只能以員編精確比對，**不支援**依姓名子字串搜尋——與 prototype 13 之 `chief` combobox 選項來源 `shortName(chief)`（顯示姓名）之落差，見開放設計問題）
- 對應 AC / 錯誤碼：當責室長篩選

#### TS-F017-008 依「連結點程序書」篩選（清單內含指定目標文件之連結者） → 僅回傳擁有該連結點之來源文件 [unit]
- Given：文件 A 有連結點指向文件 T；文件 B 無任何連結點
- When：`listDocuments({ linkTargetId: 'T的id' })`（依賴 F015 `DOCUMENT_LINK` 資料，介面形狀待 F015-test.md OQ-F015-01 定案後確認）
- Then：僅回傳 A
- 對應 AC / 錯誤碼：連結點程序書篩選；**依賴 F015，見開放設計問題交叉引用**

### 篩選：編號/書名之精確選取 vs 既有關鍵字模糊搜尋

#### TS-F017-009 依「程序書編號」下拉精確選取 → 僅回傳完全相符者，區別於既有 `keyword` 模糊搜尋 [unit]
- Given：文件 A `documentNumber='ICSOP-SRC-101-1-01'`、文件 B `documentNumber='ICSOP-SRC-101-1-02'`
- When：`listDocuments({ documentNumber: 'ICSOP-SRC-101-1-01' })`（精確相等，非 `keyword` 之 LIKE 部分比對）
- Then：僅回傳 A，**不**因 B 的編號含相同前綴而被誤回傳（區別於既有 `keyword` 參數若傳入 `'ICSOP-SRC-101-1'` 會同時命中 A 與 B）
- 對應 AC / 錯誤碼：程序書編號篩選；與既有 `keyword` 機制之關係見 OQ-F017-04

#### TS-F017-010 依「程序書書名」下拉精確選取 → 僅回傳完全相符者 [unit]
- Given：同上模式，改用 `documentName`
- When：`listDocuments({ documentName: '車輛分期進件作業' })`
- Then：僅回傳完全相符書名之文件
- 對應 AC / 錯誤碼：程序書書名篩選

### 篩選：狀態（衍生值 vs 儲存值）

#### TS-F017-011 依「狀態」篩選「已公告」→ 僅回傳有效且公告日期已過（≤今日）之文件 [unit]
- Given：文件 A `status='active', announcedDate=昨日`；文件 B `status='active', announcedDate=明日`；文件 C `status='inactive'`
- When：`listDocuments({ status: '已公告' })`（或等效之衍生狀態篩選鍵，介面待 OQ-F017-01 定案）
- Then：僅回傳 A（B 為「進度中」被排除、C 為「失效」被排除）——**此為衍生篩選，非既有 `status='active'` 之原始儲存值篩選**，需注入 `today` 供判定（比照 `deriveDisplayStatus` 之 injectable time 模式）
- 對應 AC / 錯誤碼：F017 AC「有效文件…依公告日期衍生顯示…已公告/進度中」之篩選面；design fork 見 OQ-F017-01

#### TS-F017-012 依「狀態」篩選「進度中」→ 僅回傳有效且公告日期未到（>今日）之文件 [unit]
- Given：同上資料
- When：`listDocuments({ status: '進度中' })`
- Then：僅回傳 B
- 對應 AC / 錯誤碼：同上

#### TS-F017-013 依「狀態」篩選「失效」/「作廢」→ 直接以儲存值比對（不涉及衍生） [unit]
- Given：文件 C `status='inactive'`、文件 D `status='void'`
- When：`listDocuments({ status: '失效' })` 與 `listDocuments({ status: '作廢' })`
- Then：分別僅回傳 C、D（失效/作廢無衍生分支，儲存值即顯示值，行為與既有 `status='inactive'`/`'void'` 篩選一致）
- 對應 AC / 錯誤碼：F012「失效/作廢照原樣顯示」之篩選面延伸

### 複合篩選

#### TS-F017-014 複合篩選（制定部門 + 狀態） → 交集結果 [unit]
- Given：文件 A `draftingDeptId='deptX', status='active'`；文件 B `draftingDeptId='deptX', status='inactive'`；文件 C `draftingDeptId='deptY', status='active'`
- When：`listDocuments({ draftingDeptId: 'deptX', status: 'active' })`
- Then：僅回傳 A（B 部門符合但狀態不符、C 狀態符合但部門不符皆被排除）
- 對應 AC / 錯誤碼：F017 AC「套用『制定部門+狀態』複合篩選…反映交集結果」（逐字對應）

### 排序

#### TS-F017-015 依「程序書編號」排序（遞增） → 清單依編號字串排序回傳 [unit]
- Given：文件編號分別為 `'N-3'、'N-1'、'N-2'`
- When：`listDocuments({ sortBy: 'documentNumber', sortDir: 'asc' })`
- Then：回傳順序為 `N-1, N-2, N-3`
- 對應 AC / 錯誤碼：F017 AC「依程序書編號/公告日期排序，清單即時更新」

#### TS-F017-016 依「公告日期」排序 → 清單依日期排序回傳 [unit]
- Given：公告日期分別為 `2026-03-01、2026-01-01、2026-02-01`
- When：`listDocuments({ sortBy: 'announcedDate', sortDir: 'asc' })`
- Then：回傳順序依日期遞增
- 對應 AC / 錯誤碼：同上

#### TS-F017-017 排序鍵含 `announcedDate=null` 之文件時的相對位置 [unit]
- Given：3 筆文件，其中 1 筆 `announcedDate=null`
- When：依公告日期排序
- Then：**未定案**（spec 未規定 null 排最前或最後），本場景暫標記待 OQ-F017-03 定案，不預設斷言方向，僅驗證「null 值不造成排序邏輯拋錯或清單筆數短少」
- 對應 AC / 錯誤碼：邊界（Boundary），待補充

#### TS-F017-018 未指定排序參數時之預設排序 → 沿用既有 `updatedAt DESC`（既有行為，不變更） [unit]
- Given：無 `sortBy` 參數
- When：`listDocuments({})`
- Then：維持既有 `orderBy('d.updatedAt', 'DESC')` 行為（本場景為回歸防護，確認新增排序參數為**可選擴充**，未指定時不破壞既有預設順序）
- 對應 AC / 錯誤碼：既有行為之回歸防護（gap-derived）

### 分頁

#### TS-F017-019 分頁：指定 page/pageSize 取得對應區段 [unit]
- Given：共 5 筆文件（依既定排序）
- When：`listDocuments({ page: 2, pageSize: 2 })`
- Then：回傳第 3、4 筆（0-based 或 1-based 依 OQ-F017-02 定案，本場景以「第二頁應排除第一頁與第三頁以後之筆數」為核心斷言，不綁定精確 index 起算方式）
- 對應 AC / 錯誤碼：F017 Main Flow「分頁呈現清單」；精確 `pageSize` 見 OQ-F017-02

#### TS-F017-020 分頁邊界：總筆數恰為 `pageSize` 整數倍時末頁不多出空頁 [unit]
- Given：共 4 筆文件、`pageSize=2`
- When：請求第 2 頁
- Then：回傳 2 筆（第 3、4 筆），且 `hasNext`（或等效欄位）為 `false`，不產生第 3 頁的空結果
- 對應 AC / 錯誤碼：分頁邊界（Boundary）

#### TS-F017-021 分頁邊界：請求超出總頁數之 page → 回傳空陣列而非錯誤 [unit]
- Given：共 2 筆文件、`pageSize=10`
- When：請求第 5 頁
- Then：回傳空陣列，非拋錯（比照 F024「查詢空條件非阻擋」之一貫精神——查無結果為功能性回應，非錯誤）
- 對應 AC / 錯誤碼：F017 Edge Cases「查無符合結果，顯示空狀態，非錯誤」延伸至分頁邊界

#### TS-F017-022 分頁與篩選/排序共同作用 → 先篩選+排序、再分頁切片 [unit]
- Given：5 筆文件，套用狀態篩選後剩 3 筆符合，再指定 `pageSize=2`
- When：`listDocuments({ status: 'active', page: 1, pageSize: 2 })`
- Then：回傳篩選後 3 筆中的前 2 筆（驗證處理順序為「先篩選/排序、後分頁」而非反向，避免分頁切片發生在篩選之前導致結果數量錯誤）
- 對應 AC / 錯誤碼：邊界（Boundary），三種機制共同作用之正確順序，屬回歸防護重點

### 邊界與空狀態

#### TS-F017-023 文件無連結點程序書（0 筆）→ 該欄留空或顯示「—」ues [unit]
- Given：文件無任何 `DOCUMENT_LINK`
- When：呼叫清單
- Then：連結點程序書欄位回傳空陣列，前端渲染「—」
- 對應 AC / 錯誤碼：F017 Edge Cases「文件無連結點程序書（0 筆）」

#### TS-F017-024 內容摘要過長 → 清單截斷顯示，`title` 顯示全文 [unit-前端]
- Given：`contentSummary` 為超長字串（如 500 字）
- When：清單渲染該列
- Then：畫面顯示截斷後文字（CSS `truncate` 或等效），`title` 屬性為完整原文
- 對應 AC / 錯誤碼：F017 Edge Cases「內容摘要過長…截斷顯示，滑鼠停留顯示全文」

#### TS-F017-025 查無符合關鍵字/篩選結果 → 顯示空狀態而非錯誤 [unit]
- Given：篩選條件組合無任何符合文件
- When：呼叫清單
- Then：回傳空陣列，前端顯示「查無符合結果」而非錯誤畫面
- 對應 AC / 錯誤碼：F017 AC「查詢無符合關鍵字…顯示空狀態而非錯誤」（既有測試已涵蓋 `docs.length===0` 之「尚無文件」分支，本場景聚焦「有資料但篩選後無結果」之不同分支）

### 導覽：樹狀圖圖示

#### TS-F017-026 點擊樹狀圖圖示 → 導向帶入該文件所屬循環代碼之 F036 URL [unit-前端]
- Given：文件 `lifecycleId` 對應循環代碼 `'SRC'`
- When：點擊該列之樹狀圖圖示
- Then：觸發導覽（新分頁）至 `22-lifecycle-tree-preview.html?cycle=SRC`（或等效路由，介面依實際前端路由設計）
- 對應 AC / 錯誤碼：F017 AC「點擊某列樹狀圖圖示…開啟 F036…帶入該文件所屬循環」

#### TS-F017-027 未指派節點文件之樹狀圖圖示仍可開啟（僅所屬循環，非特定節點高亮） [unit-前端]
- Given：文件 `nodeId=null`，但 `lifecycleId` 存在
- When：點擊樹狀圖圖示
- Then：仍正確導向該文件所屬循環之預覽（不因未指派節點而被阻擋或報錯）
- 對應 AC / 錯誤碼：F017 Edge Cases「未指派節點文件…『樹狀圖圖示』仍可開啟該文件所屬循環之 F036 預覽」

### 篩選 combobox 前端行為（可搜尋下拉）

#### TS-F017-028 9 個下拉之輸入即時縮小選項 [unit-前端]
- Given：任一篩選 combobox（如「制定部門」）已載入全部選項
- When：於輸入框輸入子字串
- Then：選項清單即時縮小為符合子字串（不分大小寫）之選項，可點選套用
- 對應 AC / 錯誤碼：F017 AC「於…任一下拉輸入關鍵字，過濾，下拉選項即時縮小並可選取」

## AC → TS 覆蓋對照表

| AC/來源 | 內容摘要 | 對應 TS |
|---|---|---|
| AC「頂部 3 張統計卡，清單分頁顯示 14 欄」 | 14 欄名稱解析 | TS-001, TS-002, TS-003 |
| AC「輸入既存編號或書名關鍵字…僅回傳符合結果」 | 精確選取 vs 既有 keyword | TS-009, TS-010 |
| AC「套用『制定部門+狀態』複合篩選…交集結果」 | 複合篩選 | TS-014 |
| AC「9 個下拉…即時縮小並可選取」 | 9 篩選前端行為 | TS-004~008, TS-028 |
| AC「有效文件…依公告日期衍生顯示已公告/進度中」（篩選面） | 狀態篩選之衍生語意 | TS-011, TS-012, TS-013 |
| AC「點擊樹狀圖圖示…開啟 F036」 | 樹狀圖導覽 | TS-026, TS-027 |
| AC「查詢無符合關鍵字…空狀態而非錯誤」 | 空結果 | TS-021, TS-025 |
| AC「含未指派節點文件…正確顯示警示標示」 | 已覆蓋（`DocumentListPage.test.tsx` 未直接測，但前端既有邏輯已含，範圍聲明列出） | — |
| Edge「文件無連結點程序書（0 筆）」 | 空連結點顯示 | TS-023 |
| Edge「內容摘要過長」 | 截斷＋title | TS-024 |
| Main Flow「分頁呈現清單」（gap-derived，非原 spec AC 逐字給出精確數值） | 分頁機制 | TS-019~022 |
| Main Flow「依程序書編號/公告日期排序」 | 排序機制 | TS-015~018 |
| gap-derived（F015 交叉依賴） | 連結點程序書篩選 | TS-008 |

## 開放設計問題（阻擋實作前需定案）

- **OQ-F017-01（阻擋，重要，證據衝突）：「狀態」篩選之值域為衍生顯示值或原始儲存值？**
  - 證據 A（現有後端程式碼）：`documents.store.ts::DocumentListFilters.status` 與 `typeorm-documents.store.ts::list()` 之 `qb.andWhere('d.status = :status', ...)` 皆直接比對**原始儲存值**（`active`/`inactive`/`void`）；`documents.service.spec.ts` 之既有測試亦僅測 `status: 'active'` 這種原始值篩選。
  - 證據 B（`prototypes/13-document-list.html`）：「狀態」篩選 combobox 之選項為 `['已公告','進度中','失效','作廢']`（**衍生顯示值**），`renderTable()` 之篩選邏輯為 `if(FILTER.status && ds!==FILTER.status)`，其中 `ds=derived(d)` 是**衍生後**的值——即 prototype 明確以衍生值篩選，而非原始儲存值。
  - **兩者不相容**：若沿用現有後端字面實作（比對原始值），使用者選「已公告」將無法運作（後端沒有 `status='已公告'` 這種儲存值）；若改為衍生值篩選，需要在 SQL/查詢層引入「今日日期」比較邏輯（`status='active' AND announcedDate<=:today` 對應「已公告」），這是一個**查詢語意的重大變更**，且需要 injectable `today`（比照 `deriveDisplayStatus` 已有之模式）供測試可控。
  - 品質風險：若未定案，現有前端「狀態」下拉（`fStatus`，目前值域為 `active/inactive/void` 原始值）與 prototype 13 的新篩選列（衍生值）會產生兩套不同語意的「狀態」篩選同時存在或彼此覆蓋，使用者體驗混亂。TS-F017-011～013 依 prototype 之衍生值語意設計，但**明確標記為待定案**，若定案為原始值篩選則整批需要重寫為原始值比對版本。

- **OQ-F017-02（阻擋）：分頁 `pageSize` 預設值與參數命名未定案。** spec 之 AC/Main Flow 僅寫「分頁呈現清單」，未給出精確頁筆數；`prototypes/13-document-list.html` 之頁腳文字寫死 `'每頁 50 筆'`（`document.getElementById('pageInfo').textContent=...'每頁 50 筆'`），但此為**靜態展示文字**、非可配置之定案數值來源，且與 F024 查詢頁面之 `pageSize` 預設 50（`audit.types.ts` 有明確定義 `pageSize?: number` 預設 50）恰好一致，可能僅為巧合亦可能是專案慣例。建議 architect 確認是否比照 F024 之 50 筆／頁定案，或另訂數值；TS-F017-019～022 之精確筆數斷言依此定案後才可轉為具體數字，本檔暫以相對筆數（「第二頁排除第一頁」）設計以降低耦合。

- **OQ-F017-03（非阻擋）**：`announcedDate=null` 之文件在依公告日期排序時的相對位置（排最前／最後／依 DB 預設 NULL 排序行為）未定案，TS-F017-017 暫不預設方向。

- **OQ-F017-04（非阻擋，與既有實作共存策略）**：既有 `keyword` 參數（LIKE 模糊比對 documentNumber/documentName，`DocumentListPage.tsx` 前端已有搜尋框並在生產路徑使用中）與本檔新增之「程序書編號」/「程序書書名」精確選取 combobox（prototype 13 之設計）是否**並存**（兩種篩選機制同時保留，各自服務不同使用情境：模糊搜�索 vs 精確定位）、或**其一取代另一**？若並存，兩者同時帶入時之組合語意（AND 交集，或後者覆蓋前者）需定案。本檔 TS-F017-009/010 假設兩者並存且為獨立參數，未設計兩者同時帶入之交互案例，待定案後補充。

- **OQ-F017-05（非阻擋，已知限制，不視為待修 bug）**：當責室長「姓名」顯示不可達——`ICSOP_DOCUMENT.primaryChiefId` 儲存員編字串，全專案無 `PERSON` 資料表可供 join 解析姓名（`icsop-document.entity.ts` 註解已明寫「PERSON 表待建」）。F017 AC 中「當責室長」欄之顯示需求（прototype 顯示為姓名如「陳彥廷（企劃部 車輛行銷室 室長）」）本 wave **無法**達成，只能顯示原始員編。此限制應於 impl log 中明確記載，避免日後被誤判為「顯示錯誤」而非「資料源缺口」。

- **OQ-F017-06（依賴 F015，交叉引用）**：「連結點程序書」篩選（TS-F017-008）之資料查詢介面直接依賴 F015-test.md OQ-F015-01（F015 是否有獨立儲存/端點設計）之定案結果，本檔僅先以抽象服務層參數 `linkTargetId` 表示，非最終介面。
