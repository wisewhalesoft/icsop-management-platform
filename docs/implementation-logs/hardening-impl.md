---
type: implementation-log
worktree: hardening (feature/hardening)
covers: [F020, F001]
test_design: docs/specs/test-design/hardening-test-design.md
status: complete
last_updated: 2026-07-24
---

# hardening — 實作日誌（F020 燒錄計時驗證 + F001 登入節流 + 登入頁預填排查）

嚴格 TDD（先寫失敗測試→看紅→實作到綠）。三個 disjoint 小項，完全不觸碰 sibling track
（lifecycle-changelog／orgsync-alerts）之檔案，亦不碰任何 burner 程式碼（Item 1 純驗證）。

## 測試結果總表

### Item 1 — F020 燒錄 <3 秒計時（int-only，`test/int/watermark-burn-timing.itest.ts`）

| 案例 | 說明 | 狀態 | 本機實測 |
|---|---|---|---|
| TS-HD-WM-001 | 暖機後 10 頁 A4 CJK 燒錄 → 有效 PDF 且耗時 < 8000ms 迴歸警戒線 | PASS | 燒錄 ≈ **248.9ms** |
| TS-HD-WM-002 | 冷啟動（字型快取重置）首次燒錄 → 仍有效且 < 8000ms | PASS | 燒錄 ≈ **131.2ms** |

> 本機兩者皆 ≪ 3000ms NFR 目標（8000ms 為 tripwire、非 SLA；單次無併發樣本，非負載合規證明）。
> 執行方式：`npx jest --config test/jest-int.json watermark-burn-timing`（僅此單檔，未跑整包 `test:int`）。

### Item 2 — F001 登入節流（unit）

`LoginThrottleService` 純邏輯（`src/auth/login-throttle.spec.ts`）：

| 案例 | 說明 | 狀態 |
|---|---|---|
| TS-HD-THR-001 | 全新 key → 未封鎖 | PASS |
| TS-HD-THR-002 | 4<5 → 未封鎖 | PASS |
| TS-HD-THR-003 | 5>=5 → 封鎖 | PASS |
| TS-HD-THR-004 | 已封鎖後續 recordFailure → 仍封鎖、不拋、狀態不異常 | PASS |
| TS-HD-THR-005 | 視窗過期（邊界含）→ 自動解封 | PASS |
| TS-HD-THR-006 | 過期後首次失敗 → 新視窗起點（不延續舊計數） | PASS |
| TS-HD-THR-007 | 顯式 reset → 立即解封＋底層計數歸零 | PASS |
| TS-HD-THR-008 | 不同 key 互不干擾 | PASS |
| TS-HD-THR-009 | 同實例承載 IP 軸（20）／loginId 軸（5）互不污染 | PASS |

`PasswordLoginService` 節流整合（`src/auth/password-login.service.spec.ts` 擴充）：

| 案例 | 說明 | 狀態 |
|---|---|---|
| TS-HD-SVC-001 | 連 5 次錯 → 各 401；第 6 次 → 429（body 形狀精確） | PASS |
| TS-HD-SVC-002 | 達門檻後不查詢帳號（節流先於 DB） | PASS |
| TS-HD-SVC-003 | loginId 達門檻後即使密碼正確仍 429 | PASS |
| TS-HD-SVC-004 | 不存在帳號封鎖回應與真實帳號逐字相同（不洩漏存在性） | PASS |
| TS-HD-SVC-005 | 4 次失敗後 1 次成功 → loginId 節流計數重置 | PASS |
| TS-HD-SVC-006 | 成功登入本身不計節流（連 10 次成功皆放行） | PASS |
| TS-HD-SVC-007 | IP 軸獨立：多 loginId 各未達自身門檻但同 IP 累積達門檻 → 429 | PASS |
| TS-HD-SVC-008 | 欄位缺漏不計任何節流 | PASS |
| TS-HD-SVC-009 | IP 已達門檻時欄位缺漏 → 優先 429（非 400） | PASS |
| TS-HD-SVC-010 | clientIp 空字串 → 以空字串為合法 key 正常計數、第 6 次仍 429 | PASS |

Controller 邊界（`src/auth/auth.controller.password-login.spec.ts` 擴充）：

| 案例 | 說明 | 狀態 |
|---|---|---|
| TS-HD-CTRL-001 | 第 6 次 → getResponse() 深比對等於 `{statusCode:429, message:'AUTH_TOO_MANY_ATTEMPTS', error:'Too Many Requests'}`（非裸字串） | PASS |
| TS-HD-CTRL-002 | 429 情境不設定任何 cookie | PASS |
| TS-HD-CTRL-003 | controller 將 `req.ip` 作第二參數傳遞給 service | PASS |

前端（`frontend/src/pages/LoginPage.test.tsx` 擴充）：

| 案例 | 說明 | 狀態 |
|---|---|---|
| 429 訊息 | `AUTH_TOO_MANY_ATTEMPTS` → 顯示「登入嘗試次數過多，請稍後再試」，不刷新 session | PASS |

