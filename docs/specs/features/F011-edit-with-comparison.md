# F011: 編輯 ICSOP 文件與版本對照
Priority: P0-MVP | Status: 🟡 實作（unit 綠；編輯頁欄位對照/取消/儲存＋F014 多值編輯側持久化（doc-seams）；int 已寫未跑，見 implementation-logs/doc-seams-impl.md）｜**循環子分類 delta：🟢 APPROVED（2026-08-07 人類閘門通過，含 4 項裁決）** | Last Updated: 2026-08-07
Epic/Story: E04 / US-031

> **2026-08-07 additive delta**：「所屬循環（循環別）」之編輯改為**兩段式**選取（名稱 → 子分類），並影響新舊值對照之顯示字串。規則權威＝[F040](F040-lifecycle-subcategory.md)；本檔僅加編輯路徑之 AC delta，既有條款一律不變。

## Description
編輯既有文件時，每個可編輯欄位並列顯示「目前值」與「輸入中新值」對照；儲存以新值覆蓋原記錄，不留歷史版本，UUID 不變。「所屬節點」欄位在編輯頁**唯讀顯示**目前節點並提供跳轉至畫布（改節點須經 F009）。

當前版本對照涵蓋所有可編輯欄位，以 [data-model.md 19 欄權威定義](../data-model.md#document-entity) 為準；欄位調整後含 **制定公司、制定部門、制定室別、內容摘要、版次（`{YY}'{NN}`，如 `26'01`）、公告日期**（原「當責部門」移除、「發布日期」改名「公告日期」、「人為版本號」改名「版次」；當責室長-主要/次要與使用部門保留）。

## Preconditions
- 文件已存在（F010）；操作者對欄位具寫入權（F026）。

## Main Flow
1. 開啟編輯頁 → 每個可編輯欄位顯示「目前值 / 新值」對照，變更欄位視覺標示。
2. 修改欄位（唯讀欄位如系統 UUID、所屬節點不可進入編輯狀態）。
3. 送出儲存 → 以新值覆蓋，不產生歷史版本檔，UUID 維持不變。
4. 觸發稽核記錄。

## Alternative Flows
- 「所屬節點」欄位：唯讀顯示目前節點，點擊可跳轉至 DAG 畫布（F009）改派。

## Edge Cases
- 取消編輯或離開頁面：原資料不受影響，重開編輯頁欄位為編輯前原值（未被中間輸入污染）。
- 修改後編號違反唯一性：依 F013 阻擋，原資料不受影響。

## Postconditions
- 文件為覆蓋後之當前版本，無歷史版本檔，UUID 不變。

## Acceptance Criteria
- Given 開啟編輯頁, When 載入, Then 每個可編輯欄位皆呈現「目前值/新值」對照。
- Given 修改欄位並確認, When 送出, Then 以新值覆蓋、不留歷史、UUID 不變。
- Given 修改後尚未送出, When 取消或離開, Then 原資料不受影響，欄位維持編輯前狀態。
- Given 修改版次送出, When 儲存, Then 清單顯示新版次、UUID 不變。
- Given 修改後編號違反唯一性, When 送出, Then 依 F013 阻擋，原資料不變。

### 循環子分類 delta（🟢 APPROVED 2026-08-07；規則權威＝[F040](F040-lifecycle-subcategory.md)）

- **AC-S1**（**2026-08-07 人類閘門裁決 1 收斂**）：Given 編輯頁將「所屬循環」改選為底下設有子分類之名稱, When 僅選定名稱（第一段）、未選子分類（第二段）即按儲存, Then **前端** `resolveLifecycleSelection` 回 `{ ok: false, code: 'LIFECYCLE_SUBCATEGORY_REQUIRED' }` 並阻擋送出，**原文件資料完全不變**。<br>⚠ **後端側**：`LIFECYCLE_SUBCATEGORY_REQUIRED` 僅於 payload **帶有**之 `lifecycleId` 在其名稱下非合法唯一解時觸發（INV-2 髒資料，[F040](F040-lifecycle-subcategory.md) AC-25／AC-26）；編輯 payload **未帶** `lifecycleId` 者依既有三態語意視為「不修改該欄位」，**不觸發本碼**。本次**不新增 `lifecycleName` payload 欄位**。
- **AC-S2**：Given 文件原屬「銷售及收款循環（消金）」, When 改選為「銷售及收款循環（企金）」並送出, Then 儲存成功、`lifecycleId` 更新為後者之 id；「所屬循環」之新舊值對照顯示為「銷售及收款循環（消金）」→「銷售及收款循環（企金）」（兩側字串皆由 `lifecycleDisplayName` 產生，含子分類，使變更可辨識）。
- **AC-S3**：Given 文件原屬一個無子分類之循環且未改動該欄位, When 開啟編輯頁, Then 該欄目前值顯示為該循環之 `name`（不含括號），且不呈現子分類層、不因缺子分類而阻擋儲存（向後相容，[F040](F040-lifecycle-subcategory.md) AC-33）。

## Error Scenarios
- 唯讀欄位寫入：見 [error-handling.md#permission](../error-handling.md#permission)（`FIELD_WRITE_FORBIDDEN`）。
- 編號重複：見 [error-handling.md#document](../error-handling.md#document)。
- **循環子分類未選定（2026-08-07）**：見 [error-handling.md#lifecycle-subcategory](../error-handling.md#lifecycle-subcategory)（`LIFECYCLE_SUBCATEGORY_REQUIRED`）。

## Related
- Data: [ICSOP_DOCUMENT](../data-model.md#document-entity)
- **循環子分類規則權威**: [F040](F040-lifecycle-subcategory.md)（兩段式選取、對照顯示字串）
- Depends on: [F010](F010-create-document.md); 節點改派見 [F009](F009-node-drawer-maintenance.md)
- Related: [F026 角色×欄位矩陣](F026-role-field-matrix.md)
