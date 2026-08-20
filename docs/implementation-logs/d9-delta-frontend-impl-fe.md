---
type: implementation-log
feature_id: D9-delta（F016／F017／F018／F020／F021／F024／F026／F038／F039 之 AC-N# 批次）
feature_name: 2026-08-20 缺失／變更 delta —— frontend 線（impl-fe 段）
branch: feat/d9-defect-delta
status: complete（impl-fe 段完成；使用表單整頁化等剩餘項由 impl-fe2 接手完成，全套件 88/88 綠）
last_updated: 2026-08-21
---

# D9 delta · frontend 線 —— impl-fe 實作紀錄

> **角色邊界**：本輪為 Uncle-Bob 約束環模式。約束環（`ec12e68`／`84f3b39`／`31bcc74`）由 `ring-fe`
> 對實作全盲撰寫並定版；本人（`impl-fe`，tdd-implementation）**只寫 production code，全程未建立、
> 修改、弱化或跳過任何測試檔**。三次測試爭議一律走 mailbox 交 `ring-fe` 裁定（見 §四）。
>
> ⚠ **本人之 session 於工作中途因額度中止**，lead 已將當時成果提交為 `d9a05f3`，並指派 `impl-fe2`
> 接手剩餘項。本檔僅記錄 **impl-fe 段**之實作；`impl-fe2` 段另有其紀錄。

## 一、實跑數字

### 建環時之基線（lead 親跑）
```
88 檔 → 71 綠 / 17 紅　　1227 通過 / 65 失敗 / 1292 總數
```

### impl-fe 段結束時（lead 親跑，commit `d9a05f3`）
```
88 檔 → 79 綠 / 9 紅　　1281 通過 / 12 失敗 / 1293 總數
```

### 本人 lane 之複驗（`ring-fe` 修完三則申訴後，本人重跑）
| 測試檔 | 案數 | 狀態 |
|---|---|---|
| `src/domain/field-matrix.test.ts` | 50 | PASS |
| `src/pages/typography-d9.test.ts` | 23 | PASS |
| `src/pages/ChangeHistoryPage.watermark.test.tsx` | 9 | PASS |
| `src/pages/LifecycleTreePreviewPage.watermark.test.tsx` | 4 | PASS |
| `src/pages/PublicListPage.test.tsx` | 19 | PASS |
| `src/pages/PublicDocumentDetailPage.test.tsx` | 18 | PASS |
| `src/pages/PublicViewerPage.test.tsx` | 15 | PASS |
| `src/pages/PublicViewerPage.watermark.test.tsx` | 4 | PASS |
| `src/pages/DocumentListPage.test.tsx` | 32 | PASS |
| `src/pages/DocumentListPage.linkCell.test.tsx` | 11 | PASS |
| `src/pages/DocumentListPage.filterDelta.test.tsx` | 33 | PASS |
| `src/pages/DocumentReadonlyPage.test.tsx` | 27 | PASS |
| `src/pages/DocumentEditPage.test.tsx` | 47 | PASS |
| `src/pages/AppendixManagementPage.test.tsx` | 21 | PASS |
| `src/pages/AppendixManagementPage.export.test.tsx` | 12 | PASS |
| **合計** | **325** | **15 檔全綠 / 0 紅** |

### 全套件終局（`impl-fe2` 完成剩餘項後，本人於同一 working tree 實跑）
```
88 檔 → 88 綠 / 0 紅　　1327 通過 / 0 失敗 / 1327 總數
```
`npx tsc --noEmit` → **exit 0，零錯誤**。
⚠ 此為**兩位實作者合併後之聯合結果**（impl-fe ＋ impl-fe2），非單獨歸屬 impl-fe 段。

`src/pages/DashboardHome.test.tsx` 亦複驗為 2/2 綠——`d9a05f3` commit message 所列之「KPI 卡一案紅」
單獨重跑後不復現，研判為並行 worker 競用下之非決定性假紅，非本 delta 之漣漪。

## 二、Scenario / AC 對照

