# US-001: Azure AD OIDC 登入（靜默 SSO）

> **Story ID**: US-001
> **Epic**: [E01 帳號與驗證](epic-brief.md)
> **Priority**: P0
> **Phase**: 1
> **Estimated Points**: 8

## User Story

As a 已持有公司 Azure AD 登入身分（AD session）之在職使用者,
I want 透過 Portal 入口連結（或直接造訪 ICSOP）進入本平台後，由系統自動導向 Azure AD 完成標準 OIDC 驗證，並在我已有 AD session 時靜默完成（不需再輸入帳號密碼）,
So that 我能以既有的公司身分快速取得 ICSOP 存取權限，不必在本平台重複登入。

> ⚠️ **模型變更說明（2026-07-20 定案）**：本 story 原描述為「上游系統以 POST 方式傳送使用者資訊與簽章/共享密鑰」之模式，**已改為 ICSOP 自行註冊為 Azure AD 應用、走標準 OIDC** 之模式。ICSOP **不是** Portal 的 iframe 子站台；Portal 僅提供一個連結入口，不參與身分傳遞、不轉送任何使用者資料或簽章。權威定案見 [upstream-hr-source-contract.md §12](../../../specs/upstream-hr-source-contract.md#12-身分驗證與-ad-身分對應2026-07-20-部分定案)。
>
> **檔名說明**：本檔案檔名 `US-001-upstream-signature-login.md` **沿用舊命名**以維持既有連結路徑（全域多處以檔案路徑而非標題文字引用本檔），**不因內容改版而重新命名**；內容已於 2026-07-20 改為 Azure AD OIDC，請勿因檔名誤判本 story 仍描述舊有的上游簽章模式。

## Acceptance Criteria

### AC1：靜默 SSO 成功時核發有效憑證
**Given** 使用者已持有有效的 Azure AD session（已完成公司網域 AD 登入），並透過 Portal 入口連結或直接造訪 ICSOP 觸發登入流程
**When** ICSOP 後端將使用者導向 Azure AD 進行標準 OIDC 授權（帶 `state`、`nonce`、PKCE），因使用者已有 AD session 而**靜默完成**（不需再輸入帳密），Azure AD 回呼並附上 `id_token`；ICSOP 後端驗證 `id_token` 簽章、`iss`、`aud`、`state`、`nonce` 均通過，並以 `id_token` 之 **`email` claim**（完整 email、含網域、不分大小寫）比對出一筆**在職**（`EMPSTS='A'`）之本地 `ACCOUNT` 帳號
**Then** 系統核發本平台之有效 JWT/session，並回傳對應角色與導向資訊；此次登入事件需被記錄。

### AC2：id_token 缺少 email claim 時拒絕
**Given** Azure AD 完成驗證並回傳 `id_token`，但該 `id_token` 未帶 `email` claim
**When** ICSOP 後端解析 `id_token` 以取得對應鍵
**Then** 系統拒絕核發憑證，回傳明確錯誤代碼，並記錄此次失敗嘗試；**不得**以 `HREMAILADDR` 或其他欄位 fallback 猜測身分（見 [upstream-hr-source-contract.md §12.2](../../../specs/upstream-hr-source-contract.md#122-ad-身分-account-對應鍵已定案-2026-07-20)）。

### AC3：查無對應在職帳號時的處理（OQ-E01-01 定案不變）
**Given** Azure AD 驗證成功、`id_token` 帶有 `email` claim，但以完整 email（不分大小寫）於本地 `ACCOUNT` 資料查無對應之**在職**（`EMPSTS='A'`）帳號
**When** 系統嘗試核發本平台憑證
**Then** 系統拒絕登入，提示「查無有效帳號，請洽系統管理員」，不核發憑證、不自動建立帳號（此為定案規則，非草案，見 [Epic Open Questions](epic-brief.md#open-questions)）。

### AC4：帳號已停用時拒絕（即使 AD 驗證通過）
**Given** Azure AD 驗證成功且 email 比對命中一筆本地帳號，但該帳號目前處於**已停用**狀態（不論為系統管理員手動停用〔見 [US-005 AC3](US-005-account-management.md)〕，或因離職由組織同步自動停用〔見 [E02 US-012](../E02-org-sync/US-012-auto-disable-departed-accounts.md)〕）
**When** 系統於核發憑證前檢查帳號狀態
**Then** 系統拒絕核發憑證，提示「帳號已停用，請洽系統管理員」，即使 Azure AD 身分驗證本身成功。

### AC5：`state` 或 `nonce` 不符時拒絕（防重放／CSRF）
**Given** Azure AD 回呼帶回之 `state` 與發起請求時產生的值不符，或 `id_token` 內 `nonce` 與發起請求時產生的值不符
**When** ICSOP 後端於回呼階段執行驗證
**Then** 系統拒絕本次登入流程，不核發任何憑證，並記錄此次異常事件（見 [NFR-002](../../non-functional/NFR-002-security.md)、[NFR-006](../../non-functional/NFR-006-integration-reliability.md)）。

## Technical Notes

- 需向 IT 申請一組 Azure AD app registration（Redirect URI 依 development／staging／production 各一組、Tenant ID／Client ID 由 IT 提供、Client Secret 或憑證以環境變數／密鑰機制注入且不得寫入版控），詳細需求清單見 [upstream-hr-source-contract.md §12.3](../../../specs/upstream-hr-source-contract.md#123-azure-ad-應用註冊需求)。
- 防重放／CSRF 防護採標準 OIDC `state` ＋ `nonce` ＋ PKCE（**取代**原設計之「時間戳＋nonce 自訂簽章」與共享密鑰交換/輪替方案）；具體函式庫與實作細節由系統架構師於技術設計階段決定。
- 對應鍵比對規則：以 `id_token` 之 **`email` claim**、**完整 email（含網域）、不分大小寫**逐字比對 `ACCOUNT.email`，並強制 `EMPSTS='A'`；比對邏輯需與 [E02 US-010 每日排程同步](../E02-org-sync/US-010-daily-scheduled-sync.md) 產生的 `ACCOUNT` 資料連動。
- 因對應鍵改採完整 email（不同公司網域天然區分），**不需**額外併入 `COMPID` 做複合比對；`USERID` 並非 AD 帳號名，不作為對應鍵（僅為 `ACCOUNT` 內部穩定鍵，見 [upstream-hr-source-contract.md §7.2](../../../specs/upstream-hr-source-contract.md#72-穩定鍵)）。
- Portal 僅提供連結入口，**不**傳遞任何使用者資料、token 或簽章；ICSOP 直接對 Azure AD 認證，無需與 Portal 對接或索取其對應規則。

## Test Cases

| ID | 情境 | 類型 |
|---|---|---|
| TC-001-01 | 使用者已有有效 AD session，經 Portal 入口連結或直接造訪 ICSOP → 靜默完成 OIDC 授權，成功核發 JWT，回傳正確角色 | Happy Path |
| TC-001-02 | `id_token` 驗證失敗（簽章不符／`iss` 或 `aud` 不符）→ 拒絕核發憑證，記錄失敗事件 | Error Case |
| TC-001-03 | `id_token` 缺少 `email` claim → 回傳明確錯誤，拒絕核發憑證 | Error Case |
| TC-001-04 | email 比對不到任何在職（`EMPSTS='A'`）帳號 → 拒絕並提示「請洽系統管理員」，不核發憑證 | Edge Case |
| TC-001-05 | email 比對到帳號，但該帳號已被停用（管理員手動停用或離職自動停用）→ 拒絕並提示「帳號已停用，請洽系統管理員」 | Edge Case |
| TC-001-06 | 回呼階段 `state` 或 `nonce` 不符（可能為 CSRF／重放攻擊）→ 拒絕，不核發任何憑證，記錄異常事件 | Edge Case / Security |
| TC-001-07 | `EMAILADDR` 與 `id_token.email` 大小寫不同（如網域大小寫混用）→ 比對仍應成功（不分大小寫） | Edge Case |

## Dependencies

- **Blocked By**：[E02 US-010 每日排程同步](../E02-org-sync/US-010-daily-scheduled-sync.md)（email 對應比對依賴組織同步之 `ACCOUNT` 資料）
- **Blocks**：[US-003 登入後角色導向](US-003-role-based-routing.md)、[US-004 Session 逾時與登出](US-004-session-timeout.md)

## Definition of Done

- [ ] Acceptance criteria met
- [ ] Unit tests passing (>80% coverage)
- [ ] Code review approved
- [ ] Documentation updated

## Related

- [Epic Brief: E01 帳號與驗證](epic-brief.md)
- [upstream-hr-source-contract.md §12 身分驗證與 AD 身分對應](../../../specs/upstream-hr-source-contract.md#12-身分驗證與-ad-身分對應2026-07-20-部分定案)
- [NFR-002 資訊安全與身分驗證](../../non-functional/NFR-002-security.md)
- [NFR-006 系統整合可靠性](../../non-functional/NFR-006-integration-reliability.md)
- [E02 US-010 每日排程同步](../E02-org-sync/US-010-daily-scheduled-sync.md)
