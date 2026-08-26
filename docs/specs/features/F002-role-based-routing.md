# F002: 登入後角色分流導向
Priority: P0-MVP | Status: Draft | Last Updated: 2026-08-16
Epic/Story: E01 / US-003

> **🔵 2026-08-16 additive delta（使用者裁決；缺失／變更 delta 第 1／10 項）——後台返回首頁之手段與麵包屑導覽**：① 後台新增三種回到首頁（`/admin`）之手段（側欄「首頁」項＋側欄 logo 可點＋麵包屑首段可點）；② `PageHeader` 之麵包屑由純文字改為**可點導覽**（型別 `string[]` → `{ label, to? }[]`，末段恆不可點）。**本 delta 之 AC 編號採 `AC-D#`**（D＝2026-08-16 defect delta）。
> ⚠ **「首頁」不新增 [F025](F025-role-function-matrix.md) 功能矩陣列**（OQ-D18-20 裁決）——它不是受控功能，凡能進後台者皆可回首頁；此為本檔 Main Flow 步驟 4「僅顯示該角色有權限的功能選單」之**明文例外**（AC-D1）。
> 🔴 **2026-08-16 就地修正（system-architect 查證後）**：`OQ-D18-20` 之三種手段中，第 (c) 項「麵包屑首段可點回 `/admin`」**在 14 個後台頁中僅 1 頁（`DashboardHome`）有載體**——其餘 13 頁之麵包屑首段為其自身功能名。⇒ **回首頁之手段收斂為兩種**（側欄「首頁」項＋側欄 logo，`AC-D1`／`AC-D2`）；**麵包屑之「有作用」改依其正確語意定義為「各段連往其自身目標」**（`AC-D3`），此即使用者第 10 項需求之原意。Postconditions「後台任一畫面皆存在至少一個可回到 `/admin` 之互動元件」**仍然成立**。
> ⚠ **麵包屑型別變更為破壞性改動，波及全部使用 `PageHeader` 之後台頁（約 14 處呼叫端）**，須整批遷移（AC-D7）。

## Description
登入成功後依角色自動導向：一般使用者直接進前台瀏覽頁；其餘四種管理類角色先顯示「瀏覽頁 / 管理後台」選擇畫面，進後台時僅顯示該角色有權限的功能選單（**「首頁」項除外，見 Main Flow 步驟 4 之例外**）。後台任一畫面皆須提供可回到後台首頁（`/admin`，儀表板）之手段，且麵包屑各段（末段除外）為可點之導覽連結。

## Preconditions
- 使用者已完成 F001 登入，JWT/session 內含有效角色資訊。
- 角色×功能矩陣（F025）已定義。

## Main Flow
1. 讀取 JWT/session 中的角色。
2. 角色為 `User` → 直接導向前台瀏覽頁（F019），不顯示選擇畫面。
3. 角色為 `SysAdmin/ICSOPAdmin/Supervisor/DeptContact` → 顯示「瀏覽頁 / 管理後台」選擇畫面。
4. 選擇管理後台 → 後台載入，僅顯示依 F025 有權限的功能選單。<br>**例外（2026-08-16 使用者裁決，OQ-D18-20）**：側欄最上方之「首頁」項**不對映任何 F025 功能鍵、不經角色過濾**，凡能進入後台之四種管理類角色一律顯示（AC-D1）。此為本步驟之**唯一**例外，不得推廣至其他選單項。
5. 選擇瀏覽頁 → 導向前台，套用該使用者部門置頂邏輯（F019）。
6. 後台任一子頁面 → 使用者可經下列**兩種**手段之任一回到後台首頁 `/admin`：**側欄「首頁」項**（AC-D1）、**側欄 logo 區**（AC-D2）。<br>📝 **2026-08-16 就地改寫（system-architect 查證後之事實更正）**：原條文為「經下列**三種**手段之任一回到後台首頁：側欄「首頁」項、側欄 logo 區、**麵包屑首段**（AC-D1～AC-D3）」。查證現況：**13 個後台子頁之麵包屑首段為其自身功能名**（`ICSOP 文件管理`／`循環管理`／…），**僅 `DashboardHome` 一頁之首段為 `ICSOP 管理後台`** ⇒「麵包屑首段可點回首頁」在 13/14 頁**無載體**。<br>🔴 **不得**以「所有頁之 breadcrumb 前面補一段 `ICSOP 管理後台`」達成——那會使各頁麵包屑之可見文字改變，**直接違反本檔 `AC-D7`**「各頁麵包屑之可見文字逐字與改動前相同」。
7. 後台任一子頁面之麵包屑 → 各段（末段除外）為**連往其自身目標**之連結（如編輯頁之 `ICSOP 文件管理` → `/admin/documents`），此即使用者所述「麵包屑應該要有作用」之語意（AC-D3、AC-D6）。

