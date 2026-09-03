---
type: implementation-log
feature_id: F043
feature_name: 業務/功能類別管理（前端）
status: complete
last_updated: 2026-09-02
---

# F043: 業務/功能類別管理 — 前端實作紀錄

> 範圍＝**僅前端**（`frontend/`）。後端（`backend/`）由另一位實作者負責，本紀錄不涵蓋。
> 約束環由 test-generator（`ring-fe`）撰寫，**本棒次未新增、未修改、未刪除任何測試檔**。

## 實跑證據（2026-09-02）

```
cd frontend && npx tsc --noEmit      → 0 error
cd frontend && npx vitest run        → Test Files 131 passed (131)
                                        Tests     2035 passed (2035)
```

12 個新環檔（`domain/business-category.test.ts`、`BusinessCategoryListPage`／
`BusinessCategoryDagCanvasPage`（×2）／`BusinessCategoryNodeDrawer`／
`BusinessCategoryTreePreviewPage`（×3）／`PublicCategoryTreePage`／
`PublicListPage.businessCategory`／`DocumentListPage.businessCategory`／
`ChangeHistoryPage.businessCategory`）全綠；既有測試檔**零紅**。

## 2026-09-03 第二輪修正（使用者實機揪出之真缺陷）

**現象**：節點抽屜顯示「目前掛載文件 **4 份**」、同樣兩份文件各出現兩次，而畫布徽章寫「掛載 2 份文件」（正確）；
DB 恰 4 列（2 節點 × 2 文件）無重複列 ⇒ 純顯示層缺陷。連帶症狀：載入後未做任何互動即顯示
「待送出：新增掛載 2 筆」；React 另噴 `Encountered two children with the same key`。

**根因**：`BusinessCategoryNodeDrawer` 沿用了 F009（單一歸屬模型）之前提「候選必不含已掛載於本節點者」。
該前提在 M:N 下**不成立**——後端候選依 `AC-20` 為**全部 ICSOP 文件**、不排除本節點已掛載者，
故 `[...mounted, ...candidates]` 會讓同一份文件出現兩筆同 `id` 之列。

**修正（產品程式碼，未動任何測試）**：
1. 新增具名純函式 `mergeDrawerDocs(mounted, candidates)`——以 `id` 為鍵合併，候選同 id 者**只補**其純資訊
   欄位（循環別／另掛於），**不新增第二筆**；⇒ 掛載區與候選區對同一份文件恆只呈現一次，React key 亦唯一。
2. 新增顯式 `baseline: Set<string>`（＝載入當下後端回傳之 `mounted` id 集合），`pending` 與送出之 diff
   **一律以它為基準**，不再寄生於合併後清單上的 `wasMounted` 旗標。⇒ 無互動時 `added = 0`。
3. 掛載區容器新增環要求之 DOM 契約 `data-mounted-list` ＋ `data-mounted-count`
   （與可見之「{N} 份」同取 `mountedDocs.length`，不各算一次）。
4. **不誤殺**：掛載於其他節點／其他類別之文件仍留在候選區並保留「此文件另掛於：{類別}／{節點}」。

**實跑**：`BusinessCategoryNodeDrawer.test.tsx` 17/17 綠（含環新增之 5 條）；全套
**131 檔／2040 測試全綠**；`tsc --noEmit` 0 error；輸出全文掃描 `same key` **0 次**。
⚠ 後端側之對稱修正（候選排除本節點已掛載者）由 impl-be 進行；本前端去重為**第二道防線**，兩者正交。

## 2026-09-03 第三輪修正（實機複驗揪出：候選統計取自當前頁）

**現象**：抽屜候選區逐字顯示「候選＝**全部 ICSOP 文件**（共 **22** 份，分屬 **1** 個相異循環）」，
而 dev 真庫 `SELECT COUNT(*) FROM ICSOP_DOCUMENT` ＝ **591**。

**根因**：候選查詢在 store 層是**分頁**的（`.take(pageSize)`），而前端那句話的兩個數字由**當前頁**推導
（`docs.length` 與 `new Set(docs.map(d => d.lifecycleName)).size`）。後端 controller **早就**回了
`candidateTotal`，但前端從未接（`grep candidateTotal` 於 `endpoints.ts`／`types.ts`／抽屜元件全部落空）。

🔴 **嚴重性不只是數字錯**：那句文案的用途是**證明候選不以循環過濾**（`AC-20`）；由當前頁推導只會看到
**1 個循環**，於是一句用來**反證**的文案變成了**正證**——看起來正好像候選被循環過濾了。

