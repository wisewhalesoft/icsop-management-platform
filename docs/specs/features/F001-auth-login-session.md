# F001: 雙軌驗證登入與 Session 管理
Priority: P0-MVP | Status: Draft（途徑 A 端到端驗證；途徑 B 帳密登入＋登入節流已實作＋單元驗證，識別鍵＝loginId；brute-force 節流 OQ-F001-B-04 落地，見 implementation-logs/hardening-impl.md） | Last Updated: 2026-07-24
Epic/Story: E01 / US-001, US-002, US-004

> ✅ **實作狀態（2026-07-21，垂直切片）**：途徑 A（Azure AD OIDC）已於 `backend/`（NestJS 11＋`@azure/msal-node`）實作並**真人端到端驗證通過**——登入→靜默 SSO→回呼驗簽→`email` 比對帳號→核發我方 session（httpOnly JWT）→受保護路由 `/auth/me`→登出→再存取回 401。
> **已實作**：`/auth/login`（state＋nonce＋PKCE、簽章 tx cookie）／`/auth/callback`（state 驗證、code 交換、**nonce 強制驗證**、`email` claim 缺漏→`AUTH_EMAIL_CLAIM_MISSING`、三態分類）／三態導向（SingleActive→核發 session；NotFound→`AUTH_ACCOUNT_NOT_FOUND`；Disabled→`AUTH_ACCOUNT_DISABLED`；MultipleActive→拒絕＋告警＋對外仍回 NOT_FOUND 不可列舉）／30 分鐘 sliding 閒置逾時（guard 每次請求刷新，OQ-E01-04）／`/auth/logout`。帳號來源抽象為 `AccountRepository` 介面。單元測試 33 個（帳號分類、三態決策、session token、guard）。
> **已知 gap（非本切片範圍，待後續）**：① **登出非「即時」撤銷被竊 token**——無狀態設計下清 cookie 僅撤銷該瀏覽器，token 副本活到 exp（≤30 分）；即時撤銷需 server 端 denylist（待 Redis/DB infra），與下方 AC「登出立即撤銷」之「即時」語意有落差。② **帳號來源為種子**（`SeedAccountRepository`），待 [F004](F004-org-sync.md) 組織同步寫入真實 `ACCOUNT` 表後改接。③ ~~途徑 B 帳密登入尚未實作~~ **途徑 B 帳密登入已於 authfix 實作**（`POST /auth/login`，識別鍵＝loginId，統一 `AUTH_INVALID_CREDENTIALS`；`PasswordLoginService`＋純函式 `resolvePasswordLogin`＋`AccountRepository.findByLoginId`；密碼雜湊 `accounts/password.ts` 早已就緒）。單元測試覆蓋 TS-F001-001〜007/009/010/013；`[integration]` 情境（008/011/012、真實 DB 端到端）待整合階段。**密碼路徑節流（brute-force 防護）已於 hardening 實作**（`LoginThrottleService`＝單機 process 記憶體固定時窗計數器，IP 軸 20／loginId 軸 5 每 60 秒，逾越回 429 `AUTH_TOO_MANY_ATTEMPTS`；不做持久性帳號鎖定故不與 OQ-E01-02 衝突，落地 OQ-F001-B-04；TS-HD-THR/SVC/CTRL 共 22 案，見 implementation-logs/hardening-impl.md）。⚠ 反向代理（nginx）部署下需於 `main.ts` 設 `trust proxy`，否則 IP 軸失效（部署待辦）。
> 對應設定文件：[docs/setup/azure-ad-app-registration.md](../../setup/azure-ad-app-registration.md)。

> 合併理由：Azure AD OIDC 登入、管理員帳密登入、Session 逾時/登出共享同一 session/JWT 生命週期，合為單一自足 feature。兩種登入為**雙軌並存、不互斥**（定案）。
> **2026-07-20 變更**：途徑 A 由原「上游 POST 使用者資訊＋自訂簽章」改為 **ICSOP 自行註冊 Azure AD (Entra ID) 應用、走標準 OIDC authorization code flow**。權威定案見 [upstream-hr-source-contract.md §12](../upstream-hr-source-contract.md)。
> **ICSOP 不是 Portal 的 iframe 子站台**：Portal 僅新增一個連結入口導向 ICSOP，**不參與身分傳遞**；因非嵌入模型，獨立登入頁仍成立，故途徑 B 保留。

## Description
系統並存兩種身分驗證：一般使用者以 **Azure AD OIDC**（authorization code flow ＋ PKCE）認證，使用者若已持有 AD session 則為**靜默 SSO**，我方以 id_token 之 `email` claim 對應本地帳號後核發自有 JWT/session；管理類角色可另以帳號密碼登入。Azure AD 僅負責**初次認證**，其後之 session 生命週期由我方控管：30 分鐘無操作逾時，並提供手動登出即時撤銷。

