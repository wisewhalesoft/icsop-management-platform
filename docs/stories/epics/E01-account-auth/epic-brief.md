# Epic E01: 帳號與驗證

> **Epic ID**: E01
> **Priority**: P0
> **Phase**: 1
> **Status**: Draft
> **Stories**: 6 個

## Epic Goal

解決「誰可以登入、如何驗證身分、登入後導向何處、多久沒操作要強制登出」的問題。系統需並存兩種驗證方式（雙軌並行，不互斥）：

1. **Azure AD OIDC 登入（2026-07-20 定案）**：ICSOP 自行註冊為 Azure AD 應用，走標準 OIDC；使用者已有公司 AD session 時可**靜默 SSO**（不需再輸入帳密）。ICSOP **不是** Portal 的 iframe 子站台，Portal 僅提供一個連結入口、不參與身分傳遞。對應鍵為 `id_token` 之 **`email` claim**（完整 email、不分大小寫），限**在職**（`EMPSTS='A'`）帳號；防重放採標準 OIDC `state`＋`nonce`＋PKCE。詳見 [upstream-hr-source-contract.md §12](../../../specs/upstream-hr-source-contract.md#12-身分驗證與-ad-身分對應2026-07-20-部分定案)、[US-001](US-001-upstream-signature-login.md)。
2. **管理員帳號密碼登入**：由系統管理員於後台建立帳號密碼，供無法透過 Azure AD 登入之管理類角色使用（雙軌並存，不受上述變更影響）。

登入成功後依角色分流：一般使用者直接導向前台瀏覽頁；其餘四種角色（系統管理員／ICSOP管理員／主管／部門窗口）需先選擇「瀏覽頁」或「管理後台」入口。Session 採 30 分鐘無操作逾時機制，逾時後需重新登入。

本 Epic 是全系統的存取入口，所有後續 Epic（E02～E08）皆依賴本 Epic 提供的「已驗證身分」與「角色資訊」才能運作。

## User Stories

| Story ID | Title | Priority | File |
|---|---|---|---|
| US-001 | Azure AD OIDC 登入（靜默 SSO） | P0 | [US-001-upstream-signature-login.md](US-001-upstream-signature-login.md) |
| US-002 | 管理員帳密登入 | P0 | [US-002-admin-password-login.md](US-002-admin-password-login.md) |
| US-003 | 登入後角色導向 | P0 | [US-003-role-based-routing.md](US-003-role-based-routing.md) |
| US-004 | Session 逾時與登出 | P0 | [US-004-session-timeout.md](US-004-session-timeout.md) |
| US-005 | 帳號管理 CRUD | P0 | [US-005-account-management.md](US-005-account-management.md) |
| US-006 | 角色指派管理 | P0 | [US-006-role-assignment.md](US-006-role-assignment.md) |

## Dependencies

**Depends On**：
- [E08 權限矩陣 / US-070](../E08-permission-matrix/US-070-role-function-matrix.md) — 角色定義需先存在，US-006 角色指派才有依據。
- [E02 組織同步與異動管理 / US-010](../E02-org-sync/US-010-daily-scheduled-sync.md) — Azure AD OIDC 登入時，需以 `id_token` 之 `email` claim 比對組織同步產生之在職帳號資料。

**Blocks**：
- 幾乎所有其他 Epic（E02～E08）— 皆需要已登入且已識別身分/角色的使用者才能執行任何操作。

## Success Criteria

- 兩種登入方式皆可正確核發有效 session/JWT，且未授權請求一律被拒。
- 5 種角色登入後皆導向正確畫面。
- 30 分鐘無操作後，下一次操作會被導回登入頁；操作中的使用者不會被中途登出。
- 系統管理員可完整管理帳號生命週期（建立/查詢/停用/編輯）與角色指派。

## Open Questions

> 本 Epic 之 Open Questions 大部分已定案，完整決策紀錄見 [open-questions.md](../../../specs/open-questions.md)；仍有 1 項於 open-questions.md 中查無對應條目，維持未決並建議正式補列（見下）。

- [x] **登入驗證方式**（2026-07-20 補列並定案）— 已由「上游系統 POST 使用者資訊＋自訂簽章/共享密鑰」改為 **Azure AD OIDC**（ICSOP 自行註冊為 Azure AD 應用；使用者已有 AD session 時靜默 SSO；對應鍵為 `id_token` 之 `email` claim，限在職帳號；防重放採標準 `state`＋`nonce`＋PKCE）。詳見 [upstream-hr-source-contract.md §12](../../../specs/upstream-hr-source-contract.md#12-身分驗證與-ad-身分對應2026-07-20-部分定案)。管理員帳密登入軌與 30 分鐘 Session 逾時機制**不受影響**。
- [x] **上游登入查無對應帳號時之處理方式**（OQ-E01-01 ✅）— **定案（採選項 A）**：拒絕並提示洽管理員，不自動建立帳號。此規則於 Azure AD OIDC 模式下維持不變（AD 驗證通過但 email 查無在職帳號時同樣拒絕並提示洽管理員）。
- [x] **管理員帳密登入是否需登入失敗次數鎖定**（OQ-E01-02 ✅）— **定案**：本輪不做登入失敗鎖定（待資安政策再議）。
- [x] **單一帳號是否可同時擁有多個角色**（OQ-E01-06 ✅ 2026-07-20 補列並定案）— **單一帳號僅指派一個角色**。此為現行資料模型之既成決策（`ACCOUNT.roleCode` 為單值 FK；F025 角色×功能矩陣亦以單一角色判定授權），與 E08 假設一致。⚠ 註：此屬**設計隱含決策**而非訪談明示決策，若改為多角色屬材質變更（影響 ACCOUNT schema、RBAC 中介層與 F025 矩陣語意）。
- [x] **「操作」的判定基準**（OQ-E01-04 ✅）— **定案**：每次 API 更新 `lastActivityAt` 作為 Session 閒置逾時之活動判定基準。
