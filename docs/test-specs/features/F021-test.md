---
type: test-design-feature
feature_id: F021
feature_name: RWD 響應式版面
priority: P1
related_spec: docs/specs/features/F021-rwd-responsive.md
last_updated: 2026-07-23
status: draft
---

# F021 — RWD 響應式版面 · Test Design
> source: docs/specs/features/F021-rwd-responsive.md · worktree: public（feature/public-F019-F022）· 2026-07-23

## 範圍聲明

本 feature 為橫向貫穿 F019（清單/搜尋/篩選）與 F020（檢視器）之關注點，本身不含新業務邏輯。涵蓋三斷點（桌機 ≥1024px、手機 <768px 最小 360px；spec AC 明列 1440/375/360，NFR-005 另定義平板 768–1023px 為第三斷點）之版面正確性、觸控目標 ≥44×44px、斷點切換時篩選/搜尋狀態保留、極小寬度降級。**不含**：F019/F020 本身業務邏輯正確性（已於各自檔案覆蓋，本檔僅疊加「在不同寬度下該邏輯仍可正確觸及」之關注點）。

## 測試策略（絕大多數 AC 之真實驗證依賴真實瀏覽器版面引擎，unit 覆蓋範圍有限——見下方誠實揭露）

**重要誠實揭露（Auto-Challenge）**：F021 之多數 AC（無水平捲動、清單改單欄卡片式、觸控目標 ≥44×44px、內容可縮放/捲動且浮水印清晰可辨）本質上是**視覺/版面/幾何**斷言。若前端以 CSS（Tailwind responsive utility classes）達成 RWD（而非 JS 邏輯切換版面），則：
- `jsdom`（React Testing Library 預設環境）**不執行真實 CSS 版面引擎**，`getBoundingClientRect()` 恆回傳 `0`，媒體查詢不觸發實際樣式套用；因此「觸控目標 ≥44px」「無水平捲動」「單欄卡片式改版」等幾何/視覺斷言**在 unit 測試層級不可信、不可驗證**，勉強斷言只會產生偽陽性（測試通過不代表真實瀏覽器行為正確）。
- 因此本設計**明確且刻意**將此類 AC 全數歸類 [integration]（需真實瀏覽器視窗尺寸渲染，如 Playwright/Chrome headful 或等效工具，逐斷點量測），而非為求「有測試」而寫出無法偵測真實回歸的 jsdom 假斷言。此為對 auto-challenge 職責之落實：與其產出看似覆蓋、實則無效的 unit 測試，不如明確標記為 [integration] 並說明理由。

- **[unit] 可驗證範圍（狀態邏輯，非視覺）**：
  1. 斷點切換（如平板橫/直向旋轉觸發 `resize`/`matchMedia` 事件）時，**React 元件狀態**（搜尋關鍵字、已選篩選條件）是否被保留——此為純狀態管理問題，可用 `fireEvent`/mock `matchMedia`／模擬 `window.innerWidth` 變更於 jsdom 中驗證，不涉及真實版面計算。
  2. 若元件以 JS 邏輯（而非純 CSS media query）切換版面模式（如 `useBreakpoint()` hook 回傳 `'mobile'|'tablet'|'desktop'`），則該 hook 之純邏輯（給定寬度輸入→回傳正確模式字串）可 unit 測試；**但目前 F019/F020 尚未實作，是否採此設計屬待決，見開放設計問題 OQ-F021-01**。
  3. 靜態標記存在性檢查（如「清單容器是否具備響應式 grid class 名稱」）可作為極弱代理信號輔助，但**不視為 AC 之充分驗證**，僅作為 unit 層之附加防呆（如防止某次改版誤刪 responsive class）。
- **[integration]（真實瀏覽器，逐斷點：360/375/768/1024/1440px）**：所有幾何/視覺類 AC——水平捲動偵測、單欄卡片式版面確認、觸控目標 `getBoundingClientRect()` 實測 ≥44×44px、手機檢視器縮放/捲動操作、極小寬度（280px）不崩壞之降級樣式截圖比對。建議搭配視覺回歸快照（非本設計指定工具，由 tdd-developer/CI owner 決定）。

