---
type: test-design-feature
feature_id: F001
feature_name: 雙軌驗證登入與 Session 管理 — 途徑 B 帳密登入缺口
priority: P0-MVP
related_spec: docs/specs/features/F001-auth-login-session.md
last_updated: 2026-07-22
status: draft
---

# F001 — 雙軌驗證登入與 Session 管理 · Test Design
> source: docs/specs/features/F001-auth-login-session.md · worktree: authfix · 2026-07-22

> **範圍聲明**：F001 途徑 A（Azure AD OIDC）、Session 逾時/登出、SessionGuard 即時把關、`SessionTokenService`
> 簽發/驗證、`accounts/password.ts` 之雜湊/驗證邏輯**均已有既有測試覆蓋**（`account-resolver.spec.ts`、
> `auth-outcome.spec.ts`、`session-token.service.spec.ts`、`session.guard.spec.ts`、
> `typeorm-account.repository.spec.ts`、`password.spec.ts`），**本文件不重新設計**，僅針對
> **途徑 B 帳密登入缺口**（無端點、`AUTH_INVALID_CREDENTIALS` 未實作、`verifyPassword` 未接線）設計測試。
> 與 F003 之交集（建立的帳號能否被此路徑登入）之核心驗收測試置於 [F003-test.md](F003-test.md)，本文件僅涵蓋
> 帳密登入端點本身之行為契約。

## 測試策略
- 本階段自動化＝**unit**：以假 `AccountStore`/`AccountRepository`（比照 `accounts.service.spec.ts`、
  `session.guard.spec.ts` 既有手法）注入 controller/service，不connect 真實 MSSQL，可與其他 worktree 平行跑。
- 需真實 DB（驗證 `TypeOrmAccountStore`/`TypeOrmAccountRepository` 端到端查詢語意、真實 cookie 往返、
  跨端點連續呼叫）者標 **[integration]** → 待本 worktree 整合階段序列化執行（`.env` 指向本 worktree 專用
  dev DB 或獨立起一套 docker），**暫不納入本輪自動化門檻**。
- 因 §帳密登入識別鍵（email 或 loginId）為**阻擋性開放設計問題**（見文末 OQ-F001-B-01），以下場景之 Given/When
  一律以 `{identifier}` 佔位表示登入輸入欄位；待定案後，TDD 開發者僅需替換佔位為實際欄位名稱與比對邏輯，
  場景之 Given/Then 語意不變。
- 迴歸保護：新端點須複用既有 `SessionTokenService.issue()`／`sessionCookieOptions()`，**不得**另建平行的
  token 簽發邏輯，以維持與途徑 A 之 session 生命週期一致（同一 cookie 名稱 `icsop_session`、同一 30 分鐘
  sliding window、同受 `SessionGuard` 把關）。

## Test Scenarios

### TS-F001-001 正確帳密登入成功核發 session [unit]
- **Given**：存在一筆啟用中（`status=active`）之手動帳號（`source=manual`），其 `passwordHash` 為
  `hashPassword('S3cret!')`，`{identifier}` 已知
- **When**：以正確 `{identifier}` ＋ `'S3cret!'` 呼叫帳密登入端點
- **Then**：回應核發 `icsop_session` cookie（httpOnly、與 `sessionCookieOptions()` 一致），內含
  `loginId`／`companyCode`／`roleCode` 正確；不回任何錯誤碼
- **對應 AC**："Given 正確帳密, When 送出登入, Then 核發 JWT 並導向 F002。"
- **錯誤碼**：無

### TS-F001-002 密碼錯誤 → 統一 AUTH_INVALID_CREDENTIALS [unit]
- **Given**：存在啟用中帳號，`{identifier}` 正確
- **When**：以錯誤密碼呼叫帳密登入端點
- **Then**：401、`AUTH_INVALID_CREDENTIALS`；**不**核發 session cookie；記錄失敗事件
- **對應 AC**："Given 錯誤帳密或帳號不存在, When 送出登入, Then 回統一 AUTH_INVALID_CREDENTIALS，記錄失敗。"
- **錯誤碼**：`AUTH_INVALID_CREDENTIALS`（401）

### TS-F001-003 識別鍵查無帳號 → 與密碼錯誤逐字相同之統一回應 [unit]
- **Given**：`{identifier}` 不存在於任何帳號
- **When**：以任意密碼呼叫帳密登入端點
- **Then**：401、`AUTH_INVALID_CREDENTIALS`；回應之 HTTP 狀態碼／錯誤碼／使用者訊息文字須與 TS-F001-002
  **逐字相同**（斷言兩案例 response body 深比對相等，非僅碼相同）
- **對應 AC**："帳密登入帳號不存在：回與密碼錯誤相同之統一訊息。"（Alternative Flows）＋
  "訊息不得洩漏該 email 是否存在於系統或其他可列舉資訊。"
