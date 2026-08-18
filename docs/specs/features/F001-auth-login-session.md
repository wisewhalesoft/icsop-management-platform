# F001: 雙軌驗證登入與 Session 管理
Priority: P0-MVP | Status: Draft（途徑 A 端到端驗證；途徑 B 帳密登入＋登入節流已實作＋單元驗證，識別鍵＝loginId；brute-force 節流 OQ-F001-B-04 落地，見 implementation-logs/hardening-impl.md）**＋ 2026-08-14 新增 `AC-C1`～`AC-C3` 跨公司帳密登入解析 delta（待實作）＋ 2026-08-18 新增 `AC-E1`～`AC-E15` Azure AD endpoint host 覆寫 delta（待實作，遠端環境登入不可用之修復）** | Last Updated: 2026-08-18
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

### Azure AD endpoint host 覆寫 delta（🔴 2026-08-18 遠端環境登入不可用之修復；編號採 `AC-E#`，E＝endpoint host）

> **緣由（lead 已於遠端主機 DTTHFC01 實測，非推論）**：遠端測試環境之第一跳防火牆（Palo Alto，MAC OUI `00:1b:17`，閘道 `172.20.202.254`）對 SNI 為 `login.microsoftonline.com` 之 TLS 連線**注入偽造 RST**。證據：TCP 三向交握成功、ClientHello 送出後讀回 0 bytes 即被 RST；同一連線之 SYN-ACK **TTL=108**（真實 Microsoft，約 20 跳）而 RST **TTL=63**（僅 1 跳）；SYN→SYN-ACK 40.6ms 而 ClientHello→RST **0.73ms**（快 55 倍）；**同一 IP 不帶 SNI 時 TLS 握手完全成功**並取得未竄改之 DigiCert 正牌憑證；主機端已排除（iptables 無規則、ufw inactive、無端點代理）。⇒ 遠端登入恆回 `AUTH_OIDC_EXCHANGE_FAILED`／`network_error: fetch failed`。網管已回覆不處理，**使用者裁決＝以 Microsoft 官方別名繞過，不再追防火牆**。
> **別名實測**：`login.microsoft.com` → **200**、`login.windows.net` → **200**、`login.microsoftonline.com` → **000**。別名之 OIDC discovery 內容為 `issuer: https://login.microsoftonline.com/{tenantid}/v2.0`（**canonical**），而 `authorization_endpoint`／`token_endpoint`／`jwks_uri` 指向**別名自己**。此為 Microsoft 官方行為，亦即「endpoint 可搬、issuer 不搬」。
> **參考實作**：`reference/ad-azure-frontend-logic/src/backend/config.ts` 與 `src/backend/services/aad-service.ts` 已於同一台主機解過同一問題（env 覆寫 endpoint host、`CANONICAL_AAD_ISSUER_HOST` 釘死為常數）。⚠ **關鍵差異＝該實作自行組 URL，本專案用 `@azure/msal-node@^5.4.1`，MSAL 會自行另做兩次 discovery**（見 `AC-E3`）。
> **編號自 `AC-E1` 起；本批為 additive delta，本檔既有無編號 AC 與 `AC-C1`～`AC-C3` 全數不變。** 與既有 `AC-D#`（2026-08-16 缺失 delta）／`AC-C#`／`AC-P#`／`AC-S#`／`AC-U#` 批次區隔、不重號。
> **[ASSUMPTION] 環境變數名採 `AZURE_AD_AUTHORITY_HOST`**——沿用本 repo 既有 `AZURE_AD_TENANT_ID`／`AZURE_AD_CLIENT_ID`／`AZURE_AD_CLIENT_SECRET`／`AZURE_AD_REDIRECT_URI` 之前綴慣例（見 `backend/src/auth/msal.config.ts` 與 `.env.sample`）。參考實作使用 `AAD_AUTHORITY_HOST`（其專案自身之 `AAD_*` 前綴）；**兩者僅前綴不同、語意完全相同**。若擁有者裁定改回 `AAD_AUTHORITY_HOST`，本批 AC 之變數名**整批字面替換即可**，其餘語意一字不動。追溯：[open-questions.md](../open-questions.md) `OQ-E01-11`。
>
> **本批術語**：「**canonical host**」恆指 `login.microsoftonline.com`；「**設定 host**」指 `AZURE_AD_AUTHORITY_HOST` 生效後之值；「**canonical issuer**」恆指 `https://login.microsoftonline.com/{tenantId}/v2.0`。

