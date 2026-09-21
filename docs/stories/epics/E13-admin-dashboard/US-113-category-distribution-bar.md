# US-113: 依業務/功能類別分布之雙色長條圖

> **Story ID**: US-113
> **Epic**: [E13 後台首頁儀表板](epic-brief.md)
> **Priority**: Should Have
> **Phase**: 1
> **Estimated Points**: 8
> **Status**: 🟢 **APPROVED — 2026-09-21 人類閘門通過**（30 題 `OQ-D44-*` 全數裁決）
> **需求彙整**: [F044 FR-5](../../F044-admin-dashboard-analytics.md)
> ⚠ **本檔不含編號 AC。** 下方「驗收意向」為需求意圖之敘述，供 spec-writer 轉寫。
> 🟢 **本檔內文中之全部 `⚠ 待 OQ-D44-xx` 標記，均已於 2026-09-21 經人類閘門裁決完畢。** 逐題定案值與理由之**唯一權威**＝[F044 §Open Questions 裁決單](../../F044-admin-dashboard-analytics.md)；本檔內文之「待決」措辭**刻意保留原樣供追溯**，🔴 **下游一律以裁決單為準，不得依本檔之待決措辭推定尚未裁決**。

## User Story

As a **ICSOP 管理員／系統管理員／主管**,
I want **看到每一個業務/功能類別底下，有多少份文件已經公告、多少份還在進度中**,
So that **我能看出哪一塊業務的程序書還沒到位，而不是只知道全公司總共有幾份沒公告**。

---

## 驗收意向（Acceptance Intent）

### AI-1 · 圖形與雙色
**Given** 我進入後台首頁並捲到最下方
**Then** 存在一張雙色長條圖，逐字標題為 `依業務/功能類別分布`（🔒 `業務/功能類別` 為 F043 鎖定字串：半形斜線、前後無空白）
**And** 兩色分別對映 `已公告` 與 `進度中`，且**色義與 [US-109](US-109-dashboard-kpi-cards.md) 之卡片、[US-111](US-111-announced-donut-charts.md) 之圖例一致**
**And** 兩色之區分**不得僅依顏色**，須另有文字標籤（[NFR-F044-2](../../F044-admin-dashboard-analytics.md)）。

### AI-2 · 統計單位與去重
**Given** `BUSINESS_CATEGORY_DOC` 之唯一鍵為 `(nodeId, documentId)`，同一份文件可掛在同一類別的多個節點
**When** 計算某類別之文件數
**Then** 統計單位為**類別**（非節點），同一份文件在同一類別內**只計一次**（相異 `documentId` 計數）
**And** 🔒 **必須沿用 F043 `AC1` 既有之類別層口徑「掛載文件數（去重後之相異文件數）」，不得另寫第二份去重邏輯**——否則類別池清單與首頁長條圖會出現兩個不同的「掛載文件數」（⚠ 待 `OQ-D44-24`）
**And** 🔒 類別層之文件集合**必經 `BUSINESS_CATEGORY_NODE` join**（F043 決策 E9：`BUSINESS_CATEGORY_DOC` 刻意無冗餘 `businessCategoryId` 欄）。

### AI-3 · 計入之文件狀態
**Given** 系統中有 `active`／`inactive`／`void` 三種文件
**When** 計算長條高度
**Then** **僅計入 `status='active'`**，並依 `deriveDisplayStatus` 分為 `已公告`／`進度中` 兩段
**And** `inactive`／`void` **完全不計入**（雙色既然逐字就是那兩種，第三、四種狀態沒有可落之色；⚠ 待 `OQ-D44-26`）。

### AI-4 · 類別之取捨與排序
**Given** 類別池中有停用之類別
**Then** `status='inactive'` 之類別**不顯示**（⚠ 待 `OQ-D44-25` 子題 a）
**And** ⚠ **與 F043 `OQ-B-04`（後台文件清單第 16 欄仍顯示停用類別之掛載）刻意不同**——那一處在講「這份文件掛過什麼」，這一處在講「目前有哪些類別」；**不得為了一致而對齊**
**Given** 某類別掛載文件數為 0
**Then** **不顯示**該類別（長度為 0 的長條只佔版面、不帶資訊；⚠ 待 `OQ-D44-25` 子題 b）
**When** 排序
**Then** 依 `已公告 + 進度中` 之總數降冪；同值時依 `businessCategoryDisplayName` 之**穩定次序**
**And** 🔴 **排序比較子須明文釘死**——本 repo 已記錄 `localeCompare` 定序隨環境漂移之缺陷（同一份資料在不同機器排出不同順序，測試一邊綠一邊紅）。

