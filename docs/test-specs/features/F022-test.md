---
type: test-design-feature
feature_id: F022
feature_name: 後台開啟前台瀏覽頁
priority: P2
related_spec: docs/specs/features/F022-backend-launch-public.md
last_updated: 2026-07-23
status: draft
---

# F022 — 後台開啟前台瀏覽頁 · Test Design
> source: docs/specs/features/F022-backend-launch-public.md · worktree: public（feature/public-F019-F022）· 2026-07-23

## 範圍聲明

涵蓋後台「瀏覽文件網頁」入口以**新視窗/分頁**開啟前台、後台原分頁不受影響、前台以操作者自身身分呈現（含置頂排序重用 F019）、彈窗被封鎖之替代提示。**不含**：前台頁本身內容正確性（F019/F020，另檔）。

### 現況契約落差（本 feature 之核心待辦，非設計假設）

`frontend/src/components/AppShell.tsx` 第 90-101 行「瀏覽文件網頁」入口目前為 `react-router-dom` 之 `<Link to="/public">`：

```tsx
<Link to="/public" title="瀏覽文件網頁" ...>
```

此為 **SPA 內同分頁導覽**（React Router client-side navigation），與 F022 AC「新視窗開啟前台頁，後台分頁維持原狀」直接矛盾——目前點擊會**離開 `/admin` 路由、後台狀態（如清單頁篩選/捲動位置）不會維持**，因為兩者共用同一個瀏覽器分頁與同一個 React tree。F022 之落地必為**將此 `<Link>` 改為 `window.open()`／`<a target="_blank">` 型態之新分頁開啟**，本設計之測試場景即針對此轉換後之目標行為設計。

另需注意：`frontend/src/pages/RoleLanding.tsx` 第 64、74 行**同樣有 `<Link to="/public">`**，但那是 F002「登入後前台/後台選擇卡」之**初次導覽選擇**（非「已在後台中途開啟前台預覽」），語意與 F022 不同，**不屬本 feature 範圍、不應被本次修改觸及**——本設計明確排除，避免 tdd-developer 誤將兩處一併改為新視窗開啟（`RoleLanding` 之同分頁導覽行為為正確設計，非缺陷）。

## 測試策略（unit＝`window.open` spy＋現有 F019 排序函式重用驗證；真瀏覽器分頁行為＝[integration]）

