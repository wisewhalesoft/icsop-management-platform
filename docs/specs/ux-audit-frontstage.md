# 前台 UX 稽核 — 缺口清單

- **稽核日期**：2026-08-12
- **對照基準**：`ui-ux-pro-max` skill 之 `ux-guidelines.csv`（99 條，含嚴重度分級）
- **稽核範圍**：前台三頁實作
  - `frontend/src/pages/PublicListPage.tsx`（551 行）
  - `frontend/src/pages/PublicDocumentDetailPage.tsx`（600 行）
  - `frontend/src/pages/PublicViewerPage.tsx`（237 行）
  - 前台第四頁（`prototypes/20-public-qa.html`，RAG 問答）**尚未實作**（Phase 3 / F032-F035），僅列預留提醒。
- **方法**：逐條比對 99 項 guideline 與實作原始碼。標註「實測」者為原始碼可直接證實；標註「推論」者需瀏覽器驗證。
- **本稽核不改任何檔案**，亦不觸及 `prototypes/`。C 類項目與 prototype 逐字對齊約束衝突，需人類決策後才可動。

---

## 結論摘要

99 條中，約 40 條適用於前台（其餘為表單提交、圖表、VisionOS、AI 互動、行銷頁等不適用情境）。

| 類別 | 條數 | 狀態 | 說明 |
|---|---|---|---|
| ✅ 已符合 | 22 | — | 見附錄 A |
| 🔴 A 類 · 可直接修 | 7 | **6 項已修 · A-7 待瀏覽器驗證** | 不動 prototype 版面，fidelity 漣漪為零 |
| 🟡 B 類 · 體感提升 | 3 | **3 項已修** | Medium 嚴重度，但對日常查閱體感影響最大 |
| ⚠️ C 類 · 需先決策 | 2 | 未動，待人類決策 | 與 prototype 逐字對齊衝突，改動需連動 prototype + fidelity spec |
| 🔵 D 類 · Phase 3 預留 | 1 | 未實作 | RAG 問答頁尚未實作 |

**修正已於 2026-08-12 完成**（見文末〈執行紀錄〉）。

**整體評價**：前台 a11y 基礎比預期紮實——icon-only 按鈕的 `aria-label` 覆蓋率 100%、`role="status"` / `role="alert"` 到位、空狀態文案完整、`focus:ring` 存在、toast 有 auto-dismiss。缺口集中在**觸控尺寸、非同步狀態管理、URL 狀態**三塊。

---

## 🔴 A 類 · 可直接修（不動 prototype）

### A-1 · 觸控目標小於 44×44（UX-22 / UX-66，嚴重度 High）

Guideline：`Minimum 44x44px touch targets`。實測多處為 `w-8 h-8`（32px）：

| 位置 | 元素 | 現值 |
|---|---|---|
| `PublicListPage.tsx:170-176` | 登出鈕 | `w-8 h-8` = 32px |
| `PublicListPage.tsx:348-366` | 分頁 ‹ › | `w-8 h-8` = 32px |
| `PublicListPage.tsx:392-394` | 篩選面板關閉鈕 | 僅 `Icon w-5 h-5`，無 padding = 20px |
| `PublicViewerPage.tsx:78-84` | 返回鈕 | 無尺寸約束，僅 icon 20px |
| `PublicViewerPage.tsx:140-156` | 縮放 ± | `w-8 h-8` = 32px |

**註**：`PublicDocumentDetailPage.tsx` 的下載/檢視/列印按鈕**已有** `min-h-[44px]`——代表過去做過一輪修正但未覆蓋 List 與 Viewer。修法一致即可（加 `min-h-[44px] min-w-[44px]`），視覺尺寸可維持不變（用 padding 擴大命中區）。

### A-2 · 下載按鈕無 loading／disabled 狀態（UX-32 / UX-61，嚴重度 High）

`PublicDocumentDetailPage.tsx:163-174` 的 `runDownload` 為 async，但按鈕在請求期間**未 disable**。

Guideline：`Prevent double submission during async actions`。

**本專案的額外後果**：附件／使用表單／附錄下載皆會由後端寫入調閱稽核。使用者連點三下＝**三筆稽核紀錄**。這不只是體感問題，是稽核資料正確性問題。

### A-3 · 全站零 `prefers-reduced-motion`（UX-9 / UX-99，嚴重度 High）

實測：`grep -rn "prefers-reduced-motion|motion-safe|motion-reduce" frontend/src` → **0 命中**。

現有動態效果：
- `PublicListPage.tsx:262` — `animate-pulse` skeleton
- `PublicListPage.tsx:386` — 篩選面板 `transition-transform duration-300`
- `PublicViewerPage.tsx:184` — 預覽縮放 `transition: transform .15s ease`

