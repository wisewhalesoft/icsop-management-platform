# US-013: 組織異動影響文件提示

> **Story ID**: US-013
> **Epic**: [E02 組織同步與異動管理](epic-brief.md)
> **Priority**: P1
> **Phase**: 2
> **Estimated Points**: 5

## User Story

As a ICSOP 管理員，
I want 當組織/人員/職級異動可能影響某份 ICSOP 文件的制定公司/制定部門/制定室別、當責室長（主要/次要）、使用部門設定時，系統主動提示我，
So that 我能及時重新確認並更新受影響文件的當責設定，避免文件當責資訊因人員異動而失準。

## Acceptance Criteria

**AC1: 異動影響範圍判定**
- Given [US-010](US-010-daily-scheduled-sync.md) 同步偵測到某人員的部門或職級異動（非離職，例如轉調、升遷）
- When 該人員為某份或多份 ICSOP 文件的「當責室長-主要」「當責室長-次要」，或其原部門/組織單位為文件之「制定公司」「制定部門」「制定室別」「使用部門」
- Then 系統於受影響文件清單中標示「組織異動待確認」提示，並列出受影響的具體欄位

**AC2: 提示不強制變更**
- Given 文件被標示「組織異動待確認」
- When ICSOP 管理員尚未處理該提示
- Then 文件本身狀態（有效/失效/作廢）與既有當責設定維持不變，不會被系統自動覆寫（比照文件狀態切換「無簽核流程、管理員手動切換」之精神，異動確認亦為人工判斷，非自動生效）

**AC3: 提示可被處理並消除**
- Given ICSOP 管理員檢視某筆「組織異動待確認」提示
- When 管理員前往 [E04 US-034 制定組織與當責室長設定](../E04-icsop-document/US-034-accountable-dept-chief-assignment.md) 更新該欄位，或明確標記「已確認無需變更」
- Then 該提示自受理清單中移除，並記錄處理人員與處理時間

**AC4: 在職者掛於已關閉部門之提示**
- Given 某在職帳號之所屬部門於組織主檔中已為「已關閉部門」（`VW_DEPT_SQL.CLOSE_DATE` 已過，即非現行有效部門；實測 AS 現況為 11 人）
- When 同步偵測到此情形
- Then 系統於「待確認異動」清單中標示該帳號「掛於已關閉部門」提示，**不停用該帳號、亦不自動變更其部門歸屬**，待 ICSOP 管理員或系統管理員人工確認並更新其正確部門歸屬；此情境獨立於 AC1 之部門/職級異動（轉調/升遷）判定，兩者各自觸發、不互相取代

## Technical Notes

- Phase 1 先以後台清單方式呈現（於 [US-014](US-014-org-change-management-backend.md) 頁面），Phase 2 強化為主動通知（通知管道待確認，見 Open Questions）
- 判定邏輯需比對同步異動紀錄與 ICSOP 文件之制定組織/當責欄位（制定公司/制定部門/制定室別、當責室長-主要/次要、使用部門）之關聯人員/部門 ID
- 建議提示記錄需包含：文件 ID、異動類型、異動前後差異、產生時間、處理狀態
- 「已關閉部門」判定依 `VW_DEPT_SQL.CLOSE_DATE`（有效部門 ⇔ `CLOSE_DATE > GETDATE()`），見[上游人資來源資料契約 §4、§7.3](../../../specs/upstream-hr-source-contract.md)；此類提示之對象為「在職但部門主檔已失效」，與 AC1 之「人員部門/職級異動」為不同觸發條件，兩者需在待確認清單中可分辨（提示類型欄位）

## Test Cases

| ID | 情境 | 類型 |
|---|---|---|
| TC-013-01 | 某當責室長轉調至其他部門，同步後對應之 ICSOP 文件於清單中出現「組織異動待確認」提示，並正確標示「當責室長-主要」欄位受影響 | Happy Path |
| TC-013-02 | 管理員更新受影響文件的當責室長欄位後，提示自清單消失且記錄處理歷程 | Happy Path |
| TC-013-03 | 一人員同時為 5 份文件的當責室長，其職級異動應觸發 5 筆獨立提示，皆可分別處理 | Edge Case |
| TC-013-04 | 人員異動的部門與該人員原本所屬的「使用部門」欄位無關聯（僅為當責室長但部門異動未影響其文件制定組織設定），系統不應誤判產生不相關的提示 | Edge Case |
| TC-013-05 | 某在職帳號所屬部門之 `CLOSE_DATE` 已過（已關閉部門），同步後於待確認清單出現「掛於已關閉部門」提示，且該帳號未被停用、部門歸屬未被自動變更 | Edge Case |

## Dependencies

**Blocked By**
- [US-010 每日排程同步](US-010-daily-scheduled-sync.md) — 提供異動判定資料
- [E04 US-034 制定組織與當責室長設定](../E04-icsop-document/US-034-accountable-dept-chief-assignment.md) — 提示處理後導向之編輯功能

**Blocks**
- [US-014 組織人員異動管理後台頁面](US-014-org-change-management-backend.md) — 提示清單為該頁面主要內容之一

## Definition of Done

- [ ] Acceptance criteria met
- [ ] Unit tests passing（覆蓋率 >80%）
- [ ] Code review approved
- [ ] Documentation updated

## Related

- Epic: [E02 組織同步與異動管理](epic-brief.md)
- Story: [E04 US-034 制定組織與當責室長設定](../E04-icsop-document/US-034-accountable-dept-chief-assignment.md)
- Story: [US-014 組織人員異動管理後台頁面](US-014-org-change-management-backend.md)
- Spec: [上游人資來源資料契約](../../../specs/upstream-hr-source-contract.md)（已關閉部門判定依據）

## Open Questions

- [ ] Phase 2 之「主動通知」通知管道未定義（站內通知？Email？兩者皆需？）
- [ ] 組織異動觸發的當責重新指派提示，是否需要比文件狀態切換更嚴謹的處理流程（例如強制要求處理才能繼續編輯該文件）？目前假設為非強制提示，待利害關係人確認
