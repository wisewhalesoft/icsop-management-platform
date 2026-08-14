# F001: 雙軌驗證登入與 Session 管理
Priority: P0-MVP | Status: Draft（途徑 A 端到端驗證；途徑 B 帳密登入＋登入節流已實作＋單元驗證，識別鍵＝loginId；brute-force 節流 OQ-F001-B-04 落地，見 implementation-logs/hardening-impl.md）**＋ 2026-08-14 新增 `AC-C1`～`AC-C3` 跨公司帳密登入解析 delta（待實作）** | Last Updated: 2026-08-14
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

### 跨公司手動帳號之帳密登入解析 delta（🔵 2026-08-14 使用者裁決之漣漪；編號採 `AC-C#`）

> **緣由**：使用者裁定「建立/編輯帳號時公司別可選、不限操作者所屬公司」（[F003](F003-account-role-management.md) `AC-P5`）。現行途徑 B 以 `(DEFAULT_COMPANY_CODE ?? 'AS', loginId)` 定位帳號、且登入頁**不送 `companyCode`**，若不修訂，於 `AS` 以外公司建立之手動帳號**建立後永遠無法登入**——即本檔既已閉合過一次之「建立→登入死鏈」重演。
> **編號自 `AC-C1` 起，既有無編號 AC 全數不變。途徑 A（OIDC）完全不受影響**（其以 `email` 定位身分，本就不併入 `companyCode`，見上方主流程第 7 點）。

- **AC-C1（帳密登入之帳號解析改為兩段式）**：Given 送出帳密（body **不含** `companyCode`）, When 解析帳號, Then 依序：① 以 `(DEFAULT_COMPANY_CODE ?? 'AS', loginId)` 精確查詢，命中即採用（**既有路徑，`AS` 帳號之行為與效能逐項不變**）；② 未命中則以 `loginId` **跨全部公司**查詢，恰命中一筆即採用；③ 命中多筆（歷史資料異常）→ 一律回 **401 `AUTH_INVALID_CREDENTIALS`**，**不任選一筆、不洩漏原因**（比照既有「email 命中多筆」之處置）。Given body **明確帶入** `companyCode`, Then 僅以 `(companyCode, loginId)` 精確查詢（不進入第②段），既有契約不變。
- **AC-C2（登入頁不新增公司選擇器）**：Given 登入頁, When 渲染, Then **不得**新增「公司」欄位或選擇器——使用者不應被要求知道自己屬於哪個公司代碼；跨公司解析由 `AC-C1` 於後端完成。Given 以 `AE` 建立之啟用手動帳號與正確密碼, When 於登入頁送出, Then 登入成功且 `SessionUser.companyCode` 為 `AE`（**非** `AS`）。<br>⚠ 前置保證＝[F003](F003-account-role-management.md) `AC-P24`（手動帳號 `loginId` **全域唯一**），使 `AC-C1` 第③段之多筆情境在新資料上不可達。
- **AC-C3（節流與訊息揭露不變）**：Given 第②段查詢未命中或命中多筆, When 回應, Then 一律回統一 `AUTH_INVALID_CREDENTIALS` 並依既有規則同時記 IP 與 `loginId` 兩軸失敗（`AUTH_TOO_MANY_ATTEMPTS` 之門檻與視窗不變）；**不得**因「查無此公司」「該帳號屬他公司」等理由回傳可區分之訊息或狀態碼。

## Error Scenarios
- OIDC 驗證、帳密、停用、逾時錯誤：見 [error-handling.md#auth](../error-handling.md#auth) 與 [#session](../error-handling.md#session)。
- **跨公司帳密登入解析**（`AC-C1`～`AC-C3`）：拒絕一律沿用 `AUTH_INVALID_CREDENTIALS`，**不新增任何錯誤碼**。
- 登入失敗鎖定：**定案不做**（OQ-E01-02）。

## Related
- **驗證方式與身分對應鍵之權威定案**：[upstream-hr-source-contract.md §12](../upstream-hr-source-contract.md)（§12.1 驗證方式／§12.2 對應鍵／§12.3 Azure AD 註冊需求）
- Diagram: [../diagrams/F001-auth-login.mmd](../diagrams/F001-auth-login.mmd)
- Data: [ACCOUNT](../data-model.md#account-entity)（`email` 為 AD 身分對應鍵）, [PERSON](../data-model.md#person-entity)
- NFR: [資訊安全](../nfr.md#security), [整合可靠性](../nfr.md#integration), [部署與機密管理](../nfr.md#deployment)
- Depends on: [F004 組織同步](F004-org-sync.md)（帳號與 email 資料來源）
- Next: [F002 角色分流](F002-role-based-routing.md)
- OQ: [open-questions.md](../open-questions.md) OQ-E01-01/02/04、OQ-NFR002〔部分收斂〕