- **錯誤碼**：`AUTH_INVALID_CREDENTIALS`（401）

### TS-F001-004 帳號已停用＋密碼正確 → 仍統一 AUTH_INVALID_CREDENTIALS（不洩漏啟用狀態）[unit]
- **Given**：手動帳號 `status=disabled`，密碼正確
- **When**：呼叫帳密登入端點
- **Then**：401、`AUTH_INVALID_CREDENTIALS`（**非** `AUTH_ACCOUNT_DISABLED`）；回應與 TS-F001-002/003 逐字相同
- **對應 AC**："訊息不得洩漏可列舉資訊，包含...該帳號是否啟用..."（error-handling.md §訊息揭露原則）
- **錯誤碼**：`AUTH_INVALID_CREDENTIALS`（401）
- **備註**：此斷言依現有 spec 文字直接推論而得（見 OQ-F001-B-03，非阻擋但建議定案前於 F001 spec 明文一句
  澄清，避免實作依 `account-resolver.ts` 註解另作他想）

### TS-F001-005 上游帳號（passwordHash=null）嘗試帳密登入 → 統一 AUTH_INVALID_CREDENTIALS [unit]
- **Given**：`source=upstream` 帳號，`passwordHash=null`（依 Account entity 註解，上游嚴禁保存密碼），
  `{identifier}` 命中
- **When**：以任意密碼呼叫帳密登入端點
- **Then**：401、`AUTH_INVALID_CREDENTIALS`；不得因 `passwordHash=null` 拋未捕捉例外或 500
- **對應 AC**：途徑 B Main Flow 隱含（僅手動帳號適用帳密比對）＋不得洩漏可列舉資訊
- **錯誤碼**：`AUTH_INVALID_CREDENTIALS`（401）

### TS-F001-006 必要欄位缺漏 → 400 AUTH_MISSING_FIELD [unit]
- **Given**：`{identifier}` 或密碼任一為空字串／缺漏
- **When**：送出登入請求
- **Then**：400、`AUTH_MISSING_FIELD`；不查詢帳號資料（避免無意義查詢/側錄）
- **對應 AC**：error-handling.md 錯誤碼一覽 `AUTH_MISSING_FIELD`（400，出處 F001）
- **錯誤碼**：`AUTH_MISSING_FIELD`（400）

### TS-F001-007 identifier／password 前後空白之處理一致性 [unit]
- **Given**：帳號建立時 `{identifier}` 與密碼皆無前後空白
- **When**：登入時 `{identifier}` 帶前後空白（如 `' L1 '`）、密碼帶前後空白（如 `' S3cret! '`）分別測試
- **Then**：`{identifier}` 依決議之 normalize 規則（比照 `normalizeEmail()` trim+lowercase，若鍵為 loginId
  則需另定案）應仍可命中；密碼**不 trim**（precise match，含空白視為錯誤密碼）
- **對應 AC**：隱含於"正確帳密"／"錯誤帳密"判定之精確性；防止密碼比對因誤 trim 而降低有效密碼空間
- **錯誤碼**：視情況 `AUTH_INVALID_CREDENTIALS`
- **備註**：識別鍵 normalize 規則待 OQ-F001-B-05 定案，本場景結構先行給出，斷言細節定案後補上

### TS-F001-008 特殊字元／類 SQL 注入字串當識別鍵 → 安全查詢、不 500、統一失敗回應 [integration]
- **Given**：`{identifier}` 為 `' OR '1'='1`、`%`、`_`、`'; DROP TABLE ACCOUNT; --` 等字串
- **When**：呼叫帳密登入端點（走真實 `TypeOrmAccountStore`/等效查詢層，非 mock）
- **Then**：一律視為查無帳號 → 401 `AUTH_INVALID_CREDENTIALS`；**不得** 500、不得產生非預期 SQL 行為
  （比照 error-handling.md #public 之萬用字元跳脫原則，雖出處為 F019，但參數化查詢原則跨模組適用）
- **對應 AC**：NFR 資訊安全（注入防護）＋不得洩漏可列舉資訊
- **錯誤碼**：`AUTH_INVALID_CREDENTIALS`（401）

### TS-F001-009 核發之 session 內容與途徑 A 格式一致 [unit]
- **Given**：正確帳密登入成功
- **When**：解出核發之 session token（`SessionTokenService.verify()`）
- **Then**：`{ loginId, email?, companyCode, roleCode }` 結構與途徑 A 核發者一致（同一 `SessionUser` 型別、
  同一 `issue()` 呼叫），可被既有 `SessionGuard`／`/auth/me` 正確解析
- **對應 AC**："核發 JWT 並導向 F002"（隱含角色資訊嵌於 token，比照途徑 A AC "核發我方有效 JWT 並回傳角色"）
- **錯誤碼**：無

