# US-103: OJT 場次管理（單位列×場次制，含上傳與單位分組清單）

> **Story ID**: US-103
> **Epic**: [E11 OJT 進度管理](epic-brief.md)
> **Priority**: P1
> **Phase**: 1
> **Estimated Points**: 8

## User Story

As an **ICSOP 管理員／主管／部門窗口**,
I want **針對任一份 ICSOP 文件底下的任一個使用單位，新增一筆或多筆教育訓練場次紀錄（各自帶訓練日期與簽到表檔案），並在一個以「使用單位」分組的清單中檢視所有文件×單位之場次登記狀態**,
So that **我能忠實記錄每個使用單位實際辦理教育訓練的事實，即使同一份文件由多個單位分別、多次辦理，各單位之完訓紀錄也不會互相覆蓋或遺失**。

## Acceptance Criteria

### AC1：進度列粒度＝依文件之「使用部門」原樣，不展開子樹

**Given** 某份 ICSOP 文件之「文件使用部門」欄位已指定若干使用單位（可為公司/部/處室/課任一層級，見既有欄位裁決）
**When** 系統呈現該文件之 OJT 進度列
**Then** 每一個使用單位各自對應一列（documentId × 該單位），**不**因某單位為較高層級而自動展開涵蓋其下所有子單位為多列，亦不將較低層級單位之場次併入其上層單位列——一個使用單位＝一列，與該欄位之基礎顆粒度完全一致。

### AC2：同一單位可累積多筆場次，至少一筆即視為完成

**Given** 某文件之某使用單位列
**When** 具權限角色為該列新增一筆教育訓練場次（訓練日期＋簽到表檔案）
**Then** 系統將該場次**累加**於該列之下（不覆蓋、不取代該列既有之其他場次）；**Given** 該列已存在至少一筆場次, **Then** 系統判定該單位對該文件「已完成 OJT」；**Given** 該列尚無任何場次, **Then** 判定為「尚未完成」。

### AC3：新增場次不限於操作者自身權責範圍之文件/單位

**Given** 我的角色為主管或部門窗口
**When** 我為**任一**文件之**任一**使用單位新增教育訓練場次（不論該文件/單位是否與我自身所屬單位、當責室長職掌有任何交集）
**Then** 系統允許（不新增任何權責子樹範圍檢查）。<br>📌 **本條沿用既有裁決 `OQ-D9-21`（不限權責範圍）之語意，僅將其操作入口由文件表單搬遷至本功能頁面，本 Story 不重新界定範圍，亦不縮小或擴大既有已裁決之範圍**。

### AC4：允許新增場次之角色

**Given** 我的角色為 ICSOPAdmin、Supervisor 或 DeptContact
**When** 我進入本功能頁面
**Then** 我可為任一文件之任一使用單位列新增場次；**Given** 我的角色為 SysAdmin
**Then** 我可檢視本功能頁面之全部內容，但不可新增/操作場次（唯讀，依 `OQ-E11-05` 裁決之格值）；**Given** 我的角色為一般使用者
**Then** 我無法進入本功能頁面（依 `OQ-E11-05` 裁決之新功能列格值，比照既有「一般使用者無後台管理功能」慣例）。

### AC5：檔案格式、大小限制與訓練日期規則

**Given** 我正在新增一筆場次
**When** 我選擇簽到表檔案並填寫訓練日期送出
**Then** 系統依 `OQ-E11-09`（訓練日期是否必填/是否允許未來日/單檔或多檔）與 `OQ-E11-10`（檔案格式/大小上限）之裁決值驗證並儲存；驗證失敗時系統提示具體原因，不建立任何場次紀錄。<br>⚠ 本條之具體門檻值本 Story 不預先設定，待上述兩題裁決後由 spec-writer 補入正式驗收值。

### AC6：以使用單位分組之資料清單（本功能頁 TAB2）

**Given** 我進入本功能頁面之「OJT 資料清單」分頁
**When** 頁面載入
**Then** 系統以**使用單位**為群組，呈現該單位底下涉及之各份文件的 OJT 進度列（含完成/未完成狀態、場次數量），使用者可展開任一列檢視該列下之全部場次明細（訓練日期、上傳者、檔案），亦可由此進入新增場次之操作（AC2）。<br>📌 本清單之篩選/搜尋範圍（依單位搜尋、依完成狀態篩選等）依 `OQ-E11-15` 裁決，本 Story 不預先限定完整篩選項目集合。

### AC7：新增場次寫入稽核

**Given** 具權限角色成功新增一筆教育訓練場次
**When** 檢視稽核軌跡
**Then** 系統記錄一筆稽核紀錄，包含操作人員、時間、所屬文件與使用單位；具體之稽核事件命名與是否沿用既有 OJT 上傳稽核事件形狀，依 `OQ-E11-13` 裁決。

### AC8：場次之刪除／編輯（依裁決範圍）