- **[unit] 新視窗觸發**：以 `vi.spyOn(window, 'open')`（或等效）驗證點擊入口時呼叫 `window.open(url, '_blank', ...)`，且**未**觸發 React Router `navigate()`/`history.push()`（即目前分頁之路由狀態不受影響，比照 RTL 慣例以 `MemoryRouter` 斷言路由未變化）。
- **[unit] 彈窗被封鎖偵測**：`window.open()` 依瀏覽器行為，被封鎖時多數瀏覽器回傳 `null`（而非拋出例外）；以 mock `window.open` 回傳 `null` 驗證元件偵測後渲染替代提示。
- **[unit] 身分/排序重用**：F022 之「依管理者自身部門置頂排序」**重用 F019 之排序純函式**（`splitAndSort(items, userOrgCode)`，見 F019-test.md TS-001～005），非另建邏輯——本設計僅驗證「以管理者角色呼叫 F019 之排序管線時，輸入之 `userOrgCode` 正確取自管理者自身帳號，而非其他值」，不重複設計排序演算法本身之測試（避免與 F019-test.md 重複）。
- **[unit] Cookie-based session 免加值傳遞驗證**：既有 session 為 httpOnly cookie（`backend/src/auth/session.guard.ts` 第 37 行讀取 `req.cookies`），同源新分頁自動攜帶 cookie，**不需額外傳遞 token**；驗證開啟之 URL 為相對路徑（如 `/public`）而非夾帶 `?token=...` 等敏感資訊於網址（呼應 [NFR-002](../../specs/nfr.md#security) AC2「token 不經網址傳遞」原則，雖然該 AC 原意為 OIDC 流程，本設計視為同一原則之延伸應用）。
- **[integration]**：真實瀏覽器多分頁環境下之彈窗封鎖行為（不同瀏覽器/設定之封鎖策略差異）、新分頁確實共用同一 session cookie 而成功載入前台（非重新導向登入頁）、後台原分頁之捲動位置/表單暫存狀態於新分頁開啟後確實原封不動。

## Test Scenarios

### A. 新視窗開啟（取代現行 `<Link>` 同分頁行為）

#### TS-F022-001 已登入後台使用者點擊「瀏覽文件網頁」→ 呼叫 `window.open` 開新分頁 [unit]
- Given：已登入且位於 `/admin` 任一頁面
- When：點擊側邊選單「瀏覽文件網頁」
- Then：`window.open` 被呼叫一次，第二參數為 `'_blank'`（或等效新分頁語意），第一參數為前台路由（如 `/public`）
- 對應 AC / 錯誤碼：AC「後台已登入，點擊入口，新視窗開啟前台頁」

#### TS-F022-002 點擊入口後，後台當前路由/分頁狀態不變 [unit]
- Given：後台目前位於 `/admin/documents` 且已套用某篩選（元件內部 state）
- When：點擊「瀏覽文件網頁」
- Then：目前分頁之路由仍為 `/admin/documents`（未觸發 `navigate()`），元件內部 state（如篩選條件）不因此次點擊被卸載/重置
- 對應 AC / 錯誤碼：AC「後台已登入，點擊入口，新視窗開啟前台頁，後台分頁維持原狀」

#### TS-F022-003 開啟之 URL 不夾帶 token／敏感參數於網址 [unit]
- Given：同 TS-001
- When：檢查 `window.open()` 之第一參數
- Then：為乾淨相對路徑（如 `/public`），不含 `?token=`/`?session=` 等查詢字串
- 對應 AC / 錯誤碼：架構延伸（cookie-based session 免加值傳遞，見測試策略）

### B. 彈窗被封鎖 fallback

#### TS-F022-004 `window.open()` 被瀏覽器封鎖（回傳 null）→ 顯示替代提示 [unit]
- Given：mock `window.open` 回傳 `null`
- When：點擊「瀏覽文件網頁」
- Then：渲染替代提示訊息（如「請允許彈出視窗」），不靜默失敗、不拋出未捕捉例外
- 對應 AC / 錯誤碼：AC「瀏覽器封鎖彈出視窗，開啟失敗，提供替代提示」

#### TS-F022-005 替代提示之另一策略：改同分頁開新分頁（見 OQ-F022-01） [unit，條件式]
- Given：同上被封鎖情境；若 fallback 策略採「改同分頁開啟」而非純提示訊息
- When：偵測封鎖後
- Then：改以當前分頁導覽至 `/public`（此時後台分頁狀態**必然**不再維持，與 TS-002 之保證互斥，需明確標示此為 fallback 分支之取捨）
- 對應 AC / 錯誤碼：Alternative Flows「瀏覽器封鎖彈出視窗，提供替代提示（如『請允許彈出視窗』或改同分頁開新分頁）」——spec 原文並列兩種候選方案，需定案，見 OQ-F022-01

### C. 身分呈現與置頂排序（重用 F019）

#### TS-F022-006 管理角色開啟前台頁 → 依管理者自身部門置頂排序（非模擬他人） [unit]
- Given：登入角色為 Supervisor，`orgCode=JAC00`
- When：前台頁載入（沿用 F022-test.md 呼叫 F019 之 `splitAndSort`）
- Then：傳入排序函式之 `userOrgCode` 為該 Supervisor 自身之 `orgCode`（`JAC00`），非任意其他值；置頂結果比照 F019-test.md TS-001 邏輯
- 對應 AC / 錯誤碼：AC「管理角色開啟前台頁，前台載入，依管理者自身部門置頂排序（非模擬他人）」

#### TS-F022-007 管理者無明確使用部門 → 排序退回純編號降冪 [unit]
- Given：管理者帳號 `orgCode=null`（如手動建立帳號未綁定組織）
- When：前台頁載入
- Then**：排序**行為等同 F019-test.md TS-003（無相符情境），純編號降冪，不因「管理者」身分而有特殊處理或錯誤
- 對應 AC / 錯誤碼：Edge Case「管理者無明確使用部門，前台排序退回純編號降冪（比照 F019 無相符情境）」

#### TS-F022-008 一般使用者（User）不具備此入口（無後台存取） [unit]
- Given：登入角色為 User
- When：檢查是否顯示「瀏覽文件網頁」入口／後台側邊選單
- Then：User 角色無任何後台功能權限（`visibleMenu(user?.roleCode).length === 0`，`frontend/src/App.tsx` 第 52-59 行 `AdminGuard` 邏輯），根本不進入 `/admin`（登入後直達前台，F002 既有行為），故本入口對 User 而言**不適用、非「被拒絕」而是「情境不存在」**
- 對應 AC / 錯誤碼：Preconditions「具後台存取權角色（SysAdmin/ICSOPAdmin/Supervisor/DeptContact）」隱含排除 User

### D. 真實瀏覽器分頁行為（[integration]）

#### TS-F022-009 真實瀏覽器：新分頁成功載入前台且共用 session（不需重新登入） [integration]
- Given：真實瀏覽器，已於後台分頁登入
- When：點擊入口開啟新分頁
- Then：新分頁直接顯示前台清單（非導向登入頁），確認 cookie 跨分頁同源共用生效
- 對應 AC / 錯誤碼：Preconditions「已登入」＋ AC 整體流程之真實前提

#### TS-F022-010 真實瀏覽器：後台分頁之捲動位置/暫存表單狀態於新分頁開啟後原封不動 [integration]
- Given：後台文件清單頁已捲動至特定位置、篩選欄位已輸入未送出之草稿值
- When：開新分頁瀏覽前台
- Then：切回後台分頁時，捲動位置與草稿輸入值皆維持（因新分頁開啟不涉及原分頁任何重新渲染）
- 對應 AC / 錯誤碼：AC「後台分頁維持原狀」之最嚴格版本驗證

#### TS-F022-011 不同瀏覽器彈窗封鎖預設值差異 [integration]
- Given：Chrome/Edge/Firefox/Safari（[NFR-005](../../specs/nfr.md#browser-rwd) AC1 涵蓋瀏覽器範圍）之預設彈窗封鎖行為
- When：於各瀏覽器預設設定下點擊入口
- Then：記錄各瀏覽器之預設行為差異（部分瀏覽器對使用者主動點擊觸發之 `window.open` 預設不封鎖），確認 fallback 提示至少於「已知會封鎖」情境下正確觸發
- 對應 AC / 錯誤碼：Alternative Flows「瀏覽器封鎖彈出視窗」之跨瀏覽器現實差異

## AC → TS 覆蓋對照表

| AC/來源 | 內容摘要 | 對應 TS |
|---|---|---|
| AC1 | 點擊入口，新視窗開啟前台頁，後台分頁維持原狀 | TS-001, TS-002, TS-009, TS-010 |
| AC2 | 管理角色開啟前台頁，依管理者自身部門置頂排序（非模擬他人） | TS-006 |
| AC3 | 瀏覽器封鎖彈出視窗，提供替代提示 | TS-004, TS-005, TS-011 |
| Edge：管理者無明確使用部門 | 排序退回純編號降冪 | TS-007 |
| 架構延伸（cookie session） | URL 不夾帶敏感參數 | TS-003 |
| Preconditions（角色範圍） | User 無此入口 | TS-008 |

## 開放設計問題

- **OQ-F022-01**：Alternative Flows 原文「瀏覽器封鎖彈出視窗：提供替代提示（如『請允許彈出視窗』或改同分頁開新分頁）」並列兩種候選方案，語意上二擇一（純提示 vs 直接降級為同分頁導覽），**兩者對「後台分頁維持原狀」之保證有本質差異**（後者在封鎖情境下會犧牲此保證）。需 product owner/architect 定案採用何者，或是否分階段（先提示「請允許」，使用者忽略/再次觸發才降級同分頁）。此決定直接影響 TS-005 是否應存在及其期望行為。

- **OQ-F022-02**：`window.open()` 之確切呼叫參數（是否指定 `noopener`/`noreferrer`、視窗尺寸 `features` 字串）未定案。基於安全最佳實務（新開分頁若未來需要與原分頁互動則不應設 `noopener`，但若無互動需求則應設以避免 `window.opener` 反向存取風險），建議 architect 於實作前明定，避免產生「新分頁可透過 `window.opener` 操作後台分頁」之非預期耦合。本設計之 TS-001 僅驗證「有呼叫 `window.open`」，不對此類安全性參數細節做強斷言，待定案後補充。

- **OQ-F022-03**：`RoleLanding.tsx`（F002）與 `AppShell.tsx`（F022）兩處皆連結至 `/public`，但語意/行為要求不同（前者同分頁初次導覽、後者後台中途新分頁預覽）已於範圍聲明說明；**建議** tdd-developer 在程式碼層面以清楚的命名/註解區分兩處用途（例如避免未來重構時誤將兩者合併為同一元件而抹平語意差異），本身非測試場景但為實作階段之重要提醒，記錄於此供跨階段交接。

- **OQ-F022-04**：F022 為 P2（Phase 2），依 `feature-status.md` 現況與 worktree guide 排序（F019→F020→F021→F022），若後續交付順序調整導致 F022 先於 F019 排序邏輯定案前開工，TS-006/007 所依賴之 F019 `splitAndSort` 純函式介面可能尚不存在——**本設計假設 F019 已先完成**，若實際開發順序不同，F022 之身分/排序相關測試需延後至 F019 介面穩定後才可執行，屬跨檔依賴排程風險，非設計缺陷。
