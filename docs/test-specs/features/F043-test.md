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