#### 甲、可設定性與端點路由

- **AC-E1（未設＝現況零回歸）**：Given `AZURE_AD_AUTHORITY_HOST` 未設定、或其值去頭尾空白後為空字串, When 系統啟動並執行完整登入流程, Then 生效之 authority host **為 canonical host**，且 ① `/auth/login` 之 302 `Location` host、② token endpoint 呼叫 host、③ JWKS 取得 host、④ OIDC discovery 取得 host **四者皆為 canonical host**；本檔既有全部 AC 之行為**逐項不變**。
- **AC-E2（設定後四類呼叫改走設定 host）**：Given `AZURE_AD_AUTHORITY_HOST=login.microsoft.com`, When 執行完整登入流程, Then：
  - **【執行期載體】**① `/auth/login` 回應之 302 `Location` 其 host 為 `login.microsoft.com` 且 path 仍為 `/{tenantId}/oauth2/v2.0/authorize`；② authorization code 交換之請求 host 為 `login.microsoft.com`。
  - **【宣告層約束——現況無執行期載體】**③ 系統所產生／持有之 **JWKS URL** 其 host 為 `login.microsoft.com`；④ 系統所產生／持有之 **OIDC discovery URL**（`.well-known/openid-configuration`）其 host 為 `login.microsoft.com`。<br>⚠ **③④ 現況為「宣告值正確」而非「呼叫確實發生」**（2026-08-18 由 test-generator 建環時查證、spec-writer 覆核後就地精確化，裁決＝**保留＋明標**）：本專案採 **MSAL confidential-client authorization code flow**，`id_token` 由 **TLS 保護之 token endpoint 直接回傳**，**登入流程中不抓 JWKS**；而 discovery 之出網於 `AC-E3` 之抑制手法下亦可能為零。⇒ 測試僅能斷言「設定所導出之 URL 指向別名」，該 URL 執行期未必被使用。<br>**保留理由**：① 日後若改為自行驗簽（如參考實作之作法）或改採會實際 discovery 之手法，③④ **立即變成真載體**、無須重寫；② 它們仍防止一類真實錯誤——把 JWKS／discovery URL 寫死為 canonical 而只改 authorize／token，於遠端會在該路徑一啟用即被 RST。<br>**不得**因「現在沒有執行期載體」而放寬為「host 值任意」，亦**不得**以 `.skip` 或註解形式停用。
  - `AZURE_AD_TENANT_ID`／`AZURE_AD_CLIENT_ID`／`AZURE_AD_REDIRECT_URI` **不受本設定影響**（`redirect_uri` 仍為我方 URL）。
- **AC-E3（🔴 零 canonical 出網——含 MSAL instance discovery）**：Given `AZURE_AD_AUTHORITY_HOST` 設為非 canonical 之別名, When 自程序啟動起、至一次完整登入流程（`/auth/login` → `/auth/callback` → 核發 session）結束為止, Then **對 canonical host 之出網請求次數必須為 0**。此**明確包含** `@azure/msal-node` 之兩段 discovery：① **instance discovery**——其預設目標為**硬編碼**之 `https://login.microsoftonline.com/common/discovery/instance`，**不隨 `authority` 改變**；② **OIDC discovery**——`{authority}/v2.0/.well-known/openid-configuration`。<br>**可觀測斷言標的**：登入流程之全部出網 HTTP 必須經由**單一可注入之 network client**；測試於該 client 上記錄每一次請求之絕對 URL，斷言其 host 集合**不含** `login.microsoftonline.com`。等價之更強形式＝注入一個「遇 canonical host 即 throw」之 client，斷言完整登入流程仍成功。<br>⚠ **本條是本 delta 最易做錯之處**：只換 `authority` 而未抑制 instance discovery，遠端仍會被 RST，症狀與修復前**完全相同**。<br>ℹ 抑制手法（`cloudDiscoveryMetadata`／`authorityMetadata`／`knownAuthorities`／`protocolMode`／自訂 network client 等）**由 system-architect 決定**，本 AC 不綁定實作；但無論採何手法，`AC-E5`～`AC-E7` 之 issuer 不變式**恆須成立**（尤以「靜態內嵌 metadata」之手法為然——內嵌之 `issuer` 若由設定 host 導出即違反 `AC-E7`）。
- **AC-E4（canonical 黑洞環境下端到端成功；部署級驗證）**：Given 一個「canonical host 不可達」之環境（遠端測試環境即為此實況；本地可將 `login.microsoftonline.com` 以 hosts 檔解析至黑洞位址，或以防火牆丟棄其封包等價模擬）且 `AZURE_AD_AUTHORITY_HOST` 設為可達之別名, When 真人執行完整 OIDC 登入, Then 登入成功並取得我方 session，**不得**出現 `AUTH_OIDC_EXCHANGE_FAILED`。