修法：在 `src/index.css` 加一段全域 `@media (prefers-reduced-motion: reduce)` 即可一次覆蓋，不需逐元件改。

### A-4 · 篩選面板可被 Tab 進入且無焦點管理（UX-41，嚴重度 High）

`PublicListPage.tsx:381-450`：面板恆存在於 DOM，關閉時以 `translate-y-full` 移出視窗，並設 `aria-hidden={!sheetOpen}`。

問題：**`aria-hidden="true"` 不會阻止元素接受鍵盤焦點**。關閉狀態下，鍵盤使用者 Tab 到最後仍會掉進看不見的面板（3 個 select + 2 個按鈕）。

另缺：開啟時無 focus trap、無 `aria-modal="true"`、關閉後焦點未還原到觸發鈕。

修法：關閉時加 `inert` 屬性或 `pointer-events-none` + 對內部元素設 `tabIndex={-1}`。

### A-5 · 「使用部門命中」僅用顏色表達（UX-37，嚴重度 High）

`PublicListPage.tsx:529-551`（`UsingDepts`）：命中使用者組織路徑的部門段落，唯一標示是 `text-primary-700 font-medium`。

Guideline：`Don't convey information by color alone`。色覺障礙使用者無法分辨「哪個部門是我的」——而這正是前台清單的核心資訊設計（置頂邏輯的視覺對應）。

修法：加一個小圖示（如 `pin` 或 `check`）或 `title` / 視覺隱藏文字，不需改動版面。

### A-6 · Viewer 無載入狀態（UX-10 / UX-78，嚴重度 High）

`PublicViewerPage.tsx`：`getDocumentWatermark` 進行中時，畫面直接渲染 iframe 與 header，`docName` 顯示 fallback「文件檢視」。無 `role="status"`、無 skeleton。

對比：List 與 Detail 兩頁**都有** skeleton（`role="status"` + `animate-pulse`），只有 Viewer 漏掉。

### A-7 · Viewer 放大後右側內容無法捲到（UX-69，嚴重度 High）— **推論，需瀏覽器驗證**

`PublicViewerPage.tsx:178-192`：容器 `width: min(760px, 94vw)` 搭配 `transform: scale(zoom)`，`transformOrigin: 'top center'`。

CSS `transform` **不影響 layout box**，因此父層 `overflow-auto` 的可捲範圍不會隨 scale 增加。放大到 200% 時，超出視窗的左右兩側預期無法捲動到。

**此項為原始碼推論，尚未在瀏覽器實測**，建議列入下次 Chrome MCP 煙霧測試驗證。若成立，修法為改用 `zoom` 屬性或對容器同步設定寬度而非 transform。

---

## 🟡 B 類 · 體感提升（Medium，但影響日常查閱最大）

### B-1 · 搜尋／篩選／頁碼完全不進 URL（UX-5，嚴重度 Medium）

實測：`grep -n "useSearchParams" PublicListPage.tsx` → **0 命中**。全部狀態存在 React `useState`，URL 恆為 `/public`。

實際後果：
- 找到的搜尋結果**無法分享**給同事（金融業內部查 SOP 的高頻情境）
- 重新整理 → 篩選、關鍵字、頁碼全部歸零
- 瀏覽器上一頁 → 不會回到前一組篩選，直接跳離前台
- 從詳情頁按返回 → 回到未篩選的第 1 頁

**這是我認為前台體感最差的一項**，且與視覺設計無關。改用 `useSearchParams` 即可，版面零變動。

### B-2 · 搜尋每輸入一字打一次 API（UX-89，嚴重度 Medium）

`PublicListPage.tsx:189-196` + `:57-81`：`onChange` 直接 `setKeyword`，而 `keyword` 在 `useEffect` 依賴陣列中 → **無 debounce**。輸入「內部控制」4 個字＝ 4 次後端查詢（中文輸入法組字期間可能更多）。

補充：專案已有 `components/SearchCombobox.tsx`，前台未使用。

### B-3 · Skeleton 高度與實際內容落差過大（UX-19，嚴重度 High／表現為 Medium 體感）

`PublicListPage.tsx:261-266`：skeleton 為 2 條 `h-3` 橫線（總高約 100px）；載入完成後渲染的是最多 20 張 `DocCard`（每張約 160px）。

Guideline：`Reserve space for async content`。目前每次翻頁／篩選都會發生大幅版面暴衝（layout shift）。

修法：skeleton 改為 3–5 張與 `DocCard` 等高的灰塊。這同時是「視覺精緻度」最划算的一項改動。

---

## ⚠️ C 類 · 需先決策（與 prototype 逐字對齊衝突）

以下兩項若要修，必須同時改 `prototypes/03-public-list.html`、`04-public-document-detail.html` 與對應 fidelity spec。**不建議在未決策前擅自更動。**

