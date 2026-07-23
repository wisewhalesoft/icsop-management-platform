---
type: implementation-log
feature_id: F036
feature_name: 循環樹狀圖預覽（唯讀＋浮水印）
status: partial
last_updated: 2026-07-23
---

# F036: 循環樹狀圖預覽（唯讀＋浮水印） — Implementation Log

## 範圍與定案採用
- worktree：`lifecycle-e03`。**僅 [unit]**（int 測試載具已寫、未執行）。
- 唯讀複用 F008 圖資（`DagStore.listNodes/listEdges`）＋ F007 循環名稱（`LifecycleStore.findById`）；**不新增任何 DAG 寫入路徑**。
- 浮水印**逐字重用 F020 `WatermarkService`**（伺服器端唯一來源：身分快照＋org 查找＋公司全稱＋UTC+8 時間；NFR-007 格式權威）；PublicModule 新增 `exports:[WatermarkService]`，LifecycleModule 匯入之並以結構相容 seam `LifecycleWatermarkBuilder`（`useExisting: WatermarkService`）注入。
- 下載/列印：伺服器端 `PdfLibTreeRenderer` 產生「僅樹狀圖」基底 PDF → 既有 `PdfLibBurner` 將浮水印燒錄進內容層（比照 F020/US-054）。
- 稽核經 `AuditWriter.recordAccess`（targetType=`LIFECYCLE`）記 `LIFECYCLE_VIEW`／`LIFECYCLE_DOWNLOAD`／`LIFECYCLE_PRINT`；**非阻斷**（寫入失敗不阻擋檢視/取檔）。
- RBAC：沿用 F025「循環管理」**唯讀列**（不新增矩陣列）；`@RequirePermission(循環管理,'read')` → SysAdmin/ICSOPAdmin/Supervisor 可，DeptContact/User → 403（含直接呼叫 API、含下載/列印，操作即被拒、不產檔、不記稽核）。
- 路由：後端 `admin/lifecycles/:lifecycleId/tree-preview`（GET／GET download／GET print）；前端 viewer 頁 `/lifecycles/:id/tree`（不套後台側選單）。

## AC 對照
| F036 AC（摘要） | 落地 | 狀態 |
|---|---|---|
| 循環清單點樹狀圖圖示 → 開預覽頁帶入循環 ID | 前端 `LifecycleListPage` 狀態欄圖示 `window.open('/lifecycles/:id/tree')` | PASS |
| 上到下佈局、直角箭頭、名稱＋掛載程序書數、多 parent/child | `buildTreeLayout`（純函式，前後端各一份，演算法一致）＋ SVG elbow path | PASS |
| 點節點醒目標示其所有下游、其餘淡化；再點/空白取消 | `descendants`（純函式 BFS）＋ node `data-highlighted/-selected`、edge hl/dim | PASS |
| 整頁對角平鋪浮水印、機密聲明另起一行、伺服器端動態產生 | wm-overlay（rotate -45、opacity .12）＋ `watermarkLines` 拆行；快照來自後端 | PASS |
| 切換器僅列可視循環（後端過濾）、切換重繪另記 VIEW | `getLifecycles`（read 權過濾）＋切換導向 `:id` → 重新 fetch＋記 VIEW | PASS |
| 純唯讀（無新增/刪除/拖曳節點） | viewer 無任何 DAG 編輯元件 | PASS |
| 產生 LIFECYCLE_VIEW 稽核，內容與浮水印一致 | service `preview` 記 VIEW，watermarkSnapshot 逐字＝疊加快照 | PASS |
| 下載/列印 → 內容層已燒錄浮水印之 PDF、各記獨立稽核 | `download`/`print` → renderer→burner→audit（LIFECYCLE_DOWNLOAD/PRINT 分開） | PASS（真實 PDF 位元組/中文＝[integration]） |
| DeptContact/User → 清單無圖示且 API 403 | guard `read` 權；前端 canRead 閘 | PASS |
| 主管全公司可視（OQ-E08-03） | 矩陣 Supervisor=READ | PASS |
| 稽核暫異常 → 仍可檢視（補償佇列） | 非阻斷 try/catch（Outbox 重試屬 F023） | PASS |
| 循環無節點 → 空狀態非錯誤 | 前端 `empty-state`；後端回空圖 | PASS |
| 縮放後浮水印仍覆蓋整區 | board `transform: scale`，wm-layer `inset:-40%` 隨之縮放 | PASS（幾何精確＝[integration]） |

## Test Results Summary
後端（`cd backend && npx jest src/lifecycle`）：
| Spec | 說明 | 狀態 |
|---|---|---|
| `lifecycle-tree-layout.spec.ts` | 分層/多 parent-child/空圖/版面/邊過濾 | PASS |
| `lifecycle-preview.service.spec.ts` | preview 回圖+浮水印+記 VIEW；404；空圖；非阻斷；download/print 燒錄+獨立稽核 | PASS |
| `lifecycle-preview.controller.spec.ts` | 守門鏈；可視角色放行；DeptContact/User 403；委派/回應 | PASS |
| `lifecycle-tree-pdf.spec.ts` | 基底樹圖 PDF smoke（%PDF、含 CJK 不崩潰、空循環） | PASS |

前端（`cd frontend && npx vitest run`）：
| Spec | 說明 | 狀態 |
|---|---|---|
| `lifecycle-tree-layout.test.ts` | buildTreeLayout / descendants / edgePath | PASS |
| `LifecycleTreePreviewPage.test.tsx` | 渲染/下游標示/切換器導向/下載列印連結/403/空狀態 | PASS |