| AC | 內容 | 落點 | 狀態 |
|---|---|---|---|
| `AC-N4`／`AC-N8`／`AC-N9`／`AC-N71`～`AC-N73` | 檢視器 canvas 化、縮放改重新渲染、翻頁 DOM 契約 | `PublicViewerPage.tsx` | PASS |
| `AC-N6` | 預覽位元組取自 `/pdf`（已燒錄） | 同上 | PASS |
| `AC-N7` | 🔴 **前台檢視器**疊加層移除（負向） | 同上 | PASS |
| `AC-N66` | 🔒 `ChangeHistoryPage`／`LifecycleTreePreviewPage` 疊加層**保留**並加深（正向） | 該兩頁 | PASS |
| `AC-N67` | 🔒 頁尾 `watermark-format` 字幕與 `/view` 端點保留 | `PublicViewerPage.tsx` | PASS |
| `AC-N72` | 安全資訊帶 `#securityBand` 逐字改寫 | 同上 | PASS |
| `AC-N2` | 浮水印定稿 `#334155` @ `0.30` | `ChangeHistoryPage.tsx`／`LifecycleTreePreviewPage.tsx` | PASS |
| `AC-N20` | 後台五頁列內 `data-wm-note` 兩態逐字文案 | 清單／唯讀／編輯／使用表單／附錄五頁 | PASS |
| `AC-N22`～`AC-N27` | OJT 破例矩陣格值（恰兩格改值）＋19 欄回歸鎖定 | `domain/field-matrix.ts` | PASS |
| `AC-N28`／`AC-N74`／`AC-N75` | 唯讀頁角色分支文案、附件列 DOM 契約、OJT 上傳入口 | `DocumentReadonlyPage.tsx` | PASS |
| `AC-N25` 第三輪／`AC-N76` | 編輯頁 `.ojt-write` 隔離與逐元素 `data-attachment-write` | `DocumentEditPage.tsx` | PASS |
| `AC-N37`～`AC-N40` | 清單最左 OJT 圖示欄（15 欄） | `DocumentListPage.tsx` | PASS |
| `AC-N53`／`AC-N69`／`AC-N80`／`AC-N81` | 上傳事件呈現、第四種類型值、`data-wm-snapshot` | `AccessHistoryPage.tsx` | PASS |
| `AC-N59`～`AC-N62` | 前台三頁字級上移一階；🔒 後台五頁逐字不動 | 前台三頁 | PASS |

## 三、改動檔案（皆為 production code，零測試檔異動）

| 檔案 | 類型 | 說明 |
|---|---|---|
| `frontend/package.json` | modified | 新增相依 `pdfjs-dist@^4.10.38`；新增 `copy:pdfjs`／`verify:pdfjs`／`prebuild`／`postbuild` |
| `frontend/scripts/copy-pdfjs-assets.mjs` | new | 建置前把 `cmaps`／`standard_fonts` 複製進 `public/pdfjs/`，自帶 fail-fast |
| `frontend/scripts/verify-pdfjs-assets.mjs` | new | 建置後驗證 `dist/pdfjs/` 確實有檔（盲區 #18 之唯一機器閘門） |
| `.gitignore` | modified | 忽略 `frontend/public/pdfjs/`（建置產物，非原始碼） |
| `frontend/src/pages/PublicViewerPage.tsx` | modified | iframe → 自繪 canvas；`fetch(/pdf)` → `getDocument` → `page.render`；單頁翻頁；移除疊加層 |
| `frontend/src/domain/field-matrix.ts` | modified | 新增 `OJT_WRITABLE` 列（恰兩格改值） |
| `frontend/src/domain/watermark-note.ts` | new | 前後台共用之 `data-wm-note` 逐字文案常數 |
| `frontend/src/domain/readonly-notice.ts` | new | `15`／`16` 兩頁共用之唯讀提示常數＋`canWriteOjt()` |
| `frontend/src/pages/DocumentReadonlyPage.tsx` | modified | 角色分支文案、`data-attachment-kind`／`-writable-`／`-readonly-`、OJT 上傳入口、`data-wm-note` |
| `frontend/src/pages/DocumentEditPage.tsx` | modified | `ReplaceCard` 加 `data-attachment-write`／`write-only`／`ojt-write`、OJT 徽章、`data-wm-note` |
| `frontend/src/pages/DocumentListPage.tsx` | modified | 最左 `OjtCell`（15 欄）、「檔案」欄 `WmNote`、`min-w` 1560→1724 |
| `frontend/src/pages/AccessHistoryPage.tsx` | modified | `上傳` 類型值、`ATTACHMENT_UPLOAD` 標籤與色票、5 個 option、`data-wm-snapshot` |
| `frontend/src/pages/AppendixManagementPage.tsx` | modified | 列內 `WmNote` |
| `frontend/src/pages/UsageFormManagementPage.tsx` | modified | 列內 `WmNote`（impl-fe 段僅此一項；其餘由 impl-fe2 接手） |
| `frontend/src/pages/ChangeHistoryPage.tsx` | modified | 疊加層色值／不透明度 |
| `frontend/src/pages/LifecycleTreePreviewPage.tsx` | modified | 同上 |
| `frontend/src/pages/PublicListPage.tsx` | modified | 字級上移一階＋`data-summary` 掛鉤 |
| `frontend/src/pages/PublicDocumentDetailPage.tsx` | modified | 字級上移一階；`data-wm-note` 文案改自共用常數 |
| `frontend/src/components/Icon.tsx` | modified | 註冊 `chevron-left`；`IconProps` 加 `title`／`aria-label`／`role` |
| `frontend/src/api/types.ts` | modified | `AuditKind` additive 加 `'上傳'` |

