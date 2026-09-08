---
type: implementation-log
feature_id: F019, F017, F043
feature_name: 2026-09-08 五項使用者裁決（前台瀏覽子樹／預設模式／類別導向鈕／循環別可見性）
status: complete
last_updated: 2026-09-08
---

# 2026-09-08 五項使用者裁決 — 實作紀錄

> **使用者原文（逐字）**
> 1. 前台-ICSOP 文件瀏覽：雙擊樹狀圖的節點時，應如同後台-循環樹狀圖預覽，列出包含該節點擊子節點的所有文件
> 2. 前台-ICSOP 文件瀏覽：landing 頁籤預設改為「文件清單」（目前是預設樹狀圖）
> 3. 後台-業務/功能類別樹狀圖預覽：雙擊某個節點出現文件清單抽屜後，缺少如循環樹狀圖預覽的「在文件管理中檢視這 N 份程序書」的按鈕
> 4. 後台-ICSOP 文件管理：角色「主管」及「部門窗口」，隱藏「循環別」清單欄位與篩選欄位
> 5. 前台-ICSOP 文件瀏覽：文件清單不分角色隱藏「循環別」在清單的篩選欄位與文件詳情內的欄位顯示

## AC 落點

| 項 | AC | 檔案 |
|---|---|---|
| ① | [F019](../features/F019-public-list-browsing.md) `AC-B20`／`AC-B27②` | 前台樹狀圖抽屜擴為子樹 |
| ② | [F019](../features/F019-public-list-browsing.md) `AC-B13`／`AC-B14`／`AC-B15`／`AC-B19` | 預設瀏覽模式 tree → list |
| ③ | [F043](../features/F043-business-function-category.md) `AC-56`（新增） | `29` 導向鈕 ＋ `13` 類別子樹 deep link |
| ④ | [F017](../features/F017-backend-document-list.md) `AC-D17`（新增） | 後台「循環別」欄與篩選之角色可見性 |
| ⑤ | [F019](../features/F019-public-list-browsing.md) `AC-D16`（新增） | 前台「循環別」篩選與詳情欄位移除（不分角色） |

## 實跑證據（2026-09-08）

```
cd backend  && npx tsc --noEmit   → 0 error
cd backend  && npx jest           → Test Suites 220 passed / Tests 3467 passed
cd frontend && npx tsc --noEmit   → 1 error（DocumentEditPage.test.tsx:922 'p.name' possibly null，**先前即存在**，非本輪引入）
cd frontend && npx vitest run     → Test Files 133 passed (133) / Tests 2100 passed (2100)
node <scratch>/checkjs.js prototypes/{03,04,13,29,30}-*.html → 全部 inline script 語法通過
```

## ① 前台樹狀圖抽屜 → 子樹（後端＋前端）

- **新檔** `backend/src/business-categories/business-category-subtree-order.ts`：把原本住在
  `business-category-docs.service.ts` 的 `orderSubtreeNodes()`／`compareSubtreeNodes()` **原地搬出**，
  三層 tie-break 一字未動。🔴 **後台與前台共用同一份排序**——同一棵樹在兩個頁面不得長出兩種順序。
- `PublicBusinessCategoryService.listNodeDocuments()` → **`listSubtreeDocuments()`**（分組回應，含
  `nodeName`／`totalCount`／`groupedCount`）；路由 `.../nodes/:nodeId/documents` →
  **`.../nodes/:nodeId/subtree-documents`**（與後台同名端點逐字對齊）。舊路由與舊方法**已無呼叫端，一併移除**。
- 可見性：**擴大的是節點集合，不是可見範圍**——仍是本服務唯一那一支 `isMountVisible()`；
  對不可見之 `documentId` 連 `getMountedDoc()` 都不呼叫（spec 以 `store.fetchedDocIds` 序列直接斷言）。
- 前端 `PublicCategoryTreePage`：抽屜改為分組渲染，副標題共用後台之 `formatSubtreeCount()`
  （`子樹共 N 份程序書`），空狀態文案改為 `此節點與其下游節點皆沒有您可檢視的程序書`。

### 語料鑑別力（本輪刻意布置）

`PublicCategoryTreePage.test.tsx` 之 `SUBTREE_DOCS` 把 `對保作業` **只掛在下游節點 p4**——
若實作退回「只列本節點」，該份文件不會出現、斷言立刻翻紅。若兩份文件都放在 p1 組，
「只列本節點」與「列整個子樹」輸出完全相同（本 repo 之「語料無鑑別力」形狀）。

## ② 預設瀏覽模式 tree → list

`resolveBrowseMode()` 之 fallback 改為 `'list'`（**單一具名述詞，全檔唯一**）。
🔒 「不可辨識值靜默回退為預設」與「模式不跨 session 記憶」兩條規則**一字未動**，改的只有「預設是誰」。
測試除了 `aria-pressed` 成對斷言外，另鎖 **`getPublicBusinessCategoryGraph` 未被呼叫**——
只看 `aria-pressed` 時，「畫面停在清單、卻仍白跑一趟樹狀圖查詢」之半套實作會假綠。

## ③ `29` 導向鈕 ＋ `13` 類別子樹 deep link

- 後端 `listSubtreeDocuments()` 回應 additive 兩欄 `nodeName`／`businessCategoryDisplayName`
  （後者需 `BUSINESS_CATEGORY_STORE`，以 `@Optional()` 注入 ⇒ 既有純 store 單測降級為 `null`、零漣漪）。
  🔴 `nodeName` **不得**由 `groups` 反推：根節點掛 0 份時不產生分組，而導向鈕正是在「本節點空、下游有」
  這個情境下仍要出現的。
