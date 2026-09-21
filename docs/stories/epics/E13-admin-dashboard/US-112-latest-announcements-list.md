# US-112: 最新公告（ICSOP 版本更新）清單與「查看更多」

> **Story ID**: US-112
> **Epic**: [E13 後台首頁儀表板](epic-brief.md)
> **Priority**: Should Have
> **Phase**: 1
> **Estimated Points**: 5
> **Status**: 🟢 **APPROVED — 2026-09-21 人類閘門通過**（30 題 `OQ-D44-*` 全數裁決）
> **需求彙整**: [F044 FR-4](../../F044-admin-dashboard-analytics.md)
> ⚠ **本檔不含編號 AC。** 下方「驗收意向」為需求意圖之敘述，供 spec-writer 轉寫。
> 🟢 **本檔內文中之全部 `⚠ 待 OQ-D44-xx` 標記，均已於 2026-09-21 經人類閘門裁決完畢。** 逐題定案值與理由之**唯一權威**＝[F044 §Open Questions 裁決單](../../F044-admin-dashboard-analytics.md)；本檔內文之「待決」措辭**刻意保留原樣供追溯**，🔴 **下游一律以裁決單為準，不得依本檔之待決措辭推定尚未裁決**。

## User Story

As a **後台使用者**,
I want **在首頁直接看到最近公告（或即將公告）的那幾份程序書是哪些**,
So that **我不必開文件管理、設篩選、排序，就知道最近動了什麼、下一份要公告的是什麼**。

---

## 驗收意向（Acceptance Intent）

### AI-1 · 欄位與排序
**Given** 我進入後台首頁
**Then** 存在逐字標題為 `最新公告（ICSOP 版本更新）` 之清單區塊（確切逐字由 ui-ux-designer 依使用者原文定稿）
**And** 其欄位**恰四欄**：`公告日`／`版次`／`程序書書名`／`狀態`（使用者原文明訂）
**And** 列依 `公告日` **降冪**排序。

### AI-2 · 母體與「狀態」欄之資訊量
**Given** 系統中有已公告與尚未到公告日之 active 文件
**When** 取最新公告清單
**Then** 母體為 `status='active'` 者（即 `已公告` ∪ `進度中`），排除 `inactive`／`void`
**And** 依公告日降冪 ⇒ 未來公告日者排在最上方、`狀態` 欄顯示 `進度中`
**And** ⚠ 待 `OQ-D44-22` 子題 c——🔴 **若裁為「只含已公告」，`狀態` 欄將恆為同一值、零資訊量**；使用者會要求這一欄，正說明他預期看得到不只一種狀態。

### AI-3 · 狀態欄之值
**Given** 清單已渲染
**Then** `狀態` 欄顯示**衍生顯示狀態**之逐字值（`DISPLAY_LABEL`：`已公告`／`進度中`／`失效`／`作廢`），**不是**原始 `status`（`active`／`inactive`／`void`）
**And** 🔒 與 [US-109](US-109-dashboard-kpi-cards.md)／[US-111](US-111-announced-donut-charts.md) 同源於 `deriveDisplayStatus`。

### AI-4 · 邊界資料
**Given** 某文件之 `announcedDate` 為 null
**Then** 該列**不進入本清單**（無公告日者無法參與「依公告日降冪」之排序；⚠ 待 `OQ-D44-22` 子題 d）
**Given** 某文件之 `edition` 為 null
**Then** `版次` 欄顯示逐字 `未設版次`（沿用 F042 既有常數），**不留白、不假造版次字串**。

### AI-5 · 筆數上限與空狀態
**Given** 母體筆數大於上限
**Then** 只呈現前 N 筆（建議 N＝10，⚠ 待 `OQ-D44-22` 子題 a）
**Given** 母體為空
**Then** 呈現**明確之空狀態提示**，不得空白。

### AI-6 · 「查看更多」連結
**Given** 我的角色對 `ICSOP 文件管理` 有讀取權
**Then** 區塊中存在逐字 `查看更多` 之連結
**When** 我點擊它
**Then** 導向 `/admin/documents`，**且該頁確實已套用「公告日期降冪」排序**
**And** 🔴 **已查證現況做不到**：`DocumentListPage` 之 `sortBy`／`sortDir` 是純前端 `useState`、**不讀 URL** ⇒ 須新增 URL 參數讀取（⚠ 待 `OQ-D44-23`）
**And** 🔒 若採 URL 參數，須**於 state 初始化函式即自網址取樣**——照抄同頁 `readSubtreeParams`／`readBcSubtreeParams` 之既有紀律，否則首屏會先閃一次未排序之清單
**And** 🔒 **不帶狀態篩選**（連結叫「查看更多」，帶篩選會看到更少；⚠ 待 `OQ-D44-23` 附帶題）
**And** 🔒 **閘門須直接讀 `FUNCTION_MATRIX`，不得寫成角色清單**。

### AI-7 · 文件清單零漣漪（🔒 回歸鎖定）
**Given** 本 story 實作完成
**When** 不帶任何新 URL 參數進入 `/admin/documents`
**Then** 該頁之行為、欄位集合、14 項篩選、預設排序與 CSV 欄數**與本 story 導入前逐項相同**
**And** ⚠ **客端排序與後端 `applyDocumentQuery` 對 `announcedDate` 為 null 的處置本來就不同**（客端 `?? ''`；後端「null 一律排最後、不受方向影響」）——🔒 **本輪不動該既有落差**（⚠ 待 `OQ-D44-23` 第三題）。

---

## Notes

- ⚠ **「最新公告（ICSOP 版本更新）」之括號內容**：使用者原文為「最新公告(ICSOP 版本更新)」。若 AI-2 裁為「含進度中」，該括號的「版本更新」語意仍成立（即將公告的也是版本更新），不需改文案。
- 🔒 本 story **不新增**任何文件清單之篩選或欄位；`查看更多` 只是帶排序參數導向既有頁面。
- 🔵 本區塊會揭露**程序書書名**——與後台文件清單（未寫稽核）揭露的是同一層級資訊，故仍建議不寫 `AUDIT_LOG`（見 `OQ-D44-30` 子題 c）。

## Dependencies

- **Blocked By**: 無
- **Blocks**: 無
- **觸及他人之檔案**：`frontend/src/pages/DocumentListPage.tsx`（新增 URL 排序參數讀取）——⚠ 此為本 Epic **唯一**會修改 F017 既有頁面的地方，須特別確認 AI-7 之回歸鎖定。

## Definition of Done

- [ ] 驗收意向經 spec-writer 轉為編號 AC 並經人類核可
- [ ] 清單之母體、排序、上限、null 處置有單元測試
- [ ] `查看更多` 導向後之排序有測試（非只測連結存在）
- [ ] 文件清單之既有測試全綠**且期望值未經修改**
- [ ] prototype `07-admin-shell.html` 已同步