### TS-F001-010 登入失敗留下可稽核痕跡（現況弱化驗證）[unit]
- **Given**：任一失敗情境（TS-F001-002~005 任一）
- **When**：登入失敗
- **Then**：呼叫既有失敗記錄機制（現況為 `console.error`/log，比照 `auth.controller.ts` 現有
  `[ALERT]` 模式；**非** 寫入 `AUDIT_LOG` 資料表——F023 尚未建，見 feature-status.md 跨功能缺口①）
- **對應 AC**："...記錄失敗。"
- **錯誤碼**：無（驗證副作用而非回應）
- **備註**：待 F023 `AUDIT_LOG` 落地後，此場景需升級為驗證真實稽核寫入，屆時另補（非本輪阻擋項）

### TS-F001-011 登入成功後可通過既有 SessionGuard 存取受保護路由 [integration]
- **Given**：帳密登入成功並取得 session cookie
- **When**：攜帶該 cookie 呼叫 `/auth/me`
- **Then**：200、回傳與登入核發時一致之使用者資訊；且該 session 之後續行為（30 分鐘 sliding、停用即時
  失效）與途徑 A 核發者**完全共用同一套 `SessionGuard` 機制**（不得為途徑 B 另建平行 guard 或例外分支）
- **對應 AC**：Session 生命週期不受驗證方式變更影響（F001 §Session 生命週期）
- **錯誤碼**：無

### TS-F001-012 錯誤情境回應時間無明顯側錄差異 [integration / NFR]
- **Given**：分別以「識別鍵不存在」「識別鍵存在但密碼錯誤」「識別鍵存在但帳號停用」三種情境各執行 N 次
- **When**：量測回應時間分布
- **Then**：三者回應時間不應有可觀察之系統性差異，避免以時間側錄推斷帳號是否存在（`verifyPassword` 已用
  `timingSafeEqual`，但「查無帳號」分支若跳過雜湊運算，仍可能造成快慢差異——落地時應對查無帳號分支執行一次
  dummy hash 比對以拉平耗時）
- **對應 AC**：訊息不得洩漏可列舉資訊（延伸至非訊息面之側錄風險，NFR 資訊安全）
- **錯誤碼**：無
- **備註**：觀察性/建議項，非嚴格自動化門檻（時間測試易 flaky），建議以 code review 檢查「查無帳號分支是否
  執行等量雜湊運算」取代嚴格計時斷言；上線前 security review 應覆核

### TS-F001-013 帳密登入端點不干擾同瀏覽器既有之途徑 A session／OIDC 交易 cookie [unit]
- **Given**：瀏覽器已有 `oidc_tx` cookie（途徑 A 進行中）或既有 `icsop_session`
- **When**：呼叫帳密登入端點（無論成功或失敗）
- **Then**：不清除／不覆寫非本次操作對應之 cookie（僅登入成功時依規範核發/覆寫 `icsop_session`）；命名空間
  互不干擾
- **對應 AC**：隱含於雙軌並存定案（"兩種登入為雙軌並存、不互斥"）
- **錯誤碼**：無

---

# F001 跨公司帳密登入解析 delta（AC-C1～AC-C3；2026-08-14）· Test Design

> **範圍**：[F001 spec](../../specs/features/F001-auth-login-session.md) 之「跨公司手動帳號之帳密登入
> 解析 delta」段落，對應 [F003](F003-account-role-management.md) `AC-P5`（公司可跨公司選擇）之漣漪
> `AC-P25`。**這是本裁決最嚴重之連帶效應**——不修訂則於 `AS` 以外公司建立之手動帳號將永遠無法登入，
> 重演本檔既已閉合過一次之「建立→登入死鏈」（見本檔頭 2026-07 之修復狀態）。

## 測試策略
- integration，`backend/test/int/auth.itest.ts` 新增區塊，比照既有 `bootIntApp` 慣例；帳號以
  `AppDataSource.getRepository(Account)` 直接種入（比照 F003 `AC-P10a` 之慣例），走真實
  `POST /auth/login` 端點。
- `AC-C1③`（命中多筆→401）之構造：現況 `SELECTABLE_COMPANIES` 僅 `AS`／`AE` 兩碼，第①段已排除
  `AS`，故第②段殘餘搜尋空間最多僅 1 筆候選，數學上無法以「合法可建立之公司」構造「多筆」情境。改
  種一筆 `companyCode='AD'`（真實存在於組織主檔但被 `F003 AC-P15` 排除於 `SELECTABLE_COMPANIES`
  之公司，模擬合法之歷史/上游資料）＋一筆 `'AE'`。
- `AC-C2`（登入頁不新增公司欄位）為前端關注點，於 `frontend/src/pages/LoginPage.test.tsx` 新增。

## Test Scenarios

