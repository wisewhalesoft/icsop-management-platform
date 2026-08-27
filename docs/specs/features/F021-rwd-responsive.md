# F021: RWD 響應式版面
Priority: P1 | Status: 部分（responsive 版面已建 + unit 狀態保留綠；幾何/觸控/斷點視覺＝[integration]，見 implementation-logs/public-F019-F022-impl.md） | Last Updated: 2026-07-23
Epic/Story: E06 / US-055

> **🔴 2026-08-20 CHANGE delta（使用者裁決；缺失／變更 delta 第 6 項）——前台字級整體上移一階**：使用者反映「前台文字偏小」。`OQ-D9-12`→**選項 A：僅前台**（後台管理介面字級**逐字不動**）；`OQ-D9-13`→**選項 A：各級距上移一階**（`text-sm` 14px → `text-base` 16px、`text-xs` 12px → `text-sm` 14px）。**本 delta 之 AC 編號採 `AC-N#`**（N＝2026-08-20 defect delta）。逐條見 [§前台字級 delta](#d9-typography-delta)（`AC-N59`～`AC-N62`）。
> 📌 **落點選擇之理由**：本項橫跨三個前台頁面（[F019](F019-public-list-browsing.md) 清單與詳情、[F020](F020-watermark.md) 檢視器），不專屬任一 feature；本檔既為「橫向貫穿前台各功能之版面關注點」，故收於此，並於 F019／F020 以回歸鎖定交叉引用。

## Description
前台網頁為 RWD，於桌機（≥1024px）、平板（768–1023px）、手機（<768px，最小 360px）三斷點皆可正常操作清單、搜尋、篩選與文件檢視器。此為橫向貫穿前台各功能之關注點。

## Preconditions
- 前台核心功能（F019/F020）已具備。斷點依 [NFR-005](../nfr.md#browser-rwd)。

## Main Flow
1. 依斷點調整版面（如清單改卡片式/單欄）。
2. 三斷點下清單瀏覽、搜尋、篩選、開啟檢視器等核心操作皆可觸及且無版面錯亂。
3. 手機檢視器：文件內容可縮放/捲動，浮水印清晰可辨。

## Alternative Flows
- 觸控操作：手機/平板互動元件觸控目標 ≥ 44×44px。

## Edge Cases
- 平板橫/直向切換（觸發斷點變化）：搜尋關鍵字與篩選條件維持不變。
- 手機最小 360px：不出現水平捲動或內容截斷。
- 極小寬度（如 280px）：不強制支援，但不得版面完全崩壞（降級處理）。

## Postconditions
- 使用者於任何支援裝置皆可完成核心瀏覽任務。

## Acceptance Criteria
- Given 桌機 1440px, When 瀏覽, Then 清單/篩選列/檢視器版面正確。
- Given 手機 375px, When 瀏覽, Then 清單改單欄卡片式，功能皆可觸及。
- Given 平板橫/直向切換, When 版面重排, Then 搜尋/篩選條件不遺失。
- Given 手機 360px, When 瀏覽, Then 無水平捲動或內容截斷。
- Given 手機開啟檢視器, When 載入, Then 內容可縮放/捲動，浮水印清晰可辨。

### 前台字級 delta（🔴 2026-08-20 使用者裁決；缺失／變更 delta 第 6 項） {#d9-typography-delta}

> 前提裁決（逐題紀錄見 [open-questions §D9](../open-questions.md#d9--2026-08-20-缺失變更-delta來源stories2026-08-20-defect-delta-9md)）：
> **`OQ-D9-12`→選項 A：僅前台**（設計系統 tokens 本身不動、後台維持現行字級）〔使用者〕｜
> **`OQ-D9-13`→選項 A：各級距上移一階**（`text-sm`→`text-base` 16px、`text-xs`→`text-sm` 14px）〔使用者〕｜
> **`OQ-D9-14`→`[RISK]` 接受重新校準成本**，緩解＝由 test-generator 於建環時**先盤點受影響之既有斷言數量並回報，不得事後才發現**〔lead 預設〕。
>
> **適用範圍＝三個前台頁面模組**：`frontend/src/pages/PublicListPage.tsx`、`PublicDocumentDetailPage.tsx`、`PublicViewerPage.tsx`（＋其對應 prototype `03-public-list.html`／`04-public-document-detail.html`／`05-public-viewer-watermark.html`）。
> ⚠ **明確不在範圍**：後台任一頁面、`AppShell`／`PageHeader`／`Icon` 等**共用元件**、`prototypes/00-design-system.html` 之字級 tokens 表。共用元件之字級**不動**（`OQ-D9-12` 選 A ＝「僅前台頁面局部覆寫」）——其後果是前台頁面中由共用元件渲染之片段字級不變，此為選項 A 之已知代價，非缺陷。
> 📌 **spec-writer 已預先盤點（供 test-generator 之 `OQ-D9-14` 緩解使用）**：三頁現況共 `text-sm` × 42（14／24／4）、`text-xs` × 25（5／15／5）；`frontend/src/pages/Public*.test.tsx` 現有之**字級相關斷言僅 1 條**——`PublicViewerPage.test.tsx:58` 之 `expect(text.style.fontSize).toBe('14px')`。⇒ **本字級 delta 本身之既有斷言衝擊為 0 條**（該條指向浮水印疊加之 inline `fontSize`，不屬本 delta 範圍）。<br>🔴 **但同批之 `OQ-D9-32` 會使該條轉紅（2026-08-20 第二輪裁決後之更正，test-generator 必讀）**：[F020](F020-watermark.md#d9-watermark-delta) `AC-N7` 已裁定**移除前台檢視器之 DOM 疊加層** ⇒ `PublicViewerPage.test.tsx:58` 所斷言之 `data-testid="watermark-text"` 節點**將不存在**，該測試**必然轉紅**。**此為預期、非回歸**；須**就地改寫為新行為之背書（斷言該節點不存在）、不得刪除**，逐字契約見 [F020](F020-watermark.md#d9-watermark-delta) `AC-N7`。⇒ **D9 整批對前台字級相關測試之實際衝擊＝1 條，成因為 `OQ-D9-32` 而非本字級 delta。**

- **AC-N59**（🔴 前台三頁不得殘留最小級距；source-level 斷言）：Given 本 delta 實作完成, When 讀取 `PublicListPage.tsx`／`PublicDocumentDetailPage.tsx`／`PublicViewerPage.tsx` 三檔之原始碼, Then 其中 **`text-xs` 之出現次數為 0**（全數已上移為 `text-sm`）。<br>📌 **驗證載體**：以 `node:fs` 讀檔之純檢查測試，比照本 repo 既有之 `frontend/src/pages/change-label-authority.test.ts`（權威性檢查以檔案內容為斷言對象之既有慣例）。<br>⚠ **不得**以 `text-[13px]` 之類任意值繞過——本條同時斷言三檔中**不存在** `text-\[` 之任意字級寫法（`/text-\[[0-9]+px\]/` 無命中）。
- **AC-N60**（render-level 之代表性斷言）：Given 三個前台頁面渲染完成, When 檢視下列代表性節點之 `className`, Then 逐項成立——
  | 頁面 | 節點 | 期望 class |
  |---|---|---|
  | `PublicListPage` | 清單卡片之**內容摘要**文字節點（🔴 2026-08-27 起位於**書名副標題**、不再是 `<dl>` 之一列——[F019](F019-public-list-browsing.md#ux-20260827-public-delta) `AC-Y5`；掛鉤 `data-summary` 與本列要求**逐字不變**） | 含 `text-base`、**不含** `text-sm`／`text-xs` |
  | ~~`PublicListPage`~~（📝 **本列已無載體**） | ~~清單頂部**範圍說明句**（`#scopeNotice`，[F019](F019-public-list-browsing.md) `AC-U7`）~~ 🔴 說明列已於 **2026-08-27 整條移除**（`AC-Y1`；`AC-U7` 一併作廢） | ~~含 `text-sm`、**不含** `text-xs`~~ ⇒ 改為斷言**該節點不存在**（本 delta 之字級要求對它失效，非放寬） |
  | `PublicDocumentDetailPage` | 附件／附錄／使用表單列之**浮水印註記**（`data-wm-note`，[F020](F020-watermark.md) `AC-D7`） | 含 `text-sm`、**不含** `text-xs` |
  | `PublicViewerPage` | **安全資訊帶**（`浮水印由伺服器端…` 之容器，`PublicViewerPage.tsx:198`） | 含 `text-sm`、**不含** `text-xs` |
  📌 **本條為 `AC-N59` 之補強**：source-level 只能證明「舊 class 消失」，render-level 才能證明「新 class 確實落在使用者看得到的節點上」。兩條缺一不可。<br>📌 **表列節點以外之字級屬設計裁量**——只要滿足 `AC-N59` 之全域約束即可。
- **AC-N61**（🔒 後台與設計系統 tokens 逐字不動——`OQ-D9-12` 選項 A 之回歸鎖定）：Given 本 delta 實作完成, When 檢查下列項目, Then 逐項成立——
  - ① **後台頁面之字級 class 未被全域取代**：`DocumentListPage.tsx`／`AccountManagementPage.tsx`／`UsageFormManagementPage.tsx`／`AccessHistoryPage.tsx`／`AppendixManagementPage.tsx` **五檔皆仍含 `text-xs`**（出現次數 > 0）。<br>📌 **本條偵測之失誤形狀＝跨全專案之 find-replace**（`text-xs` → `text-sm`）——那會使上列五檔之計數歸零，是本項最可能之過度施作。
  - ② **設計系統 tokens 表逐字不變**：`prototypes/00-design-system.html` 之字級表仍逐字含 `14 / regular` ＋ `text-sm`（正文 Body）與 `12 / regular` ＋ `text-xs`（輔助說明 Caption）兩列（`prototypes/00-design-system.html:100-108`）。<br>📌 **已明確接受之代價（`OQ-D9-12` 選 A 之裁決註記）**：前後台字級自此分歧，未來新增頁面時須額外判斷「這是前台還是後台」才知道套用哪組字級。
  - ③ **共用元件不動**：`frontend/src/components/**` 之字級 class 逐字未變。
- **AC-N62**（🔒 浮水印疊加之字級不受本項影響；🔴 **2026-08-20 就地縮減範圍——`PublicViewerPage` 一項已不適用**）：Given 本 delta 實作完成, When 檢視 `ChangeHistoryPage` 與 `LifecycleTreePreviewPage` 之浮水印疊加文字節點, Then 其 inline `fontSize` **仍逐字為 `14`**（兩頁現行 `fontSize: 14`，`ChangeHistoryPage.tsx:1000`／`LifecycleTreePreviewPage.tsx:516`），**不因本字級 delta 而改變**。<br>📝 **被縮減之原條文逐字保留供追溯**：「Given 本 delta 實作完成, When 檢視 `PublicViewerPage` 之浮水印疊加文字節點（`data-testid="watermark-text"`）, Then 其 inline `style.fontSize` **仍逐字為 `'14px'`**（`PublicViewerPage.test.tsx:58` 之既有斷言維持綠燈）；`ChangeHistoryPage`／`LifecycleTreePreviewPage` 之浮水印 `fontSize: 14` 亦不變。」<br>🔴 **縮減理由**：`PublicViewerPage` 之浮水印疊加層已由 [F020](F020-watermark.md#d9-watermark-delta) `AC-N7`（`OQ-D9-32`，使用者裁決）**整個移除** ⇒ 該節點不存在，本條對它**失去載體**。⚠ **本條並未被推翻**——它對**仍然存在**的兩頁疊加層**逐字有效**；且該兩頁位於**後台**，若前台單方面放大字級而波及它們即為越界（`OQ-D9-12` 選項 A ＝僅前台）。<br>🔴 **本 delta 只動 `text-*` Tailwind class，不動任何 inline `fontSize`**（此原則未變）。

#### 🔴 prototype 載體之權威化（2026-08-20 第三輪；來源＝`docs/ui-ux-design-overview.md` §A.6.7）

> **本節之存在理由（與本 repo 頭號教訓互為反面）**：既往之失誤是「**補了 AC ≠ AC 有載體**」；
> 本節處理的是它的**反面**——**載體已存在於 prototype，卻沒有任何 AC 賦予它權威**。
> 本輪約束環為簡化版（**僅 backend jest ＋ frontend vitest，無 Playwright／fidelity**），test-generator 只認 spec ＋ prototype：
> 未入 AC 之掛鉤與文案，它要嘛**不建約束**（實作者刪掉也沒人發現），要嘛**自行臆造斷言**（建出規格從未授權之約束）。兩者皆為缺陷。
> 📌 **共同載體形狀**：prototype 為**權威**，實際斷言落於**實作端**之 vitest 測試（比照 `AC-D10`／`AC-E8`／`AC-D15` 之既有慣例）。

- **AC-N82**（設計系統之字級分歧註記橫幅；權威＝`prototypes/00-design-system.html`）：Given `prototypes/00-design-system.html`, When 讀取其內容, Then 於字級 tokens 表**之外**存在一則註記橫幅，其文字**含下列三段逐字片段**——
  - ① 標題：**`🔴 前台／後台字級自此分歧（2026-08-20 使用者裁決 · OQ-D9-12／OQ-D9-13）`**
  - ② 規則：**`上表為後台管理介面與設計系統之權威 tokens，逐字不變。`** 且含 **`text-sm → text-base（16px）、text-xs → text-sm（14px）`** 與 **`前台不得再出現 text-xs 或 text-[Npx] 之任意字級`**
  - ③ 防呆：**`不得把本表改成單一新值`**（其後說明該誤改會讓後台一起變大）
  - 🔒 **字級 tokens 表本身逐字不動**——`AC-N61` ② 之斷言（表中仍含 `14 / regular`＋`text-sm` 與 `12 / regular`＋`text-xs` 兩列）**維持有效**；本橫幅位於**表外**，不影響該斷言。
  - 🔴 **本條之必要性**：`AC-N61` 只鎖住「表不許改」，**但沒有任何地方告訴後續讀者「為什麼前台和這張表不一樣」**。缺了這段說明，下一個看到前台用 `text-base`、設計系統寫 `text-sm` 的人會判定為漂移並「修回去」——那正是 `AC-N61` ① 所防之跨全專案 find-replace 的動機來源。**把理由寫在畫面上，是讓回歸鎖定能長期存活的前提。**
  - 📌 **驗證載體**：以 `node:fs` 讀取 `prototypes/00-design-system.html` 之字串包含檢查（比照 `AC-N59`／`AC-N61` ② 之既有 source-scan 慣例）。

## Error Scenarios
- 極小寬度降級：見 [NFR-005](../nfr.md#browser-rwd)（後台 DAG 畫布以桌機為主）。
- **字級調整不產生任何錯誤路徑**（2026-08-20）：純呈現變更，**不新增錯誤碼、不改變任何 API 契約**。

## Related
- Depends on: [F019](F019-public-list-browsing.md), [F020](F020-watermark.md)
- NFR: [瀏覽器相容與 RWD](../nfr.md#browser-rwd)
- OQ: OQ-NFR005（後台畫布平板編輯? 標準瀏覽器政策）
- **2026-08-20 使用者裁決（D9 delta）**：`OQ-D9-12`（僅前台）／`OQ-D9-13`（各級距上移一階）／`OQ-D9-14`（`[RISK]` 接受重新校準成本，緩解＝建環時先盤點）。見 [§前台字級 delta](#d9-typography-delta)。
- **⚠ 待 ui-ux-designer（2026-08-20 D9 delta 新增）**：`prototypes/03-public-list.html`／`04-public-document-detail.html`／`05-public-viewer-watermark.html` 三檔之 `text-sm` → `text-base`、`text-xs` → `text-sm`；**`prototypes/00-design-system.html` 之字級 tokens 表一字不動**（`AC-N61` ②）。
- **⚠ 交 test-generator（`OQ-D9-14` 之緩解；🔴 2026-08-20 第二輪就地更正）**：建環時須先盤點受本 delta 影響之既有斷言並回報。**本字級 delta 自身之衝擊＝0 條**；**但同批 `OQ-D9-32`（移除前台檢視器疊加層）使 `PublicViewerPage.test.tsx:58` 必然轉紅** ⇒ **D9 整批之實際衝擊＝1 條**，須就地改寫為新行為之背書、不得刪除（見上方 §前言之 🔴 段與 [F020](F020-watermark.md#d9-watermark-delta) `AC-N7`）。若實測與此不符，請回報以更正本節。
