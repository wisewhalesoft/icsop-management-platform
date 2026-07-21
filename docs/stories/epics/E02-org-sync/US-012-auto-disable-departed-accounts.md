# US-012: 離職者自動停用帳號

> **Story ID**: US-012
> **Epic**: [E02 組織同步與異動管理](epic-brief.md)
> **Priority**: P0
> **Phase**: 1
> **Estimated Points**: 5

## User Story

As a 系統管理員，
I want 當同步資料顯示某人員已離職（或不再存在於外部來源資料中）時，系統自動停用其帳號，
So that 離職人員無法繼續存取系統，同時保留其歷史操作與稽核紀錄以符合稽核需求。

## Acceptance Criteria

**AC1: 離職判定即自動停用（以 EMPSTS 為權威判定）**
- Given 某帳號對應人員於同步資料中之在職狀態欄位 `VW_HPMUSER.EMPSTS` 由 `A`（在職）變更為非 `A`（如 `B` 已離職）
- When 同步（排程或手動）完成判定
- Then 系統將該帳號狀態設為「停用」，帳號無法再登入（適用兩種驗證方式：管理員帳密登入與上游系統登入）；判定**不得**以 `RESIGNDT`（離職日）欄位是否有值為準——該欄位「未離職」之哨兵值為 `9999-12-31` 而非 NULL，僅 `EMPSTS='A'` 為在職判定之權威依據

**AC2: 既有 Session 立即失效**
- Given 該離職人員帳號在停用當下仍有有效登入 session
- When 帳號被停用
- Then 該使用者下一次操作（含頁面刷新、API 呼叫）應被拒絕並強制登出，不可繼續使用既有 session 至逾時（連結 [E01 US-004 Session 逾時與登出](../E01-account-auth/US-004-session-timeout.md)）

**AC3: 稽核歷史保留不被刪除**
- Given 帳號已因離職被停用
- When 系統管理員或稽核人員查詢該人員過往的文件調閱歷程或操作紀錄
- Then 所有歷史稽核紀錄（見 [E07 US-060](../E07-audit-trail/US-060-audit-trail-logging.md)）仍完整可查，帳號僅為「停用」狀態，非刪除

**AC4: 停用非刪除，資料可追溯**
- Given 帳號被系統自動停用
- When 系統管理員於後台查看帳號清單
- Then 該帳號仍顯示於清單中，狀態標示為「停用（離職）」，並記錄停用時間與觸發來源（自動同步）

**AC5: 人員自來源 view 消失不得逕行判定為離職**
- Given 某帳號於上次同步時存在於 `VW_HPMUSER`，但本次同步時查無該筆資料（自來源 view 消失，而非 `EMPSTS` 變更為非 `A`）
- When 系統執行同步比對
- Then 系統**不得**逕行將該帳號判定為離職並停用；此情況應計入 [US-010 AC5](US-010-daily-scheduled-sync.md) 之消失筆數閾值保護統計，並產生告警供系統管理員人工核實（可能成因包含上游來源 view 之 `INNER JOIN` 靜默吞人等資料品質風險，見[上游人資來源資料契約 §3.2](../../../specs/upstream-hr-source-contract.md)）

## Technical Notes

- 帳號停用應為軟刪除（soft-disable），不可實體刪除帳號記錄，以維持稽核紀錄之外鍵完整性
- Session 失效機制建議透過 JWT 黑名單或 session store 主動撤銷，而非僅依賴到期時間，才能達成「立即失效」
- 停用邏輯需與 [US-010](US-010-daily-scheduled-sync.md) 同步流程中的異動分類（離職/停用類型）串接
- 在職判定之權威欄位為 `VW_HPMUSER.EMPSTS`（`A`=在職），優於 `RESIGNDT`；已知上游存在極少數 `EMPSTS='A'` 卻帶過去離職日期之不一致資料，同步邏輯須容忍並記錄告警，**不得**因此中止同步（見[上游人資來源資料契約 §6](../../../specs/upstream-hr-source-contract.md)）
- 帳號主鍵應為 `(COMPID, USERID)`；`USERID` 為登入帳號、實測 100% 唯一，`EMPNO`（員工編號）非唯一鍵（存在一人多帳號情形），不可作為帳號比對主鍵（見[上游人資來源資料契約 §7.2](../../../specs/upstream-hr-source-contract.md)）