- `formatSubtreeJumpLabel()` 自 `LifecycleTreePreviewPage` **export 供兩頁共用**——
  🔒 這**不是**架構 §14.8 所指的「碰巧撞字」，兩處講的是同一件事。
- **鈕上的 N ＝相異份數（`totalCount`），不是畫面列數**。本頁是全站唯一「兩數必然可以不同」之處
  （§A.8.5 ⑧）；測試語料刻意讓列數 3、相異 2。
- `13` 之落地形狀＝**一次後端查詢取得相異 id 集合、再與工作集交集**（沿用同頁 `linkTargetId`／
  `appendixId`／`formId` 之既有樣板）。🔒 這不是「前端自行走訪子樹」（`AC-T43` 禁止之事）：
  子樹展開／排序／分組全部由後端完成。
  ⚠ **與循環側刻意不同構**：循環是 `ICSOP_DOCUMENT.nodeId` 單一欄位（後端一條 `IN` 下推、回頂層
  `subtreeFilter` 描述子）；類別是 M:N，文件列上**沒有節點維度可比對**。
- 參數名 `businessCategoryId`／`bcNodeSubtreeId`（🔴 **不得**沿用循環側鍵名——兩種 deep link 在 `13` 上並存）。
- 端點失敗（403／404／網路）→ **靜默 no-op**：不篩選、不顯示 chip、**不跳 toast**（使用者沒做錯任何事）。

## ④⑤ 「循環別」之兩種隱藏，**刻意不同構**

| | 前台（`AC-D16`） | 後台（`AC-D17`） |
|---|---|---|
| 條件 | **不分角色**無條件移除 | 依 `循環管理 read`（＝主管／部門窗口隱藏） |
| 範圍 | 清單篩選 ＋ 詳情欄位 | 清單欄位 ＋ 清單篩選（**CSV 匯出一字未動**） |
| 網址參數 | `cycle` 一律忽略（**不讀、不送**） | 不涉及 |

🔴 **明文禁止把兩者「整理」成同一個判定。**

- 後台之述詞由 `canSeeTree` 更名為 **`canSeeLifecycleDimension`**，樹狀圖欄／循環別欄／循環別篩選
  **三個載體共用同一個**——各寫一份判定時，日後漏改的那一處會讓被隱藏的角色從另一個入口看見同一份資訊。
- 篩選以**過濾整個 `FILTERS` 定義陣列**達成（而非在 `filterControls()` 內就地跳過）：`FILTERS` 是桌機與
  行動 sheet 之同一份順序權威，收斂一次即兩處同時生效；就地跳過只會修好其中一處。測試對**兩處各驗一次**。
- 前台之 `cycle` 參數**刻意不保留「讀了但不顯示」**：那會讓已分享出去的網址在**沒有任何畫面解釋**的
  情況下靜默縮小結果集。回歸鎖＝入口網址仍帶 `cycle=lc1`、對送出之查詢參數物件**精確比對**。

## 被移除／降級之測試（逐項交代，⚠ 不得默默消失）

| 原案 | 處置 | 其規則是否仍有載體 |
|---|---|---|
| `PublicListPage.subcategory` 之 `AC-S1 循環別下拉逐字呈現` | 改為 `AC-D16` 之負向半句 | 🔒 後台半句仍在 `DocumentListPage.subcategory.test.tsx` |
| `PublicDocumentDetailPage.subcategory` 四案（子分類顯示規則） | 改為一條負向半句 | 🔒 後台半句仍在 `DocumentReadonlyPage`／`DocumentListPage` |
| `PublicListPage.filterDelta` 之 `TS-F040-D-001`～`-004`、`TS-F019-D2-004b`／`-006` | 刪除（前台已無載體） | 🔒 F040 規則於**後台**仍受完整拘束 |

負向半句一律以 `queryByLabelText`／`queryByText` 斷言（**自 DOM 移除**，非 CSS 隱藏），
且每條負向斷言之前都先有一句正向半句（頁面確實渲染出來），否則整頁 403 時恆真。

## Prototype 傳播

見 [ui-ux-design-overview.md §A.10](../../ui-ux-design-overview.md)：`03`／`04`／`13`／`29`／`30` 五支。

## 本輪明確**不做**（範圍紀律）

- ❌ **CSV 匯出不依角色改變欄數**（`AC-D17` ⚠）：裁決逐字為「清單欄位與篩選欄位」，匯出不在其列；
  順手改會使「匯出恆等於畫面所見」與「匯出欄位固定」兩條既有鎖定同時失效。
- ❌ **前台詳情之「所屬節點」欄未動**：裁決只點名「循環別」。
- ❌ **後端 `GET /public/documents/filter-options` 仍回 `lifecycles`**、前台詳情 DTO 仍回 `lifecycleName`：
  本輪約束的是**呈現**、不是資料的存在。正因後端仍回得出來，反向斷言才有鑑別力。
- ❌ **前台抽屜不加導向鈕**（`AC-56` ⑦ 之負向半句）：前台清單沒有節點子樹維度，也無後台文件管理可導向。

## ⬜ 尚未進行

- **瀏覽器實機驗證**（本 repo 已多次記錄：機器閘門全綠仍會漏掉只有真瀏覽器才踩得到的缺陷）。
- **測試站／正式站部署**。🔒 本輪**未新增任何 migration**（無資料表變更）。