### Item 3 — 登入頁 `admin@cdmp.test` 預填排查 → **NO-OP（已排查、非缺陷）**

- `frontend/src/pages/LoginPage.tsx:29-30` 為 `useState('')`／`useState('')`，初始值皆空字串，非 `admin@cdmp.test`。
- 全 repo（含 worktree）ripgrep 搜尋字面 `admin@cdmp.test`：**零筆命中**。
- 結論：瀏覽器密碼管理員之 autofill（依 `localhost:5173` origin 建議他專案已存憑證），非 ICSOP 程式碼缺陷。
- 依測試設計 §3 與任務指示：**不新增任何測試、不改任何程式碼**。此項為「已檢查」而非「略過」。

## 測試計數（DoD）

| 套件 | Baseline | 本輪後 | 增量 |
|---|---|---|---|
| backend `npx jest` | 1131 / 96 suites | **1153 / 97 suites** | +22 tests（THR 9＋SVC 10＋CTRL 3）、+1 suite（login-throttle.spec） |
| frontend `npx vitest run` | 390 / 35 files | **391 / 35 files** | +1 test（429 訊息，無新檔） |
| backend `npx tsc --noEmit` | clean | **clean** | — |
| frontend `npx tsc --noEmit` | clean | **clean** | — |

> 註：`tsconfig.json` 之 `include:["src/**/*"]` 不涵蓋 `test/int/**`，故 `tsc --noEmit` 不會 typecheck itest。
> 已另以 throwaway tsconfig（`extends` + `include:["src/**/*","test/**/*"]`）驗證 `watermark-burn-timing.itest.ts` typecheck 通過（EXIT 0）。
> 首度並行跑「backend 全套件（scrypt 重、439s）＋frontend vitest」時 frontend 因 CPU 競爭出現
> `Timeout waiting for worker to respond`（worker-pool 假紅、非測試失敗）；backend 結束後單獨重跑 frontend → 35 files / 391 綠。
> Icon.registry.test.tsx：本輪前端僅改一個純函式 switch case、未新增任何 `<Icon>`，故 icon registry 不受影響（已隨全套件通過）。

## 變更檔案

| 檔案 | 類型 | 說明 |
|---|---|---|
| `backend/src/auth/login-throttle.ts` | new | `LoginThrottleService`（單機記憶體固定時窗計數器）＋門檻常數＋`tooManyAttemptsException()`＋`AUTH_TOO_MANY_ATTEMPTS` |
| `backend/src/auth/login-throttle.spec.ts` | new | TS-HD-THR-001〜009 純邏輯（注入假時鐘） |
| `backend/src/auth/password-login.service.ts` | modified | `login(input, clientIp)` 新增節流接線（§2.3 順序）；建構子注入 `LoginThrottleService` |
| `backend/src/auth/password-login.service.spec.ts` | modified | 既有呼叫補 `clientIp`；`make()` 建 throttle；新增 TS-HD-SVC-001〜010 |
| `backend/src/auth/auth.controller.ts` | modified | `passwordLogin` 新增 `@Req() req`，以 `req.ip ?? ''` 傳入 service |
| `backend/src/auth/auth.controller.password-login.spec.ts` | modified | 新增 `fakeReq(ip)`；`makeController` 建 throttle＋回傳 svc；既有呼叫補 req；新增 TS-HD-CTRL-001〜003 |
| `backend/src/auth/auth.module.ts` | modified | 新增 `LoginThrottleService` provider（useFactory 零參數）並注入 `PasswordLoginService` |
| `backend/src/auth/account-login-closure.spec.ts` | modified | `new PasswordLoginService(...)` 補 throttle；`login()` 呼叫補 clientIp（配套修改，非新增案例） |
| `backend/test/int/watermark-burn-timing.itest.ts` | new | TS-HD-WM-001/002 真實燒錄計時（**未動任何 burner 程式碼**） |
| `frontend/src/pages/LoginPage.tsx` | modified | `loginErrorMessage` 新增 `AUTH_TOO_MANY_ATTEMPTS` case（僅純函式 switch） |
| `frontend/src/pages/LoginPage.test.tsx` | modified | 新增 429 訊息案例 |
| `docs/specs/features/F001-auth-login-session.md` | modified | 僅 Status 行＋實作狀態 ③ 節流句更新（允許範圍） |
| `docs/specs/features/F020-watermark.md` | modified | 僅 Status 行更新（允許範圍） |

## 架構決策（皆在 spec 邊界內）