## Test Cases

| ID | 情境 | 類型 |
|---|---|---|
| TC-012-01 | 同步偵測到某人員離職，執行後該帳號狀態變為「停用」，且立即無法透過任一驗證方式登入 | Happy Path |
| TC-012-02 | 離職人員停用當下有一個有效 session，下一個 API 請求應回傳 401/403 並要求重新登入 | Happy Path |
| TC-012-03 | 離職人員嘗試以已停用帳號透過 Azure AD 登入，系統應拒絕並回傳明確錯誤（帳號已停用），不可因 AD 驗證通過而略過帳號狀態檢查 | Error Case |
| TC-012-04 | 查詢已停用帳號過往 90 天內的文件調閱歷程，應可正常查得完整紀錄，筆數與停用前一致 | Edge Case |
| TC-012-05 | 人員原被誤判離職而停用，隔日同步該人員重新出現於來源資料且在職狀態正常，系統應能重新啟用帳號（需人工確認或自動恢復，記錄為 Open Question） | Edge Case |
| TC-012-06 | 某在職帳號因上游 `INNER JOIN` 類問題於本次同步之來源資料中消失（非 `EMPSTS` 變更），系統不得將其判定為離職或停用，應計入消失筆數統計並觸發告警 | Error Case |
| TC-012-07 | 某帳號 `EMPSTS='A'` 但 `RESIGNDT` 帶有過去日期（已知上游不一致資料），系統應維持該帳號在職、不停用，並記錄告警而非中止同步 | Edge Case |

> **補充說明（TC-012-03，2026-07-20）**：Azure AD 驗證通過僅代表「AD 身分成立」，不代表「本地帳號可登入」——[E01 US-001](../E01-account-auth/US-001-upstream-signature-login.md) 之帳號比對邏輯本身即強制 `EMPSTS='A'`（見 US-001 AC1/AC4），故離職（`EMPSTS≠'A'`）帳號在比對階段即不會被命中，不需仰賴額外的「停用狀態」二次檢查即可阻擋登入；本 TC 驗證的是「萬一帳號曾被命中後才轉為停用（如管理員手動停用，或比對命中後才發生離職）」之情境下，停用檢查仍須生效。

## Dependencies

**Blocked By**
- [US-010 每日排程同步](US-010-daily-scheduled-sync.md) — 提供離職判定依據

**Blocks**
- [E01 US-004 Session 逾時與登出](../E01-account-auth/US-004-session-timeout.md) — 需支援「主動撤銷」機制供本 Story 呼叫
- [E07 US-060 稽核軌跡記錄](../E07-audit-trail/US-060-audit-trail-logging.md) — 保留停用帳號之歷史稽核資料完整性

## Definition of Done

- [ ] Acceptance criteria met
- [ ] Unit tests passing（覆蓋率 >80%，含 session 撤銷情境）
- [ ] Code review approved
- [ ] Documentation updated

## Related

- Epic: [E02 組織同步與異動管理](epic-brief.md)
- Story: [E01 US-004 Session 逾時與登出](../E01-account-auth/US-004-session-timeout.md)
- Story: [E07 US-060 查看/下載/列印稽核軌跡記錄](../E07-audit-trail/US-060-audit-trail-logging.md)
- NFR: [NFR-002 資訊安全與身分驗證](../../non-functional/NFR-002-security.md)
- NFR: [NFR-003 稽核與資料保留](../../non-functional/NFR-003-audit-retention.md)
- Spec: [上游人資來源資料契約](../../../specs/upstream-hr-source-contract.md)（在職判定、消失保護定案）

## Open Questions

- [ ] 人員被誤判離職而停用後，隔日恢復在職狀態時，帳號是否應自動恢復啟用，或需系統管理員人工確認後才能恢復？（見 TC-012-05）
