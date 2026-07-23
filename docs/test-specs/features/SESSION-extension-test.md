# SESSION-extension · Test Design
> worktree: org-foundation · 2026-07-22
> source: backend/src/auth/session-token.service.ts、session.guard.ts、account-repository.ts、account-resolver.ts、typeorm-account.repository.ts、password-login.service.ts、auth.controller.ts、docs/specs/features/F019-public-list-browsing.md、F020-watermark.md

## 範圍聲明（沿用/擴充之既有 org-sync 元件，不重設其既有測試）

- **擴充**：`SessionUser`／JWT claims 新增 `orgCode`／`name`／`employeeNo`（`ACCOUNT` 表已有這些欄位，本次僅需串接進 session 層），供 F019「置頂依使用者部門」與 F020「身分快照」使用。
- **沿用既有骨架，不重寫**：`SessionTokenService.issue()/verify()` 之簽發/驗證機制（JWT 簽章、過期判定）、`SessionGuard` 之「JWT 驗證→DB 現行帳號覆寫→sliding 刷新」兩層把關流程本身**不變**，僅擴充其攜帶/刷新之欄位範圍。
- **既有測試不重設**：`session-token.service.spec.ts`／`session.guard.spec.ts` 現有 7 個情境（有效放行、無 cookie、過期、偽造簽章、DB 停用、DB 查無、角色即時生效）之**邏輯**不變；惟其測試 fixture（`user: SessionUser`、`FakeRepo` 之 `AccountRepository` 實作）於介面擴充後**必須同步更新型別**才能編譯通過——此為破壞性變更之已知影響範圍，詳列於 OQ-SESSION-2，不在本檔重新設計這 7 個既有情境本身。
- 本檔範圍涵蓋：claims 擴充本身、`SessionGuard` 每請求刷新之欄位涵蓋範圍（**核心未定案項**，見 OQ-SESSION-1）、`AccountRepository` 介面擴充（3 個查詢方法）、途徑 A（OIDC callback）與途徑 B（帳密登入）兩處 `SessionUser` 建構呼叫點之對應調整。

## 測試策略（unit＝假 upstream reader/假 store；真上游/DB 同步＝[integration] 序列化）

- **unit**：假 `JwtService`（比照既有 `new JwtService({ secret: '...' })` 直接建構真實套件但無外部 IO 之慣例，非額外 mock）＋假 `AccountRepository`（比照 `session.guard.spec.ts` 之 `FakeRepo` 慣例，擴充其回傳型別）。
- **[integration]**：真實登入（途徑 A／B）後 `/auth/me` 回傳內容與 `ACCOUNT` 表現況比對；序列化執行（與其餘 org-foundation `[integration]` 情境共用同一序列化窗口，因皆觸及同一 `ACCOUNT` 表）。

## Test Scenarios

### TS-SESSION-001 issue()：SessionUser 含 orgCode/name/employeeNo → JWT claims 正確帶入 [unit]
- **Given** `SessionUser = { loginId, email, companyCode, roleCode, orgCode: 'JAC00', name: '王小明', employeeNo: 'E12345' }`
- **When** 呼叫 `SessionTokenService.issue(user)`
- **Then** 產出之 JWT 經解碼後 payload 含 `orgCode`/`name`/`employeeNo` 三個新 claim，值與輸入相符

### TS-SESSION-002 verify()：正確還原 orgCode/name/employeeNo [unit]
- **Given** 由 TS-SESSION-001 產出之 token
- **When** 呼叫 `verify(token)`
- **Then** 回傳之 `SessionUser` 含正確之 `orgCode`/`name`/`employeeNo`

### TS-SESSION-003 issue()/verify() round-trip：中文姓名正確保存 [unit]
- **Given** `name` 含中文字元（如「陳○○」，或全形符號）
- **When** issue → verify
- **Then** 姓名逐字元相符，無亂碼/編碼損毀（JWT payload 為 UTF-8 base64url 編碼，需驗證非 ASCII 字元往返正確）

### TS-SESSION-004 既有 4 欄位行為不受影響（回歸）[unit]
- **Given** 既有情境之 `SessionUser`（`loginId`/`email`/`companyCode`/`roleCode`）
- **When** issue → verify
- **Then** 4 欄位行為與擴充前完全一致（回歸基準，對應既有 `session-token.service.spec.ts` 案例邏輯延續）

### TS-SESSION-005 employeeNo 為 null（如手動建立帳號，source=manual）→ 允許 null 往返 [unit]
- **Given** `SessionUser.employeeNo = null`（對應 `ACCOUNT.employeeNo` 為 nullable 欄位）
- **When** issue → verify
- **Then** 正確還原 `employeeNo: null`，不拋錯、不被序列化為字串 `"null"`

### TS-SESSION-006 orgCode 為 null（未指派部門之帳號）→ 允許 null 往返 [unit]
- **Given** `SessionUser.orgCode = null`
- **When** issue → verify
- **Then** 正確還原為 `null`