**修正（產品程式碼，未動任何測試）**：
1. `api/types.ts`：`BusinessCategoryNodeDrawerData` 接上後端之 `candidateTotal`／`candidateLifecycleCount`
   兩個**全量**統計欄位（已套排除與關鍵字、未分頁），並就地寫明「明文禁止由 `candidates.length` 或
   `new Set(...)` 推導」及其後果。
2. 抽屜元件：兩個數字**一律取自後端欄位**；移除由當前頁推導之 `candidateCycleCount`。
3. **誠實揭露分頁**：新增第三個數字「目前已載入 {N} 份」（載入當下之 `candidates.length`，掛鉤
   `data-candidate-loaded`），文案改為
   「候選＝**全部 ICSOP 文件**（共 {總數} 份，分屬 {循環數} 個相異循環）。**不以循環過濾**，…。
   本清單**分頁載入**：目前已載入 {N} 份，請用上方搜尋縮小範圍。」
   ⚠ 舊文案只寫「共 N 份」而 N 取自當前頁，在真庫上是一句**假話**。

**實跑**：`BusinessCategoryNodeDrawer.test.tsx` **21/21 綠**（含環新增之 3 條＋1 條自證）；全套
**131 檔／2044 測試全綠**；`tsc --noEmit` 0 error；輸出全文掃描 `same key` 0 次。

## Test Results Summary（環之逐檔對應）

| 環檔 | 主要 AC | 狀態 |
|---|---|---|
| `domain/business-category.test.ts` | `AC-05`／`AC-06` | PASS |
| `pages/BusinessCategoryListPage.test.tsx` | `AC-01`～`AC-14`／`AC-44`／`AC-46` | PASS |
| `pages/BusinessCategoryDagCanvasPage.test.tsx` | `AC-15`／`AC-19`／`AC-44`～`AC-46` | PASS |
| `pages/BusinessCategoryDagCanvasPage.deleteConfirm.test.tsx` | `AC-18` | PASS |
| `pages/BusinessCategoryNodeDrawer.test.tsx` | `AC-20`～`AC-30`／`AC-45` | PASS |
| `pages/BusinessCategoryTreePreviewPage.test.tsx` | `AC-32`／`AC-34`～`AC-37`／`AC-53`① | PASS |
| `pages/BusinessCategoryTreePreviewPage.watermark.test.tsx` | `AC-33` | PASS |
| `pages/BusinessCategoryTreePreviewPage.subtreeDrawer.test.tsx` | `AC-35` | PASS |
| `pages/PublicCategoryTreePage.test.tsx` | `AC-B16`～`AC-B27`／`AC-53`② | PASS |
| `pages/PublicListPage.businessCategory.test.tsx` | `AC-B12`～`AC-B15`／`AC-B19`／`AC-B24` | PASS |
| `pages/DocumentListPage.businessCategory.test.tsx` | `AC-B1`～`AC-B11` | PASS |
| `pages/ChangeHistoryPage.businessCategory.test.tsx` | `AC-39`～`AC-42`／`AC-54`／§A.10.3 | PASS |
| `domain/function-matrix.test.ts`（additive） | `AC-43`／`AC-44`／`AC-B28`／`AC-B29` | PASS |
| `domain/menu.test.ts`（additive） | `AC-43`／`AC-B28`／`AC-B29` | PASS |
| `pages/PermissionMatrixPage.test.tsx`（additive） | `AC-43`／`AC-44` | PASS |

## Files Changed

