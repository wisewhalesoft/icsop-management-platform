# F007: 循環池 CRUD
Priority: P0-MVP | Status: 🟡 Implemented (unit-green; 建立→畫布導向＋刪除稽核收尾完成)｜**子分類 delta：🟢 APPROVED（2026-08-07 人類閘門通過，含 4 項裁決）** | Last Updated: 2026-08-07
Epic/Story: E03 / US-020

> **2026-08-07 additive delta**：本 feature 新增「子分類」欄位。**規則之權威來源為 [F040](F040-lifecycle-subcategory.md)**（正規化、唯一性不變式 INV-1／INV-2、顯示名稱組合）；本檔僅加「循環池 CRUD 畫面/端點確實行使該契約」之 AC，既有條款一律不變。

## Description
ICSOP 管理員對「循環（Life Cycle）」池進行建立、查詢、編輯、刪除/停用。循環是 DAG 結構與 ICSOP 文件掛載的容器。**循環之業務身分＝`(name, subcategory)` 組合**（[F040](F040-lifecycle-subcategory.md)，2026-08-07）：子分類非必填，同一名稱下之不同子分類視為彼此獨立的循環。**刪除規則（OQ-E03-03 定案）**：**允許刪除循環，但需先清空該循環內所有文件掛載**；仍有文件掛載時拒絕刪除並回 `LIFECYCLE_HAS_DOCUMENTS`（語意＝需先解除全部掛載）。停用（`inactive`）不受此限制，可隨時執行。

## Preconditions
- 操作者為 ICSOP 管理員（F025：循環管理僅 ICSOPAdmin 可 CRUD）。

## Main Flow
1. 新增循環：輸入名稱（必填）與說明 → 建立循環、配發 UUID、導向該循環 DAG 畫布編輯頁（F008）。
2. 查詢清單：顯示名稱、狀態、節點數量、最後更新時間，可依名稱或狀態篩選。
3. 編輯：修改名稱/說明，`updatedAt` 更新。
4. 刪除：系統檢查該循環是否仍有文件掛載 → 若有，拒絕並回 `LIFECYCLE_HAS_DOCUMENTS`（提示需先解除全部掛載）；若無，刪除循環（含其節點/連線）並記錄稽核。
5. 停用：狀態切為 `inactive`（不受掛載限制，見 Alternative Flows）。

## Alternative Flows
- 停用循環：狀態切為 `inactive`，既有節點/文件掛載關係不受影響；**停用不需先清空掛載**（與刪除規則不同）。
- 清空掛載後刪除：管理員經節點抽屜（[F009](F009-node-drawer-maintenance.md)）將該循環內全部文件解除/改派至他處後，即可成功刪除該循環。
- **子分類（🟢 APPROVED 2026-08-07，additive）**：建立/編輯表單於「循環名稱」之後新增**非必填**之「子分類」欄位；送出前服務層以 `normalizeSubcategory` 正規化（trim；空白／空字串／未提供 → `null`），再依 [F040](F040-lifecycle-subcategory.md) 固定順序驗證 INV-1／INV-2。清單列與所有下拉一律以 `lifecycleDisplayName` 呈現（有子分類 → `名稱（子分類）`；無 → `名稱`），刪除／停用之既有規則不因子分類而改變（以 `id` 為操作對象，非以名稱）。

## Edge Cases
- 刪除仍有文件掛載之循環：拒絕刪除、回 `LIFECYCLE_HAS_DOCUMENTS`（語意＝**需先解除全部文件掛載才能刪除**，非「永不可刪、僅能停用」）；管理員可改為停用，或清空掛載後再刪。
- 刪除無任何節點與文件掛載之循環：允許刪除並記錄稽核。
- 刪除僅有節點/連線、無文件掛載之循環：允許刪除，其節點與連線一併移除（DAG 結構為循環之附屬）。

## Postconditions
- 循環存在於清單並可作為 F010 文件建立時「所屬循環」選項來源。

## Acceptance Criteria
- Given 輸入合法名稱, When 新增循環, Then 建立成功、回傳 UUID、導向 DAG 畫布編輯頁。
- Given 編輯既有循環名稱/說明, When 儲存, Then 更新成功且 `updatedAt` 更新。
- Given 循環仍有文件掛載, When 刪除, Then 回 409 `LIFECYCLE_HAS_DOCUMENTS` 並提示**需先解除全部文件掛載才能刪除**（亦可改為停用）。
- Given 已將循環內全部文件掛載解除, When 刪除, Then **允許刪除**（含其節點/連線）並記錄稽核。
- Given 循環名稱為空, When 建立, Then 回 `LIFECYCLE_NAME_REQUIRED` 驗證錯誤。
- Given 停用一個仍有效的循環（即使仍有文件掛載）, When 送出, Then 狀態變更成功且既有掛載關係不受影響（停用不需先清空掛載）。