## Alternative Flows
- 管理類角色選「瀏覽頁」：以自身身分/部門呈現前台（非模擬他人）。
- **已位於後台首頁時使用返回手段**：三種手段皆導向 `/admin`，重複導向同一路由不產生錯誤、不重複推入瀏覽歷程（AC-D4）。

## Edge Cases
- JWT 角色資訊遺失/無效：導回登入頁並提示重新登入。
- 麵包屑僅有一段（該頁無上層）：該唯一段即為末段，**不可點**（AC-D6）。
- 呼叫端未提供某段之 `to`：該段渲染為不可點純文字（AC-D6）。

## Postconditions
- 使用者位於與其角色一致的入口畫面，後台選單僅含有權限項目（**「首頁」項除外**）。
- 後台任一畫面皆存在至少一個可回到 `/admin` 之互動元件。

## Acceptance Criteria
- Given 角色為一般使用者且登入成功, When 登入完成, Then 直接導向前台瀏覽頁，不顯示選擇畫面。
  <br>🔴 **2026-08-26 缺陷修復（本條原未兌現）**：實作原對 `roleCode==='User'` 渲染一張「前往前台
  瀏覽」單卡（移植自 `prototypes/02-role-landing.html` 之 `#userDirect` 區塊）——那是一個**只有一個
  選項的選擇畫面**，與本條「不顯示選擇畫面」直接牴觸，且該頁副標自己就寫著「一般使用者將直接進入
  前台」卻沒有直接進去。真人回報「很多餘」後改為 `<Navigate to="/public" replace />`。
  判定條件採 `visibleMenu(roleCode).length === 0`（**與 `AdminGuard` 同一式**，不比對 `roleCode`
  字面），涵蓋 [F041](F041-user-subtype-business-scope.md) 業務子分類；兩邊各寫一套會在日後調整
  [F025](F025-role-function-matrix.md) 矩陣時產生「分流頁放行、後台守衛擋掉」之死鏈。
  prototype 之 `#userDirect` 區塊已就地標註為**不得移植**。
- Given 角色為管理類之一且登入成功, When 登入完成, Then 顯示「瀏覽頁/管理後台」選擇畫面。
- Given 管理類角色選擇管理後台, When 後台載入, Then 僅顯示 F025 有權限的功能選單。
- Given JWT 角色遺失或無效, When 導向判定, Then 導回登入頁並提示重新登入。

### 後台返回首頁與麵包屑導覽 delta（🔵 2026-08-16 使用者裁決；缺失／變更 delta 第 1／10 項） {#home-breadcrumb-delta}

> 前提裁決：**OQ-D18-20**＝三種手段皆做，且「首頁」不新增 F025 矩陣列；**OQ-D18-21**＝末段不可點、其餘各段可點，`breadcrumb` 型別改為 `{ label, to? }[]`。