### TS-F001-C01 AC-C1① 既有路徑不變：AS 帳號精確命中 [integration，回歸護欄]
沿用既有 `ADMIN_LOGIN`／`ADMIN_PASSWORD` 之 round-trip，證明 stage①（`(DEFAULT_COMPANY_CODE, loginId)`
精確查詢）不受本 delta 影響。

### TS-F001-C02 AC-C1② 跨公司 fallback：AE-only 帳號登入成功 [integration]
AS 無同 `loginId`，第①段未命中，第②段跨公司查詢恰命中 `AE` 一筆 → 登入成功，`SessionUser.companyCode`
為 `AE`（非 `AS`）。**本場景為死鏈修復之直接證據，DoD 強制驗收項。**

### TS-F001-C03 AC-C1（body 明確帶 companyCode）→ 僅精確查詢該公司 [integration]
`loginId` 同時存在於 `AS`／`AE`；明確帶 `companyCode=AE` 應僅比對 `AE` 密碼成功，不進入第②段
之跨公司模糊比對。

### TS-F001-C04 AC-C1③ 命中多筆 → 401，不任選一筆 [integration，⚠ 現況巧合綠燈見 risks-and-gaps G-F003P-08]
`AD`＋`AE` 皆有同 `loginId`（`AS` 無）→ 兩組密碼皆應回 401。

### TS-F001-C05 AC-C3 節流／訊息揭露不變 [integration，⚠ 現況巧合綠燈見 risks-and-gaps G-F003P-08]
跨公司帳號密碼錯誤與「查無此帳號」之回應狀態碼相同，不洩漏區分資訊。

### TS-F001-C06 AC-C2 登入頁不新增公司欄位 [vitest，回歸護欄]
管理員帳密表單現況只有帳號／密碼兩欄；`passwordLogin` 呼叫 payload 不含 `companyCode` 鍵。鎖住現況，
防止未來因跨公司需求而誤加公司選擇器（違反 AC-C2 之明文禁止）。

## AC → TS 覆蓋對照表（本 delta）

| AC-C# | 覆蓋 TS |
|---|---|
| AC-C1 | TS-F001-C01, TS-F001-C02, TS-F001-C03, TS-F001-C04 |
| AC-C2 | TS-F001-C02（登入成功之後果）, TS-F001-C06（表單本身） |
| AC-C3 | TS-F001-C05 |

---

## AC → TS 覆蓋對照表

| F001 Acceptance Criterion（途徑 B／通用揭露原則） | 覆蓋 TS |
|---|---|
| Given 正確帳密, When 送出登入, Then 核發 JWT 並導向 F002。 | TS-F001-001, TS-F001-009 |
| Given 錯誤帳密或帳號不存在, When 送出登入, Then 回統一 AUTH_INVALID_CREDENTIALS，記錄失敗。 | TS-F001-002, TS-F001-003, TS-F001-010 |
| 帳密登入帳號不存在：回與密碼錯誤相同之統一訊息（Alternative Flows）。 | TS-F001-003 |
| Given 任一登入失敗情境, Then 訊息不得洩漏 email 是否存在或其他可列舉資訊。 | TS-F001-002〜005, TS-F001-008, TS-F001-012 |
| Given 帳號建立密碼, When 寫入 DB, Then 以不可逆加鹽雜湊儲存。 | ⚪ 既有覆蓋（`password.spec.ts`），非本次範圍 |
| Session 生命週期（逾時/登出/sliding）不受驗證方式變更影響。 | TS-F001-011（銜接既有 `session.guard.spec.ts`） |
| （NFR）資訊安全：注入防護、側錄防護 | TS-F001-008, TS-F001-012 |
| （隱含）雙軌並存、cookie 命名空間不互相干擾 | TS-F001-013 |
| （隱含）上游帳號不得被帳密路徑誤判可登入 | TS-F001-005 |

## 開放設計問題（阻擋實作前需定案）

### OQ-F001-B-01（🔴 阻擋）帳密登入識別鍵＝email 還是 loginId？
- **現況**：F001 spec 途徑 B Main Flow 僅寫「輸入帳號密碼」，未指定比對欄位；prototype
  `01-login.html` 表單欄位標籤為「帳號」；帳號建立表單／API（`08-account-management.html`、
  `accounts.controller.ts::CreateBody`）**完全未收集 email**；`Account.email` 目前僅由 F004 組織同步／
  `SeedAccountRepository` 寫入，`createManual`/`TypeOrmAccountStore.create` 從未寫入；`Account.email`
  僅有一般 index（`IX_ACCOUNT_email`），**非 UNIQUE 約束**。
- **若選 email**：需（a）帳號建立表單/API 新增 email 輸入與驗證、（b）決定手動帳號 email 唯一性是否強制
  （見 OQ-F003-CLOSE-01）、（c）決定手動帳號 email 網域規則。