### AI-5 · 筆數上限
**Given** 類別數超過上限
**Then** 只呈現前 N 條（建議 N＝10）並提供展開全部之入口
**And** 🔒 **上限只保護版面，不得隱藏資料**（展開後必須看得到全部；⚠ 待 `OQ-D44-25` 子題 d）。

### AI-6 · 可見性閘門
**Given** 我的角色對 `業務/功能類別管理` **無讀取權**（部門窗口＝`NONE`）
**Then** 本區塊**不進 DOM**
**And** 🔴 **閘門須直接讀 `FunctionKey.BUSINESS_CATEGORY_MANAGEMENT` 之矩陣值，明文禁止寫成角色清單**——比照 `DocumentListPage` 之 `canSeeLifecycleDimension` 既有紀律（其註解逐字：「寫成角色清單也能過測，但下次矩陣一動，這裡就會與真正的授權分家」）
**And** ⚠ 待 `OQ-D44-27`——讓一個在側欄看不到該功能的角色在首頁看到它的統計圖，是本 repo 已修過多次的「死鏈／越權可見」形狀之鏡像。

### AI-7 · 數值可被文字讀到
**Given** 長條圖已渲染
**Then** 每一條之類別名稱、已公告數、進度中數**皆可由文字取得**（非只存在於矩形的寬高中）
**And** 這是本輪（僅 vitest / jest、無視覺回歸）唯一能驗證圖畫得對不對的途徑。

### AI-8 · 空狀態
**Given** 系統中尚無任何業務/功能類別，或全部類別皆零掛載
**Then** 呈現**明確之空狀態提示**，不得空白
**And** 提示須說明資料從何而來（比照 F042 `EMPTY_ALL_HINT` 之既有作法：不留下「什麼都沒有、也看不出該去哪裡」的死路）。

---

## Notes

- 🔒 **命名鎖定**：`業務/功能類別` 為 F043 鎖定字串（半形斜線、前後無空白）；程式碼識別子一律 `businessCategory`／`BUSINESS_CATEGORY`（明文禁止 `functionCategory`／`bizCat`／裸 `category`）。
- ⚠ **本區塊之統計與類別池清單之「掛載文件數」口徑不同之處**：類別池清單計的是**全部掛載文件**（不分狀態），本區塊只計 `active`。⇒ 兩個數字**會不同**，spec 須明文記載此刻意差異，否則會被當成 bug 回報。這是本 story 最容易被誤判的一點。
- 🔴 **效能**：類別層去重需 `BUSINESS_CATEGORY_DOC` → `BUSINESS_CATEGORY_NODE` → `BUSINESS_CATEGORY` 之兩段 join ＋ `DISTINCT`，是本 Epic 最重的聚合。若 `OQ-D44-30` 子題 a 裁為單一端點，它會拖慢整張卡片列——這正是建議採獨立端點的理由。

## Dependencies

- **Blocked By**: [E12 US-107](../E12-business-function-category/US-107-business-category-document-mount.md)（掛載模型須已上線——🟢 已上線，2026-09-04 已 push 至 main）
- **Blocks**: 無
- **共用**：與 [US-109](US-109-dashboard-kpi-cards.md)／[US-111](US-111-announced-donut-charts.md) 共用 `deriveDisplayStatus` 與「已公告／進度中」之色義。

## Definition of Done

- [ ] 驗收意向經 spec-writer 轉為編號 AC 並經人類核可
- [ ] 「同一文件掛同類別多節點只計一次」有專屬 fixture 與斷言（🔴 語料必須真的含這種形狀，否則該斷言恆真、零鑑別力）
- [ ] 「本區塊數字 vs 類別池清單數字」之刻意差異有斷言鎖住（而非讓它日後被「順手對齊」）
- [ ] 部門窗口角色下本區塊不進 DOM 有測試
- [ ] 全部數值可由 `textContent`／`getByRole` 取得
- [ ] prototype `07-admin-shell.html` 已同步