### C-1 · `text-slate-400` 對比未達 4.5:1（UX-36 / UX-76，嚴重度 High）

`#94A3B8`（slate-400）on `#FFFFFF` ≈ **2.8:1**，未達 WCAG AA 正文門檻 4.5:1。CSV 第 36 條的反例正是 `#999 on white (2.8:1)`。

實測用於**實質內容**（非純裝飾）的位置：
- `PublicListPage.tsx:495/499/505/511` — DocCard 的 `<dt>` 欄位標籤（制定部門／公告日期／使用部門／循環別）
- `PublicListPage.tsx:517` — 內容摘要值（`text-slate-500`，≈ 4.0:1，同樣未達標）
- `PublicDocumentDetailPage.tsx:462/497` — 「無附件」「無關聯使用表單」空狀態文字
- `PublicListPage.tsx:342` — 隱藏筆數提示

**衝突點**：`prototypes/00-design-system.html` 頁首自稱「WCAG 2.1 AA」，但 prototype 本身即使用 slate-400 於這些位置。**設計系統的宣稱與實作不一致，源頭在 prototype。**

決策選項：(a) 統一升到 `text-slate-500`／`slate-600`，連動改 prototype；(b) 明確承認這些為輔助文字並下修設計系統的 AA 宣稱範圍。

### C-2 · 手機正文 12px（UX-67，嚴重度 High）

Guideline：`Minimum 16px body text on mobile`，反例明寫 `text-xs for body text`。

前台大量使用 `text-xs`（12px）承載正文級資訊：`DocCard` 整個 `<dl>` 區塊（`PublicListPage.tsx:493`）、範圍說明句（`:256`）、Detail 頁多處輔助說明。

**衝突點**：prototype 即為 `text-xs`，且此為刻意的資訊密度取捨（一屏顯示更多文件）。全面放大會顯著改變版面。

決策選項：(a) 僅在 `< sm` 斷點放大到 14px，桌機維持 12px；(b) 維持現狀並記錄為已知取捨。

---

## 🔵 D 類 · Phase 3 預留

### D-1 · RAG 問答頁需標示 AI 生成內容（UX-92，嚴重度 High）

`prototypes/20-public-qa.html` 對應的問答頁尚未實作（F032-F035）。實作時須滿足：
- **UX-92**（High）：明確標示 AI 生成內容，不得以人類口吻呈現
- **UX-93**（Medium）：串流輸出，避免 10 秒以上純 spinner
- **UX-98**（Low）：提供 👍/👎 或「重新生成」回饋機制

---

## 附錄 A · 已符合項目（22 條）

| 編號 | 項目 | 證據 |
|---|---|---|
| UX-3 | Active State | 分頁 `aria-current="page"` |
| UX-4 | Back Button | react-router 正常 pushState |
| UX-7 | Excessive Motion | 動畫節制，每視圖 ≤ 2 個 |
| UX-8 | Duration Timing | 150ms / 300ms，皆在 150-300ms 區間 |
| UX-11 | Hover vs Tap | DocCard 用 `onClick` 非 hover |
| UX-15 | Z-Index Management | 有 scale：z-30 / z-40 / z-50，無 `z-[9999]` |
| UX-21 | Container Width | `max-w-5xl` / `max-w-4xl` |
| UX-28 | Focus States | DocCard `focus:ring-2`、輸入框 `focus:ring-2` |
| UX-31 | Disabled States | 分頁鈕 `disabled:opacity-40`、狀態篩選 disabled 樣式 |
| UX-33 | Error Feedback | `role="alert"` + 紅底錯誤區 + toast |
| UX-34 | Success Feedback | 下載成功 toast |
| UX-38 | Alt Text | 無 `<img>`，全 SVG icon（`Icon.tsx` 註冊表） |
| UX-39 | Heading Hierarchy | h1 → h2 → h3 循序 |
| UX-40 | ARIA Labels | **icon-only 按鈕 100% 有 `aria-label`** |
| UX-42 | Screen Reader | 用 `<header>` `<main>` `<section>` `<article>` `<dl>` 語意標籤 |
| UX-44 | Error Messages | `role="alert"` |
| UX-50 | Font Loading | Google Fonts 帶 `display=swap` |
| UX-62 | Input Affordance | 輸入框有 border + 背景 |
| UX-73 | Line Length | 有 max-width 約束 |
| UX-79 | Empty States | 「查無符合結果 + 請調整篩選 + 清除按鈕」 |
| UX-82 | Toast Notifications | `useToast.tsx:77-79` 有 auto-dismiss timer |
| UX-90 | No Results | 有引導文案與復原動作 |

## 附錄 B · 次要觀察（未列入主清單）