**Given** 已存在之場次
**When** 具權限角色嘗試刪除或編輯該場次
**Then** 系統之允許範圍、允許角色與是否寫稽核，依 `OQ-E11-04`（刪除）與 `OQ-E11-16`（編輯，與刪除裁決強關聯）裁決；本 Story 於裁決前不預先開放刪除/編輯功能，僅提供新增（AC2）與檢視（AC6）。

## Technical Notes

- 本 Story 為 OJT 模型重構之核心：現行模型為「文件的單份覆蓋式附件」（`DOCUMENT_ATTACHMENT.type='OJT_SIGNIN'`，1 份、重傳覆蓋），本 Story 改為「文件 × 使用單位」之多筆累加式場次紀錄。資料模型形狀、既有單份 OJT 檔之遷移方式（`OQ-E11-01`）由 spec-writer／system-architect 於下一棒定案，本 Story 不預先假設資料表設計。
- 「使用單位」之基礎資料來源即既有 ICSOP 文件「文件使用部門」欄位（第 9 欄）之既有裁決值（可指定任意層級、多筆）；AC1 刻意與該欄位之現行顆粒度規則保持一致，避免另立一套獨立於文件既有欄位之單位認定邏輯。
- 舊端點 `POST /admin/documents/:documentId/attachments/ojt` 之存廢方式見 `OQ-E11-11`；本 Story 之新增場次為全新之操作入口，不承接舊端點之「覆蓋」語意（AC2 明文為累加，非覆蓋——此為對既有 [F016](../../../specs/features/F016-pdf-ojt-attachment.md#ojt-role-open-delta) `AC-N29`「可覆蓋」語意之刻意反轉，理由是新模型下不同場次代表不同時間點之獨立教育訓練事實，不應互相取代）。
- TAB1 儀表板（US-104）依賴本 Story 建立之場次/單位列資料作為計算來源，故 US-104 之 Dependencies 將本 Story 列為前置。

## Test Cases

| ID | 情境 | 類型 |
|---|---|---|
| TC-103-01 | 某文件有 2 個使用單位，各自新增 1 筆場次 → 各自獨立列出，互不覆蓋 | Happy Path |
| TC-103-02 | 同一單位對同一文件新增第 2 筆場次 → 累加為 2 筆場次，該列狀態仍為「已完成」 | Happy Path |
| TC-103-03 | 某單位尚無任何場次 → 該列狀態顯示「尚未完成」 | Happy Path |
| TC-103-04 | 主管（其所屬單位與目標文件、目標使用單位皆無任何職掌交集）為該文件之該單位新增場次 → 允許成功（不受權責範圍限制） | Edge Case |
| TC-103-05 | SysAdmin 嘗試新增場次 → 拒絕（唯讀），但可檢視清單與儀表板 | Error Case |
| TC-103-06 | 一般使用者嘗試進入本功能頁面 → 無法進入 | Error Case |
| TC-103-07 | 上傳格式不符/超過大小上限之簽到檔 → 拒絕並提示原因，不建立場次 | Error Case |
| TC-103-08 | TAB2 清單以單位分組呈現、可展開檢視場次明細 | Happy Path |
| TC-103-09 | 新增場次成功 → 稽核軌跡新增對應紀錄 | Happy Path |

## Dependencies

- **Blocked By**：[E04 US-030 建立 ICSOP 文件](../E04-icsop-document/US-030-create-icsop-document.md)（文件與其使用部門欄位須先存在）、[E08 US-070 角色×功能權限矩陣](../E08-permission-matrix/US-070-role-function-matrix.md)（新功能列格值，依 `OQ-E11-05`）
- **Blocks**：[US-104 OJT 進度儀表板](US-104-ojt-progress-dashboard.md)、[US-105 文件表單 OJT 欄位唯讀衍生化](US-105-document-ojt-derived-field.md)
- **Supersedes（部分取代，反轉方向詳見 US-105）**：[E04 US-036 PDF 與 OJT 附件上傳](../E04-icsop-document/US-036-pdf-ojt-attachment-upload.md) 之 OJT 相關範圍（ICSOP PDF 附件部分不受影響）

## Definition of Done

- [ ] Acceptance criteria met
- [ ] Unit tests passing (>80% coverage)
- [ ] Code review approved
- [ ] Documentation updated

## Related

- [Epic Brief: E11 OJT 進度管理](epic-brief.md)
- [F016 PDF 與 OJT 附件上傳](../../../specs/features/F016-pdf-ojt-attachment.md)（現行 OJT 行為之權威，本 Story 重構其 OJT 部分）
- [F026 角色×欄位權限矩陣](../../../specs/features/F026-role-field-matrix.md#ojt-write-exception-delta)（既有 OJT 破例之權威，反轉盤點見 US-105）
- [data-model.md DOC_USING_DEPT](../../../specs/data-model.md#doc-using-dept)（使用單位之既有資料模型參照）
- [NFR-002 資訊安全與身分驗證](../../non-functional/NFR-002-security.md)
- [NFR-003 稽核保留](../../non-functional/NFR-003-audit-retention.md)
