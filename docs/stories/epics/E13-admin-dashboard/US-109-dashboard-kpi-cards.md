# US-109: 後台首頁四張統計卡（已公告／進度中／本月新版公告／OJT 準時完成率）

> **Story ID**: US-109
> **Epic**: [E13 後台首頁儀表板](epic-brief.md)
> **Priority**: Must Have
> **Phase**: 1
> **Estimated Points**: 8
> **Status**: 🟢 **APPROVED — 2026-09-21 人類閘門通過**（30 題 `OQ-D44-*` 全數裁決）
> **需求彙整**: [F044 FR-1](../../F044-admin-dashboard-analytics.md)
> ⚠ **本檔不含編號 AC。** 下方「驗收意向」為需求意圖之敘述，供 spec-writer 轉寫；AC 之唯一權威為日後之 `docs/specs/features/F044-admin-dashboard-analytics.md`。
> 🟢 **本檔內文中之全部 `⚠ 待 OQ-D44-xx` 標記，均已於 2026-09-21 經人類閘門裁決完畢。** 逐題定案值與理由之**唯一權威**＝[F044 §Open Questions 裁決單](../../F044-admin-dashboard-analytics.md)；本檔內文之「待決」措辭**刻意保留原樣供追溯**，🔴 **下游一律以裁決單為準，不得依本檔之待決措辭推定尚未裁決**。

## User Story

As a **ICSOP 管理員（及其他後台角色）**,
I want **一進後台首頁就看到四個口徑明確的數字：已公告幾份、進度中幾份、這個月公告了幾份、教育訓練跟上了多少**,
So that **我不必逐頁點進去、逐欄自己數，就能判斷現在該先處理哪一件事**。

---

## 驗收意向（Acceptance Intent）

> 🔵 以 Given/When/Then 敘述需求意圖，**非編號 AC**。凡標示 `⚠ 待 OQ-D44-xx` 者，其最終值由人類裁決決定。

### AI-1 · 四張卡取代既有五張
**Given** 我以任一後台角色進入 `/admin`
**When** 頁面載入
**Then** 歡迎區之下呈現**恰 4 張**統計卡，逐字標題為 `已公告`／`進度中`／`本月新版公告`／`OJT 準時完成率`
**And** 既有 5 張待辦 KPI 卡不再呈現（⚠ 待 `OQ-D44-03`；若裁為並存則兩排並陳且須可區分）。

### AI-2 · 已公告與進度中之口徑
**Given** 系統中存在各種狀態之 ICSOP 文件
**When** 計算前兩張卡
**Then** `已公告`＝`deriveDisplayStatus` 判定為 `announced` 者之份數；`進度中`＝判定為 `in_progress` 者之份數
**And** 🔴 **兩者之判定必須來自 `backend/src/documents/display-status.ts` 之同一支既有純函式，不得另寫第二套**
**And** 🔴 **`進度中` 必須重用既有 `pendingPublish` 之 provider**——已查證兩者是同一個計數（⚠ 待 `OQ-D44-02`）。

### AI-3 · 本月新版公告
**Given** 當月有若干份文件公告（含新建立者與舊文件改版後重新公告者）
**When** 計算第三張卡
**Then** 得到該批之份數
**And** ⚠ 待 `OQ-D44-01`：判定口徑（建議＝`announcedDate` 落在當月且 ≤ 今日）
**And** 🔒 若採建議口徑，本卡之數字與 [US-111](US-111-announced-donut-charts.md) 區塊 (1)「當月已公告」環圖之各段總和**必須恆等**——這是同一畫面上最容易出現「兩個看起來該一樣卻不一樣」的地方。

### AI-4 · OJT 準時完成率
**Given** 近 1 個月內有若干單位之教育訓練到期
**When** 計算第四張卡
**Then** 卡面**同時**呈現實際單位數量與比率（使用者原文明訂），形如「已完成 X / 應完成 Y（Z%）」
**And** ⚠ 待 `OQ-D44-08`（分子分母方向）／`OQ-D44-09`（時間窗口）／`OQ-D44-10`（是否引入「準時」第二口徑）／`OQ-D44-11`（「單位」之粒度）／`OQ-D44-12`（排除規則）
**And** **Given** 應完成數為 0, **Then** **省略比率**、呈現明確空狀態（比照 F042 `coverage.rate` 於分母為零時省略該鍵之既有紀律；🔴 明文禁止 `NaN%`／`0%`／`100%`）。

