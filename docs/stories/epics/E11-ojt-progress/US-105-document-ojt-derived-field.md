# US-105: 文件表單 OJT 欄位唯讀衍生化

> **Story ID**: US-105
> **Epic**: [E11 OJT 進度管理](epic-brief.md)
> **Priority**: P1
> **Phase**: 1
> **Estimated Points**: 5

## User Story

As a **檢視 ICSOP 文件表單或詳情頁之任一角色（ICSOP 管理員／主管／部門窗口／系統管理員／一般使用者）**,
I want **在文件表單/詳情頁看到「OJT」不再是一個可上傳的附件欄位，而是顯示「本文件所有使用單位是否皆已完成 OJT」的衍生狀態，並列出目前已完成 OJT 的使用單位清單**,
So that **我能直接從文件本身掌握其 OJT 完訓覆蓋情形，且不會誤以為文件表單仍是登記 OJT 的入口——實際登記已統一移至 [US-103](US-103-ojt-session-management.md) 之獨立管理頁面**。

## Acceptance Criteria

### AC1：「有無 OJT」語意反轉——由「是否已上傳」改為「是否所有使用單位皆完成」

**Given** 某份 ICSOP 文件
**When** 系統判定該文件之 OJT 狀態
**Then** 「有 OJT」＝該文件之**全部**使用單位皆已完成 OJT（依 [US-103](US-103-ojt-session-management.md) AC2 之單位完成定義：至少一筆場次）；只要存在一個尚未完成之使用單位，即判定為「無 OJT」（或依 `OQ-E11-06` 裁決是否新增「部分完成」中間態）。<br>🔴 **本條為對既有語意之明確反轉**：現行「有 OJT」＝「該文件是否已上傳過 1 份 `OJT_SIGNIN` 附件」（[F016](../../../specs/features/F016-pdf-ojt-attachment.md)），與單位完成情形完全無關；本 Story 生效後該定義不再成立。

### AC2：文件表單/詳情頁顯示已完成 OJT 之使用單位清單（唯讀）

**Given** 我開啟某文件之編輯表單、唯讀詳情頁或前台文件詳情頁（前台是否顯示依 `OQ-E11-14` 裁決）
**When** 檢視 OJT 相關區塊
**Then** 系統以唯讀方式列出該文件目前已完成 OJT 之使用單位名稱清單；**Given** 該文件尚無任何使用單位完成
**Then** 顯示明確之「尚無單位完成」等同提示，非空白或錯誤。

### AC3：文件表單之 OJT 上傳/覆蓋入口全面移除