- **若選 loginId**：需新增一支「以 `(companyCode, loginId)` 查現行帳號＋密碼雜湊」之登入解析方法（現有
  `AccountRepository.findByEmail` 語意為「同 email 之全部帳號」，不可直接套用；`findCurrentByLogin` 已有
  `(companyCode, loginId)` 查詢但不回 `passwordHash`，需擴充或新介面），與 AD 對應鍵完全分流，語意單純、
  與既有 UI/資料現況零落差。
- **阻擋原因**：本題直接決定 controller payload 欄位名稱、`AccountRepository`（或新介面）之形狀、以及
  `createManual` 是否需要新增輸入欄位；不解決則本文件與 [F003-test.md](F003-test.md) 之 `{identifier}`
  佔位場景無法轉為可執行測試。

### OQ-F001-B-02（🔴 阻擋）帳密登入端點之路徑與傳輸協定？
- `GET /auth/login` 已被途徑 A（OIDC 起點，整頁重導向）佔用，語意上不可能沿用。
- `frontend/src/pages/LoginPage.tsx` 目前完全未接途徑 B（原始碼註解：「途徑 B...後端尚未實作...故略去」），
  無既有前端契約可循；prototype `01-login.html` 之 `doLogin()` 以 JS 攔截 `form onsubmit`（非整頁導向），
  暗示應為 SPA 風格 fetch/JSON API（比照 `/admin/accounts` 之 JSON 慣例），而非仿 `/auth/callback` 之
  整頁 HTML 回應。
- 待決：(a) 路徑命名、(b) 成功回應格式（JSON body + `Set-Cookie` vs 整頁重導向）、(c) 失敗回應格式
  （JSON `{code}` 供前端渲染 `errBanner`，或 HTML 錯誤頁）。
- **阻擋原因**：直接決定 TS-F001-001〜013 之 HTTP 層斷言方式（狀態碼／body 形狀／是否重導向）。

### OQ-F001-B-03（非阻擋，建議定案）帳號已停用時是否確定統一回 AUTH_INVALID_CREDENTIALS？
- 依 error-handling.md 訊息揭露原則字面（禁止洩漏「該帳號是否啟用」）推論為是（TS-F001-004 已依此設計）；
  惟 `account-resolver.ts` 原始碼註解特別區分「此判定發生在 AD 驗證通過之後...非密碼登入路徑」，暗示原作者
  已意識到密碼路徑可能需要不同處理。建議定案時於 F001 spec 之 Alternative Flows／Error Scenarios 明文補一句
  澄清，避免實作者各自判斷分岔。

### OQ-F001-B-04（非阻擋，建議定案）密碼登入節流／暴力破解防護策略？
- error-handling.md「登入失敗鎖定：定案本輪不做（OQ-E01-02）」原針對途徑 A（Azure AD 自身有節流/Conditional
  Access）；密碼路徑是本系統首次直接持有「可線上窮舉之本地密碼比對」攻擊面，風險輪廓不同。建議至少於
  nfr.md 或本 feature spec 明文一句「本輪密碼路徑仍不做節流，已知風險」以留稽核軌跡；不影響本輪 unit 測試
  設計，但應列入上線前 security review 待辦。

### OQ-F001-B-05（非阻擋，建議定案）identifier／password 之 trim／大小寫規則？
- Email 路徑已有 `normalizeEmail()`（trim + lowercase）；若識別鍵最終選 loginId，目前**無**對應 normalize
  函式，需決定登入時是否大小寫敏感、是否 trim。密碼本身建議維持不 trim（業界慣例，避免削弱有效密碼空間），
  但需在 spec 明文以避免各自實作不一致（見 TS-F001-007）。

---

# F001 帳號選擇 delta（AC-M1～AC-M29；2026-08-24）· Test Design

