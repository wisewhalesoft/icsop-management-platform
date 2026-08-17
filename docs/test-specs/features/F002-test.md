---
type: test-design-feature
feature_id: F002
feature_name: 登入後角色分流導向（本檔僅涵蓋 2026-08-16 導覽 delta）
priority: P0-MVP
related_spec: docs/specs/features/F002-role-based-routing.md#home-breadcrumb-delta
last_updated: 2026-08-16
status: draft
---

# F002 — 後台返回首頁與麵包屑導覽 delta · Test Design（Lane L1）

> source: `docs/specs/features/F002-role-based-routing.md` `AC-D1`～`AC-D7`
> ＋ `docs/specs/architecture-spec.md` §10.8（決策 A8）＋ `prototypes/07-admin-shell.html`
> 缺失／變更 delta 第 1 項（返回首頁之手段）與第 10 項（麵包屑可點，半）· 2026-08-16 · lane L1
>
> ⚠ 本檔**只涵蓋 `AC-D#` 批次**；F002 之既有 AC（角色分流、選擇畫面）不在本輪範圍，其既有測試維持不動。

## 測試策略

| 層 | 手段 | 檔案 |
|---|---|---|
| 元件（純渲染規則） | vitest ＋ Testing Library，`PageHeader` 單獨渲染（inline fallback 分支即足夠——本批 AC 不涉及 topbar 位置） | `frontend/src/components/PageHeader.breadcrumb.test.tsx` |
| 元件（外殼與導覽） | vitest，`AppShell` ＋ `MemoryRouter` ＋ `useLocation`／`useNavigationType` 探針 | `frontend/src/components/AppShell.home.test.tsx` |
| 領域（矩陣回歸鎖定） | vitest 純函式 | `frontend/src/domain/menu.home.test.ts` |
| **原始碼靜態掃描** | vitest ＋ `node:fs`，掃 `frontend/src/pages/*.tsx` 之 `breadcrumb={[...]}` 字面 | `frontend/src/components/PageHeader.callers.test.tsx` |

> **🔵 2026-08-16 三次修正之連帶更新**：`AC-D3` 已由「A 類功能名皆可點」改為**統一判準**
> ——「`to` 僅在『該段目標路由 ≠ 當前頁路由』時給定」。掃描器隨之改寫為**編碼規則**
> （以 `(目標路由, 該頁自身路由)` 推導期望值）而非抄寫可點清單，故日後新增子頁只需補一列資料。
> 影響：原本 11 頁「須有 `to`」變成 **4 頁須有、7 頁不得有**（`08`／`09`／`10`／`13`／`18`／`19`／`24`
> 為自我連結）。新增 `TS-D10-015` 直接把判準本身釘成一條通則防護。

### 🔴 為何需要「原始碼靜態掃描」這一層

`AC-D3` 的驗收對象是**15 個呼叫端各自傳入的 `to`**，而那 15 頁之元件測試檔**分屬其他分線**
（檔案所有權硬邊界，本線不得改動）。同時 `tsc --noEmit` 只能證明「沒有人還在傳 `string[]`」
（`AC-D7` 之機器載體），**證明不了 `to` 指到正確的路由**——`to: '/admin'` 與
`to: '/admin/documents'` 同樣可編譯。掃描呼叫端字面是本線唯一能把 A 類／B 類逐頁釘死的手段。
此形式已有 repo 既有先例：`components/Icon.registry.test.tsx`（掃描 src 之字面圖示名）。
掃描器附**自我檢測**（`TS-D10-010`：15 個呼叫端皆須找得到 breadcrumb 字面），避免掃描器
失靈時「全綠但什麼都沒驗」。

## AC ↔ 約束對照

