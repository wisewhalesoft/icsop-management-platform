# NFR-006: 系統整合可靠性 (Integration Reliability)

> **NFR ID**: NFR-006
> **Category**: Reliability
> **Priority**: P0
> **Status**: Draft

## Requirement

本系統與兩個外部相依系統整合：(1) Azure AD（Entra ID）之 OIDC 身分提供者服務（authorization／token／JWKS 端點，見 [E01 US-001](../epics/E01-account-auth/US-001-upstream-signature-login.md)）、(2) 外部 MSSQL View 提供的組織/人員/職級資料。兩者皆為外部相依，需有可靠的錯誤處理、重試與通知機制，避免外部異常導致本系統資料損毀或服務中斷。

## Acceptance Criteria

- **AC1（同步失敗重試）**：每日排程同步（[E02 US-010](../epics/E02-org-sync/US-010-daily-scheduled-sync.md)）失敗時，系統須自動重試（草案建議 3 次，間隔遞增）並於最終失敗時通知系統管理員。
- **AC2（交易性保護）**：組織/人員同步過程中若中途失敗，不可造成本地資料庫處於部分更新的不一致狀態（需以交易(transaction)或暫存表+切換方式確保原子性）。
- **AC3（Azure AD 身分提供者容錯）**：Azure AD 之 authorization／token／JWKS 端點逾時或不可用、`id_token` 驗證失敗、回應格式錯誤等情境，須回傳明確錯誤碼且不得使系統崩潰或洩漏內部錯誤細節（含 Azure AD 原始錯誤內容）給呼叫端；已核發之本平台既有 JWT/session 不受影響（Azure AD 僅參與初次驗證）。
- **AC4（同步互斥）**：手動觸發同步（[E02 US-011](../epics/E02-org-sync/US-011-manual-trigger-sync.md)）與排程同步之間需有互斥鎖，避免同時執行造成資料競爭。

## Impacted Stories

- [E02 US-010 每日排程同步](../epics/E02-org-sync/US-010-daily-scheduled-sync.md)
- [E02 US-011 手動觸發同步](../epics/E02-org-sync/US-011-manual-trigger-sync.md)
- [E01 US-001 Azure AD OIDC 登入（靜默 SSO）](../epics/E01-account-auth/US-001-upstream-signature-login.md)

## Validation Method

- 模擬 MSSQL View 連線中斷/逾時情境，驗證重試與通知機制。
- 模擬同步中途失敗，驗證資料庫回滾/一致性。
- 模擬 Azure AD 身分提供者異常情境（`id_token` 驗證失敗、逾時、JWKS 端點不可用、格式錯誤），驗證錯誤處理與記錄。

## Open Questions

- [ ] 外部 MSSQL View 的確切 schema、欄位定義、可用性 SLA 未提供，需與外部系統負責單位確認，見 [E02 US-010](../epics/E02-org-sync/US-010-daily-scheduled-sync.md)。
- [ ] 同步失敗通知管道（email/系統內通知）未定義。