## 四、向 `ring-fe` 提出之申訴（三則，全數成立並由 `ring-fe` 修正）

| # | 爭點 | 舉證形狀 | 裁定 | ring-fe 修正 |
|---|---|---|---|---|
| 1 | `AC-N37` 新增最左欄後，3 個測試檔共 5 處 `td[n]` 絕對索引未同步 +1（連坐 20 案） | 環自身已於 `TS-D-016` 改 `td[5]`→`td[6]`，證明作者已知位移；且環之「15 欄表頭 `headers[0]==='OJT'`」與殘留索引互斥 | 成立 | `6af088b`（兩個 helper 改一行即連坐修好） |
| 2 | `TS-D-013`（既有）以 `getByText('附件（僅下載）')` 當等待閘，與 `AC-N74③`「Supervisor → 標題為『附件』」互斥 | `#attachTitle` 為頁面唯一帶該兩字串之節點；分支條件由 AC 釘死為「對 OJT 是否可寫」，與有無附件無關 | 成立 | `8d1b5b1`（改用書名當等待閘） |
| 3 | `AC-N53` 之 `getByText('附件上傳')` 與既有 `TS-AQ-FE-001` 之 `getByText('DOWNLOAD · 下載')` 互斥 | 窮舉 pill 之三種可能 DOM 形狀，逐格證明無一能同時滿足（`getNodeText` 只串直屬 text node）；並實跑形狀②驗證另一條立刻轉紅 | 成立 | `fcc375b`（改為組合字串，與 prototype 17:315 同形） |

## 五、impl-fe 段**未完成**、已由 `impl-fe2` 接手之項目（如實登錄）

1. `UsageFormCreatePage.tsx`／`UsageFormEditPage.tsx` 兩個新頁（`AC-N41`～`AC-N45`／`AC-N77`～`AC-N79`）
2. `UsageFormManagementPage` 之制定部門欄（`AC-N47`）、「編輯」改名與導頁（`AC-N48`）、`data-create-usage-form`（`AC-N77`）
3. `PermissionMatrixPage` 之 `FIELD_DISPLAY` 未隨 `FIELD_MATRIX` 之 OJT 改值同步（anti-drift 斷言）
4. `endpoint-contract`：前端仍呼叫 `PATCH /admin/usage-forms/:formId/number`，後端已改為 `PATCH /admin/usage-forms/:formId`

> 🔴 **接手後本人未再觸碰上列檔案**——`impl-fe2` 正於同一個 working tree 內進行中（`App.tsx`／
> `endpoints.ts`／`types.ts`／`PageHeader.tsx`／`AccessHistoryPage.tsx`／`PermissionMatrixPage.tsx`／
> `UsageFormManagementPage.tsx` ＋ 6 個新檔為其未提交異動），重複實作會直接覆蓋同儕之在製品。