| AC | 約束 | 檔案 · ID |
|---|---|---|
| `AC-D1` 側欄「首頁」為第一項、四角色皆顯示、route `/admin`、icon `layout-dashboard` | 四角色參數化 ＋ DOM 順序 ＋ icon class | `AppShell.home` TS-D1-001～004 |
| `AC-D2` 側欄 logo 可點、可鍵盤聚焦、無障礙名稱 `回到後台首頁` | `getByRole('link', {name:'回到後台首頁'})` ＋ href | `AppShell.home` TS-D1-005/006 |
| `AC-D3` 統一判準｜**子頁**（目標路由 ≠ 當前路由）之首段必須連回其清單頁 | **4 頁**（`DagCanvasPage`／`DocumentCreatePage`／`DocumentEditPage`／`DocumentReadonlyPage`）逐頁掃描比對 | `PageHeader.callers` TS-D10-012 |
| `AC-D3` 統一判準｜**自我連結**（目標＝當前路由）與**分類標籤**（無目標）一律不得有 `to` | **11 頁**逐頁掃描比對（7 頁自我連結 ＋ 4 頁 B 類；`DashboardHome` 由同一條規則導出） | `PageHeader.callers` TS-D10-013 |
| `AC-D3` **統一判準本身**（通則防護） | 任一呼叫端之首段 `to` 皆不得等於該頁自身路由——**直接編碼規則、非逐頁列舉**，日後新增頁面自動生效 | `PageHeader.callers` TS-D10-015 |
| `AC-D3` 明文禁止之解法（各頁補一段 `ICSOP 管理後台`） | 除 `DashboardHome` 外 14 頁首段皆不得為 `ICSOP 管理後台` | `PageHeader.callers` TS-D10-014 |
| `AC-D4` 重複導向不出錯、不推入歷程 | `useNavigationType() !== 'PUSH'` ＋ 無 `role="alert"` | `AppShell.home` TS-D1-007/008 |
| `AC-D5` 🔒 F025 矩陣未新增「首頁」列 | 13 個功能鍵不變、`MENU` 每項皆有 `functionKey`、`visibleMenu` 五角色皆不回傳首頁 | `menu.home` TS-D1-010～013 |
| `AC-D6` ① 末段恆不可點（縱有 `to`） | `queryByRole('link')` 為 null ＋ `tagName === 'SPAN'` | `PageHeader.breadcrumb` TS-D10-001 |
| `AC-D6` ② 非末段有 `to` → 可點且導向該 `to` | href 斷言 ＋ 點擊後 location | TS-D10-002/003 |
| `AC-D6` ③ 非末段無 `to` → 純文字 | `tagName === 'SPAN'` | TS-D10-004 |
| `AC-D6` ④ `chevron-right` 數量／位置不變 | 段數 − 1；單段時為 0 | TS-D10-005/006 |
| `AC-D7` 不存在 `string[]` 呼叫端 | ① `tsc --noEmit` exit 0（規格指定之機器載體）② 掃描器：每段皆為物件字面、移除物件後不得殘留引號 | `PageHeader.callers` TS-D10-011 |
| `AC-D7` 可見文字逐字不變 | 15 頁首段 label 逐字比對（A 類 11 ＋ B 類 4） | TS-D10-012/013 |

## 測試資料

- 角色：`SysAdmin`／`ICSOPAdmin`／`Supervisor`／`DeptContact`（`User` 不進後台，不在本批 AC 範圍）。
- **`DeptContact` 為 `AC-D1` 之關鍵案例**：它只有 1 個功能選單項，若「首頁」被誤套 `canPerform` 會直接消失。

## 🔴 本環涵蓋不到

| # | 涵蓋不到者 | 為何 | 把關手段 |
|---|---|---|---|
| 1 | `AC-D7`「可見文字逐字與改動前相同」之**完整**保證 | 「改動前」之各頁完整 label 序列未入規格（`AC-D3` 只給首段），無權威可比對 | 本環只鎖首段逐字；完整序列以 `tsc` ＋ 人工 diff（PR review）把關 |
| 2 | 麵包屑之實際**視覺位置**（topbar 而非 inline） | §10.15 第 16 項：`PageHeader` 未包在 `AppShell` 內時走 inline fallback 分支 | 瀏覽器煙霧：任開一後台子頁，確認麵包屑在頂欄左側、非內容區 |
| 3 | 15 個呼叫端**執行時**是否真的把 `to` 傳進 `PageHeader` | 掃描的是原始碼字面，非執行結果 | 瀏覽器煙霧：逐頁點麵包屑首段，確認落在該功能清單頁 |
