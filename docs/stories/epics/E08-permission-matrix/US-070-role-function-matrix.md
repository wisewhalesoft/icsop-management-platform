# US-070: 角色×功能權限矩陣草案

> **Story ID**: US-070
> **Epic**: [E08 權限矩陣](epic-brief.md)
> **Priority**: P0
> **Phase**: 1
> **Estimated Points**: 5

## User Story

As a 系統架構師/後端開發者,
I want 取得一份角色 × 功能的權限矩陣草案,
So that 我能在 API 層落實每個角色對每個後台功能的存取控制，避免越權操作。

## 角色清單（5 種，定案）

系統管理員（SysAdmin）、ICSOP管理員（ICSOPAdmin）、主管（Supervisor，即當責室長/部門主管）、部門窗口（DeptContact）、一般使用者（User）。

## 權限矩陣草案

| 功能 | 系統管理員 | ICSOP管理員 | 主管 | 部門窗口 | 一般使用者 |
|---|---|---|---|---|---|
| 帳號管理 | CRUD | 唯讀 | 無 | 無 | 無 |
| 角色指派 | CRUD | 無 | 無 | 無 | 無 |
| 循環管理（DAG） | 唯讀 | CRUD | 唯讀 | 無 | 無 |
| ICSOP文件管理 | 唯讀 | CRUD | 唯讀 | 唯讀 | 無 |
| 文件使用表單管理 | 唯讀 | CRUD | 無 | 無 | 無 |
| 附錄管理 | 唯讀 | CRUD | 無 | 無 | 無 |
| 文件索引管理 | 唯讀 | CRUD | 無 | 無 | 無 |
| 文件調閱歷程查詢 | 全部唯讀 | 全部唯讀 | 無 | 無 | 無 |
| 文件變更歷程 | 唯讀 | 唯讀 | 無 | 無 | 無 |
| 組織人員異動管理（同步操作） | CRUD（可觸發同步/查看） | 唯讀 | 無 | 無 | 無 |
| 前台瀏覽 | 可 | 可 | 可 | 可 | 可 |
| 下載/列印文件 | 可（浮水印） | 可（浮水印） | 可（浮水印） | 可（浮水印） | 可（浮水印） |
| 系統參數設定 | CRUD | 無 | 無 | 無 | 無 |

> **定案補充（2026-07-17）**：「角色指派」為「帳號管理」功能內的 modal 操作，**非獨立側選單頁面**；矩陣仍將「角色指派」保留為獨立權限列（僅系統管理員 CRUD，其餘皆無）。ICSOP管理員對「帳號管理」列本身為唯讀，但不因此取得角色指派操作權限。

## Acceptance Criteria

### AC1：API 層依矩陣擋下未授權操作
**Given** 一個角色對某功能的權限為「無」或「唯讀」
**When** 該角色使用者嘗試呼叫該功能的寫入型 API（Create/Update/Delete）
**Then** 系統回傳 403 權限不足錯誤，且該操作不得執行。

### AC2：唯讀權限僅允許查詢
**Given** 角色對某功能標示為「唯讀」
**When** 該角色使用者呼叫查詢類 API
**Then** 系統允許回傳資料；但呼叫任何寫入類 API 一律被拒。

### AC3：矩陣變更需可追溯
**Given** 矩陣草案經使用者審核後需調整
**When** 調整定案
**Then** 本文件需更新版本並移除對應 Open Question，變更本身應留下記錄（如透過文件版本控制）。

## Technical Notes

- 建議以 RBAC（Role-Based Access Control）中介層（middleware/guard）實作，矩陣可轉換為設定檔或資料庫規則表，避免權限判斷邏輯散落於各業務程式碼中。
- 「本部門相關」「本部門唯讀」等範圍限定機制，需與 [E02 組織架構](../E02-org-sync/epic-brief.md)（公司>本部>部>處/室）的部門歸屬邏輯連動。**（2026-07-17 更新）目前矩陣中已無任一角色使用「本部門」範圍限定**：主管「循環管理（DAG）」已由「唯讀（本部門相關）」改為「唯讀」（全公司，OQ-E08-03 定案，見 Open Questions）；主管「文件調閱歷程查詢」先前已由「本部門」改為「無」（見本文件 Open Questions 2026-07-16 定案）。本機制仍保留為系統一般性能力（供未來角色/功能新增時沿用），僅標示現行矩陣暫無實際使用案例，實作時仍可預留此擴充點，非刪除。

## Test Cases