**Given** 我以任一角色（含 ICSOPAdmin、Supervisor、DeptContact）開啟文件編輯表單或唯讀詳情頁
**When** 檢視附件/OJT 區塊
**Then** 畫面**不再提供**任何上傳、取代或覆蓋 OJT 檔案之操作入口——包含 2026-08-20 起僅對 Supervisor／DeptContact 開放之破例入口（[F016](../../../specs/features/F016-pdf-ojt-attachment.md#ojt-role-open-delta) `AC-N28`）**亦一併移除**；欲登記教育訓練場次須改至 [US-103](US-103-ojt-session-management.md) 之獨立管理頁面操作。<br>🔴 **本條為對 2026-08-20 使用者裁決（`OQ-D9-19`／`OQ-D9-20`）之明確反轉**：該輪裁決是在「文件表單維持唯讀」的前提下，唯獨為 OJT 一欄開一個可寫例外；本 Story 反向操作——**連這個唯一的例外也收回**，文件表單自此對全部欄位（含 OJT）皆為徹底唯讀，寫入動作統一搬到獨立管理頁面。此反轉之理由是模型本身已改變（單份覆蓋式 → 多單位多場次），文件表單的欄位形狀已無法承載新模型，而非推翻「主管/部門窗口需要能登記 OJT」此一使用者原始需求本身——該需求由 [US-103](US-103-ojt-session-management.md) 承接。

### AC4：既有唯讀角色之行為不受影響

**Given** 我的角色為 SysAdmin 或一般使用者
**When** 我檢視文件表單/詳情頁之 OJT 區塊
**Then** 行為與 AC2／AC3 一致（唯讀顯示已完成單位清單、無上傳入口）——此為既有唯讀慣例之自然延續，非新增限制。

## 既有行為反轉初步盤點

> 📌 **本節性質**：本 Story 為模型級重構之收斂點，下列既有 US／AC 之部分或全部語意將被本 Epic（E11）反轉、作廢或改寫。**本節僅列出盤點範圍與反轉方向**，逐條之精確新舊條文對照、AC 編號沿用/棄用之最終決定，**留待下一棒 spec-writer 展開**；product-analyst 於此不逕自宣告任何一條既有 AC 之存廢。

1. **[F016](../../../specs/features/F016-pdf-ojt-attachment.md#ojt-role-open-delta) OJT 上傳角色開放 delta（`AC-N28`～`AC-N35`、`AC-N74`）**
   - 現況：文件唯讀/編輯頁附件區持有一個 OJT 上傳/覆蓋入口（`POST /admin/documents/:documentId/attachments/ojt`），2026-08-20 起 Supervisor／DeptContact／ICSOPAdmin 可寫，SysAdmin／User 唯讀；`AC-N29` 明文「可覆蓋」（重傳即覆蓋、無版本歷史）。
   - 反轉方向：該入口依 AC3 整個自文件表單移除；`AC-N28`（上傳成功）、`AC-N29`（覆蓋語意——新模型為「新增場次」而非「覆蓋」，覆蓋語意本身在文件表單脈絡下作廢）、`AC-N30`（不限權責範圍——語意延續但落點搬遷至 [US-103](US-103-ojt-session-management.md) AC3）、`AC-N33`／`AC-N34`（ICSOP PDF 仍拒／SysAdmin·User 仍拒）皆需在文件表單/舊端點脈絡下明確標示作廢或改寫落點。`AC-N74`（唯讀頁三條具名提示文案，其中 `RO_NOTICE_OJT_EXCEPTION` 明文「唯一例外為 OJT 實體簽到表可上傳」）之文案需整段改寫——文件唯讀頁自此對 OJT 亦無例外，原本區分「SysAdmin 全唯讀」與「主管/窗口 OJT 例外」兩種文案的必要性可能消失，改為單一唯讀文案。

2. **[F026](../../../specs/features/F026-role-field-matrix.md#ojt-write-exception-delta) OJT 上傳破例 delta（`AC-N22`～`AC-N27`、`AC-N24` 之措辭、`AC-N75`／`AC-N76`）**
   - 現況：角色×欄位矩陣「OJT 簽到表」列對 Supervisor/DeptContact 為「可寫」，為全表 20 欄×5 角色中唯一非 ICSOPAdmin 可寫之格；`AC-N24` 明文以此為界，鎖定「OJT 以外之 19 欄仍唯讀」之回歸鎖定；`AC-N75`／`AC-N76` 為唯讀頁/編輯頁對應之 DOM 掛鉤（`data-writable-attachment`、`data-ojt-upload`、`.ojt-write` class、`data-ojt-exception` 徽章）。
   - 反轉方向：文件表單脈絡下「OJT 簽到表」列之角色格值需改回「唯讀」（比照其餘欄位）——因寫入路徑已不存在於文件表單。`AC-N22`（恰兩格改值）、`AC-N23`（允許寫入解析）需整條作廢或改寫為「恰 0 格改值（OJT 欄回歸唯讀）」；`AC-N24` 之措辭「OJT 簽到表以外的 19 欄」需改為「全部 20 欄」（因不再有例外欄）；`AC-N75`／`AC-N76` 所鎖定之 DOM 掛鉤（可寫徽章、上傳鈕、`.ojt-write` 樣式、`data-ojt-exception` 徽章）需自兩個 prototype（`15-document-edit.html`／`16-document-readonly.html`）移除。

3. **[F017](../../../specs/features/F017-backend-document-list.md#ojt-icon-column-delta) OJT 圖示欄 delta（`AC-N37`～`AC-N40`）與篩選（`AC-D2` 第 12 列、`AC-D5`）**
   - 現況：`hasOjt` 為「該文件是否有 1 份 `OJT_SIGNIN` 附件」之布林值，驅動清單第 1 欄兩態圖示（`file-check-2`／`file-x-2`）與 OJT 三值篩選（全部／有 OJT／無 OJT）。
   - 反轉方向：依本 Story AC1，「有無 OJT」之定義改為「是否所有使用單位皆完成」——一個需要跨多筆使用單位聚合計算的衍生值，不再是單一附件是否存在的簡單判斷。`AC-N38`（三態渲染邏輯，含 `undefined` 視同 `false` 之規則）、`AC-N39`（DOM 掛鉤 `data-has-ojt`）、`AC-D5`（三值篩選語意）皆需重新定義其計算來源；是否新增「部分完成」第三狀態即為 `OQ-E11-06`，需先裁決才能決定上述 AC 是整條作廢或僅改寫計算來源（欄位/篩選之外觀與 DOM 掛鉤本身可能不變，變的只是底層布林值/列舉值之計算方式）。

4. **[F025](../../../specs/features/F025-role-function-matrix.md) `AC-N36`（功能矩陣不變之回歸鎖定）**
   - 現況：`AC-N36` 明文鎖定「2026-08-20 之 OJT 開放 delta 不新增功能列、不得改為 write」——因為那一輪之開放是**欄位層級**的破例，刻意選擇不建獨立功能列。
   - 反轉方向：本 Epic 因新增「OJT 進度管理」獨立側選單項/頁面，天生需要在角色×功能矩陣新增一個功能列（供 SysAdmin／ICSOPAdmin／Supervisor／DeptContact 之可視/可寫程度分格，具體格值見 `OQ-E11-05`）——這正是 `AC-N36` 當初刻意避免之事。下一棒 spec-writer 需將 `AC-N36` 本身明確列為「本次 delta 之反轉對象」，而非誤判為仍然有效之既有回歸鎖定。

5. **[F023](../../../specs/features/F023-audit-logging.md#d9-audit-delta) `AC-N50` 與 [F024](../../../specs/features/F024-access-history-query.md#d9-audit-view-delta) `AC-N53`／`AC-N69`／`AC-N70`（稽核落列與查詢呈現）**
   - 現況：OJT 上傳（覆蓋）動作被明文定義為特定形狀之稽核事件——`actionType='ATTACHMENT_UPLOAD'`、`targetType='DOCUMENT_ATTACHMENT'`、單一 `documentId`、F024 查詢頁「上傳」類型可篩出/排除（`AC-N69`）、CSV 匯出呈現規則（`AC-N70`）。
   - 反轉方向：新模型下「上傳」動作語意變為「對某文件之某使用單位新增一筆 OJT 場次」，比原本多了「使用單位」這一維度；是否沿用既有 `actionType`／`targetType` 並加掛欄位、或另立新 `actionType`（`OQ-E11-13`），直接決定 `AC-N50`／`AC-N53`／`AC-N69`／`AC-N70` 是「就地擴充」或「整批作廢改寫」。此外，若 `OQ-E11-04` 裁定允許刪除場次，現行這批 AC 完全未涵蓋「刪除」動作之稽核落列規則，屬全新需求、需新增而非改寫既有 AC。

6. **[data-model.md](../../../specs/data-model.md#document-entity) ICSOP_DOCUMENT 第 17 欄與 [DOCUMENT_ATTACHMENT](../../../specs/data-model.md#attachment-entity) 實體**
   - 現況：第 17 欄「OJT 實體簽到表」定義為 `attachment(OJT_SIGNIN)`，基數為 1（單一覆蓋式附件，與第 14 欄 ICSOP PDF 同構）；`DOCUMENT_ATTACHMENT` 實體之 `type` 列舉含 `OJT_SIGNIN`，語意為 1 份、覆蓋式。
   - 反轉方向：第 17 欄之基數與資料來源整個改變——不再是單一附件，而是衍生自「每個使用單位、每個單位下 0..* 場次」之聚合布林值（依 AC1）。此為資料模型層級之破壞性變更，既有單份 `OJT_SIGNIN` 資料之遷移方式見 `OQ-E11-01`；新模型之資料落點形狀由 spec-writer／system-architect 於下一棒定案，本 Story 不預先假設資料表設計（依角色紀律，US 不夾帶資料表設計）。

## Technical Notes

- 本 Story 之「已完成 OJT 之使用單位清單」（AC2）與 [US-104](US-104-ojt-progress-dashboard.md) 之「文件-訓練覆蓋率」KPI 為**同一份底層事實之兩種呈現**（前者為單一文件之明細清單、後者為跨文件之聚合統計），兩者之「單位完成」判定邏輯（[US-103](US-103-ojt-session-management.md) AC2）必須共用同一套規則，不得各自定義。
- 前台是否同步顯示已完成單位清單（AC2 括號所述）為 `OQ-E11-14`，本 Story 之 AC2 涵蓋後台文件表單/詳情頁為必要範圍，前台為視裁決結果而定之延伸範圍。
- 本 Story 應與 [US-103](US-103-ojt-session-management.md) 同批實作或至少同批上線——若僅移除文件表單之上傳入口（AC3）而 US-103 之新管理頁面尚未就緒，將造成「無任何入口可登記 OJT」之功能真空，此為部署順序上之硬性約束，非單純之依賴關係建議。

## Test Cases

| ID | 情境 | 類型 |
|---|---|---|
| TC-105-01 | 某文件 3 個使用單位皆完成 → 「有 OJT」判定為真 | Happy Path |
| TC-105-02 | 某文件 3 個使用單位中有 1 個未完成 → 「有 OJT」判定為假（或依 `OQ-E11-06` 之部分完成態） | Happy Path |
| TC-105-03 | 開啟文件詳情頁 → 顯示已完成單位清單（唯讀），清單與實際場次紀錄一致 | Happy Path |
| TC-105-04 | 某文件尚無任何單位完成 → 顯示「尚無單位完成」提示，非空白 | Edge Case |
| TC-105-05 | Supervisor／DeptContact 開啟文件表單 → 不再出現任何 OJT 上傳/覆蓋操作入口 | Happy Path |
| TC-105-06 | ICSOPAdmin 開啟文件表單 → 同樣不再出現 OJT 上傳入口（與其餘角色一致） | Happy Path |
| TC-105-07 | SysAdmin／一般使用者檢視文件表單之 OJT 區塊 → 唯讀顯示已完成單位清單，無上傳入口 | Happy Path |

## Dependencies

- **Blocked By**：[US-103 OJT 場次管理](US-103-ojt-session-management.md)（衍生狀態之計算來源）
- **Blocks**：無
- **Supersedes（反轉，見上方盤點）**：[F016](../../../specs/features/F016-pdf-ojt-attachment.md#ojt-role-open-delta)、[F026](../../../specs/features/F026-role-field-matrix.md#ojt-write-exception-delta)、[F017](../../../specs/features/F017-backend-document-list.md#ojt-icon-column-delta) 之 OJT 相關條文；[F025](../../../specs/features/F025-role-function-matrix.md) `AC-N36`

## Definition of Done

- [ ] Acceptance criteria met
- [ ] Unit tests passing (>80% coverage)
- [ ] Code review approved
- [ ] Documentation updated
- [ ] 既有行為反轉初步盤點已由 spec-writer 展開為正式對照表並回寫本檔或對應 spec 檔

## Related

- [Epic Brief: E11 OJT 進度管理](epic-brief.md)
- [US-103 OJT 場次管理（單位列×場次制，含上傳與單位分組清單）](US-103-ojt-session-management.md)
- [US-104 OJT 進度儀表板](US-104-ojt-progress-dashboard.md)
- [F016 PDF 與 OJT 附件上傳](../../../specs/features/F016-pdf-ojt-attachment.md#ojt-role-open-delta)
- [F026 角色×欄位權限矩陣](../../../specs/features/F026-role-field-matrix.md#ojt-write-exception-delta)
- [F017 後台文件清單與搜尋](../../../specs/features/F017-backend-document-list.md#ojt-icon-column-delta)
- [F025 角色×功能權限矩陣](../../../specs/features/F025-role-function-matrix.md)
- [F023 稽核紀錄](../../../specs/features/F023-audit-logging.md#d9-audit-delta)
- [F024 文件調閱歷程查詢](../../../specs/features/F024-access-history-query.md#d9-audit-view-delta)