#### 乙、🔒 安全不變式（issuer 釘死）

> 🔴 **實作前必讀（2026-08-18 查證，spec-writer 於覆核 `AC-E2`③ 時連帶發現）**：`@azure/msal-node@5.4.1` ＋ `@azure/msal-common@16.11.2` **完全沒有 `iss` claim 之比對**（對兩套件 `dist` 全樹 grep `.iss` 零命中），現行 `auth.controller.ts` 亦只手動驗 `nonce`。⇒ **本專案目前根本沒有 issuer 檢查**。`AC-E5`～`AC-E7` 要求的是**新增**一段明確的 `iss` 比對，**不是**「確認 MSAL 有在做」——切勿假設 SDK 已代勞（MSAL 依 OIDC §3.1.3.7：confidential client 自 token endpoint 經 TLS 直取之 id_token 得免驗簽，其信任錨定在 **TLS ＋ 所連的那台主機**）。
> ⇒ 由此推得兩件事，兩者都必須成立：① `AC-E5`～`AC-E7` 之載體為**我方新增之比對單元**（單元層可測，無須端到端）；② **既然 token 之信任實質錨定於「我們連了哪台主機」，`AC-E9` 白名單與 `AC-E8` TLS 驗證就不只是 defense in depth——它們是主要控制**，issuer 釘死為其上之額外一層。此為 `AC-E9` 裁量之補強理由（見該條）。

- **AC-E5（正向：別名下仍以 canonical issuer 為期望值）**：Given `AZURE_AD_AUTHORITY_HOST=login.microsoft.com`, When 驗證一個 `iss` 為 canonical issuer 且簽章／`aud`／`exp`／`nonce` 皆通過之 id_token, Then **接受**並依既有流程核發我方 session。
- **AC-E6（🔴 負向：期望 issuer 不得由設定值導出——機器可驗）**：Given 期望 issuer 之計算與比對以任意 host 值 `H` 驅動（測試取 `H = evil.example.com`，即攻擊者可控之值；若 `AC-E9` 白名單使該值無法經環境變數進入系統，測試**直接對該計算/比對單元注入 `H`**——白名單**不得**作為本條之唯一防線，二者為 defense in depth）, When 驗證一個 `iss` 為 `https://H/{tenantId}/v2.0`、其餘欄位（簽章對應之 JWKS、`aud`、`exp`、`nonce`）皆刻意構造為通過之 id_token, Then **必須拒絕**、回 `AUTH_OIDC_TOKEN_INVALID`、**不核發任何 session cookie**，並記錄失敗。
- **AC-E7（不變式：issuer 判定與 host 設定完全解耦）**：Given 一組固定之 id_token fixture（至少含一個 `iss` 為 canonical issuer 者、一個 `iss` 為非 canonical 者）, When 以 `AZURE_AD_AUTHORITY_HOST` 之**任意合法值**（至少涵蓋：未設、`login.microsoftonline.com`、`login.microsoft.com`、`login.windows.net`）分別重跑驗證, Then 每一個 fixture 之接受／拒絕結果在全部設定下**逐項相同**。<br>此即參考實作註解所述之理由：期望 issuer 若由可設定之 host 導出，等於讓被檢查者自行決定檢查基準，該檢查即不再是檢查。
- **AC-E8（🔒 TLS 憑證驗證不得關閉）**：Given 任一 `AZURE_AD_AUTHORITY_HOST` 設定, When 對該 host 建立 TLS 連線, Then 憑證鏈與主機名驗證**必須維持啟用**；**不得**以 `NODE_TLS_REJECT_UNAUTHORIZED=0`、`rejectUnauthorized: false`、自訂 CA 略過、或忽略憑證錯誤等任何方式繞過。<br>理由：別名之可信度來自「它確實是 Microsoft 的主機」，而該保證**只由 TLS 憑證提供**；`AC-E5`～`AC-E7` 僅保證**不接受**壞 token，**不保證不外洩** client secret 與 authorization code。本條與 `AC-E9` 共同承擔外洩面之防護。