> **範圍**：[F001 spec](../../specs/features/F001-auth-login-session.md#multi-account-picker)
> 「同一 email 命中多帳號 → 帳號選擇」段落。**唯一 oracle**＝該節 `AC-M1`〜`AC-M29`；輔助權威為
> [upstream-hr-source-contract.md §12.2 人類裁決 #2](../../specs/upstream-hr-source-contract.md)。
> **本輪為人類明示之簡化環**：僅 backend jest／frontend vitest 單元測試，不建 Playwright fidelity、
> Stryker mutation、dependency-cruiser 度量閘門（`e2e/` 完全不動）。本批**無對應 prototype**
> （`prototypes/01-login.html` 不含選擇畫面，`[OPEN-M5]`）——丙節之 AC 即為選擇畫面之唯一 oracle。
>
> **blind 界定**（本 delta 為既有程式碼之 delta，純粹 blind 不可行）：可讀既有 `*.spec.ts`／
> `*.test.tsx`、型別/interface 宣告、模組路徑與既有 export 名稱；不得讀 `backend/src/auth/`、
> `frontend/src/auth/`、`frontend/src/pages/LoginPage.tsx` 之**實作內文**（函式主體/控制流）。
> 本檔涉及之新介面（`multi-account-picker.ts`／`selection-ticket.ts`／`candidate-payload.ts`／
> `AuthController` 新方法／`SelectAccountPage.tsx`／`endpoints.ts` 新函式）**皆尚不存在**，其型別
> 契約由本檔（測試檔頭之 JSDoc）**定義**，非窺視既有實作決定——這是 TDD 紅燈的正常型態，
> 詳見各測試檔頭之「契約」段落。

## 新介面之權威定義

本 delta 新增下列尚不存在之模組/方法/元件，其**唯一權威定義**在對應測試檔案頭之 JSDoc「契約」區塊
（非本文件重複轉錄，以免兩處漂移）：

| 模組 | 契約定義於 | 承載之 AC |
|---|---|---|
| `backend/src/auth/multi-account-picker.ts`（`CandidateAccount`／`MultiAccountDecision`／`namesConsistent`／`sortCandidates`／`decideMultiAccountLogin`） | `multi-account-picker.spec.ts` 檔頭 | AC-M1, M2, M4～M9, M16(部分), M28 |
| 同檔追加：`planCallbackResponse`（`/auth/callback` 回應規劃，決策層與 HTTP 邊界解耦之設計理由見檔頭） | `multi-account-callback-plan.spec.ts` 檔頭 | AC-M2(規劃), M3, M8, M16(部分), M26(部分) |
| `backend/src/auth/selection-ticket.ts`（`SelectionTicketService`／`SELECTION_TICKET_COOKIE`／`SELECTION_TICKET_TTL_SECONDS`） | `selection-ticket.spec.ts` 檔頭 | AC-M10, M19, M20, M22, M23, M29 |
| `backend/src/auth/candidate-payload.ts`（`buildCandidatePayload`／`DisplayResolvers`） | `candidate-payload.spec.ts` 檔頭 | AC-M12, M14, M15 |
| `AuthController` 新建構子第 4 參數（`SelectionTicketService`）＋新方法 `getSelectAccount`／`postSelectAccount` | `auth.controller.select-account.spec.ts` 檔頭 | AC-M11, M17～M24, M26, M27 |
| `frontend/src/api/types.ts` 新增 `SelectAccountCandidate`／`SelectAccountResponse`；`endpoints.ts` 新增 `getSelectAccountCandidates`／`selectAccount` | `endpoints.select-account.test.ts` | 契約層（供上述 AC 之前端消費） |
| `frontend/src/pages/SelectAccountPage.tsx`（新頁面，畫面文案為 test-generator 依最小揭露原則之合理預設，非 AC 逐字規定，見檔頭） | `SelectAccountPage.test.tsx` 檔頭 | AC-M12～M17, M26 |
| `frontend/src/App.tsx` 之 `AppRoutes()` 未登入分支新增路由 `/login/select-account` | `app-routes.select-account.test.tsx` | `[ASSUMPTION]`（前端路由） |

**設計決策（測試作者裁量，記錄以供 tdd-implementation 與後續維護者理解，非 AC 逐字規定）**：
1. 兌換時以既有 `AccountRepository.findCurrentByLogin(companyCode, loginId)` 重查現行狀態，
   刻意**不**新增 `AccountRepository` 介面方法——選擇票證之候選集合改為自帶
   `{accountId, companyCode, loginId}`（而非純 opaque id），使兌換與時效/一次性/防重放全部
   在 `selection-ticket.ts`／`AuthController` 兩層完成，零新增 repository 表面。
2. `SelectionTicketService` 之到期判斷**不得**依賴 `jsonwebtoken`（`JwtService.verify()`）內建
   `exp`（其綁定真實系統時鐘，注入之假時鐘 `now()` 對它不生效）；改以 payload 內嵌 `issuedAt`
   （由注入之 `now()` 產生）＋`now() - issuedAt` 之自訂比較——與既有 `LoginThrottleService` 之
   注入時鐘哲學一致。此點已於檔頭 JSDoc 明確要求，供 tdd-implementation 遵循。
3. `/auth/callback` 之既有 OIDC 完整成功交換路徑，本輪**未**以真實/偽造 MSAL 回應驅動端到端測試
   （理由與風險見下方 risks-and-gaps）；改以 `planCallbackResponse()` 之純函式規劃層驗證
   AC-M2／M3／M8 之決策正確性，HTTP 邊界（`res.redirect`／`res.cookie` 之實際呼叫）不在本輪
   自動化驗證範圍——此為明確記錄之 gap，非靜默跳過。

## 測試策略
- 全數為 unit/component 層（jest／vitest），無 integration、無 Playwright。
- 純邏輯決策（候選集合、姓名一致性、排序、票證簽發/驗證/消耗、payload 投影）以 fixture 直接驅動，
  不經 HTTP／Nest DI 容器——比照既有 `account-resolver.spec.ts`／`auth-outcome.spec.ts`。
- `AuthController` 新方法以既有 spec 慣例（`new AuthController(repo, tokens, svc, tickets)` 直接
  實例化，不經 `Test.createTestingModule`）驅動，比照 `auth.controller.logout.spec.ts`。
- 前端以 `vi.mock('../api/endpoints')`／`vi.mock('../auth/useAuth')`＋`@testing-library/react`，
  比照 `LoginPage.test.tsx`／`useAuth.test.tsx`。
- **驗證方法論**：本批全部測試已以「拋棄式驗證 stub」（實作最小可行版本、確認全數轉綠、刪除 stub）
  逐檔驗證過斷言之內部一致性（非只驗證匯入失敗即紅），過程中修正 2 處測試自身之 fixture 錯誤
  （`AC-M4` 排序期望值算錯字典序、`AC-M14` 全域禁字掃描誤把合法之 `orgCode:null` 原始欄位一併
  掃入）。stub 檔案與對 `auth.controller.ts`／`App.tsx`／`types.ts`／`endpoints.ts` 之暫時性修改
  均已完整還原（`git checkout`／`rm`），交付時repo 僅新增測試檔本身。

## Test Scenarios（依 AC 分組，非逐案枚舉；完整案例見對應 `*.spec.ts`/`*.test.tsx` 之 `it()` 描述）

### 甲節：候選集合之判定
- **AC-M1**：`multi-account-picker.spec.ts`——email 比對規則（大小寫不分／網域逐字／不 fallback）
  之回歸鎖，與既有 `classifyAccountByEmail` 同源 fixture。
- **AC-M2**：`multi-account-picker.spec.ts`——N=0（NotFound/Disabled）／N=1（SingleActive）／N≥2
  （RequiresSelection）三分支；`multi-account-callback-plan.spec.ts`——四種決策映射為
  `CallbackPlan` 之規劃正確性。
- **AC-M4**：候選排序之決定性（companyCode→loginId 雙鍵升冪、重跑穩定）。
- **AC-M5**：候選集合封閉於該 email（不因姓名/部門相同誤收其他 email 之帳號）。
- **AC-M6 🔒**：僅 active 進入選單；停用帳號之任何欄位（含 roleCode）不得外洩於候選集合序列化結果。

### 乙節：安全前置條件
- **AC-M7 🔒**：姓名一致判準之 fail-closed 邊界——trim-only 等價、內部空白/全形半形差異/一字之差
  一律判不一致（不做正規化）。⚠ **case 大小寫之處理留白**，見下方 risks-and-gaps。
- **AC-M8 🔒**：姓名不一致 → `AmbiguousIdentity`／`planCallbackResponse` 映射為既有
  `AUTH_ACCOUNT_NOT_FOUND`（不新增碼）＋`warnLog`（email／`(companyCode,loginId)`清單／相異姓名
  組數，不含姓名本身或密碼相關欄位）。
- **AC-M9 🔒**：已停用帳號之姓名差異不參與姓名一致判定（不誤觸 AC-M8）。
- **AC-M10 🔒**：票證綁定 email＋候選集合全集＋簽發/到期時間，受簽章保護（竄改/偽造金鑰皆拒絕）。
- **AC-M11 🔒**：持票證不持 session → 既有 `SessionGuard` 因僅認 `SESSION_COOKIE` 而自然拒絕
  （401 `AUTH_SESSION_EXPIRED`），且不觸發 `findCurrentByLogin`（未被當成已登入身分處理）。

### 丙節：選擇畫面之可觀察內容
- **AC-M12**：`candidate-payload.spec.ts`（後端 payload 投影，8 欄封閉集，防禁欄外洩）＋
  `SelectAccountPage.test.tsx`／`endpoints.select-account.test.ts`（前端渲染與端點契約）。
- **AC-M13**：`SelectAccountPage.test.tsx`——四項必顯欄位、姓名頁面層僅顯示一次。
- **AC-M14**：`candidate-payload.spec.ts`——公司/部門/角色/員工編號逐欄缺值規則；前端對應驗證
  em dash 渲染。
- **AC-M15**：`candidate-payload.spec.ts`＋`SelectAccountPage.test.tsx`——重複組合仍以 loginId
  可辨識。
- **AC-M16**：`multi-account-picker.spec.ts`（資料層：候選物件不含預選欄位）＋
  `SelectAccountPage.test.tsx`（UI 層：無預選、確認鈕停用直到明確選取）。
- **AC-M17**：`auth.controller.select-account.spec.ts`（後端 401）＋`SelectAccountPage.test.tsx`
  （前端導回登入頁、不顯示任何帳號資料）。

### 丁節：兌換、時效與錯誤情境
- **AC-M18**：`auth.controller.select-account.spec.ts`——核發 session／同回應清票證 cookie／
  roleCode 取兌換當下現行值。
- **AC-M19 🔒**：`selection-ticket.spec.ts`（純邏輯：299s 有效/301s 逾期/非 sliding）＋
  `auth.controller.select-account.spec.ts`（HTTP 層再驗）。
- **AC-M20 🔒**：`selection-ticket.spec.ts`（竄改/缺漏/不可解析）＋
  `auth.controller.select-account.spec.ts`（不得回退重查候選，`findByEmail` 零呼叫）。
- **AC-M21 🔒**：`auth.controller.select-account.spec.ts`——三種來源（他人帳號／簽發後新建／
  隨機值）皆拒絕，且未查詢集合外之帳號現行狀態。
- **AC-M22 🔒**：`selection-ticket.spec.ts`（票證層：不同 email 之 payload 互不干擾）＋
  `auth.controller.select-account.spec.ts`（HTTP 層：跨票證重放）。
- **AC-M23 🔒**：`selection-ticket.spec.ts`＋`auth.controller.select-account.spec.ts`——
  一次性消耗對 GET／POST 皆生效。
- **AC-M24 🔒**：`auth.controller.select-account.spec.ts`——簽發後停用 → `AUTH_ACCOUNT_DISABLED`，
  且未查詢集合中其他候選（不得自動改選）。
- **AC-M25**：⬜ **未建測試**，見下方 risks-and-gaps（無「切換帳號」端點本身即為此 AC 之消極滿足，
  無正面可觀察行為可鎖）。
- **AC-M26 🔒**：`multi-account-callback-plan.spec.ts`（規劃層封閉集）＋
  `auth.controller.select-account.spec.ts`（HTTP 錯誤內容）＋`SelectAccountPage.test.tsx`
  （畫面不顯示 accountId）。

### 戊節：零漣漪回歸鎖
- **AC-M27**：`multi-account-regression.spec.ts`（節流門檻/視窗、session TTL 常數）＋
  `auth.controller.select-account.spec.ts`（建構子擴充不影響既有 `logout()`）。
- **AC-M28**：`multi-account-regression.spec.ts`——既有 email 比對四條以 `classifyAccountByEmail`
  重跑。
- **AC-M29 🔒**：`multi-account-regression.spec.ts`（`AUDIT_LOG` entity／migrations 目錄靜態掃描，
  無新欄位/新 migration）＋`selection-ticket.spec.ts`（原始碼掃描：無 TypeORM/DataSource 依賴）。

## AC → 測試檔對照表（本 delta）

| AC | 測試檔 |
|---|---|
| AC-M1, M28 | `multi-account-picker.spec.ts`, `multi-account-regression.spec.ts` |
| AC-M2 | `multi-account-picker.spec.ts`, `multi-account-callback-plan.spec.ts` |
| AC-M3 | `multi-account-callback-plan.spec.ts` |
| AC-M4, M5, M6, M9, M16(資料層) | `multi-account-picker.spec.ts` |
| AC-M7 | `multi-account-picker.spec.ts` |
| AC-M8 | `multi-account-picker.spec.ts`, `multi-account-callback-plan.spec.ts` |
| AC-M10 | `selection-ticket.spec.ts` |
| AC-M11 | `auth.controller.select-account.spec.ts` |
| AC-M12 | `candidate-payload.spec.ts`, `endpoints.select-account.test.ts`, `SelectAccountPage.test.tsx` |
| AC-M13, M15(UI), M16(UI) | `SelectAccountPage.test.tsx` |
| AC-M14, M15(資料) | `candidate-payload.spec.ts` |
| AC-M17 | `auth.controller.select-account.spec.ts`, `SelectAccountPage.test.tsx` |
| AC-M18, M21, M22(HTTP), M23(HTTP), M24 | `auth.controller.select-account.spec.ts` |
| AC-M19, M20, M22(票證), M23(票證) | `selection-ticket.spec.ts`, `auth.controller.select-account.spec.ts` |
| AC-M25 | ⬜ 未建測試（見 risks-and-gaps） |
| AC-M26 | `multi-account-callback-plan.spec.ts`, `auth.controller.select-account.spec.ts`, `SelectAccountPage.test.tsx` |
| AC-M27 | `multi-account-regression.spec.ts`, `auth.controller.select-account.spec.ts` |
| AC-M29 | `multi-account-regression.spec.ts`, `selection-ticket.spec.ts` |
| `[ASSUMPTION]` 前端路由 | `app-routes.select-account.test.tsx` |

**覆蓋完成度**：29 條 AC 中 28 條有直接可執行測試；`AC-M25` 為唯一缺口（見 risks-and-gaps，非自行發明斷言）。
