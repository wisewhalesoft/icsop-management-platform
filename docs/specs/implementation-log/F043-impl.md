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
   ① 抽屜載荷走 `GET .../nodes/:nodeId/candidates`（後端 `BusinessCategoryDocsService.getDrawer()` 之回應形狀，
   前端函式名為 `getBusinessCategoryNodeDrawer`，**函式名與 URL 段刻意不同名**）；
   ② 後台樹狀圖預覽資料走 `GET /admin/business-categories/:id/tree`（§14.5 只列了 `/tree/download`／`/print`，
   預覽本體之路徑由本棒次依 `BusinessCategoryPreviewController.preview` 推定為同一 controller 之根路徑）。
   ③ 狀態切換走 `PATCH /admin/business-categories/:id`（body `{status}`）——§14.5 無獨立 `/status` 子路由。
   **這三項單元測試永遠測不到**（端點被 mock），須以瀏覽器煙霧測試或整合層驗證。
2. 🔴 **未做瀏覽器實機驗證**：本輪僅單元／元件測試與 `tsc`。本 repo 已多次記錄「兩端單元測試全綠但真瀏覽器壞掉」
   之形狀（代理白名單、`Accept: text/html` 撞 SPA fallback、migration 未跑）。⚠ 特別是：
   前台樹狀圖之可見性過濾、下載／列印之代理串流、`/business-categories/:id/tree` 之 SPA fallback。
3. 🔴 **migration 未跑、後端未上線** ⇒ 本前端目前無真實資料可打（F043 檔頭之三項驗收條件尚未滿足）。
4. `AC-B7` ③ 之 active 過濾在「類別池端點取用失敗」之降級路徑下不成立（見架構決策 4）。
5. `AC-B9`（CSV 第 15 欄之位元組規則）為**後端**職責，前端僅維持 `AC-B10` 之「匯出呼叫恰兩引數」不變。