## Preconditions
- **Azure AD 登入**：
  - ICSOP 已完成 Azure AD app registration，取得 Tenant ID、Client ID、Client Secret（或憑證）、各環境 Redirect URI（development／staging／production 各一組），並以**環境變數／密鑰機制注入**，不得寫入版控（[nfr.md#deployment](../nfr.md#deployment) AC2）。
  - app registration 已配置回傳 `email` claim（另建議 `name`、`oid` 供稽核與除錯）。
  - 組織/帳號資料已由 [F004](F004-org-sync.md) 自上游同步至本地 `ACCOUNT`（帳號比對依據）。
- **帳密登入**：帳號已由 [F003](F003-account-role-management.md) 建立（`source=manual`），密碼以雜湊儲存。

## Main Flow
### 途徑 A：Azure AD OIDC 登入
1. 使用者自 Portal 連結或直接進入 ICSOP；未持有效我方 session 時，後端產生 `state`、`nonce` 與 PKCE `code_verifier`／`code_challenge`，將 `state`／`nonce`／`code_verifier` 綁定於伺服器端暫存後，重導至 Azure AD authorization endpoint 發起 authorization request。
2. Azure AD 執行認證：使用者**已有有效 AD session ⇒ 靜默完成，不再要求登入**；否則由 Azure AD 依公司既有政策（含 MFA／Conditional Access）處理。
3. Azure AD 將使用者重導回我方 Redirect URI，帶回 `authorization code` 與 `state`。
4. 後端比對 `state` 與暫存值；相符後以 `code` ＋ `code_verifier` 向 Azure AD token endpoint 交換 token。
5. 後端驗證 `id_token`：
   - 以 **Azure AD JWKS 公鑰驗證簽章**（公鑰快取並依 `kid` 輪替，無共享密鑰）。
   - 檢查 `iss`（發行者符合本租戶）、`aud`（等於本應用 Client ID）、`exp`／`nbf`（未過期）、`nonce`（等於步驟 1 暫存值）。
6. 取 `id_token` 之 **`email` claim** 作為身分對應鍵。
7. 以該 email 比對本地 `ACCOUNT.email`（← `VW_HPMUSER.EMAILADDR`）：**完整 email 含網域逐字比對、不分大小寫、不拆 local-part**，並強制 `status=active`（← `EMPSTS='A'`，僅在職帳號）。跨公司兼職者由網域天然區分，**不需併入 `companyCode`**。**不得** fallback 至 `HREMAILADDR`。
8. 命中唯一且啟用之帳號 → 記錄登入事件 → 核發我方 JWT（內含 `roleCode`）與 session → 進入 [F002](F002-role-based-routing.md)。

### 途徑 B：管理員帳密登入
1. 使用者於獨立登入頁輸入帳號密碼送出。
2. 後端以 bcrypt/argon2 比對雜湊。
3. 驗證通過且帳號啟用 → 核發 JWT → 進入 F002。

### Session 生命週期（不受驗證方式變更影響）
1. 每次有效互動（頁面操作或 API 請求）更新 `lastActivityAt`，重置閒置計時起點（OQ-E01-04 定案）。
2. 閒置逾 30 分鐘後之下一次操作被判逾時 → 導回登入頁。
3. 手動登出 → 立即撤銷當前 JWT/session（我方自有撤銷，不依賴 Azure AD）。

## Alternative Flows
- **帳密登入帳號不存在**：回與密碼錯誤相同之統一訊息。
- **AD 驗證通過但本地查無對應在職帳號**（OQ-E01-01 定案）：拒絕登入並提示「查無有效帳號，請洽系統管理員」，**不自動建立帳號**。
- **逾時後重新進入**：我方 session 逾時但 AD session 仍有效時，重新發起 authorization request 可再次靜默完成 SSO，使用者無感重新取得我方 JWT。

## Edge Cases
- **`state` 不符或缺漏**：判定為 CSRF／回呼竄改，拒絕並終止本次流程，不交換 token。
- **`nonce` 不符**：判定 id_token 非本次流程所發，拒絕核發我方 JWT。
- **authorization code 交換失敗**（code 已用過／過期／client 認證失敗／Azure AD 不可用）：拒絕登入並記錄失敗，不進入帳號比對。
- **id_token 過期或簽章驗證不符**（含 `iss`／`aud` 不符、JWKS 取不到對應 `kid`）：拒絕登入並記錄失敗。
- **`email` claim 缺漏或為空**：無法取得對應鍵，拒絕登入並提示洽系統管理員。
- **email 查無對應在職帳號**（含該員 `EMAILADDR` 從缺、或僅存在於已離職帳號）：拒絕登入。屬 HR 資料面問題，應由 HR 補齊，**不得**以其他欄位靜默 fallback。
- **AD 認證成功但本地帳號已停用**（含離職停用）：仍**拒絕**登入（見 [F005](F005-auto-disable-departed.md)）。
- **email 於在職帳號中命中多筆**：視為資料異常，拒絕登入並告警系統管理員，不任選一筆。
- 閒置 29:59 時操作：session 維持有效並重新計時。
- 多分頁同帳號：任一分頁有效操作重置全域閒置計時（依 OQ-E01-04，以每次 API 更新 `lastActivityAt` 為基準）。

## Postconditions
- 成功：持有我方核發之有效 JWT，角色資訊嵌於 token/session；Azure AD 於此後不參與授權判定。
- 逾時/登出：原憑證不可再用於任何受保護 API。

## Acceptance Criteria
- Given 使用者已持有有效 Azure AD session 且本地有對應之啟用帳號, When 進入 ICSOP 觸發 OIDC 登入, Then **不出現 AD 登入畫面（靜默 SSO）**、核發我方有效 JWT 並回傳角色，記錄登入事件。
- Given 發起 authorization request, When 產生請求, Then 必含 `state`、`nonce` 與 PKCE `code_challenge`，且三者於伺服器端與該次流程綁定。
- Given Azure AD 回呼之 `state` 與暫存值不符, When 處理回呼, Then 拒絕流程、**不執行 code 交換**、回 `AUTH_OIDC_STATE_MISMATCH`，記錄失敗。
- Given authorization code 交換失敗, When 呼叫 token endpoint, Then 回 `AUTH_OIDC_EXCHANGE_FAILED`、不核發任何憑證、不洩漏內部細節，記錄失敗。
- Given 取得 id_token, When 驗證, Then 必以 Azure AD JWKS 公鑰驗簽並檢查 `iss`／`aud`／`exp`／`nonce`；任一項不符回 `AUTH_OIDC_TOKEN_INVALID`、拒發憑證，記錄失敗。
- Given id_token 通過驗證但無 `email` claim, When 取對應鍵, Then 回 `AUTH_EMAIL_CLAIM_MISSING`、拒絕登入。
- Given `email` claim 與 `ACCOUNT.email` 僅大小寫不同, When 比對帳號, Then **視為相符**（不分大小寫）並成功登入。
- Given `email` claim 之 local-part 相同但網域不同, When 比對帳號, Then **視為不相符**（完整 email 含網域逐字比對）。
- Given AD 驗證通過但無任何 `status=active` 之帳號其 email 相符, When 比對帳號, Then 回 `AUTH_ACCOUNT_NOT_FOUND`、提示「查無有效帳號，請洽系統管理員」、**不自動建立帳號**（OQ-E01-01）。
- Given AD 驗證通過但對應帳號已停用, When 比對帳號, Then 回 `AUTH_ACCOUNT_DISABLED`、拒絕登入。
- Given 正確帳密, When 送出登入, Then 核發 JWT 並導向 F002。
- Given 錯誤帳密或帳號不存在, When 送出登入, Then 回統一 `AUTH_INVALID_CREDENTIALS`，記錄失敗。
- Given 帳號建立密碼, When 寫入 DB, Then 以不可逆加鹽雜湊儲存。
- Given 最後操作逾 30 分鐘, When 下一次操作, Then 判逾時、回 `AUTH_SESSION_EXPIRED`、導回登入頁。
- Given 30 分內持續互動, When 每次互動, Then 重置計時，不被強制登出。
- Given 使用者點擊登出, When 送出, Then 立即撤銷我方憑證，該憑證不可再用於任何受保護 API。
- Given 任一登入失敗情境, When 回傳錯誤, Then 訊息**不得洩漏該 email 是否存在於系統**或其他可列舉資訊。

## Error Scenarios
- OIDC 驗證、帳密、停用、逾時錯誤：見 [error-handling.md#auth](../error-handling.md#auth) 與 [#session](../error-handling.md#session)。
- 登入失敗鎖定：**定案不做**（OQ-E01-02）。

## Related
- **驗證方式與身分對應鍵之權威定案**：[upstream-hr-source-contract.md §12](../upstream-hr-source-contract.md)（§12.1 驗證方式／§12.2 對應鍵／§12.3 Azure AD 註冊需求）
- Diagram: [../diagrams/F001-auth-login.mmd](../diagrams/F001-auth-login.mmd)
- Data: [ACCOUNT](../data-model.md#account-entity)（`email` 為 AD 身分對應鍵）, [PERSON](../data-model.md#person-entity)
- NFR: [資訊安全](../nfr.md#security), [整合可靠性](../nfr.md#integration), [部署與機密管理](../nfr.md#deployment)
- Depends on: [F004 組織同步](F004-org-sync.md)（帳號與 email 資料來源）
- Next: [F002 角色分流](F002-role-based-routing.md)
- OQ: [open-questions.md](../open-questions.md) OQ-E01-01/02/04、OQ-NFR002〔部分收斂〕