## Test Scenarios

### A. 狀態保留（斷點切換，unit 可驗證）

#### TS-F021-001 平板橫向切直向（觸發斷點變化）時搜尋關鍵字不遺失 [unit]
- Given：清單頁已輸入搜尋關鍵字，於平板寬度（768px 直向）
- When：模擬視窗寬度變更觸發橫向斷點（1024px 以上或跨斷點邊界）之 resize 事件
- Then：搜尋輸入框之值不被清空/重置
- 對應 AC / 錯誤碼：Edge Case（平板橫/直向切換，搜尋關鍵字與篩選條件維持不變）

#### TS-F021-002 平板橫/直向切換時已選篩選條件不遺失 [unit]
- Given：清單頁已套用部門/狀態/循環篩選
- When：模擬斷點切換
- Then：已選篩選條件（下拉選中值）不被重置
- 對應 AC / 錯誤碼：同上

#### TS-F021-003 手機（<768px）與桌機（≥1024px）切換時分頁頁碼不遺失（防禦性延伸） [unit]
- Given：清單頁位於第 2 頁
- When：模擬斷點切換
- Then：頁碼狀態維持第 2 頁不重置回第 1 頁（spec 未明列，本設計視為與「搜尋/篩選狀態不遺失」同一原則之合理延伸，需 product owner 確認是否納入正式 AC）
- 對應 AC / 錯誤碼：Edge Case 延伸（見開放設計問題 OQ-F021-02）

### B. 版面模式判定（若採 JS breakpoint hook，待決）

#### TS-F021-004 給定寬度 1440px → 判定為桌機版面模式 [unit，條件式]
- Given：`resolveBreakpoint(1440)`（假設性 hook，見 OQ-F021-01）
- When：呼叫
- Then：回傳 `'desktop'`
- 對應 AC / 錯誤碼：AC「桌機 1440px，清單/篩選列/檢視器版面正確」之判定邏輯前提（本 TS 僅在確認採 JS hook 設計時才適用）

#### TS-F021-005 給定寬度 375px → 判定為手機版面模式 [unit，條件式]
- Given：`resolveBreakpoint(375)`
- When：呼叫
- Then：回傳 `'mobile'`
- 對應 AC / 錯誤碼：AC「手機 375px，清單改單欄卡片式」判定前提