| 檔案（`frontend/src/`） | 類型 | 說明 |
|---|---|---|
| `domain/business-category.ts` | new | 決策 E6：**別名重新匯出** `normalizeSubcategory`／`lifecycleDisplayName as businessCategoryDisplayName`（`AC-05` 明文禁止複製第二份） |
| `domain/function-matrix.ts` | modified | 新增 `FunctionKey.BUSINESS_CATEGORY_MANAGEMENT` 與最末列 `row('READ','CRUD','READ','NONE','NONE')` |
| `domain/menu.ts` | modified | 新增側選單項 `businesscategory`（icon `shapes`），**緊接 `lifecycle` 之後**（`AC-43` 明文鎖定位置） |
| `components/Icon.tsx` | modified | 註冊 lucide `shapes`（守門測試會掃 `icon: 'shapes'`，漏註冊會靜默渲染為 null） |
| `api/types.ts` | modified | 新增 F043 全套型別；`DocumentListItem` **additive** 新增選填 `businessCategories?: BusinessCategoryRef[]`（決策 E5） |
| `api/endpoints.ts` | modified | 新增 24 支端點函式（後台 CRUD／DAG／抽屜／預覽／子樹／前台三支／變更歷程五支） |
| `pages/BusinessCategoryListPage.tsx` | new | §甲 類別池（7 欄、建立/編輯 modal、刪除保護與停用之不對稱） |
| `pages/BusinessCategoryDagCanvasPage.tsx` | new | §乙 DAG 畫布（標題＝顯示名＋` · DAG 畫布`、刪除節點二次確認） |
| `pages/business-category-dag-flow.ts` | new | 專屬錯誤訊息表 ＋ `AC-18` 確認文案唯一組字點 |
| `pages/BusinessCategoryNodeDrawer.tsx` | new | §丙 掛載抽屜（**無警示／無二次確認／無改派**；候選不以循環過濾） |
| `pages/BusinessCategoryTreePreviewPage.tsx` | new | §丁 後台樹狀圖預覽（浮水印疊加、下載／列印、子樹唯讀抽屜） |
| `pages/PublicCategoryTreePage.tsx` | new | §己 前台樹狀圖模式（**無下載／列印**、四欄唯讀抽屜、三句空狀態） |
| `pages/PublicListPage.tsx` | modified | additive：`resolveBrowseMode()` ＋ 模式切換器 ＋ 依 `mode` 渲染樹狀圖或既有清單 |
| `pages/DocumentListPage.tsx` | modified | additive：第 16 欄（pill＋`+N`）、第 14 項篩選、`orderedBusinessCategories()` 純函式 |
| `pages/ChangeHistoryPage.tsx` | modified | additive：第三個 tab、`BC_CHANGE_TYPES`（7 鍵）、`downloadFromModal()` 分派點 |
| `pages/PermissionMatrixPage.tsx` | modified | `FUNC_DISPLAY` 新增第 15 列（逐列對齊 `FUNCTION_MATRIX`） |
| `pages/lifecycle-tree-layout.ts` | modified | **純型別放寬**：`buildTreeLayout` 參數由 `DagNode[]` → `TreeLayoutInputNode[]`（行為零變更） |
| `pages/dag-flow.ts` | modified | **純型別放寬**：`graphToFlow` 參數由 `DagGraph` → `FlowGraphInput`（行為零變更） |
| `App.tsx` | modified | 三條路由：`/admin/business-categories`、`.../:businessCategoryId/canvas`、`/business-categories/:id/tree` |

## Architectural Decisions（實作期就地裁量，皆在 spec 邊界內）

1. **共用渲染演算法之型別放寬（決策 E2／E7 之落地）**：架構要求「共用的是渲染演算法、不是頁面元件」，
   但既有 `DagNode` 帶**必填** `lifecycleId`，業務類別節點帶的是 `businessCategoryId`。
   處置＝把 `buildTreeLayout`／`graphToFlow`／`miniLayout`／`DiffBoard` 之參數型別放寬為**結構最小集**
   （三者實際只讀 `id`／`name`／`docCount`）。🔒 **不動 `DagNode` 本身**（`AC-49` 零漣漪），
   也**不**要求呼叫端塞一個假的 `lifecycleId: ''`（那會讓類別節點在型別上宣稱自己屬於某個循環）。
2. **§A.10.3 `PREVIEW_KIND` 之 React 落地**：`downloadFromModal(kind, ownerId, changeLogId)` 為**唯一消費點**，
   `PREVIEW_KIND_LIFECYCLE`／`PREVIEW_KIND_BUSINESS` 為兩個 tab 各自持有之具名旗標；Tab 2 之清單列下載
   與 modal 下載**皆**經此分派，全檔無第二處判斷。
3. **共用 modal 之兩個文案參數化**：`TreeDiffModal`／`DiffBoard` 新增 `ownerNoun`（空 DAG 說明句之名詞）與
   `auditFamily`（稽核家族徽章），**兩者預設值＝循環側之既有逐字** ⇒ 循環側輸出一字不變。
4. **第 14 項篩選之選項來源**：`AC-B7` ③ 要求「僅 active」，而決策 E5 之 additive 欄位只帶 `{id, displayName}`
   （不帶 status）⇒ 選項主來源為**類別池端點**（`getBusinessCategories`，過濾 `active`）；池取用失敗／為空時
   **降級**為自當前工作集之掛載值衍生（比照既有 `loadPool` 之降級紀律）。⚠ 降級路徑無法施加 ③ 之 active 過濾。
5. **`清除篩選` 保留 `mode`**（`PublicListPage`）：原實作為 `setSearchParams(new URLSearchParams())`（整組清空），
   其前提「本頁之網址參數全部都是查詢狀態」自本 delta 起**不再成立**——整組清空會把正在看文件清單的
   使用者當場踢回樹狀圖模式。改為清空查詢參數但保留 `mode`（`AC-B24`：清單模式行為逐字不變）。