- **節流採單機 process 記憶體固定時窗計數器**（非 `@nestjs/throttler`、非 Redis）：沿用 architecture-spec「單機部署、不引入 Redis」原則（sp_getapplock／JWKS 快取同哲學）；零新 npm 相依、零新 migration、零新 DB 表。時鐘可注入以做確定性 unit 測試（比照 `WatermarkService.clock`）。
- **雙軸獨立節流**：`ip:${clientIp}`（門檻 20）與 `login:${companyCode}:${loginId}`（門檻 5）以具名 key namespace 共用同一計數器，任一達門檻即整體 429。IP 軸較寬鬆以容忍共用 NAT 之多位合法使用者；loginId 軸較嚴以擋定向猜測。
- **`recordFailure(key, limit)` 計數封頂於 limit**：使 `limit` 參數具實際語意（避免持續 hammering 使計數無界成長），封頂後 `isBlocked` 維持 true。門檻／視窗以具名常數表示，日後調整數值不影響案例結構。
- **429 body 形狀（關鍵）**：Nest 無 `TooManyRequestsException` shortcut。刻意以「物件形狀」`new HttpException({statusCode:429, message:'AUTH_TOO_MANY_ATTEMPTS', error:'Too Many Requests'}, 429)` 拋出，避免裸字串 body 破壞 `frontend/src/api/client.ts` 之 `extractError()`（讀 `body.message`）。CTRL-001／SVC-001/004 以 `getResponse()` 深比對鎖定此形狀。
- **非揭露一致性**：loginId 軸對真實與不存在帳號計數完全相同（SVC-004 深比對兩路徑第 6 次 body 逐字相等），延續現況 `resolvePasswordLogin` 拒絕分支之統一語意，防止以節流探測帳號存在性。
- **成功登入處置**：成功不計任何節流，且**僅重置 loginId 軸、不重置共享 IP 軸**（避免以「登入一個會成功的帳號」清空同 IP 下他人失敗記錄而繞過 IP 節流）。
- **檢查順序**：IP 軸檢查先於欄位驗證（惡意來源儘早廉價擋下）；欄位缺漏不計任何節流；loginId 軸達門檻即拒（即使本次密碼正確亦不驗證，標準節流語意）。

## OQ-E01-02 vs OQ-F001-B-04 調和（避免被誤讀為衝突）

- `OQ-E01-02` 定案「登入失敗**鎖定**本輪不做」，語意為**持久性帳號鎖定**（需人工解鎖／長時間凍結），且其脈絡係針對**途徑 A**（Azure AD 自帶 Conditional Access／節流）。
- 本輪落地者為**完全不同機制**：時窗制（60 秒）自動重置之**請求節流**（HTTP 429），**無任何持久化**（無新表、無 `ACCOUNT` 欄位變更）、視窗一到自動恢復、**不需任何人工解鎖**。
- `OQ-F001-B-04` 明文「密碼路徑是本系統首次直接持有『可線上窮舉之本地密碼比對』攻擊面」——本設計即該待辦之落地，**與 `OQ-E01-02` 定案不衝突，而是關閉 `OQ-F001-B-04`**。

## ⚠ 部署待辦（必要、非本輪範圍）— `main.ts` `trust proxy`

`backend/src/main.ts` 現況**未設定** `app.set('trust proxy', ...)`。IP 軸節流在**直接連線**（dev、supertest in-process）下 `req.ip` 正確；但**若正式部署於 nginx 反向代理之後**（architecture-spec 之同源反代拓撲），未設 `trust proxy` 時 `req.ip` 將恆為反代自身位址，使**所有**使用者共用同一個 IP 節流額度（20/60s），可能導致正式環境下多位合法使用者集體被誤擋。

- 本輪**刻意不修** `main.ts`：需真實反代拓撲決定信任的 proxy 跳數（`trust proxy` 設過寬會讓攻擊者偽造 `X-Forwarded-For` 繞過 IP 軸），且有部署層影響，不在本 track 允許觸碰之表面。
- **強烈建議列入後續任務追蹤**，不應被本 track 之「Item 2 已完成」狀態掩蓋。controller 已就地加註此風險註解。

## 給 orchestrator：`error-handling.md`（凍結文件）需集中補列之內容

本 track 不逕自修改凍結之 `docs/specs/error-handling.md`；以下為建議補入內容：

1. **錯誤碼一覽新增一列**：

   | 錯誤碼 | HTTP | 使用者訊息（示意） | 出處 |
   |---|---|---|---|
   | `AUTH_TOO_MANY_ATTEMPTS` | 429 | 登入嘗試次數過多，請稍後再試 | F001（途徑 B 帳密登入節流，OQ-F001-B-04） |

2. **文件開頭 HTTP 狀態碼慣例句補「429」**：現況列舉「400 輸入驗證/格式錯誤、401 驗證失敗、403 授權不足、404 找不到、409 衝突(...)、5xx 系統錯誤」——**未含 429**。建議在 409 與 5xx 之間追加：「**429 請求過於頻繁（節流）**、」。

3. **（供人類裁決，見測試設計 §5）** 節流門檻具體數值（loginId 5／IP 20／視窗 60s）與 `OQ-F001-B-04` 是否標記為已收斂，需資安政策／PM 簽核；本 track 之 unit 測試以具名常數表示門檻，調整數值不影響案例結構。