#### 丙、允許值域與設定驗證

- **AC-E9（白名單值域＋啟動 fail-fast）**：Given `AZURE_AD_AUTHORITY_HOST` 之值不在允許清單 `{login.microsoftonline.com, login.microsoft.com, login.windows.net}` 內, When 系統啟動, Then **啟動失敗**（fail-fast，比照既有 `requireEnv` 之啟動期 throw），錯誤訊息含所收到之值與**完整允許清單**；**不得**靜默回退為 canonical host（靜默回退會使遠端重現原症狀且無任何診斷線索——即本次故障之成因形狀）。允許清單為**程式內常數**，**不得**由環境變數擴充或關閉：任何「放行未列值」之 escape hatch env 皆由與 `AZURE_AD_AUTHORITY_HOST` **相同之行為者**設定，等於使本管制歸零。<br>**裁量理由（spec-writer 裁量，非使用者裁決）**：本設定值決定 **client secret 與 authorization code 被 POST 到哪一台主機**，並決定**使用者被重導去哪裡輸入公司密碼**。issuer 釘死（`AC-E5`～`AC-E7`）只防止壞 token 被接受，**完全不防止機密外洩至錯誤主機**——二者為不同的攻擊面。白名單使「compose 檔／CI 變數／`.env` 之一次錯誤或惡意編輯」不足以造成外洩，門檻由「改一個字串」提高為「改程式碼並經 review」。<br>**（2026-08-18 補強）**：查證後理由更強——MSAL **不做 id_token 驗簽亦不比對 `iss`**（見上方乙節之實作前必讀），token 之信任實質錨定於「**我們把 code 送去了哪台主機、以及該主機之 TLS 憑證**」。⇒ 本白名單與 `AC-E8` **不是次要防線，而是此處的主要控制**；`AC-E5`～`AC-E7` 為其上之額外一層。<br>**代價（已評估，明確接受）**：Microsoft 日後新增別名、或本系統改部署至主權雲（`login.microsoftonline.us`／`login.partner.microsoftonline.cn` 等）時，須修改常數並重新部署。此三個別名已穩定存在多年，變動機率低；且「需經 code review 才能改」**正是本管制的目的而非其缺陷**。<br>ℹ **部署建議（非 AC）**：遠端環境優先採 `login.microsoft.com`（Microsoft 現行文件所列之別名）；`login.windows.net` 為歷史別名，僅作備援。
- **AC-E10（值正規化與格式拒絕）**：Given `AZURE_AD_AUTHORITY_HOST` 之值, When 讀取設定, Then 先去頭尾空白並轉為小寫再比對白名單（`  Login.Microsoft.Com  ` 視為 `login.microsoft.com` 並通過）；含 scheme（`https://…`）、path（`…/common`）、port（`…:443`）、query 或 userinfo 之值**一律視為非白名單值**並依 `AC-E9` 啟動失敗——**不得**嘗試自其中萃取 host（萃取會使 `https://evil.example.com@login.microsoft.com/` 這類值產生歧義）。

#### 丁、失敗行為與可診斷性

