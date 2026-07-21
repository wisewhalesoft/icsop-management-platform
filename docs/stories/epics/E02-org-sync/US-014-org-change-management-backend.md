# US-014: 組織人員異動管理後台頁面

> **Story ID**: US-014
> **Epic**: [E02 組織同步與異動管理](epic-brief.md)
> **Priority**: P1
> **Phase**: 1
> **Estimated Points**: 5

## User Story

As a 系統管理員 / ICSOP 管理員，
I want 在後台有一個整合頁面可查看組織同步狀態、最近同步時間、異動清單與待確認提示，
So that 我能集中掌握組織資料同步的健康狀況，並快速找到需要處理的異動事項。

## Acceptance Criteria

**AC1: 同步狀態總覽**
- Given 系統管理員登入後台並進入「組織人員異動管理」頁面
- When 頁面載入
- Then 顯示最近一次同步的時間、觸發方式（排程/手動）、結果（成功/失敗）、異動筆數，並提供 [US-011](US-011-manual-trigger-sync.md) 之「立即同步」按鈕

**AC2: 同步歷史紀錄查詢**
- Given 頁面已載入
- When 使用者切換至「同步歷史」頁籤
- Then 顯示過去同步執行紀錄清單（可分頁），每筆包含執行時間、觸發方式、結果、異動筆數，失敗紀錄可展開查看錯誤訊息

**AC3: 待確認提示清單**
- Given 存在 [US-013](US-013-org-change-impact-alert.md) 產生之「組織異動待確認」提示（含「人員部門/職級異動」與「在職者掛於已關閉部門」兩類，見 [US-013 AC1/AC4](US-013-org-change-impact-alert.md)）
- When 使用者切換至「待確認異動」頁籤
- Then 顯示提示清單並區分提示類型，每筆可點擊直接導向對應 ICSOP 文件之當責設定編輯畫面（[E04 US-034](../E04-icsop-document/US-034-accountable-dept-chief-assignment.md)）；「已關閉部門」類提示無對應文件當責欄位時，導向該帳號之部門歸屬確認畫面

## Technical Notes

- 頁面存取權限依 [E08 US-070 角色×功能權限矩陣](../E08-permission-matrix/US-070-role-function-matrix.md)，草案為系統管理員可操作同步、ICSOP 管理員可查看並處理待確認提示
- 同步歷史建議支援依時間區間、結果篩選
- 同步紀錄之「中止」狀態（見 [US-010 AC5](US-010-daily-scheduled-sync.md)、[US-011 AC4](US-011-manual-trigger-sync.md)）於同步歷史頁籤需與一般「失敗」狀態明確區分呈現，並附消失筆數/比例資訊；來源 view 與欄位定義見[上游人資來源資料契約](../../../specs/upstream-hr-source-contract.md)

## Test Cases

| ID | 情境 | 類型 |
|---|---|---|
| TC-014-01 | 頁面正確顯示最近一次成功同步的時間與異動筆數 | Happy Path |
| TC-014-02 | 點擊待確認提示清單中的項目，正確導向對應文件之編輯畫面並帶入該文件 ID | Happy Path |
| TC-014-03 | 非授權角色（如一般使用者）嘗試存取本頁面 API，應回傳 403 | Error Case |
| TC-014-04 | 同步歷史紀錄超過 100 筆時，分頁功能正常運作，不影響頁面載入效能 | Edge Case |
| TC-014-05 | 待確認清單中同時存在「人員異動」與「已關閉部門」兩類提示，頁面正確以類型區分呈現，且分別導向正確處理畫面 | Edge Case |

## Dependencies

**Blocked By**
- [US-010 每日排程同步](US-010-daily-scheduled-sync.md)
- [US-011 手動觸發同步](US-011-manual-trigger-sync.md)
- [US-012 離職者自動停用帳號](US-012-auto-disable-departed-accounts.md)
- [US-013 組織異動影響文件提示](US-013-org-change-impact-alert.md)

**Blocks**
- 無下游 Story 直接依賴（為本 Epic 之整合呈現頁面）

## Definition of Done

- [ ] Acceptance criteria met
- [ ] Unit tests passing（覆蓋率 >80%）
- [ ] Code review approved
- [ ] Documentation updated

## Related

- Epic: [E02 組織同步與異動管理](epic-brief.md)
- Story: [US-010](US-010-daily-scheduled-sync.md) / [US-011](US-011-manual-trigger-sync.md) / [US-012](US-012-auto-disable-departed-accounts.md) / [US-013](US-013-org-change-impact-alert.md)
- Epic: [E08 權限矩陣](../E08-permission-matrix/epic-brief.md)
- Spec: [上游人資來源資料契約](../../../specs/upstream-hr-source-contract.md)