### TS-SESSION-007 SessionGuard 每請求刷新：現況僅 roleCode 由 DB 覆寫，orgCode/name/employeeNo 沿用 JWT 內原值 [unit]
- **Given** 有效 token（`orgCode='JAC00'`），`AccountRepository.findCurrentByLogin` 回傳現行 `{status:'active', roleCode:'SysAdmin'}`（`CurrentAccount` 介面現況不含 `orgCode`/`name`/`employeeNo`）
- **When** `SessionGuard.canActivate`
- **Then** `req.sessionUser.roleCode` 為 DB 現行值（`SysAdmin`），但 `orgCode`/`name`/`employeeNo` 沿用 token 內登入當下之快照值，**不受本次請求 DB 查詢影響**
- 此為**現況設計之待確認行為**，非既定正確答案——見 OQ-SESSION-1；本情境明確記錄「若不修改 `CurrentAccount` 介面，此即為實際行為」

### TS-SESSION-008 [依 OQ-SESSION-1 方案 B] 若擴充 CurrentAccount 亦含新 3 欄 → 每請求以 DB 現行值覆寫
- **Given** 同 TS-SESSION-007，但 `findCurrentByLogin` 回傳之 `CurrentAccount` 已擴充為含 `orgCode='JB100'`（DB 現行值，與 token 內登入時之 `'JAC00'` 不同，模擬使用者於 session 存續期間被組織轉調）
- **When** `SessionGuard.canActivate`
- **Then** `req.sessionUser.orgCode` 反映 DB 現行值 `'JB100'`（即時生效，比照現行 `roleCode` 之「角色變更即時生效」設計精神），不需重新登入即可反映最新部門
- 與 TS-SESSION-007 為互斥之兩方案，依 OQ-SESSION-1 定案後保留其一

### TS-SESSION-009 帳密登入（POST /auth/login）成功 → 回傳 SessionUser 含 orgCode/name/employeeNo [unit]
- **Given** `PasswordLoginService` 命中帳號，該帳號之 `PasswordAuthAccount`（介面擴充後）含 `orgCode`/`name`/`employeeNo`
- **When** 呼叫 `login()`
- **Then** 回傳之 `SessionUser` 正確帶入這 3 欄
- 對應 `password-login.service.ts` 第 72-77 行現有建構邏輯需擴充（現況僅映射 `loginId`/`email`/`companyCode`/`roleCode`）

### TS-SESSION-010 OIDC 登入（callback）成功 → 回傳 SessionUser 含 orgCode/name/employeeNo [unit]
- **Given** `classifyAccountByEmail` 命中單一在職帳號，該帳號之 `ResolvableAccount`（介面擴充後）含 `orgCode`/`name`/`employeeNo`
- **When** 執行 callback 成功路徑
- **Then** 核發之 session（`res.cookie` 內容經 `verify` 解出）含這 3 欄
- 對應 `auth.controller.ts` 第 201-206 行現有建構邏輯需擴充

### TS-SESSION-011 破壞性介面變更回歸提醒：既有測試替身需同步擴充型別 [unit，非功能斷言，記錄性]
- **Given** 既有 `session.guard.spec.ts` 之 `FakeRepo implements AccountRepository`
- **When** `AccountRepository` 介面新增欄位需求後
- **Then** 若新欄位為**必填**，`FakeRepo` 之既有 3 個方法（`findByEmail`/`findCurrentByLogin`/`findByLoginId`）之回傳物件皆需同步補上欄位，否則 TypeScript 編譯失敗；若設計為**optional**，既有測試替身可不修改即通過編譯，但下游消費端（F019/F020）需自行處理 `undefined`
- 本情境為 tdd-developer 實作前之「受影響檔案」提醒，見 OQ-SESSION-2 完整清單

### TS-SESSION-012 F019 消費情境：sessionUser.orgCode 可正確餵入子樹前綴比對 [unit]
- **Given** `sessionUser.orgCode = 'JAC00'`
- **When** 傳入子樹前綴展開邏輯（即 ORG-read-endpoints-test.md 之比對規則，本情境僅驗證欄位型別/可用性，不重測比對邏輯本身）
- **Then** 型別為 `string`，可直接作為前綴比對輸入，不需額外查詢 `ACCOUNT`/`ORG_UNIT` 表

### TS-SESSION-013 F020 消費情境：sessionUser.name/employeeNo 可直接用於浮水印身分快照 [unit]
- **Given** 已登入 session
- **When** 讀取 `sessionUser.name`／`sessionUser.employeeNo`
- **Then** 兩值與該登入帳號之 `ACCOUNT` 記錄一致，可直接組裝浮水印字串，不需 F020 端另行查詢 `PERSON`/`ACCOUNT`
- 對應契約 §8 浮水印欄位對應（員工編號＝`EMPNO`、姓名＝`USERNM`）