全套件：後端 jest 全綠、前端 vitest 29 檔 164 綠；後端＋前端 `tsc --noEmit` 皆 0 error。

## Files Changed
| 路徑 | 類型 | 說明 |
|---|---|---|
| backend/src/lifecycle/lifecycle-tree-layout.ts(.spec) | new | 上到下分層佈局純函式 |
| backend/src/lifecycle/lifecycle-tree-pdf.ts(.spec) | new | 基底樹圖 PDF renderer（seam＋PdfLib 實作） |
| backend/src/lifecycle/lifecycle-watermark.ts | new | LifecycleWatermarkBuilder seam（結構相容 WatermarkService） |
| backend/src/lifecycle/lifecycle-preview.service.ts(.spec) | new | 預覽/下載/列印編排＋稽核（非阻斷） |
| backend/src/lifecycle/lifecycle-preview.controller.ts(.spec) | new | tree-preview 端點＋RBAC read 守門 |
| backend/src/lifecycle/lifecycle.module.ts | modified | 掛預覽 controller/service、匯入 PublicModule/AuditModule、provide seams |
| backend/src/public/public.module.ts | modified | `exports:[WatermarkService]`（供 lifecycle 重用） |
| backend/src/audit/audit.types.ts | modified | additive：`LIFECYCLE_DELETE` 動作（見 F007 log）；LifecycleAuditEvent 註記 |
| backend/test/int/lifecycle.itest.ts | new | 建立→graph→tree-preview→驗 LIFECYCLE_VIEW 稽核（**未執行**） |
| frontend/src/pages/lifecycle-tree-layout.ts(.test) | new | 前端佈局＋descendants＋edgePath 純函式 |
| frontend/src/pages/LifecycleTreePreviewPage.tsx(.test) | new | viewer 頁（移植 prototype 22） |
| frontend/src/api/types.ts | modified | `LifecycleTreePreview` |
| frontend/src/api/endpoints.ts | modified | `getLifecycleTreePreview`／download／print URL |
| frontend/src/App.tsx | modified | 路由 `/lifecycles/:id/tree`（viewer 風格，AdminGuard 外） |
| frontend/src/pages/LifecycleListPage.tsx | modified | 狀態欄樹狀圖圖示入口（開新分頁） |
| frontend/src/components/Icon.tsx | modified | 註冊 git-fork/zoom-in/zoom-out/maximize/printer |

## Architectural Decisions
- **雙入口之路由鍵＝循環 UUID**（OQ-E03-07 暫定）：prototype `?cycle=<代碼>` 之「業務代碼」在現行 data-model 不存在（LIFECYCLE 僅 UUID＋名稱），故 viewer 路由以 `:id`（UUID）為準；文件清單第二入口只需導向 `/lifecycles/<doc.lifecycleId>/tree`。
- **佈局採 prototype 22 之最長路徑分層**（非 F008 canvas 之 dagre / 儲存座標）：AC 明訂「上到下佈局」，viewer 為唯讀重新排版，與畫布編輯座標解耦。前後端各一份純函式（無共用 package），演算法一致並各自單測。
- **基底 PDF 由樹圖 renderer 產生後再燒錄浮水印**：F020 burner 僅在既有 PDF 上疊字，F036 無「原始文件 PDF」故新增 renderer；兩者以 `PdfBurner` seam 串接，unit 以假體驗證組合。
- 稽核 targetType=`LIFECYCLE`、`targetNumber`＝循環名稱（→ buildAuditRow 落 `lifecycleName`）；watermarkSnapshot 逐字＝疊加/燒錄快照。

## Blocking Issues / spec-doc 變更需求（未自行修改共用 spec）
- **第二入口（F017 文件清單樹狀圖圖示）未接線**：`DocumentListPage` 屬 documents.* / doc-edit 併行 track，本 worktree 明確不觸（避免合併衝突）。viewer 已支援任意 `lifecycleId` 開啟；文件清單只需加圖示導向 `/lifecycles/<lifecycleId>/tree`。→ 併回後由前端串接補上（cross-track）。
- **CJK 燒錄字型缺口（與 F020 同）**：`PdfLibBurner` 與 `PdfLibTreeRenderer` 皆用 `StandardFonts.Helvetica`（無 CJK）→ 真實中文需 fontkit＋CJK TTF（數 MB 資產）＝[integration]。未提供時 `asciiSafe` 退化（renderer 用 `?`；⚠ **既有 F020 burner 之 `asciiSafe` 以 `'□'` U+25A1 取代，該字元本身 WinAnsi 不可編碼→真實下載會拋錯**，屬 F020 既存 [integration] 缺口，本 worktree 未改動 public/pdf-burner）。→ 建議架構師一併補 CJK 字型並修正 burner 之退化字元。
- **OQ-E03-07**：`?cycle` 值/反查以 UUID 落地（見上）；若日後導入循環業務代碼需回填對照。
- **OQ-E07-02**：`LIFECYCLE_VIEW/DOWNLOAD/PRINT` 三動作稽核資料模型歸屬本 worktree 依 F023 鎖定契約落地（targetType=LIFECYCLE）；OQ-E07-03（是否併入 F024 查詢）維持未決。
- 節流去重（OQ-E07-01：短時間重複開啟/切換是否合併稽核）未實作——依 F023「每次調閱獨立記錄」逐次記錄。