- **AC-D1**（側欄「首頁」項）：Given 任一管理類角色（SysAdmin／ICSOPAdmin／Supervisor／DeptContact）已進入後台, When 渲染側欄選單, Then **第一項**為 `首頁`（icon 鍵 `layout-dashboard`、route `/admin`），位於既有 `帳號管理` 之上；四種角色**皆顯示該項**（不因 F025 過濾而隱藏）；When 點擊該項, Then 導向 `/admin` 並渲染後台首頁（儀表板）。
- **AC-D2**（側欄 logo 可點）：Given 後台任一頁面, When 點擊側欄 logo 區, Then 導向 `/admin`；該元件為可鍵盤聚焦之互動元素（`<a>` 或 `role="link"`，非純 `<div>`），並具無障礙名稱 `回到後台首頁`。
- **AC-D3**（麵包屑各段連往其自身目標；**2026-08-16 就地改寫，同日經 ui-ux-designer 查證後二次修正**）：Given 後台某子頁面之麵包屑首段為**功能名**（如文件編輯頁之 `ICSOP 文件管理` › `編輯`）, When 點擊該**非末段**之功能名, Then 導向**該段自身之目標** `/admin/documents`（＝該功能之清單頁），**非** `/admin`。
  - ⚠ **本條不主張「所有後台頁之麵包屑首段皆可點」**——首段是否可點，取決於它是否為一個**可導向之目的地**（見下表 B 類）。可點與否一律由 `AC-D6` ②③ 之通則決定：有 `to` 且非末段 → 可點；無 `to` 或為末段 → 純文字。
  - 🔴 **`to` 之給定規則（2026-08-16 三次修正；判準統一化）**：某段之 `to` **僅在「該段之目標路由 ≠ 當前頁之路由」時給定**；**目標等於當前路由者一律不給 `to`**（＝自我連結，點了停在原地、對使用者無作用），依 `AC-D6` ③ 渲染為純文字。此判準與下方 B 類 `ICSOP 管理後台` 所用者**為同一條**，本表僅提供「功能名 → 目標路由」之查表，**可點與否由本規則導出、不由本表直接宣告**。
  - **A 類｜首段為功能名之目標路由（＝ `MENU` 中同名項之 `route`）**：

    | 首段（逐字） | 目標路由 | 出現於（prototype／路由） | 該頁是否可點 |
    |---|---|---|---|
    | `帳號管理` | `/admin/accounts` | `08`＝`/admin/accounts` | ❌ **自我連結，不可點** |
    | `組織人員異動管理` | `/admin/org-sync` | `09`＝`/admin/org-sync` | ❌ **自我連結，不可點** |
    | `循環管理` | `/admin/lifecycles` | `10`＝`/admin/lifecycles` | ❌ **自我連結，不可點** |
    | `循環管理` | `/admin/lifecycles` | `11`＝`/admin/lifecycles/:lifecycleId/canvas`；`12`（節點抽屜，prototype-only） | ✅ 可點 |
    | `ICSOP 文件管理` | `/admin/documents` | `13`＝`/admin/documents` | ❌ **自我連結，不可點** |
    | `ICSOP 文件管理` | `/admin/documents` | `14`＝`/admin/documents/new`；`15`＝`/admin/documents/:id/edit`；`16`＝`/admin/documents/:id` | ✅ 可點 |
    | `使用表單管理` | `/admin/usage-forms` | `19`＝`/admin/usage-forms` | ❌ **自我連結，不可點** |
    | `附錄管理` | `/admin/appendices` | `24`＝`/admin/appendices` | ❌ **自我連結，不可點** |
    | `系統參數設定` | `/admin/settings` | `18`＝`/admin/settings`（`PermissionMatrixPage`） | ❌ **自我連結，不可點** |

    📝 **2026-08-16 三次修正（lead 指出 `帳號管理` 一列違反本檔自身判準，spec-writer 覆核後發現為系統性而非單列）**：本表首版僅列「功能名 → route」而未區分「該段是否指向當前頁」，致 **7 個頁面（`08`／`09`／`10`／`13`／`18`／`19`／`24`）之首段被標為可點，但其目標即該頁自身** ⇒ 點下去無任何變化，與使用者第 10 項訴求「麵包屑應該要有作用」直接牴觸。已改以上述統一判準表述。<br>✅ **仍可點者為 5 個子頁**（`11`／`12`／`14`／`15`／`16`），其首段指向真正的上層清單頁——**此即本 delta 對第 10 項訴求之實質交付**（如編輯頁 `ICSOP 文件管理` › `編輯`，點首段回到 `/admin/documents`）。<br>⚠ **本修正之影響面為 7 頁而非 1 頁**，實作與約束環皆需連帶調整（移除該 7 頁首段之 `to`）。

  - **B 類｜首段為「分類標籤」，`to` 缺省 ⇒ 依 `AC-D6` ③ 恆為不可點之純文字（此為正確行為，非缺陷、非待實作）**：

    | 首段（逐字） | 出現於 | 為何無 `to` |
    |---|---|---|
    | `ICSOP 管理後台` | `07`（後台首頁 `DashboardHome`） | 該頁**即** `/admin` 本身 ⇒ 依上述「目標＝當前路由則不給 `to`」之判準（與 A 類 7 頁同一條）；且其第二段 `首頁` 為末段亦不可點 ⇒ **該頁麵包屑兩段皆不可點** |
    | `稽核與調閱歷程` | `17` | 系統中**不存在**名為「稽核與調閱歷程」之頁面（`文件調閱歷程` 是其下之功能，且於本頁為**末段**⇒ 依 `AC-D6` ① 不可點） |
    | `AI 智慧問答` | `21` | 同上（`文件索引管理` 於本頁為**末段**） |
    | `稽核追溯` | `23` | 同上（`文件變更歷程` 於本頁為**末段**） |

  - 📝 **`文件索引管理`／`文件調閱歷程`／`文件變更歷程` 三個功能名，於現行 16 個後台頁中皆未以「非末段」形式出現**，故目前**無可點載體**；若日後新增其子頁使之成為非末段，其 `to` 依 A 類通則分別為 `/admin/doc-index`／`/admin/access-history`／`/admin/change-history`。
  - 📝 **2026-08-16 二次修正（ui-ux-designer 查證）**：本條首版曾稱後台首頁「該頁麵包屑**僅此一段**」——**該事實描述為假**：`prototypes/07-admin-shell.html:49` 與 `frontend/src/pages/DashboardHome.tsx` 皆為**兩段**（`ICSOP 管理後台` › `首頁`）。渲染結果雖同為全不可點（首段無 `to`、次段為末段），但**斷言前提不存在**，照抄會建出無載體之測試，故就地更正。同時補列 B 類四頁——原表僅列 A 類功能名，B 類以「表中缺漏」之形式存在，易被下游誤判為待實作之缺口。
  - 📝 **2026-08-16 首次改寫之理由（保留）**：原條文為「Given 後台**任一**子頁面之麵包屑首段為 `ICSOP 管理後台`, When 點擊該段, Then 導向 `/admin`」——查證現況，16 個後台頁中**僅 `07` 一頁**之首段為 `ICSOP 管理後台`，該斷言於其餘 15 頁無可驗證之對象。使用者第 10 項需求「麵包屑應該要有作用」之正確語意為「**各段連往其自身目標**」，非「回首頁」；回首頁之手段改由 `AC-D1`／`AC-D2` 兩者承擔（Postconditions「至少一個」仍成立，B 類四頁亦然）。
  - 🔴 **明文禁止之解法**：不得為湊出「首段一律可點回首頁」而於各頁 breadcrumb 前補一段 `ICSOP 管理後台`——該作法改變各頁可見文字，違反 `AC-D7`。
