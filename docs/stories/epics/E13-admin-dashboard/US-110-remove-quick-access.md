# US-110: 移除「快速進入功能區」

> **Story ID**: US-110
> **Epic**: [E13 後台首頁儀表板](epic-brief.md)
> **Priority**: Must Have
> **Phase**: 1
> **Estimated Points**: 2
> **Status**: 🟢 **APPROVED — 2026-09-21 人類閘門通過**（30 題 `OQ-D44-*` 全數裁決）
> **需求彙整**: [F044 FR-2](../../F044-admin-dashboard-analytics.md)
> ⚠ **本檔不含編號 AC。** 下方「驗收意向」為需求意圖之敘述，供 spec-writer 轉寫。
> 🟢 **本檔內文中之全部 `⚠ 待 OQ-D44-xx` 標記，均已於 2026-09-21 經人類閘門裁決完畢。** 逐題定案值與理由之**唯一權威**＝[F044 §Open Questions 裁決單](../../F044-admin-dashboard-analytics.md)；本檔內文之「待決」措辭**刻意保留原樣供追溯**，🔴 **下游一律以裁決單為準，不得依本檔之待決措辭推定尚未裁決**。

## User Story

As a **任一後台角色**,
I want **首頁不要再放一整排與左側選單完全重複的功能卡**,
So that **首頁最值錢的那半屏版面可以拿來放我真正需要的狀況資訊，而不是同一份選單的第二個副本**。

---

## 驗收意向（Acceptance Intent）

### AI-1 · 區塊整個移除
**Given** 我以任一後台角色進入 `/admin`
**When** 頁面載入
**Then** 畫面上**不存在**逐字 `快速進入功能區` 之標題，亦不存在任何功能卡
**And** 該區塊原本佔用之版面由 [US-111](US-111-announced-donut-charts.md)／[US-112](US-112-latest-announcements-list.md)／[US-113](US-113-category-distribution-bar.md) 之三個區塊接手。

### AI-2 · 側欄零漣漪（🔒 回歸鎖定）
**Given** 本 story 實作完成
**When** 以五種角色逐一渲染後台側欄
**Then** 其選單項集合、順序、逐字標籤、圖示與存取徽章**與本 story 導入前逐格相同**
**And** `MENU`／`visibleMenu()`／`accessLabelFor()` 之行為**一行未改**
**And** 🟢 **已查證**：F042 `AC-28`⑮（`受限CRUD` 逐字徽章）之載體**不只**儀表板卡片——`AppShell.tsx:107` 之側欄亦呼叫 `accessLabelFor`，且 `menu.test.ts:141` 直接測該純函式 ⇒ **移除卡片不會使該 AC 失去載體**。

### AI-3 · 權限矩陣零漣漪（🔒 回歸鎖定）
**Given** 本 story 實作完成
**When** 逐格取 `FUNCTION_MATRIX` 之值
**Then** 其功能鍵集合與 5 種角色 × 全部功能列之逐格值，**與本 story 導入前完全相同**
**And** **未新增任何功能列**（比照 [F002](../../../specs/features/F002-role-based-routing.md) `AC-D5` 之既有鎖定）。

### AI-4 · prototype 同步
**Given** prototype 為版面之權威來源
**When** 本 story 完成
**Then** `prototypes/07-admin-shell.html` 之 `快速進入功能區` 標題、`cardGrid` 容器與 `CARDS`／`renderCards` 相關腳本**一併移除**
**And** 該檔之側欄 `MENU` 常數**一行未改**。

### AI-5 · 既有測試之處置
**Given** `frontend/src/pages/DashboardHome.test.tsx` 有兩處依賴本區塊
**When** 本 story 完成
**Then** `:190` 之 `getByText('快速進入功能區')` 斷言移除；`:185` 之案例（名稱含「快速進入卡片仍在」）**改寫為斷言其他仍在之區塊**——該案例真正要證明的是「活動端點失敗不阻斷儀表板」，其載體換掉即可，**不得整案刪除**（那會讓一條真正有價值的降級斷言消失）。

---

## Notes

### 🟢 已查證之漣漪清單（完整，非推測）

| 檔案 | 內容 | 處置 |
|---|---|---|
| `prototypes/07-admin-shell.html:92` ＋ `cardGrid` div ＋ `CARDS`／`renderCards` | 區塊本體 | 移除 |
| `frontend/src/pages/DashboardHome.tsx` | `CARD_DESC` 常數、`visibleMenu`／`accessLabelFor` import、卡片區塊 | 移除 |
| `frontend/src/pages/DashboardHome.test.tsx:185` | 案例名含「快速進入卡片仍在」 | 改寫載體 |
| `frontend/src/pages/DashboardHome.test.tsx:190` | `getByText('快速進入功能區')` | 移除該斷言 |
| `docs/ui-ux-design-overview.md:973` | 差異表「另加『快速進入功能區』卡片 合計 +4/−0」 | 更新 |
| `docs/ui-ux-design-overview.md:1137` | 「修正後主管卡片為 `["業務/功能類別管理","ICSOP 文件管理"]`」 | 標記為已作廢 |
| `docs/specs/prototype-alignment/browser-smoke-findings.md:49,51` | 2026-07-25 實測紀錄 | 🔵 **不改**（歷史紀錄，非現況規格） |

### 🟢 兩項關鍵確認（供人類安心）

1. **`docs/specs/features/` 之下對「快速進入功能區」零命中** ⇒ 本 story **不作廢任何一條既有編號 AC**，不需要任何「推翻既有條文」之授權。
2. `accessLabelFor` 之 `受限CRUD` 分支在側欄另有載體（見 AI-2）⇒ F042 `AC-28`⑮ 不受影響。

⚠ 覆核請見 `OQ-D44-15`。

## Dependencies

- **Blocked By**: 無
- **Blocks**: 版面上 US-111／US-112／US-113 接手本區塊之空間，但三者可與本 story 並行開發
- **相關**：`OQ-D44-05`（「最近活動」區塊去留——建議保留不動，與本 story 無關）

## Definition of Done

- [ ] 首頁與 prototype 皆無 `快速進入功能區` 之任何痕跡
- [ ] 側欄與 `FUNCTION_MATRIX` 之回歸斷言全綠**且期望值未經修改**
- [ ] `DashboardHome.test.tsx` 兩處已依 AI-5 處置（降級斷言仍存在）
- [ ] `docs/ui-ux-design-overview.md` 兩處已更新
