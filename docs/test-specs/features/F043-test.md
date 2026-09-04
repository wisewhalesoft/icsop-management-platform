# F043 業務/功能類別管理 — 測試設計

> 規格權威：[F043](../../specs/features/F043-business-function-category.md)（52 條主 AC＋命名鎖定表＋推翻總表）
> 跨檔 delta：[F017](../../specs/features/F017-backend-document-list.md#business-category-column-delta) `AC-B1`～`AC-B11`／
> [F019](../../specs/features/F019-public-list-browsing.md#business-category-browse-delta) `AC-B12`～`AC-B27`／
> [F025](../../specs/features/F025-role-function-matrix.md#business-category-function-key-delta) `AC-B28`／`AC-B29`
> architecture 權威：[architecture-spec.md 第 14 章](../../specs/architecture-spec.md#ch14-f043)（決策 E1～E9）
> prototype 權威：`prototypes/26`～`30`（新檔）＋ `03`／`07`／`13`／`18`／`23`（改版）
>
> 🔵 本輪為**簡化版約束環**（僅 backend jest／frontend vitest 單元＋元件測試，無 Playwright／
> Stryker／dependency-cruiser——比照 F040／F041／F042 等既有 delta 之範圍決定）。
> ⚠ 本檔採**團隊模式雙線共筆**：backend／jest 線與 frontend／vitest 線各自建置各自章節，
> 附加時請先 grep 既有「（backend／jest 線）」或「（frontend／vitest 線）」標頭再接續，勿覆寫。

---

## （frontend／vitest 線）

> 本節由 frontend test-generator 建置，2026-09-02。涵蓋 F043 主檔中前端可測之 AC（甲～己）＋
> 三份跨檔 delta（`AC-B1`～`AC-B29`）之前端半。後端服務層／錯誤碼驗證順序／DB 唯一鍵等由
> backend 線另章覆蓋，本節不重複。

### 涵蓋範圍與自動化就緒度

| 約束層 | 狀態 |
|---|---|
| 單元／元件（vitest） | ✅ 已建（下表逐檔列出），交付時預期**整批 RED**（production code 尚未存在） |
| e2e fidelity（Playwright） | ⬜ 本輪不建（簡化版環，同 F040～F042 之既有範圍決定） |
| mutation（Stryker） | ⬜ 同上 |
| metric gate | ⬜ 同上 |

### 檔案清單（frontend）

| 檔案 | 涵蓋 AC | 備註 |
|---|---|---|
| `frontend/src/domain/business-category.test.ts` | `AC-05`／`AC-06` | 新檔；`normalizeSubcategory` 重用之參照相等斷言、`businessCategoryDisplayName` 固定向量 |
| `frontend/src/domain/function-matrix.test.ts` | `AC-43`／`AC-44`／`AC-B28`／`AC-B29` | 既有檔擴充（additive `describe`／`it`，未改動既有斷言之期望值）；含核心不對稱斷言 |
| `frontend/src/domain/menu.test.ts` | `AC-43`／`AC-B28`／`AC-44`／`AC-B29` | 既有檔擴充；MENU 11→12 項、相對位置鎖定、Supervisor 視角之側欄不對稱 |
| `frontend/src/pages/PermissionMatrixPage.test.tsx` | `AC-43`／`AC-44` | 既有檔擴充；`FUNC_DISPLAY` 動態 anti-drift 自動涵蓋新列＋顯式鎖定案例 |
| `frontend/src/pages/BusinessCategoryListPage.test.tsx` | `AC-01`～`AC-03`／`AC-07`～`AC-09`／`AC-12`／`AC-14`／`AC-44`／`AC-46` | 新檔；類別池 CRUD |
| `frontend/src/pages/BusinessCategoryDagCanvasPage.test.tsx` | `AC-19`／`AC-44`～`AC-46` | 新檔；DAG 畫布基本渲染與 RBAC |
| `frontend/src/pages/BusinessCategoryDagCanvasPage.deleteConfirm.test.tsx` | `AC-18` | 新檔；刪除節點二次確認之逐字文案（N＝掛載列數） |
| `frontend/src/pages/BusinessCategoryNodeDrawer.test.tsx` | `AC-20`～`AC-23`／`AC-28`～`AC-30`／`AC-45` | 新檔；🔴 本批最高風險——候選不以循環過濾、無警示無改派 |
| `frontend/src/pages/BusinessCategoryTreePreviewPage.test.tsx` | `AC-32`／`AC-34`～`AC-37`／`AC-53`① | 新檔；後台預覽（`data-mounted-doc-count` 契約、下載/列印代理串流） |
| `frontend/src/pages/BusinessCategoryTreePreviewPage.subtreeDrawer.test.tsx` | `AC-35` | 新檔；子樹抽屜不去重、distinct≠rows 之成對數字 |
| `frontend/src/pages/BusinessCategoryTreePreviewPage.watermark.test.tsx` | `AC-33` | 新檔；疊加層唯一浮水印載體、旋轉正方形幾何（AC-T50 同型） |
| `frontend/src/pages/PublicCategoryTreePage.test.tsx` | `AC-B16`～`AC-B21`／`AC-B25`～`AC-B27`／`AC-53`② | 新檔；`data-visible-doc-count` 契約、deep-link-only 空狀態 |
| `frontend/src/pages/PublicListPage.businessCategory.test.tsx` | `AC-B12`～`AC-B15`／`AC-B19`／`AC-B24` | additive；模式切換器本身（不重複測樹狀圖內部，見該檔頭註） |
| `frontend/src/pages/DocumentListPage.businessCategory.test.tsx` | `AC-B1`～`AC-B4`／`AC-B7`／`AC-B10`／`AC-B11` | additive；🔴 一律以表頭反查欄索引，不硬編 |
| `frontend/src/pages/ChangeHistoryPage.businessCategory.test.tsx` | `AC-39`／`AC-40`／`AC-41`／`AC-42`／`AC-54` | additive；🔴🔴 `AC-54` 容器限定斷言＋`PREVIEW_KIND` 成對分派 |

### AC ↔ 約束對照（僅列前端負責之 AC；backend 專屬 AC 見 backend 線章節）

| AC | 對照測試 |
|---|---|
| `AC-01`／`AC-02` | `BusinessCategoryListPage.test.tsx`：新增類別（子分類留白／`"  消金  "`） |
| `AC-03`／`AC-07`／`AC-08`／`AC-09` | 同上：`BUSINESS_CATEGORY_DUPLICATE`／`SUBCATEGORY_CONFLICT`／`NAME_REQUIRED` 前端顯示 |
| `AC-05`／`AC-06` | `business-category.test.ts` |
| `AC-12` | `BusinessCategoryListPage.test.tsx`：刪除保護文案＋停用不受限 |
| `AC-14` | 同上：搜尋比對 `businessCategoryDisplayName` |
| `AC-18` | `BusinessCategoryDagCanvasPage.deleteConfirm.test.tsx` |
| `AC-19` | `BusinessCategoryDagCanvasPage.test.tsx` |
| `AC-20`～`AC-23` | `BusinessCategoryNodeDrawer.test.tsx` |
| `AC-28`～`AC-30` | 同上 |
| `AC-32`～`AC-37` | `BusinessCategoryTreePreviewPage.test.tsx`／`.watermark.test.tsx`／`.subtreeDrawer.test.tsx` |
| `AC-39`～`AC-42` | `ChangeHistoryPage.businessCategory.test.tsx` |
| `AC-43`／`AC-44` | `function-matrix.test.ts`／`menu.test.ts`／`PermissionMatrixPage.test.tsx` |
| `AC-45`／`AC-46` | 分散於各頁之 RBAC 案例（見各檔） |
| `AC-53`①②| `BusinessCategoryTreePreviewPage.test.tsx`（①）＋`PublicCategoryTreePage.test.tsx`（②）**成對** |
| `AC-54` | `ChangeHistoryPage.businessCategory.test.tsx` |
| `AC-B1`～`AC-B11` | `DocumentListPage.businessCategory.test.tsx` |
| `AC-B12`～`AC-B27` | `PublicListPage.businessCategory.test.tsx`（切換器本身）＋`PublicCategoryTreePage.test.tsx`（樹狀圖內容） |
| `AC-B28`／`AC-B29` | `function-matrix.test.ts`／`menu.test.ts` |

### 前端無法涵蓋、留給 backend 線或不可測之 AC

見 [risks-and-gaps.md §F043（frontend）](../risks-and-gaps.md#f043-frontend)。

---

## §丙 delta（2026-09-03，同日第三個真實需求）：候選之循環別篩選（`userSelectedLifecycleId`）

> 本節由 test-generator 於 2026-09-03 追加，涵蓋 team-lead mailbox 直接裁決之設計（尚無正式
> `AC-##`，見 [risks-and-gaps.md `BC-NOASSERT-4`](../risks-and-gaps.md)）。背景：候選依
> `documentNumber` 排序＝依循環分群，真庫 591 份文件、14 個循環，抽屜無翻頁機制、前端只取第一頁
> ⇒ 第一頁幾乎全部集中在字母序最前之循環。使用者裁決：加「循環別」下拉，讓使用者自選要看哪個
> 循環。🔒 與 `AC-20`（候選不以循環過濾）之明文分界：`AC-20` 禁的是「系統靜默地只依循環過濾」，
> 使用者主動選擇是另一回事，故新引數逐字為 `userSelectedLifecycleId`（非 `lifecycleId`），既有
> 兩條 `@ts-expect-error` 結構性防線原樣保留、逐字未動。

| 檔案 | 涵蓋內容 | 備註 |
|---|---|---|
| `backend/src/business-categories/business-category-docs-candidates.service.spec.ts` | 新增 describe 區塊（8 條）：不傳／`undefined` 之回歸鎖、傳入後 items／total／lifecycleCount 收斂並與 excludeDocumentIds 同時生效、`candidateLifecycles` 鑑別力核心（篩選後仍列出全部循環選項）、`candidateLifecycles` 套用 keyword／exclude、鍵合法性正向測試（與既有負向 `@ts-expect-error` 並存）、服務層透傳接線可驗證、防 N+1 | 既有 15 條全綠；新增 8 條中 3 條紅（items/total/lifecycleCount 尚未套用篩選）、5 條綠（回歸鎖／已可經既有 passthrough 滿足／結構性自檢，非退化） |
| `frontend/src/pages/BusinessCategoryNodeDrawer.test.tsx` | 新增 describe 區塊（4 條）：下拉存在且預設「全部循環」、選項恰 6 個且來自 `candidateLifecycles`（非當前頁 `candidates` 推導，鑑別力核心語料：當前頁僅 1 循環、`candidateLifecycles` 有 5 循環）、選取觸發重新查詢＋帶引數＋說明文字同步更新、選回「全部循環」可還原且呼叫引數恢復兩段路徑參數 | 既有 21 條全綠、新增 4 條全紅（`循環別篩選` 下拉尚未實作，`findByLabelText` timeout） |

逐字文案（本檔作者依既有慣例決定，非既有 AC 明文）：預設選項「全部循環」比照 `ChangeHistoryPage.tsx:906`／`prototypes/23-change-history.html:524`；下拉之可存取標籤「循環別篩選」為本頁首見同型篩選器，逐字由本檔選定，若 impl-fe 自然設計不同屬合法申訴。

---

## §丁 delta（2026-09-04，同日第四個真實需求）：候選之分頁瀏覽（累積式「載入更多」）＋ 伺服器端搜尋（決 A/B/C）

> 起因（使用者實機原話）：「抽屜一次只載入 20 份，如果該循環超過 20 份，需要使用者去背其他的文件名
> 才能搜尋到，不太合理。」查證後發現比使用者說的更嚴重：`frontend/src/api/endpoints.ts` 之
> `getBusinessCategoryNodeDrawer()` 從未送出 `page`／`keyword`，搜尋只掃已載入之當前頁（≤20
> 列）——第 21 筆之後**連搜尋都搜不到**。後端 `keyword`／`page`／`pageSize` 三個參數**早已存在**
> （`business-category-docs.controller.ts:67-87`），缺的是前端的瀏覽手段。
>
> 權威：`docs/ui-ux-design-overview.md` §A.11（prototype 28 之分頁瀏覽設計，`ui-ux-designer`
> 2026-09-04 定案）＋ team-lead mailbox 直接裁決三項（決 A／決 B／決 C，尚無正式 `AC-##`，
> 見 [risks-and-gaps.md `BC-NOASSERT-8`／`BC-NOASSERT-9`](../risks-and-gaps.md)）：
> - **決 A**：`candidateLifecycles` 恆含使用者已選之循環（`count` 可為 0），由**後端資料來源**
>   保證，不採前端補回。
> - **決 B**：唯讀角色（主管／系統管理員）開放搜尋、篩選、載入更多，只是不能掛載／移除。
> - **決 C**：搜尋改為**伺服器端查詢**，本輪一併修（原「請用上方搜尋縮小範圍」是一句假話）。

### 檔案清單與涵蓋內容

| 檔案 | 涵蓋內容 | 備註 |
|---|---|---|
| `frontend/src/pages/BusinessCategoryNodeDrawer.test.tsx` | 就地更新既有 1 條（AC-28 搜尋案例，改為伺服器端查詢之 mock 序列＋呼叫引數斷言，兩條原有斷言逐字未動）＋新增 9 條：三態互斥且窮盡之成對斷言（態①／態③邊界／①→②→③依序走過含累積）、`data-candidate-remaining` 等新 DOM 契約、決 C 伺服器端搜尋（命中項刻意不在已載入頁內之語料鑑別力核心）、page→1 重置語意（含已載入計數重置）、⑦ 逐字說明句、決 B 之控制項不 disabled、決 B 之候選列點擊掛載數不變 | 既有 25 條中 24 條全綠、1 條（AC-28）就地更新後為紅（伺服器端查詢尚未實作）；新增 9 條中 8 條紅、1 條綠（唯讀角色點候選列已由既有 canWrite 守門滿足，回歸鎖）。呼叫簽章 additive 延伸第 4 個選填引數 `{ keyword?, page? }`，既有兩／三引數呼叫斷言零漣漪 |
| `backend/src/business-categories/business-category-docs-candidates.service.spec.ts` | 新增 describe 區塊（4 條）：決 A 同源斷言（`candidateLifecycles` 含已選循環、count 為 0）、決 A 對照組（非恆為 0）、決 A 未選循環回歸鎖、決 C 之 page／keyword 組合回歸鎖 | 既有 23 條全綠；新增 4 條全綠——**誠實揭露非紅燈規避**：FakeStore 已同步擴充實作決 A（鎖住服務層透傳契約），真正之紅燈落在下方 int-test（真實 SQL 尚未實作），詳見 `risks-and-gaps.md BC-NOASSERT-8` |
| `backend/test/int/business-category-candidates.itest.ts` | 新增 describe（1 條）：決 A 之 SQL 層驗證——已選循環 ＋ 全庫皆無命中之 keyword → `candidateLifecycles` 仍含該循環（count 為 0） | 既有 8 條全綠（已對真 SOP DB 實跑複核，無退化）；新增 1 條**已對真庫實跑，確認為紅**（`typeorm-business-category-docs.store.ts` 之 `groups` CTE 尚未補上此保證）——本檔為決 A 唯一之真紅燈載體 |

### 假綠防線（team-lead 明文提醒，逐項已落地為斷言）

- ①③ 必須**成對**斷言：只驗態①（永遠顯示按鈕）或只驗態③（載完後留一顆 `disabled` 按鈕）皆可能恆真；本環兩態各自獨立斷言「另一態之掛鉤計數為 0」。
- 搜尋語料之命中項**刻意不在已載入頁內**：否則客端過濾與伺服器端查詢在該語料下輸出相同，斷言對「有沒有真的送到後端」無鑑別力。
- 剩餘數量（`data-candidate-remaining`）與按鈕存在與否**成對**斷言，不能只驗按鈕在不在。
- 決 B 之兩半（控制項可用／掛載仍被擋）**成對**斷言——「開放搜尋」很容易在實作時悄悄擴大成「可寫」。

### §丁 第二波（2026-09-04，`impl-paging` 交件複驗＋lead 裁定之 2 項 NEW work）

`impl-paging` 交件後全環轉綠（FE 33/33、BE 27/27、`test:int` 24 suites/210 tests，含決 A 之真
SQL 修正）。複驗過程中誠實提報一項潛伏碰撞、一項接縫缺口，lead 裁定後補測試如下：

**一、`已掛載於` 逐字碰撞（AC-21 斷言範圍收斂，非產品缺陷）**：空狀態合法文案「全部 ICSOP
文件皆已掛載於本節點」（prototype 定稿逐字）含子字串「已掛載於」，與 AC-21 原本之**全頁**負向
掃描巧合碰撞（今日未觸發，因語料互斥）。lead 裁定：**收窄斷言範圍，不改產品文案**——

| 檔案 | 涵蓋內容 | 備註 |
|---|---|---|
| `frontend/src/pages/BusinessCategoryNodeDrawer.test.tsx` | 就地改寫 AC-21～AC-23 既有一條：「已掛載於」收窄至候選清單容器（`getByRole('list')`，本抽屜元件內唯一之 `role="list"` 元素）內查詢，先斷言容器存在且至少 1 列（正向半句，防容器不存在時負向恆真）；「改派」維持全頁掃描（無合法用途，不收窄）。新增 2 條：容器唯一性自證（`getAllByRole('list')` 恰 1 個）、空狀態情境下明文允許該合法文案存在（把「碰巧沒被抓到」轉為「明文允許」） | 3 條皆綠（產品程式碼本就正確；本輪純屬測試精度收斂，implementer 未被要求改動任何東西） |

**二、`keyword`／`page` 是否真的組進 URL —— 原無自動化證據（前後端契約接縫）**：既有元件測試
全面 `vi.mock('../api/endpoints')`，驗不到參數是否真的進了送出之 URL（`impl-paging` 誠實提報）。

| 檔案 | 涵蓋內容 | 備註 |
|---|---|---|
| `frontend/src/api/endpoints.businessCategoryDrawerUrl.test.ts` | 新檔（比照既有 `endpoints.documentFilters.test.ts` 之既定手法：不 mock `./endpoints`，直接呼叫真實函式並 stub 全域 `fetch`，讀 `vi.mocked(fetch).mock.calls[0][0]`）。5 條：完整組合（`userSelectedLifecycleId`／`keyword`／`page` 三者皆在 URL、`keyword` 含需 encode 字元且期望值以 `URLSearchParams` 現算而非手打 `%XX`）、未互動恰兩引數→URL 不含任何 query string、選循環恰三引數→URL 只含該鍵、僅帶 keyword→URL 只含該鍵、`page=1` 不送出／`page=2` 才送出 | **5 條全綠**——`endpoints.ts` 之 URL 組裝本就正確（`URLSearchParams` 已正確 encode、既有兩／三引數結構性斷言未鬆動）；本檔之作用是把「本來零自動化證據」的接縫**補上機器閘門**，非揪出新缺陷 |

兩項合計新增 5 條，皆綠——本輪之性質是**收斂測試精度＋補接縫閘門**，不是修產品缺陷。
