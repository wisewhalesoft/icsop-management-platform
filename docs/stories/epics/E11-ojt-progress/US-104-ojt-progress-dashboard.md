# US-104: OJT 進度儀表板

> **Story ID**: US-104
> **Epic**: [E11 OJT 進度管理](epic-brief.md)
> **Priority**: P1
> **Phase**: 1
> **Estimated Points**: 5

## User Story

As an **ICSOP 管理員／主管／部門窗口**（系統管理員唯讀檢視）,
I want **在 OJT 進度管理頁面之「儀表板」分頁，看到全體 ICSOP 文件之訓練覆蓋率、依處室/部門之完成率，以及最近完成 OJT 的單位動態**,
So that **我能快速掌握目前哪些 SOP 之教育訓練已到位、哪些單位或處室尚待追蹤，不需要逐一翻閱每份文件或每個使用單位之明細**。

## Acceptance Criteria

### AC1：文件-訓練覆蓋率 KPI

**Given** 我進入本功能頁面之「儀表板」分頁
**When** 頁面載入
**Then** 系統呈現「文件-訓練覆蓋率」指標——依 `OQ-E11-07` 裁決之公式（例如：已完成 OJT 之使用單位列數 ÷ 該文件或全體池之使用單位列總數），呈現方式（單一總覽比率／依文件逐筆列出／兩者皆有）亦依該題裁決；本 Story 於裁決前不預先假設具體計算公式或呈現粒度。

### AC2：處室/部門完成率

**Given** 我檢視儀表板
**When** 頁面呈現「處室/部門完成率」區塊
**Then** 系統依 `OQ-E11-07` 裁決之彙總（rollup）規則，將使用單位列之完成狀態彙總至處室或部門層級呈現完成率；是否重用既有「子樹展開」判定式、彙總之層級基準，依該題裁決。

### AC3：最近完成 OJT 的單位

**Given** 我檢視儀表板
**When** 頁面呈現「最近完成 OJT 的單位」區塊
**Then** 系統依 `OQ-E11-07` 裁決之時間窗口（如最近 7/30 天）列出近期新增場次所屬之文件與使用單位；**該區塊不得揭露個別受訓人員之姓名或其他個人識別資訊**，僅呈現單位/文件/日期層級之聚合資訊（PII 過濾要求，依 `OQ-E11-07` 具體裁決細節）。

### AC4：裁撤單位是否計入統計

**Given** 某使用單位已被組織同步標記為裁撤（`isActive=false`）
**When** 系統計算 AC1／AC2 之覆蓋率/完成率
**Then** 是否將該單位列計入分母，依 `OQ-E11-03` 裁決；本 Story 於裁決前不預先假設處置方式。

### AC5：角色可視範圍

**Given** 我的角色為 ICSOPAdmin、Supervisor 或 DeptContact
**When** 我進入儀表板分頁
**Then** 我可正常檢視全部 KPI 區塊（不因角色而限縮可見文件/單位範圍——沿用 US-103 AC3 之「不限權責範圍」原則）；**Given** 我的角色為 SysAdmin
**Then** 我可檢視但不可操作任何寫入動作（唯讀，依 `OQ-E11-05`）；**Given** 我的角色為一般使用者
**Then** 我無法進入本頁面。

## Technical Notes

- 本 Story 之全部 KPI 計算皆依賴 [US-103](US-103-ojt-session-management.md) 建立之「文件 × 使用單位 × 場次」資料為來源，**本 Story 不得早於 US-103 之資料模型定案前開始實作**。
- 「處室/部門完成率」之彙總規則（`OQ-E11-07`）若裁定重用既有子樹展開判定式（[F026](../../../specs/features/F026-role-field-matrix.md) §9.1 `isWithinSubtree`），須注意該判定式之既有測試與簽章依既有裁決「不得因新需求而修改」（[F026](../../../specs/features/F026-role-field-matrix.md#user-subtype-delta) 之既有慣例），本 Story 僅能重用、不得修改。
- 「最近完成 OJT 的單位」之 PII 過濾要求（AC3）為本 Story 之硬性防線，不因 `OQ-E11-07` 之其他子項裁決結果而放寬——理由：教育訓練出席狀況涉及個別員工之出勤資訊，儀表板為多角色（含跨部門之主管/部門窗口）可見之聚合視圖，不應成為變相查詢特定人員出席紀錄之途徑。

## Test Cases

| ID | 情境 | 類型 |
|---|---|---|
| TC-104-01 | 文件 A 有 3 個使用單位、2 個已完成 → 覆蓋率呈現反映 2/3 | Happy Path |
| TC-104-02 | 某處室下轄 3 個單位、皆完成 → 該處室完成率呈現 100% | Happy Path |
| TC-104-03 | 近期新增場次之單位 → 出現於「最近完成」區塊，且不顯示受訓人員姓名 | Happy Path |
| TC-104-04 | 已裁撤之使用單位 → 依 `OQ-E11-03` 裁決之規則計入或排除統計 | Edge Case |
| TC-104-05 | SysAdmin 檢視儀表板 → 可見但不可操作任何寫入動作 | Happy Path |
| TC-104-06 | 一般使用者嘗試進入 → 無法進入 | Error Case |
| TC-104-07 | 某文件所有使用單位皆完成 → 該文件覆蓋率呈現 100% | Happy Path |
| TC-104-08 | 某文件無任何使用單位已完成 → 覆蓋率呈現 0%，非錯誤 | Edge Case |

## Dependencies

- **Blocked By**：[US-103 OJT 場次管理](US-103-ojt-session-management.md)（資料來源）
- **Blocks**：無（本 Story 為純檢視功能，不阻擋其他 Story）

## Definition of Done

- [ ] Acceptance criteria met
- [ ] Unit tests passing (>80% coverage)
- [ ] Code review approved
- [ ] Documentation updated

## Related

- [Epic Brief: E11 OJT 進度管理](epic-brief.md)
- [US-103 OJT 場次管理（單位列×場次制，含上傳與單位分組清單）](US-103-ojt-session-management.md)
- [F026 角色×欄位權限矩陣 §9.1 子樹展開判定式](../../../specs/features/F026-role-field-matrix.md)
- [NFR-002 資訊安全與身分驗證](../../non-functional/NFR-002-security.md)