- **AC-E11（別名於 code 交換階段不可達）**：Given 設定 host 於執行期不可達（連線被 RST／逾時／DNS 解析失敗）, When `/auth/callback` 執行 authorization code 交換, Then 回**既有** `AUTH_OIDC_EXCHANGE_FAILED`、不核發任何憑證，並記錄失敗；**不新增任何錯誤碼**。
- **AC-E12（發起階段之總約束——兩分支全稱，不得 skip）**：**（2026-08-18 就地改寫**：原措辭之 Given 於「靜態注入 metadata」手法下恆不成立，屬空真前提。改寫為對**兩種手法皆成立之全稱契約**，測試不得以 `.skip` 迴避任一分支。**裁決＝改寫保留**，不刪除——它是日後換手法時的護欄。**）**<br>Given 設定 host **完全不可達**（測試以「對任何 host 皆 throw」之 network client 注入，涵蓋 RST／逾時／DNS 失敗）, When 使用者觸發 `/auth/login`, Then **下列兩者必有其一成立，且不得有第三種結果**：
  - **分支 A（發起階段零出網——`AC-E3` 之靜態注入手法下的現況）**：`/auth/login` 仍正常回 **302** 且 `Location` 符合 `AC-E2` ①；即 `/auth/login` 之成敗**與設定 host 之可達性無關**。此分支同時是 `AC-E3` 「零出網」於發起階段之正向確認。
  - **分支 B（發起階段有出網且失敗）**：回既有 `AUTH_OIDC_EXCHANGE_FAILED` 之錯誤呈現，與 callback 階段**同碼、同使用者訊息**，並滿足 `AC-E13`。
  - **兩分支共同禁止**：**不得**回 500、不得回未處理例外、不得回任何堆疊或例外 `message`。此禁止項**與手法無關、永遠可測**，是本條在分支 A 下仍具約束力的部分。<br>ℹ 分支 B 為既有錯誤碼之**適用階段擴充**（原文義僅涵蓋 callback 之 token 交換），語意不變、不新增碼；見 [error-handling.md#aad-authority-host](../error-handling.md#aad-authority-host)。
- **AC-E13（🔴 登入失敗頁之揭露封閉集——現況已被違反，本條為缺陷修正）**：**（2026-08-18 就地精確化。**⚠ **這不是新需求**：本檔既有無編號 AC 早已要求「不洩漏內部細節」，[error-handling.md#auth](../error-handling.md#auth) 亦早已要求「錯誤訊息不得回傳上游原始錯誤內容」——**現況違反的是既有 AC**，`AC-E13` 只是把「內部細節」精確到可機器驗證。故實作端屬 **BUG-FIX，非行為變更**。**）**<br>**已確認之兩處違反點**（`backend/src/auth/auth.controller.ts`，供實作定位，非規定實作）：① `renderError` 之第三參數於 code 交換失敗路徑帶入 `e.message`，使畫面直接印出 `network_error: Network request failed: fetch failed`——**即使用者最初回報時貼給 lead 的那張畫面**；② `if (error) return this.renderError(res, \`Azure：${error}\`, errorDesc)` 將 Azure 回呼之 `error`／`error_description` **兩個 query 參數原樣回顯**（且該路徑連錯誤碼都不是我方常數）。
  - **(a) 使用者可見之封閉允許集**：登入失敗頁**僅得**顯示下列四類，**全部為我方撰寫之固定字串或常數**——① 我方錯誤碼常數（如 `AUTH_OIDC_EXCHANGE_FAILED`；該碼本就是對外定義之契約，見 [error-handling.md 錯誤碼一覽](../error-handling.md)）；② 該錯誤碼於 error-handling 錯誤碼表所定之**固定使用者訊息**（如「驗證失敗，請重新登入」）；③ 重試登入連結；④ **選配**之 correlation/trace id（**必須為我方產生之隨機識別碼**，不得由任何外部值導出、不得含任何內容資訊）。
  - **(b) 判準（可機器驗證之充要形式）**：使用者可見之字串**必須完整取自一個有限的、原始碼中可列舉的常數集合**（`AUTH_*` 錯誤碼 ∪ 固定訊息文案 ∪ 我方撰寫之靜態說明句，如既有之「交易 cookie 損毀。」），**加上** (a)④ 之隨機 id。**任何執行期插值之外部來源字串一律禁止**——涵蓋但不限於：例外之 `message`／`name`／`stack`、`fetch failed`／`network_error`／`ECONNRESET`／`ETIMEDOUT`、上游 HTTP 狀態碼與 response body、`AADSTS*` 代碼與其描述、**Azure 回呼之 `error`／`error_description` query 參數**、生效之 authority host 或任何主機名／URL、`tenantId`、`clientId`、`clientSecret`、email／`loginId`。
  - **(c) 診斷不得因此消失**：上述全部細節**必須**寫入伺服器端日誌（含與 (a)④ 相同之 correlation id 以供對照），**日誌不得含 `clientSecret`**。此為本條與 `AC-E14` 之分工：**畫面收斂、日誌保全**。
  - **(d) 適用範圍**：`/auth/callback` 與 `/auth/login` 之**全部**失敗呈現路徑，非僅 `AC-E11`／`AC-E12` 兩者；既有之 `AUTH_OIDC_STATE_MISMATCH`／`AUTH_OIDC_TOKEN_INVALID`／`AUTH_EMAIL_CLAIM_MISSING`／`AUTH_ACCOUNT_*` 路徑同受 (a)(b) 拘束（其現有 detail 皆為我方靜態字串，已符合，**屬回歸鎖而非變更**）。上方 ② 之 `Azure：${error}` 路徑須改為我方常數碼＋固定訊息。
- **AC-E14（啟動期可診斷紀錄）**：Given 系統啟動, When 設定載入完成, Then **恰一次**於伺服器日誌記錄生效之 authority host；當其**非** canonical host 時，以 WARN 等級記錄並註明「已啟用 Azure AD endpoint host 覆寫；issuer 仍釘死為 canonical」。日誌**不得**包含 `AZURE_AD_CLIENT_SECRET`。<br>**「恰一次」之界定（2026-08-18 補實，對齊建環之編碼）**：指**每次設定載入恰一次**（冪等：同一次載入重複呼叫不重複輸出），**非**「行程生命週期內全域一次」——dev 熱重載／多 worker／測試中重建模組各自載入時，各記一次為**正確**。斷言形狀＝對同一次載入之記錄呼叫計數為 1。<br>理由：本次故障之最大成本在於「症狀為通用網路錯誤、無從自外部判斷生效設定為何」；`AC-E13` 使畫面不再洩漏，本條確保診斷資訊仍在日誌可得。

#### 戊、零漣漪回歸鎖

- **AC-E15（其餘行為完全不變）**：Given 任一 `AZURE_AD_AUTHORITY_HOST` 設定（含未設）, When 執行途徑 B 帳密登入（含 `AC-C1`～`AC-C3` 之兩段式解析）、session 30 分鐘閒置逾時、登出撤銷、`AUTH_TOO_MANY_ATTEMPTS` 節流, Then 行為**逐項不變**——本設定僅影響 Azure AD endpoint 之出網目標，不影響我方 session 之任何面向；[F002](F002-role-based-routing.md) 角色分流亦不受影響。同時，本批**不改動** `state`／`nonce`／PKCE／`aud`／`exp`／簽章驗證之任何既有規則。

## Error Scenarios
- OIDC 驗證、帳密、停用、逾時錯誤：見 [error-handling.md#auth](../error-handling.md#auth) 與 [#session](../error-handling.md#session)。
- **跨公司帳密登入解析**（`AC-C1`～`AC-C3`）：拒絕一律沿用 `AUTH_INVALID_CREDENTIALS`，**不新增任何錯誤碼**。
- **Azure AD endpoint host 覆寫**（`AC-E1`～`AC-E15`）：執行期不可達一律沿用 `AUTH_OIDC_EXCHANGE_FAILED`（涵蓋 `/auth/login` 發起階段與 `/auth/callback` 交換階段兩處）；issuer 不符沿用 `AUTH_OIDC_TOKEN_INVALID`；設定值不合法為**啟動期失敗**（非 HTTP 錯誤，無錯誤碼）。**不新增任何錯誤碼**。見 [error-handling.md#aad-authority-host](../error-handling.md#aad-authority-host)。
- 登入失敗鎖定：**定案不做**（OQ-E01-02）。

## Related
- **驗證方式與身分對應鍵之權威定案**：[upstream-hr-source-contract.md §12](../upstream-hr-source-contract.md)（§12.1 驗證方式／§12.2 對應鍵／§12.3 Azure AD 註冊需求）
- **Azure AD endpoint host 覆寫之參考實作**（同 repo，已於同一台主機驗證可用）：`reference/ad-azure-frontend-logic/src/backend/config.ts`（`DEFAULT_AAD_AUTHORITY_HOST`、`AadSettings.authorityHost`）與 `reference/ad-azure-frontend-logic/src/backend/services/aad-service.ts`（`CANONICAL_AAD_ISSUER_HOST` 常數、`authority()` vs `expectedIssuer()` 之分離）。⚠ 該實作**自組 URL、不使用 MSAL**，故無 instance discovery 問題；本專案用 `@azure/msal-node`，`AC-E3` 為其專屬增量約束。
- Diagram: [../diagrams/F001-auth-login.mmd](../diagrams/F001-auth-login.mmd)
- Data: [ACCOUNT](../data-model.md#account-entity)（`email` 為 AD 身分對應鍵）, [PERSON](../data-model.md#person-entity)
- NFR: [資訊安全](../nfr.md#security), [整合可靠性](../nfr.md#integration), [部署與機密管理](../nfr.md#deployment)
- Depends on: [F004 組織同步](F004-org-sync.md)（帳號與 email 資料來源）
- Next: [F002 角色分流](F002-role-based-routing.md)
- OQ: [open-questions.md](../open-questions.md) OQ-E01-01/02/04、OQ-NFR002〔部分收斂〕