## 六、架構決策與實作取捨（皆在規格邊界內）

### (a) `pdfjs-dist` 版本與 seam
- 依 §11.1 明文選定 **`pdfjs-dist` 4.x**（實裝 `4.10.38`），**不經 `react-pdf`**。npm 之 latest 為 6.x，
  但 §11.1 逐字裁定 4.x，且 6.x 之 `render()` 參數形狀已變（`canvas` 取代 `canvasContext`），
  與環之 `vi.mock` fake 形狀不符。
- 渲染 seam **不另包抽象層**（§11.4 明示）：元件直接 `import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'`，
  測試以 `vi.mock('pdfjs-dist')` 攔截。實作端**只匯入這兩個具名匯出**，確保 mock 覆蓋完整。
- worker 以 `import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'` 打包（§11.1 之逐字形狀）；
  已實測 vitest／jsdom 下 `?url` 匯入可正常解析，不需額外 shim。

### (b) 三處疊加層之界線（本輪最高風險項）
`AC-N7`（負向，僅 `PublicViewerPage`）與 `AC-N66`（正向，另兩頁）為同一界線之兩面。實作時**分開處理**：
`PublicViewerPage` 整段刪除疊加層；另兩頁只改 `opacity: 0.12 → 0.30`、`color: '#64748B' → '#334155'`，
**疊加層本體與 `watermarkLines()` 拆行邏輯一字未動**。三處未被一次刪除。

### (c) `.ojt-write` 與 `.write-only` 之互斥（第二高風險項）
React 端原本**沒有**這兩個 class（以條件渲染取代 prototype 的 CSS 隱藏）。依 `AC-N76` ④ 新增為
**純標記 class**（無對應 CSS 規則），並保持兩條規則**分離**：
- `icsop_pdf`／`xls` 控制項 → `write-only`，渲染條件 `!ro`（僅 ICSOPAdmin）
- `ojt` 控制項 → `ojt-write`，渲染條件 `canWriteOjt(role)`（ICSOPAdmin／Supervisor／DeptContact）

`canWriteOjt()` 直接查 `FIELD_MATRIX`，**不在頁面內另寫角色白名單**——自建白名單正是
`AC-N24`「開一個洞、鬆一片牆」所防之形狀。

### (d) 字級：逐檔處理，**未用全域取代**
`AC-N61` ① 之防呆對象即為跨專案 find-replace。實作以**限定三個前台頁面檔案**之腳本處理
（`text-xs`→`text-sm`、`text-sm`→`text-base`、`text-[10|11px]`→`text-sm`，單趟正規表示式避免二次升階），
後台五頁與 `components/**` 一行未動；`typography-d9.test.ts` 之後台 `text-xs` 計數 > 0 守衛全綠可證。

### (e) 兩處為滿足環而新增、但**非 prototype 既有**之元素（如實登錄，供覆核）
1. `DocumentListPage` 之 OJT 儲存格內加一個 `sr-only` 文字節點。
   - **理由**：`AC-N38` ③ 之環斷言為 `cell.textContent.trim() !== ''`，而 prototype 之 OJT 欄為
     icon-only（`textContent` 恆為空字串）。以 `sr-only` 承載該文字：視覺與 prototype 完全相同
     （`sr-only` 為視覺隱藏），且外層已是 `role="img"`＋`aria-label`（AT 視為葉節點、不重複播報）。
   - **未申訴之理由**：此為**加法**，不弱化任何產品行為，且獨立提升可及性。
2. `DocumentEditPage` 之 `.xls` 上傳鈕以 **`disabled` 按鈕**形式存在。
   - ⚠ **本鈕現在不能按**。真正的 `.xls` 上傳需要 multipart 二進位＋`.xls` 解析，而
     `backend/src/xls-source/xls-source.controller.ts` 現行只接受已解析之 `templateSummary` JSON body
     （標註為 `[integration]`）。原 React 實作只有一張「待 AI 索引管線就緒」佔位卡、無任何控制項。
   - **理由**：`AC-N76` ④ 之逐元素掛鉤 `data-attachment-write="xls"` 必須有載體——它擋的是
     「有人把 `.xls` 上傳鈕的 `.write-only` 整個刪掉」這一形狀；控制項若不存在，日後恢復本功能時
     該防護就不見了。
   - 🔴 **這是「掛鉤先到位、功能未到位」，不是「功能已完成」**——請勿因該案綠燈而認為 `.xls` 上傳可用。