#### TS-F021-006 斷點邊界值（767px vs 768px）判定不重疊不漏判 [unit，條件式]
- Given：`resolveBreakpoint(767)` 與 `resolveBreakpoint(768)`
- When：呼叫
- Then：767 判為 `'mobile'`、768 判為 `'tablet'`（依 [NFR-005](../../specs/nfr.md#browser-rwd) AC2 邊界定義：手機 <768px、平板 768–1023px、桌機 ≥1024px）
- 對應 AC / 錯誤碼：NFR-005 AC2 邊界

#### TS-F021-007 斷點邊界值（1023px vs 1024px）判定不重疊不漏判 [unit，條件式]
- Given：`resolveBreakpoint(1023)` 與 `resolveBreakpoint(1024)`
- When：呼叫
- Then：1023 判為 `'tablet'`、1024 判為 `'desktop'`
- 對應 AC / 錯誤碼：NFR-005 AC2 邊界

### C. 靜態防呆（弱代理信號，非充分驗證）

#### TS-F021-008 清單容器渲染時具備響應式版面 class（存在性檢查） [unit，弱信號]
- Given：清單頁元件渲染輸出
- When：檢查容器 DOM/class
- Then：存在對應「手機單欄／桌機多欄」之 responsive class 標記（不驗證實際生效之視覺結果，僅防止未來改版意外整包移除響應式 class）
- 對應 AC / 錯誤碼：AC「手機 375px，清單改單欄卡片式」之極弱代理（真實驗證見 TS-011 [integration]）

### D. 真實視覺/幾何驗證（[integration]）

#### TS-F021-009 桌機 1440px：清單/篩選列/檢視器版面正確 [integration]
- Given：真實瀏覽器視窗寬度 1440px
- When：載入前台清單頁
- Then：清單/篩選列/檢視器（若已開啟）版面無跑版、無元素重疊
- 對應 AC / 錯誤碼：AC「桌機 1440px，瀏覽，清單/篩選列/檢視器版面正確」

#### TS-F021-010 手機 375px：核心操作皆可觸及 [integration]
- Given：真實瀏覽器視窗寬度 375px
- When：載入清單頁並嘗試搜尋/篩選/開啟檢視器
- Then：所有核心操作皆可觸及（無被裁切/隱藏而不可互動之控制項）
- 對應 AC / 錯誤碼：AC「手機 375px，瀏覽，清單改單欄卡片式，功能皆可觸及」

#### TS-F021-011 手機 375px：清單改單欄卡片式版面 [integration]
- Given：同上
- When：檢視清單呈現方式
- Then：由桌機之表格/多欄樣式改為單欄卡片式
- 對應 AC / 錯誤碼：同 TS-010

#### TS-F021-012 手機最小 360px：不出現水平捲動或內容截斷 [integration]
- Given：真實瀏覽器視窗寬度 360px
- When：載入清單頁
- Then：`document.documentElement.scrollWidth` 不超過 `window.innerWidth`（無水平捲動條）；文字/按鈕內容無截斷（非省略號以外之硬性裁切）
- 對應 AC / 錯誤碼：AC「手機 360px，瀏覽，無水平捲動或內容截斷」

#### TS-F021-013 觸控目標 ≥44×44px（手機/平板互動元件） [integration]
- Given：真實瀏覽器，手機（375px）與平板（768px）寬度
- When：量測所有可互動元素（按鈕/連結/篩選控制項）之 `getBoundingClientRect()`
- Then：寬與高皆 ≥44px（[NFR-005](../../specs/nfr.md#browser-rwd) AC3）
- 對應 AC / 錯誤碼：Alternative Flows「觸控操作，互動元件觸控目標 ≥44×44px」

#### TS-F021-014 手機開啟檢視器：內容可縮放/捲動 [integration]
- Given：真實瀏覽器，375px，已開啟 F020 檢視器
- When：模擬觸控縮放（pinch-zoom）與捲動手勢
- Then：PDF 內容隨手勢正確縮放/捲動，無版面鎖死
- 對應 AC / 錯誤碼：AC「手機開啟檢視器，載入，內容可縮放/捲動」

#### TS-F021-015 手機檢視器浮水印清晰可辨（見 OQ-F021-03，主觀 AC） [integration，需替代量測方案]
- Given：同上
- When：檢視疊加之浮水印文字
- Then：**「清晰可辨」為主觀視覺判斷，非本測試設計可直接給出通過/失敗之客觀斷言**；本設計提出可量測替代方案：浮水印文字節點之 CSS `opacity`/字級/顏色對比值符合 [NFR-007](../../specs/nfr.md#watermark) 定案視覺規格（`opacity:0.12`、14px、`slate-500`）之**客觀存在性**檢查，「人類可辨識」之最終確認留待人工視覺 QA／可用性測試補充，非自動化測試範圍
- 對應 AC / 錯誤碼：AC「手機開啟檢視器，浮水印清晰可辨」（見 OQ-F021-03）

#### TS-F021-016 極小寬度（280px）不強制支援但不得版面完全崩壞（降級） [integration]
- Given：真實瀏覽器視窗寬度 280px（低於最小支援 360px）
- When：載入清單頁
- Then**：降級標準**——不要求功能完整可操作，但不得出現 JS 錯誤導致白屏、不得出現文字圖片完全重疊不可讀之嚴重崩壞（「不強制支援」但「不得完全崩壞」之量化邊界由 tdd-developer/QA 依實測畫面判斷，spec 未給出精確量測標準，見開放設計問題 OQ-F021-04）
- 對應 AC / 錯誤碼：Edge Case「極小寬度（如 280px），不強制支援，但不得版面完全崩壞（降級處理）」

## AC → TS 覆蓋對照表

| AC/來源 | 內容摘要 | 對應 TS |
|---|---|---|
| AC1 | 桌機 1440px 版面正確 | TS-009 |
| AC2 | 手機 375px 單欄卡片式，功能皆可觸及 | TS-010, TS-011, TS-008 |
| AC3 | 平板橫/直向切換，搜尋/篩選條件不遺失 | TS-001, TS-002 |
| AC4 | 手機 360px 無水平捲動或截斷 | TS-012 |
| AC5 | 手機開啟檢視器，可縮放/捲動，浮水印清晰可辨 | TS-014, TS-015 |
| Alt Flow：觸控 ≥44×44px | TS-013 |
| Edge：極小寬度降級 | TS-016 |
| NFR-005 AC2 | 斷點邊界定義 | TS-006, TS-007 |

## 開放設計問題

- **OQ-F021-01**：F019/F020 是否以「純 CSS（Tailwind responsive utility classes）」或「JS 邏輯 hook（如 `useBreakpoint()`）」達成版面切換，目前尚未實作（前置依賴 F019/F020），本設計之 TS-004～007 依賴後者存在才有意義。若最終採純 CSS 方案（與現行後台 DAG 畫布等既有頁面之慣例一致，且 `docs/ui-ux-design-overview.md` 未明示採 JS 斷點邏輯），則 TS-004～007 應整批移除、B 節之「unit 可驗證範圍」進一步縮小至僅剩 A 節（狀態保留）。建議 tdd-developer 於實作前與本設計對齊，避免產出針對不存在之 hook 的測試。

- **OQ-F021-02**：分頁頁碼於斷點切換時是否需保留（TS-003），spec 原文僅明列「搜尋關鍵字與篩選條件」，未提及分頁狀態。本設計依一致性原則視為合理延伸，但**未經 product owner 確認**，列為待定 AC，非強制項。

- **OQ-F021-03**：「浮水印清晰可辨」（AC5）為主觀視覺判斷，不具備自動化測試可直接判定之客觀門檻。已於 TS-015 提出可量測替代方案（CSS 屬性客觀存在性檢查），但**建議正式定義一個可驗收之量化替代指標**（如：於指定視窗尺寸下之螢幕截圖，經人工/半自動比對確認可讀，或訂出對比度演算法門檻），否則此 AC 於上線前之 sign-off 將缺乏客觀依據，屬 auto-challenge 應明確提出之品質風險。

- **OQ-F021-04**：極小寬度（280px）之「不得版面完全崩壞」缺乏量化定義（何謂「完全崩壞」？無 JS 錯誤即合格，或需額外可讀性標準？），[NFR-005](../../specs/nfr.md#browser-rwd) AC4 僅提及後台 DAG 畫布之對應情境，未涵蓋前台此邊界。建議 product owner/UI-UX 補充明確驗收標準（如「無重疊裁切超過 X%」或簡化為「無 JS runtime error + 主要 CTA 按鈕仍可點擊」之最低門檻），否則 TS-016 之 pass/fail 判準將流於測試執行者主觀認定。

- **OQ-F021-05**：本 feature 之所有 [integration] 場景需要之工具鏈（真實瀏覽器多視窗尺寸渲染、觸控手勢模擬、視覺回歸快照比對）未於現有專案中出現先例（後台頁面測試多為 RTL/jsdom），屬全新測試基礎設施需求，需 CI/CD owner 評估導入成本與是否於本輪 MVP 範圍內建置，或改列為上線前人工 QA checklist（非自動化 CI 項目）。此為 F021 相較 F019/F020/F022 之獨特風險，其餘三檔之 [integration] 場景多可沿用既有真 DB/Blob 測試基礎設施，F021 則需額外的瀏覽器自動化能力。