| ID | 情境 | 類型 |
|---|---|---|
| TC-070-01 | ICSOP管理員呼叫循環管理 CRUD API → 允許執行 | Happy Path |
| TC-070-02 | 一般使用者呼叫帳號管理 API → 回傳 403 | Error Case |
| TC-070-03 | 部門窗口呼叫 ICSOP 文件刪除 API → 回傳 403（部門窗口無 CRUD 權限） | Error Case |
| TC-070-04 | 主管呼叫文件調閱歷程查詢、文件變更歷程、文件使用表單管理或附錄管理 API（矩陣皆為「無」）→ 回傳 403 | Error Case |
| TC-070-05 | 系統管理員呼叫 ICSOP 文件管理**查詢** API（唯讀）→ 允許回傳；呼叫**寫入**類 → 回傳 403（可查不可改） | Edge Case |

## Dependencies

- **Blocked By**：[E01 US-005 帳號管理 CRUD](../E01-account-auth/US-005-account-management.md)、[US-006 角色指派管理](../E01-account-auth/US-006-role-assignment.md)
- **Blocks**：[E01 US-003 登入後角色導向](../E01-account-auth/US-003-role-based-routing.md)，以及 E02～E07 全部具備寫入操作之 Story

## Definition of Done

- [ ] Acceptance criteria met
- [ ] Unit tests passing (>80% coverage)
- [ ] Code review approved
- [ ] Documentation updated

## Related

- [Epic Brief: E08 權限矩陣](epic-brief.md)
- [US-071 角色×欄位權限矩陣草案](US-071-role-field-matrix.md)
- [E01 US-006 角色指派管理](../E01-account-auth/US-006-role-assignment.md)

## Open Questions

- [x] （已定案）「主管」「部門窗口」對 ICSOP 文件管理**皆唯讀**，僅 ICSOP 管理員可編輯（無建議編輯／回報審核流程）。
- [x] （已定案 2026-07-16）**系統管理員**對循環管理／ICSOP 文件管理／文件使用表單管理為**唯讀**（比照主管，可查不可改）；**主管無「文件使用表單管理」與「文件調閱歷程查詢」權限**。
- [x] **（已定案 2026-07-17，OQ-E08-03）主管「循環管理（DAG）」可視範圍由「唯讀（本部門相關）」改為「唯讀」（全公司）**：與主管對「ICSOP 文件管理」全公司唯讀之範圍一致，消弭原本「文件管理可見全公司、循環管理僅本部門」之雙入口不一致（見 [E03 US-025](../E03-lifecycle-dag/US-025-lifecycle-tree-preview.md) 原 OQ-E03-06／新增邊界問題）。主管對循環仍為**唯讀**，寫入類操作（新增/編輯節點、建立連線等）仍一律 403，僅可視範圍放寬。連帶：[E03 epic-brief](../E03-lifecycle-dag/epic-brief.md) 之 OQ-E03-01（循環是否需要「擁有部門」欄位）不再以「主管可視範圍」為前提用途，若仍有其他用途（如未來報表/統計）需保留待確認，本次不因此關閉該 OQ。
- [x] **（已定案 2026-07-17，OQ-E07-04）新增「文件變更歷程」功能列**：使用者澄清「變更歷程」（Change History）為**獨立後台功能**，不歸屬／不比照「文件調閱歷程查詢」列（change 歸 change、access 歸 access），故於矩陣新增獨立一列「文件變更歷程」＝系統管理員／ICSOP管理員皆**唯讀**（全公司）、主管／部門窗口／一般使用者皆**無**。此列涵蓋 [E07 US-062 ICSOP 程序書變更歷程](../E07-audit-trail/US-062-document-change-history.md)與[US-063 循環樹狀圖變更歷程](../E07-audit-trail/US-063-lifecycle-tree-change-history.md)兩個 tab，兩者共用同一權限值（皆唯讀給 SysAdmin/ICSOPAdmin，其餘無）。
- [x] **（已定案 2026-08-06，比照 E10）新增「附錄管理」功能列**：附錄管理（[E10](../E10-appendix/epic-brief.md)）之權限模型與「文件使用表單管理」完全比照，故於矩陣新增獨立一列「附錄管理」＝系統管理員唯讀／ICSOP管理員CRUD／主管、部門窗口、一般使用者皆無，插於「文件使用表單管理」列之後。
- [ ] 本矩陣其餘部分為分析師草案，需經使用者／利害關係人正式審核後才能作為開發依據。