## 七、單元測試盲區（§11.11）之實際處置

### 盲區 **#18**（本輪最高風險）：pdf.js `cMapUrl`／`standardFontDataUrl` 未真正部署
vitest 以 jsdom＋`vi.mock('pdfjs-dist')` 執行，**從未真的下載** `/pdfjs/cmaps/*.bcmap`；
即使複製腳本被刪或路徑寫錯，`getDocument({cMapUrl:...})` 在測試中恆為 mock、不會失敗。
本人之處置為**兩道建置期閘門**（無 CI，故落在 npm scripts）：

| 階段 | script | 行為 | 失敗時 |
|---|---|---|---|
| `prebuild` | `copy-pdfjs-assets.mjs` | `node_modules/pdfjs-dist/{cmaps,standard_fonts}` → `frontend/public/pdfjs/` | 來源缺目錄、或複製後**目標為空**（`*.bcmap`／`*.pfb` 計數為 0）→ `process.exit(1)`，整個 `npm run build` 中止 |
| `postbuild` | `verify-pdfjs-assets.mjs` | 檢查 `frontend/dist/pdfjs/{cmaps,standard_fonts}` 內確有檔 | 同上，`exit 1` |

實跑結果：`cmaps: 168 個 *.bcmap`、`standard_fonts: 10 個 *.pfb`。

- 🔴 **刻意不掛 `postinstall`**：`frontend/Dockerfile` 之 `npm ci` 發生在 `COPY . .` **之前**，
  當下映像檔內尚無 `scripts/`，掛 `postinstall` 會讓 `npm ci` 直接失敗。`prebuild` 在 `COPY . .` 之後
  才執行，是唯一同時對本機與 Docker 都成立的掛點。
- `frontend/public/pdfjs/` 已加入 `.gitignore`（自 `node_modules` 衍生之建置產物）。
- **nginx／vite 白名單零改動**：`/pdfjs/` 落於既有 `location /` 之 `try_files $uri` 分支（確實存在的
  靜態檔直接命中，不會誤入 SPA fallback）；worker 由 Vite `?url` 打包為雜湊資產、落於既有
  `location /assets/`。已逐條核對 `nginx.conf` 與 `vite.config.ts`，**確認不需新增規則**。
- ⚠ **仍未被機器涵蓋者**（交還 lead）：**「瀏覽器實際渲染非內嵌 CJK 字型之 PDF 是否顯示中文」**。
  上述兩道閘門只證明「檔案進了產物」，不證明「pdf.js 真的用到它」。需一次瀏覽器煙霧測試：
  開啟一份**未內嵌**中文字型之 ICSOP PDF，確認中文非空白／非 `notdef` 方塊，並於 DevTools Network
  觀察 `/pdfjs/cmaps/*.bcmap` 與 worker 皆為 200。**本輪未做。**

### 其餘盲區（如實登錄為未涵蓋）
| # | 項目 | 現況 |
|---|---|---|
| 19 | worker 執行期可達性 | 建置期可抓；執行期需瀏覽器煙霧測試。**未做** |
| 22 | 大頁數 PDF 之瀏覽器記憶體峰值 | 已採**單頁翻頁**（非連續捲動）從結構上限制同時存在之 canvas 數；實測**未做** |
| 23 | HiDPI 縮放之實際清晰度 | 已依 §11.2 實作 `outputScale = zoom × devicePixelRatio` 之雙屬性算法；jsdom `devicePixelRatio` 恆為 1，**視覺品質測不到**，需真人於高 DPR 螢幕驗收 |
| 24 | 前後端 `FIELD_MATRIX` 兩份鏡射之 OJT 列漂移 | 前端側已改；兩側測試各自對各自檔案斷言，**無自動化交叉比對**。需人工確認 backend 線之 `OJT_WRITABLE` 與本檔逐格一致 |
| 25 | `/pdf` 之 `Cache-Control` 標頭 | 屬 backend 線；前端無從處置 |