### 子分類 delta（🟢 APPROVED 2026-08-07；規則權威＝[F040](F040-lifecycle-subcategory.md)）

- **AC-S1**：Given 建立表單填妥名稱「銷售及收款循環」且子分類留白, When 送出, Then 建立成功、持久化之 `subcategory` 為 `null`（**非空字串**），清單該列顯示「銷售及收款循環」（不含括號）。
- **AC-S2**：Given 建立表單填妥名稱「銷售及收款循環」且子分類輸入 `"  消金  "`, When 送出, Then 建立成功、持久化之 `subcategory` 為 `"消金"`（已 trim），清單該列顯示「銷售及收款循環（消金）」（全形括號、前後無空白）。
- **AC-S3**：Given 池中已有「銷售及收款循環（消金）」, When 再建立同名同子分類之循環, Then 回 409 `LIFECYCLE_DUPLICATE`、池筆數不變；Given 改以子分類「企金」送出, Then 建立成功且與前者 UUID 相異（[F040](F040-lifecycle-subcategory.md) AC-09／AC-10）。
- **AC-S4**：Given 池中已有無子分類之「銷售及收款循環」, When 建立子分類為「消金」之同名循環, Then 回 409 `LIFECYCLE_SUBCATEGORY_CONFLICT`、池筆數不變（方向一）。
- **AC-S5**：Given 池中已有「銷售及收款循環（消金）」, When 建立子分類留白之同名循環, Then 回 409 `LIFECYCLE_SUBCATEGORY_CONFLICT`、池筆數不變（方向二）。
- **AC-S6**：Given 池中有「銷售及收款循環（消金）」與「銷售及收款循環（企金）」, When 編輯前者僅修改說明, Then 儲存成功且不回唯一性錯誤（排除自身）；When 將「企金」改為「消金」, Then 回 409 `LIFECYCLE_DUPLICATE`；When 將「企金」之子分類清空, Then 回 409 `LIFECYCLE_SUBCATEGORY_CONFLICT`（[F040](F040-lifecycle-subcategory.md) AC-15～AC-17）。
- **AC-S7**：Given 池中全部循環之 `subcategory` 皆為 `null`（本次變更前之現況）, When 執行本檔上列既有全部 AC（建立／編輯／刪除保護／停用／名稱必填）, Then 行為與變更前完全一致、無任何新增阻擋（向後相容，[F040](F040-lifecycle-subcategory.md) AC-32）。
- **AC-S8**：Given 清單之關鍵字搜尋（既有 Main Flow 2）, When 輸入子分類字串「消金」, Then 命中顯示名稱含該字串之列——搜尋比對對象為 `lifecycleDisplayName` 之輸出（名稱＋子分類），非僅 `name`。

## Error Scenarios
- 名稱空白/刪除保護：見 [error-handling.md#dag](../error-handling.md#dag)（`LIFECYCLE_NAME_REQUIRED`, `LIFECYCLE_HAS_DOCUMENTS`）。
- **子分類唯一性（2026-08-07）**：見 [error-handling.md#lifecycle-subcategory](../error-handling.md#lifecycle-subcategory)（`LIFECYCLE_DUPLICATE`, `LIFECYCLE_SUBCATEGORY_CONFLICT`）；驗證順序為 `LIFECYCLE_NAME_REQUIRED` → `LIFECYCLE_DUPLICATE` → `LIFECYCLE_SUBCATEGORY_CONFLICT`。

## Related
- Data: [LIFECYCLE](../data-model.md#lifecycle-entity)、[唯一性不變式](../data-model.md#lifecycle-uniqueness)
- **子分類規則權威**: [F040](F040-lifecycle-subcategory.md)（正規化／INV-1／INV-2／顯示名稱／選取有效性）
- Depends on: 清空掛載經 [F009](F009-node-drawer-maintenance.md) 節點抽屜
- Blocks: [F008](F008-dag-node-edge.md), [F010](F010-create-document.md)
- 定案: OQ-E03-01（不需擁有部門欄位）、OQ-E03-02（循環狀態與文件狀態不聯動）、**OQ-E03-03（允許刪除，但需先清空全部文件掛載；停用不受限）**、OQ-E03-05（結構變更歷程採 [F038](F038-lifecycle-tree-change-history.md)）
