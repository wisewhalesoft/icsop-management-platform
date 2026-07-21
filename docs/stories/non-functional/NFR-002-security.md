# NFR-002: 資訊安全與身分驗證 (Security)

> **NFR ID**: NFR-002
> **Category**: Security
> **Priority**: P0
> **Status**: Draft

## Requirement

系統涉及公司內部管制文件（ICSOP）與人員身分資料，須符合基本資訊安全要求，涵蓋傳輸安全、憑證/密鑰管理、身分驗證機制、檔案存取控管與密碼儲存規範。

## Acceptance Criteria

- **AC1（傳輸加密）**：所有前後端、後端與外部系統（上游登入 API、MSSQL View）之通訊皆須使用 HTTPS/TLS 1.2 以上。
- **AC2（Azure AD OIDC 身分驗證）**：使用者身分驗證採 Azure AD OIDC，後端須以 Azure AD JWKS 公鑰驗證 `id_token` 簽章，並檢查 `iss`（發行者）、`aud`（受眾）、`exp`（過期時間）、`nbf`（生效時間）、`nonce` 均相符；防重放／CSRF 攻擊採標準 OIDC `state`＋`nonce`＋PKCE 機制，三者均須單次使用（one-time use）、用畢即失效。驗證失敗須拒絕核發 JWT/session 並記錄失敗事件。**本機制無共享密鑰、無自訂簽章，`id_token` 亦不經網址（URL query string）傳遞。**（權威定案見 [upstream-hr-source-contract.md §12](../../specs/upstream-hr-source-contract.md#12-身分驗證與-ad-身分對應2026-07-20-部分定案)）
- **AC2-1（身分對應鍵）**：身分比對以 `id_token` 之 `email` claim 對應本地 `ACCOUNT.email`，須為**完整 email（含網域）逐字比對、不分大小寫**，並強制僅比對**在職**帳號（`EMPSTS='A'`）；**不得** fallback 至 `HREMAILADDR` 或其他欄位猜測身分。若比對命中多筆帳號，系統須**拒絕核發憑證並觸發告警**，不得任意選取其中一筆。
- **AC3（密碼儲存）**：管理員帳密登入之密碼須以不可逆雜湊演算法（如 bcrypt/argon2）加鹽儲存，不得明碼或可逆加密儲存。
- **AC4（Session/JWT 管理）**：JWT/session token 須有效期控制（對應 [E01 US-004](../epics/E01-account-auth/US-004-session-timeout.md) 30 分鐘逾時規則），並提供登出時的 token 撤銷機制。
- **AC5（檔案存取控管）**：ICSOP PDF、使用表單、OJT 簽到表等存於 Azure Blob Storage 的檔案，不可透過猜測或直接組合網址存取，需經過身分驗證與權限檢查（依 [E08 權限矩陣](../epics/E08-permission-matrix/epic-brief.md)）後由後端核發短效期存取憑證（如 SAS Token）。

## Impacted Stories

- [E01 US-001 Azure AD OIDC 登入（靜默 SSO）](../epics/E01-account-auth/US-001-upstream-signature-login.md)
- [E01 US-002 管理員帳密登入](../epics/E01-account-auth/US-002-admin-password-login.md)
- [E01 US-004 Session逾時與登出](../epics/E01-account-auth/US-004-session-timeout.md)
- [E04 US-036 PDF與OJT附件上傳](../epics/E04-icsop-document/US-036-pdf-ojt-attachment-upload.md)
- [E08 權限矩陣（全部）](../epics/E08-permission-matrix/epic-brief.md)

## Validation Method

- 上線前執行安全檢視（security review）與滲透測試（至少涵蓋 `id_token` 偽造/竄改、`state`／`nonce` 重放攻擊、越權存取檔案三項情境）。
- 密碼雜湊實作以單元測試驗證不可逆性與加鹽正確性。
- 檔案存取權限以整合測試驗證：未登入/無權限使用者無法透過直接網址取得檔案。

## Open Questions

- [x] ~~上游簽章演算法（如 HMAC-SHA256）、共享密鑰交換與輪替機制的具體規格未提供~~ — **已定案／已消解（2026-07-20，OQ-NFR002 部分收斂）**：登入驗證改採 Azure AD OIDC，公鑰由 Azure AD JWKS 自行管理與輪替，**無共享密鑰、無自訂簽章**，此問題項已消解。詳見 [upstream-hr-source-contract.md §12](../../specs/upstream-hr-source-contract.md#12-身分驗證與-ad-身分對應2026-07-20-部分定案)、`docs/specs/open-questions.md` OQ-NFR002。（*歷史說明*：本行原文字為舊「上游 POST＋自訂簽章」模型下之待確認項，僅保留供追溯，非現行機制描述。）
- [ ] 是否有公司既定的資安規範/框架（如 ISO 27001 相關內部政策）需要遵循，原始訪談未提及。（OQ-NFR002 部分收斂之殘餘待確認項之一：公司整體資安框架，仍待資安/外部單位確認）
- [ ] Azure Blob Storage 的存取金鑰管理與輪替策略待確認。（OQ-NFR002 部分收斂之殘餘待確認項之一：Blob 金鑰輪替政策與週期，仍待確認）
