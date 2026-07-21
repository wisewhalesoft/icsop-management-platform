# US-011: 手動觸發同步

> **Story ID**: US-011
> **Epic**: [E02 組織同步與異動管理](epic-brief.md)
> **Priority**: P1
> **Phase**: 1
> **Estimated Points**: 3

## User Story

As a 系統管理員，
I want 在後台頁面手動立即觸發一次組織/人員資料同步，
So that 當外部人資系統有緊急異動（如即刻生效的離職）時，不需等待下一次排程即可讓本系統資料即時更新。

## Acceptance Criteria

**AC1: 手動觸發成功執行**
- Given 系統管理員登入後台且目前無其他同步正在執行中
- When 系統管理員點擊「立即同步」按鈕
- Then 系統立即啟動與 [US-010](US-010-daily-scheduled-sync.md) 相同的同步邏輯，頁面顯示「執行中」狀態

**AC2: 防止重複觸發**
- Given 目前已有一次同步（排程或手動）正在執行中
- When 系統管理員再次點擊「立即同步」
- Then 系統拒絕本次觸發並提示「同步進行中，請稍候」，不會啟動第二個並行同步程序

**AC3: 執行結果即時呈現**
- Given 手動同步已完成（成功/失敗/中止）
- When 系統管理員停留在後台頁面
- Then 頁面自動更新顯示同步結果（成功/失敗/中止、異動筆數、若失敗或中止則顯示錯誤或中止原因摘要），無需手動重新整理頁面

**AC4: 消失閾值保護觸發時之呈現**
- Given 手動觸發之同步因在職帳號消失比例超過閾值（草案 5%）而依 [US-010 AC5](US-010-daily-scheduled-sync.md) 中止
- When 同步中止
- Then 頁面明確顯示「已中止（未執行停用）」狀態，與一般連線失敗類之「失敗」狀態於文案上可區分，並提示系統管理員後續應人工核實上游資料

## Technical Notes

- 手動觸發與排程觸發應共用同一組同步服務邏輯，僅觸發來源不同（記錄於同步紀錄的 `trigger_type` 欄位：`scheduled` / `manual`）；[US-010](US-010-daily-scheduled-sync.md) 之消失筆數閾值保護（AC5）對手動觸發同等適用，不因觸發來源而放寬
- 需以鎖機制（如資料庫層級鎖或應用層互斥鎖）防止排程與手動觸發同時執行造成資料競爭
- 執行狀態更新建議透過輪詢（polling）或 WebSocket 呈現，避免使用者需手動整理頁面
- 來源物件（`VW_DEPT_SQL`／`VW_HPMUSER`／`VW_HRCOMF`，經 linked server）、連線與下推限制同 [US-010 Technical Notes](US-010-daily-scheduled-sync.md)，詳見[上游人資來源資料契約](../../../specs/upstream-hr-source-contract.md)

## Test Cases

| ID | 情境 | 類型 |
|---|---|---|
| TC-011-01 | 系統管理員點擊「立即同步」，同步於數秒後完成，頁面正確顯示成功狀態與異動筆數 | Happy Path |
| TC-011-02 | 同步進行中時再次點擊按鈕，系統回傳明確錯誤訊息且不啟動第二次同步（可透過檢查同步紀錄僅新增 1 筆執行中紀錄驗證） | Error Case |
| TC-011-03 | 手動觸發同步時外部 MSSQL View 無法連線，頁面正確顯示失敗狀態與錯誤訊息 | Error Case |
| TC-011-04 | 非系統管理員角色嘗試呼叫手動同步 API，應被拒絕（403），驗證權限依 [E08 角色×功能權限矩陣](../E08-permission-matrix/US-070-role-function-matrix.md) | Edge Case |
| TC-011-05 | 手動觸發時模擬在職帳號消失比例超過 5% 閾值，頁面應顯示「已中止（未執行停用）」而非一般「失敗」，且不執行任何帳號停用 | Edge Case |

## Dependencies

**Blocked By**
- [US-010 每日排程同步](US-010-daily-scheduled-sync.md) — 共用同步核心邏輯

**Blocks**
- 無下游 Story 直接依賴（為 US-010 之便利性擴充）

## Definition of Done

- [ ] Acceptance criteria met
- [ ] Unit tests passing（覆蓋率 >80%，含並行觸發鎖定情境）
- [ ] Code review approved
- [ ] Documentation updated

## Related

- Epic: [E02 組織同步與異動管理](epic-brief.md)
- Story: [US-010 每日排程同步](US-010-daily-scheduled-sync.md)
- Story: [US-014 組織人員異動管理後台頁面](US-014-org-change-management-backend.md)
- NFR: [NFR-006 系統整合可靠性](../../non-functional/NFR-006-integration-reliability.md)
- Spec: [上游人資來源資料契約](../../../specs/upstream-hr-source-contract.md)