6. **`AC-53` ② 之落實方式**＝前台工具列**不存在**下載／列印節點（非 `disabled`、非 CSS 隱藏）。
7. **`AC-21` 之可測形狀所需**：§丙 抽屜之 `<aside>` **刻意不掛 `role="dialog"`**——否則
   「選取候選後不彈出任何確認對話框」這條斷言永遠測不到真正的東西。

## 與 prototype 之已知落差（逐項列明，非疏漏）

| # | 項目 | 處置與理由 |
|---|---|---|
| 1 | `26` 之刪除流程含「示範：解除全部掛載」按鈕與其專屬確認標題 | **未移植**。那是 prototype 端的示範捷徑；真實流程為「確認刪除 → 呼叫端點 → 後端回 409 `BUSINESS_CATEGORY_HAS_DOCUMENTS` → 顯示需先解除全部掛載」。已保留確認對話框與逐字訊息。 |
| 2 | `28` 之 `data-prototype-demo="true"` 示範鈕（`BUSINESS_CATEGORY_DOC_ALREADY_MOUNTED`） | **未移植**（prototype 自身明文「實作時不得移植」）。該錯誤碼於正常 UI 路徑不可達（`AC-24`）。 |
| 3 | `28` 之「移除掛載」按鈕 `aria-label` | prototype 為 `移除掛載：{書名}`；實作改為 `aria-label="移除掛載"` ＋ `title="移除掛載：{書名}"`（環以精確名稱定位；`aria-label` 非可見文案，prototype 未以 AC 鎖定，滑鼠提示仍帶書名）。 |
| 4 | `26` 之搜尋框無障礙名稱 | prototype 無 `aria-label`；實作採 `搜尋業務/功能類別名稱`（比照姊妹頁 `LifecycleListPage` 之既有樣式）。 |
| 5 | 各頁之後台外框 | 一律採 React 既有 `AppShell`／`PageHeader`（與全站其餘後台頁一致），非逐頁複製 prototype 之 topbar/sidebar 標記。 |
| 6 | `29` 之類別切換 `<select>` 無障礙名稱 | prototype 為 `aria-label="業務/功能類別"`（與可見 label 同字）；實作採 `aria-label="切換類別"`（比照姊妹頁 `LifecycleTreePreviewPage` 之 `切換循環`），**可見 label 文字仍為 `業務/功能類別`**。 |
| 7 | `30` 之前台控制列 | 模式切換器由 `PublicListPage` 持有（架構 §14.8），以 `modeSwitch` 節點傳入樹狀圖元件之控制列 ⇒ 樹狀圖模式下與類別下拉、縮放**同一列**（同 `30`）；清單模式下為獨立一列（同 `03`）。**同一份節點**供兩種模式使用，不寫兩份。 |
| 8 | `30` 之 `data-prototype-demo`「示範視角」切換器 | **未移植**（prototype 自身明文「實作時不得移植」）。 |

## 環之申訴與結果（2026-09-02）

向 `ring-fe` 提出兩類共 12 處，**全數獲採納並由 `ring-fe` 自行修正測試**（本棒次未動任何測試檔）：

1. **三處與 prototype 26 逐字互斥之查詢字串**：`/新增類別/`→`/新增業務\/功能類別/`（按鈕與 modal 標題）、
   `/刪除類別/`→`/刪除業務\/功能類別/`、`/搜尋類別/`→`/搜尋業務\/功能類別/`。
2. **本 delta 未傳播到 9 個既有測試檔**（其中 `PermissionMatrixPage.test.tsx` 同檔即自相矛盾：
   `toHaveLength(14)` 與 `toHaveLength(15)` 並存）：`PermissionMatrixPage`／`menu.home`／
   `DocumentListPage.{test,export,filterDelta}`／`PublicListPage.{test,subcategory,filterDelta,userSubtype,uxAudit}`。

## 未兌現／交棒事項（誠實列出）