### AI-5 · 「查看明細」連結
**Given** 我的角色對 `OJT 進度管理` 有讀取權
**When** 檢視第四張卡
**Then** 卡上存在逐字 `查看明細` 之連結
**When** 我點擊它
**Then** 導向 OJT 進度管理之 `OJT 資料清單` 分頁，且**未全部完成 OJT 的單位排在上方**
**And** ⚠ 待 `OQ-D44-13`（導向形態：URL 參數 vs router state）／`OQ-D44-14`（排序語意與作用範圍）
**And** 🔒 **閘門須直接讀 `FUNCTION_MATRIX`，不得寫成角色清單**（比照 `DocumentListPage` 之 `canSeeLifecycleDimension` 既有紀律）。

### AI-6 · 角色可見性
**Given** 我以四種後台角色之一登入
**Then** 前三張卡一律呈現（四種角色對 `ICSOP 文件管理` 皆有 `READ` 以上）
**And** 第四張卡之可見性 ⚠ 待 `OQ-D44-07`——🔴 **此題與 2026-09-02 「OJT TAB1 儀表板對主管／部門窗口隱藏」之人類裁決正面衝突，不得由下游自行推定**。

### AI-7 · 降級不阻斷
**Given** 任一計數之資料來源丟出例外
**When** 頁面載入
**Then** **僅該張卡降級**（顯示 0 或明確之未知態），其餘三張與整個儀表板照常呈現
**And** 沿用既有 `DashboardSummaryService.safe()` 之紀律，不得讓單一 provider 失敗使整頁崩潰。

### AI-8 · 日期邊界
**Given** 時鐘停在月初第一秒、月末最後一秒、或 1 月 31 日
**When** 計算「本月」與「近 1 個月」
**Then** 分桶結果符合裁定之時區基準（⚠ 待 `OQ-D44-28`，建議＝沿用 UTC）
**And** 🔴 **基準必須集中於單一推導點**，前後端不得各算一份
**And** 🔴 **測試必須凍結時鐘**——本 repo 已記錄「fixture 以 `Date.now()` 回推 ⇒ 每天 00:00–02:00 必紅、其餘 22 小時綠」之跨日定時炸彈。

---

## Notes

- 🔒 **卡片標題為使用者逐字指定**：`已公告`／`進度中`／`本月新版公告`／`OJT 準時完成率`。若 `OQ-D44-11` 裁為「單位＝進度列」，第四張卡之副標將**不得**使用「單位」一詞（否則與 `查看明細` 的單位排序對不上）——那會反過來要求改動使用者指定的文案，須回報。
- ⚠ **`進度中` 與既有 `待公布的文件` 是同一個數字**：若 `OQ-D44-03` 裁為並存，畫面上會同時出現兩張數值相同、標題不同的卡。
- 🔒 **不得**為本 story 新增任何 `FUNCTION_MATRIX` 功能列。

## Dependencies

- **Blocked By**: 無（可與 US-110 ～ US-113 並行）
- **Blocks**: 無
- **共用之口徑**：與 [US-111](US-111-announced-donut-charts.md)、[US-113](US-113-category-distribution-bar.md) 共用 `deriveDisplayStatus`；與 [US-112](US-112-latest-announcements-list.md) 共用 `DISPLAY_LABEL` 之逐字狀態值。

## Definition of Done

- [ ] 驗收意向經 spec-writer 轉為編號 AC 並經人類核可
- [ ] 四張卡之計數以單元測試鎖住（含凍結時鐘之月界向量）
- [ ] 單一 provider 失敗之降級路徑有測試
- [ ] 既有 F025／F042／F017 測試全綠**且期望值未經修改**
- [ ] prototype `07-admin-shell.html` 已同步