### TS-SESSION-014 JWT/cookie 大小邊界：極端姓名長度下仍在安全範圍內 [unit，計算位元組數]
- **Given** `name` 取 `nvarchar(30)` 上限之全形中文姓名（30 個中文字元）
- **When** issue()
- **Then** 產出 cookie 之總位元組數遠低於瀏覽器常見 4KB header 安全上限（估算：3 新欄位合計增量 < 100 bytes，屬低風險，本情境以斷言位元組數上限取代真實瀏覽器測試）

### TS-SESSION-015 [integration] 真實登入後 /auth/me 回傳內容與 ACCOUNT 表一致
- **Given** 真實 MSSQL、真實 `ACCOUNT` 記錄（含 `orgCode`/`name`/`employeeNo`）
- **When** 依序執行途徑 A 或途徑 B 登入，再呼叫 `GET /auth/me`
- **Then** 回傳之 `orgCode`/`name`/`employeeNo` 與 `ACCOUNT` 表當下資料完全一致

## 覆蓋對照表

| Scenario | 類型 | 對應來源/AC |
|---|---|---|
| TS-SESSION-001~006 | unit | claims 擴充本體；null 邊界 |
| TS-SESSION-007/008 | unit（雙軌） | OQ-SESSION-1（每請求刷新範圍） |
| TS-SESSION-009/010 | unit | 兩處登入呼叫點擴充 |
| TS-SESSION-011 | unit（記錄性） | OQ-SESSION-2 受影響檔案清單 |
| TS-SESSION-012/013 | unit | F019/F020 消費端契約驗證 |
| TS-SESSION-014 | unit | cookie 大小邊界 |
| TS-SESSION-015 | integration | 端到端一致性 |

## 開放設計問題

1. **OQ-SESSION-1（最關鍵，需 architect/PM 定案）：`SessionGuard` 每請求刷新範圍是否應涵蓋 `orgCode`/`name`/`employeeNo`。** 現行設計對 `roleCode` 採「DB 為每請求即時來源真相」（`current.roleCode` 覆寫 token 內舊值，達成角色變更即時生效），但新 3 欄位若比照辦理，需擴充 `CurrentAccount` 介面（目前僅 `{status, roleCode}`）並在 `findCurrentByLogin` 查詢多帶欄位；若不比照，則使用者於 session 存續期間（最長 30 分鐘 sliding）若被組織轉調，F019 置頂與 F020 浮水印身分快照將顯示**登入當下之舊部門**直到下次登入。此與 F006（組織異動提示，非強制、不自動覆寫）的產品精神是否一致需一併確認——F006 本身即定調「異動不自動覆寫」，故 session 快照制（TS-SESSION-007）或許才是與 F006 精神一致的選項，而非直覺的「即時同步」（TS-SESSION-008）。**此問題需明確記於 `SessionUser` 介面註解，避免日後維護者誤解為 bug。**
2. **OQ-SESSION-2：介面擴充之破壞性變更已知受影響檔案清單（供 tdd-developer 對照，非需另行調查）**：
   - `session-token.service.ts`（`SessionClaims`／`SessionUser` 介面本體）
   - `session.guard.spec.ts`（`FakeRepo` fixture、`user: SessionUser` 常數）
   - `session-token.service.spec.ts`（既有 issue/verify 案例之 fixture）
   - `account-repository.ts`（`CurrentAccount`／`PasswordAuthAccount` 介面）
   - `account-resolver.ts`（`ResolvableAccount` 介面）
   - `typeorm-account.repository.ts`（`findByEmail`/`findCurrentByLogin`/`findByLoginId` 三方法之 SELECT 欄位與回傳物件建構）
   - `password-login.service.ts`（`login()` 內 `SessionUser` 建構）
   - `auth.controller.ts`（`callback()` 內 `SessionUser` 建構，第 201-206 行）
   
   是否採「新欄位皆為 optional」（降低既有測試改動範圍，但下游需自行處理 `undefined`）或「必填但允許 `null`」（型別更嚴謹，但既有測試 fixture 需逐一補值），為實作前需拍板之風格決策。
3. **OQ-SESSION-3：JWT payload 僅簽章未加密，name/employeeNo 屬個資，client 端可解碼讀取。** 現行架構為無狀態 JWT（架構 §7.4），payload 僅 base64url 編碼＋簽章，非加密，意即持有 cookie 之瀏覽器可自行解碼讀出這些新增個資欄位（雖僅使用者本人瀏覽器持有自己的 cookie，非跨使用者外洩，但仍屬「client 可讀」而非僅「server 可讀」的資料揭露範圍變化）。是否符合 nfr.md#security 資料保護要求需覆核；若需更嚴謹之保護，需考慮改為伺服器端 session store（將牴觸現行「無狀態 JWT」架構決策，屬架構層級變更，超出本次擴充範圍，僅記錄供決策參考）。
4. **OQ-SESSION-4：是否需要真實瀏覽器 cookie 大小/相容性 `[integration]` 驗證。** 因 3 新欄位估算增量極小（TS-SESSION-014 已以位元組計算涵蓋），傾向不需額外真實瀏覽器情境，除非團隊對 cookie 相容性有更嚴謹之合規要求。