- **UX-20 Viewport Units**：`PublicViewerPage.tsx:191` 用 `75vh`、`:181` 用 `94vw`。手機瀏覽器工具列會讓 `vh` 不準，建議改 `dvh`（Medium）。
- **UX-45 Skip Links**：無「跳至主要內容」連結（Medium）。前台導覽極簡，優先度低。
- **UX-84 Truncation**：`contentSummary`（`PublicListPage.tsx:517`）無 `line-clamp`，長摘要會撐高卡片（Medium）。
- **UX-43 / UX-54 Form Labels**：桌機篩選 select 僅有 `aria-label`，無視覺 label。此為 prototype 版面決定，且下拉本身含「所有使用部門」等自述性預設值，判定為可接受取捨。
- **UX-85 Date Formatting**：`announcedDate.slice(0,10)` 輸出 ISO 格式（2026-08-12）。非在地化格式但無歧義，可接受。

---

## 建議執行順序

1. **A-2**（重複稽核）優先——這是唯一會造成**資料正確性**問題的一項，不只是體感。
2. **A-1 / A-3 / A-4 / A-5 / A-6** 一批處理——皆為局部屬性補強，不動版面，可共用一次測試迴圈。
3. **B-1 / B-2 / B-3** 一批處理——體感提升最大，B-3 同時改善視覺精緻度。
4. **A-7** 併入下次瀏覽器煙霧測試驗證後再修。
5. **C-1 / C-2** 待人類決策；若決定要做，順勢併入 design system v2 的討論。

---

## 執行紀錄（2026-08-12）

依上述順序執行，完成 A-1～A-6 與 B-1～B-3 共 9 項。**未動 `prototypes/`、未動任何既有測試**。

### 變更檔案

| 檔案 | 對應項目 |
|---|---|
| `frontend/src/index.css` | A-1（`.tap-target` 命中區 utility）、A-3（全域 `prefers-reduced-motion`） |
| `frontend/src/pages/PublicListPage.tsx` | A-1、A-4、A-5、B-1、B-2、B-3 |
| `frontend/src/pages/PublicDocumentDetailPage.tsx` | A-1、A-2（`DownloadButton` + 併發鎖） |
| `frontend/src/pages/PublicViewerPage.tsx` | A-1、A-6 |
| `frontend/src/pages/PublicListPage.uxAudit.test.tsx` | 新增，9 個測試 |
| `frontend/src/pages/PublicDocumentDetailPage.uxAudit.test.tsx` | 新增，4 個測試 |

### 實作決策說明

- **A-1 觸控目標**：以 `.tap-target` 的覆蓋式 `::after` 擴大命中區至 44×44，**元素視覺尺寸完全不變**。若直接放大 `w-8 h-8`，會違反 prototype 之版面權威。
- **A-2 併發鎖**：採「任一下載進行中即不受理其他下載」的保守策略，而非僅鎖定當前列。理由：後端每次核發即寫入一筆調閱稽核，寧可犧牲併發下載的便利，也不產生歧義的稽核紀錄。
- **A-4 inert**：`aria-hidden` 不阻止焦點，改用 `inert` 讓子樹同時退出焦點序列與無障礙樹。React 18 型別未涵蓋該屬性，故以 DOM API 於 effect 中設定。另補 Esc 關閉與焦點還原。
- **A-5 命中標示**：僅補上 `sr-only` 說明文字。原有的 `font-medium` 已提供一個非顏色線索；**更強的視覺標記（圖示／底線）會變動版面，歸入 C 類待決策**，未擅自加入。
- **B-1 URL 狀態**：查詢條件改以 URL query 為單一真相，元件內不另存副本以免失同步。第 1 頁與空值不留在網址上。
- **B-2 debounce**：300ms，且以 `replace` 寫入，避免逐字輸入在瀏覽歷史堆疊大量條目。

### 驗證結果

- `npx tsc --noEmit`：通過
- `npx vitest run`：**60 檔 / 767 測試全綠**（原 754 + 新增 13）
- 既有 7 個前台測試檔（62 測試）未修改即通過——確認改動未破壞既有契約
- e2e `fidelity-document-appendix-detail.spec.ts` 為唯一觸及前台的 fidelity spec，其選擇器僅依賴 `[data-appendix-item]` / `[data-appendix-name]` / `[data-appendix-empty]` / `data-appendix-order`，本次未動這些標記。**惟 e2e 需起服務與資料庫，本次未實跑**，建議併入下次部署後煙霧測試。

### 仍未處理

- **A-7**（Viewer 放大後右側內容可能捲不到）：原始碼推論，未實測，待瀏覽器驗證後再修。
- **C-1**（`text-slate-400` 對比 2.8:1）、**C-2**（手機正文 12px）：待人類決策，需連動 prototype。
- **D-1**（RAG 問答頁 AI 標示）：功能尚未實作。