- **AC-D4**（重複導向不出錯）：Given 目前已位於 `/admin`, When 依序觸發 `AC-D1`／`AC-D2` 之任一回首頁手段, Then 頁面維持於 `/admin`、不顯示錯誤、不產生額外瀏覽歷程項（`navigate(..., { replace: true })` 或等效）。同理，Given 目前已位於 `/admin/documents`, When 於該頁點擊麵包屑之 `ICSOP 文件管理` 段（若該頁該段非末段）, Then 行為相同。
- **AC-D5**（🔒 F025 矩陣回歸鎖定）：Given 本 delta 實作完成, When 逐格取 `FUNCTION_MATRIX` 之值, Then 其**功能鍵集合與 5 種角色 × 全部功能列之逐格值，與本 delta 導入前完全相同**——**未新增「首頁」列**；[F025](F025-role-function-matrix.md) 之全部既有測試維持綠燈且期望值未經修改。側欄「首頁」項之 `MenuItem` **不得**帶 `functionKey`，`visibleMenu()` 亦不得對其套用 `canPerform`。
- **AC-D6**（麵包屑型別與可點規則）：Given `PageHeader` 之 `breadcrumb` prop 型別為 `{ label: string; to?: string }[]`, When 渲染, Then ① **最末段一律渲染為不可點之 `<span>`**（縱使該段提供 `to` 亦忽略）；② 非末段且提供 `to` 者渲染為可點連結（`<a href>` 或 router `<Link>`），點擊後導向該 `to`；③ 非末段但未提供 `to` 者渲染為不可點之 `<span>`；④ 段與段之間之分隔圖示（`chevron-right`）數量與位置不變。
- **AC-D7**（呼叫端整批遷移）：Given 全部使用 `PageHeader` 之後台頁, When 型別改動完成, Then **不存在任何仍以 `string[]` 傳入 `breadcrumb` 之呼叫端**（TypeScript 編譯 `tsc` exit 0 即為此條之機器驗證）；且各頁麵包屑之**可見文字逐字與改動前相同**（僅新增連結行為，不改文案）。

## Error Scenarios
- 前端隱藏選單不可作為唯一防線：導向邏輯須前端路由＋後端 API 權限雙重把關（見 [error-handling.md#permission](../error-handling.md#permission)）。

## Related
- Data: [ROLE](../data-model.md#role-entity), [ACCOUNT](../data-model.md#account-entity)
- Depends on: [F001](F001-auth-login-session.md), [F025 角色×功能矩陣](F025-role-function-matrix.md)
- Next: [F019 前台清單](F019-public-list-browsing.md)
- **2026-08-16 使用者裁決**: OQ-D18-20（返回首頁之手段、不新增矩陣列；**手段數於同日經 system-architect 查證後由三收斂為二**，見 `AC-D3` 之改寫註）、OQ-D18-21（麵包屑可點規則與型別）。編輯頁之「返回」鈕另立於 [F011](F011-edit-with-comparison.md) `AC-D1`。
- **待 system-architect（本 delta 新增）**：`breadcrumb` 型別遷移之落點與相容策略（一次性 breaking change vs 過渡期 union 型別）；本規格要求最終狀態為單一 `{ label, to? }[]`、不保留 `string[]` 相容路徑。
