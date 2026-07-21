# US-052: 部門/狀態/循環篩選

> **Story ID**: US-052
> **Epic**: [E06 前台RWD瀏覽](epic-brief.md)
> **Priority**: P0
> **Phase**: 1
> **Estimated Points**: 5

## User Story

As a 公司同仁,
I want 依部門、文件狀態、所屬循環篩選前台文件清單,
So that 我能縮小瀏覽範圍，只看與我當下需求相關的文件類別。

## Acceptance Criteria

### AC1：單一篩選條件正確過濾

**Given** 使用者選擇一個部門篩選條件
**When** 套用篩選
**Then** 清單僅顯示「使用部門」包含該部門的文件（定案：部門篩選比對「使用部門」，見 Technical Notes）。

### AC1a：部門篩選可選任意層級並自動展開子樹（定案 2026-07-20）

**Given** 部門篩選選單提供本部／部／處室／課任一層級之組織單位供選擇
**When** 使用者選定某一層級的部門節點（例如選「營運管理部」此一「部」層級節點）
**Then** 清單回傳該節點**及其下所有子樹**（處/室/課）之使用部門相符文件，不需使用者逐一勾選子節點；子樹展開採部門代碼前綴比對達成（見 Technical Notes）。

### AC2：多篩選條件組合為 AND 邏輯

**Given** 使用者同時選擇部門、狀態（有效/失效/作廢）、循環三種篩選條件
**When** 套用篩選
**Then** 清單僅顯示同時符合三個條件的文件。

### AC3：清除篩選回復完整清單

**Given** 使用者已套用一個或多個篩選條件
**When** 點擊「清除篩選」
**Then** 清單回復未篩選狀態，並維持 [US-050](US-050-public-list-sorting.md) 預設排序規則。

## Technical Notes

- 部門篩選之比對欄位**定案為「使用部門」**（2026-07-17）：該欄位直接對應前台使用情境並驅動清單置頂排序（[US-050](US-050-public-list-sorting.md)）；不比對制定組織（制定公司/部門/室別）欄位。原「使用部門 vs 當責部門」open question 已收斂（當責部門欄位亦已移除）。
- 循環篩選選項來源為 [E03 循環池](../E03-lifecycle-dag/US-020-lifecycle-pool-crud.md) 已建立之循環清單。
- 一般使用者是否可篩選查看「作廢」狀態文件，原始需求定案文件狀態分「有效/失效/作廢」，前台是否應預設隱藏作廢文件（僅管理角色可見）待確認，列入 Open Questions。
- **部門篩選之組織層級與子樹展開（2026-07-20 依上游資料契約定案）**：組織階層為 5 層（公司＞本部＞部＞處/室＞課），層級由 5 碼部門代碼前綴決定，不可用來源 view 的 `TOP_DEPTID`／`P_DEPTID` 等欄位判定。子樹展開直接以**部門代碼前綴比對**達成（`ORG_UNIT` 儲存 `orgCode` 與預先計算之 `codePrefix`並建立索引，前綴比對如 `CODE LIKE 'JA%'` 為 index-seek 友善），不需 closure table 或遞迴 CTE，詳見[上游人資來源資料契約 §3.5、§9](../../../specs/upstream-hr-source-contract.md)。此邏輯與 [US-050](US-050-public-list-sorting.md) 置頂比對、[E08 US-071](../E08-permission-matrix/US-071-role-field-matrix.md) 使用部門欄位定義、[E09 US-096](../E09-rag-qa/US-096-permission-aware-retrieval.md) 檢索層過濾共用同一套規則。

## Test Cases

| ID | 情境 | 類型 |
|---|---|---|
| TC-052-01 | 選擇單一部門篩選 → 僅顯示相符文件 | Happy Path |
| TC-052-02 | 同時選擇部門+狀態+循環 → 回傳三條件交集 | Happy Path |
| TC-052-03 | 篩選條件組合後查無結果 → 顯示「查無符合結果」 | Error Case |
| TC-052-04 | 一般使用者篩選「作廢」狀態 → 依待確認規則決定是否可見（暫定可見，因原始需求未限制前台可見狀態範圍） | Edge Case |
| TC-052-05 | 清除篩選 → 清單回復預設排序與完整內容 | Edge Case |
| TC-052-06 | 選擇「部」層級節點（如營運管理部）作為部門篩選 → 清單回傳該部底下所有處/室/課（如審查室、醫療一課）之使用部門相符文件，無需手動勾選子節點 | Happy Path |
| TC-052-07 | 選擇「課」層級節點作為部門篩選 → 僅回傳該課使用部門相符文件（葉節點無子樹可展開） | Edge Case |

## Dependencies

- **Blocked By**：[US-050 前台清單與排序規則](US-050-public-list-sorting.md)
- **Blocks**：無

## Definition of Done

- [ ] Acceptance criteria met
- [ ] Unit tests passing (>80% coverage)
- [ ] Code review approved
- [ ] Documentation updated

## Related

- [Epic Brief: E06 前台RWD瀏覽](epic-brief.md)
- [E03 US-020 循環池CRUD](../E03-lifecycle-dag/US-020-lifecycle-pool-crud.md)
- [E04 US-032 文件狀態切換](../E04-icsop-document/US-032-status-toggle.md)
- Spec: [上游人資來源資料契約](../../../specs/upstream-hr-source-contract.md)（組織層級推導、部門代碼前綴子樹展開定案）