1. 🔴 **端點契約仰賴後端同步**：本前端依 `architecture-spec` §14.5 之路徑表實作。其中兩處**需與後端對帳**——
   ① ✅ **已兌現（限定：2026-09-03 修正前之建置）**——抽屜載荷走
   `GET .../nodes/:nodeId/candidates`（後端 `BusinessCategoryDocsService.getDrawer()` 之回應形狀，
   前端函式名為 `getBusinessCategoryNodeDrawer`，**函式名與 URL 段刻意不同名**）。
   使用者於**真實瀏覽器**開啟節點抽屜並渲染出真實之已掛載與候選文件，證明 URL／回應形狀／前端
   消費面端到端走通——那正是單元測試永遠測不到的一層（重複列缺陷即於該畫面顯現）。
   ⚠ **本次候選排除修正變更了 `listCandidates` 簽章與 controller 呼叫點**
   （`business-category-docs.service.ts:137` 新增 `excludeDocumentIds`、
   `business-category-docs.controller.ts:75` 之呼叫點同步改動；前端側亦改了合併邏輯
   `mergeDrawerDocs`），**修正後之建置尚未於瀏覽器複驗**；待 lead 完成實機複驗後方可移除此限定語。
   🔴 立此限定語之理由：本 repo 反覆吃虧的形狀，正是「曾經驗過」被寫成「已驗過」，而中間有人
   改了那條路徑——寫明範圍，日後讀者才知道那份證據對應的是哪一版程式碼。
   ② 後台樹狀圖預覽資料走 `GET /admin/business-categories/:id/tree`（§14.5 只列了 `/tree/download`／`/print`，
   預覽本體之路徑由本棒次依 `BusinessCategoryPreviewController.preview` 推定為同一 controller 之根路徑）。
   ③ 狀態切換走 `PATCH /admin/business-categories/:id`（body `{status}`）——§14.5 無獨立 `/status` 子路由。
   **這三項單元測試永遠測不到**（端點被 mock），須以瀏覽器煙霧測試或整合層驗證
   ——① 已有上述**限定範圍**之實機證據，②③ 仍完全待驗。
2. 🔴 **前端側未做瀏覽器實機驗證**：本棒次僅單元／元件測試與 `tsc`。本 repo 已多次記錄「兩端單元測試
   全綠但真瀏覽器壞掉」之形狀（`Accept: text/html` 撞 SPA fallback、代理白名單漏列）。⚠ 仍待實機確認：
   前台樹狀圖之可見性過濾、下載／列印之代理串流、`/business-categories/:id/tree` 之 SPA fallback。
   ✅ **代理白名單已有結構性保證，非「未查證」**：`frontend/src/api/proxy-coverage.test.ts` 掃描後端全部
   `@Controller` 之路由、取**第一段路徑**（`split('/')[0]`）並斷言 vite proxy 與 `nginx.conf` 各有對應設定；
   `public/business-categories` 之第一段為 `public`、`admin/business-categories` 為 `admin`，兩者皆為既有鍵
   ⇒ 自動涵蓋且該測試綠。**仍待實機確認的是渲染結果，不是白名單。**
3. ✅ **已兌現（2026-09-03 由 team-lead 執行並附 `SELECT` 覆核）——migration 已跑、後端已上線**。
   📝 原措辭逐字保留供追溯：`OLD>` 「🔴 **migration 未跑、後端未上線** ⇒ 本前端目前無真實資料可打
   （F043 檔頭之三項驗收條件尚未滿足）。」證據摘要：
   - 三支 migration 已對 **dev 真庫**實跑並 COMMIT（跑前 `migration:show` 顯示既有 46 支全已套用、待跑者恰為這 3 支）；
   - 六張表全部存在；`UQ_BUSINESS_CATEGORY_name_subcategory (name, subcategory)`、
     `UQ_BUSINESS_CATEGORY_DOC_node_document (nodeId, documentId)` 存在，且**不存在**
     `(businessCategoryId, documentId)` 或單獨 `(documentId)` 之唯一鍵（INV-B6 之反面亦成立）；
   - `FK_BUSINESS_CATEGORY_DOC_document` → `ON DELETE CASCADE`；`AUDIT_LOG` 之
     `businessCategoryId`／`nodeId` 兩欄存在；
   - 後端整合測試 **24 suites / 204 tests** 對真 SOP DB 全綠；
   - 容器已 `--force-recreate` 重建、三個容器 healthy，啟動日誌顯示
     `BusinessCategoryPreviewController`／`BusinessCategoryChangeDiffController`／
     `PublicBusinessCategoryController` 三個新 controller 之路由全部掛上；
   - 使用者已在**真實瀏覽器**建立類別「投資」與 11 個節點，並把同樣兩份文件掛到兩個不同節點
     ——即上節「2026-09-03 第二輪修正」之缺陷來源（資料為真）。
   ⇒ F043 檔頭三項驗收條件之 ①②③ 已滿足；本前端已有真實資料可打。
4. `AC-B7` ③ 之 active 過濾在「類別池端點取用失敗」之降級路徑下不成立（見架構決策 4）。
5. `AC-B9`（CSV 第 15 欄之位元組規則）為**後端**職責，前端僅維持 `AC-B10` 之「匯出呼叫恰兩引數」不變。
