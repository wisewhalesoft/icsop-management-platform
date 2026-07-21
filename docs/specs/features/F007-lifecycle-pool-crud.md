# F007: 循環池 CRUD
Priority: P0-MVP | Status: Draft | Last Updated: 2026-07-17
Epic/Story: E03 / US-020

## Description
ICSOP 管理員對「循環（Life Cycle）」池進行建立、查詢、編輯、刪除/停用。循環是 DAG 結構與 ICSOP 文件掛載的容器。**刪除規則（OQ-E03-03 定案）**：**允許刪除循環，但需先清空該循環內所有文件掛載**；仍有文件掛載時拒絕刪除並回 `LIFECYCLE_HAS_DOCUMENTS`（語意＝需先解除全部掛載）。停用（`inactive`）不受此限制，可隨時執行。

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

## Error Scenarios
- 名稱空白/刪除保護：見 [error-handling.md#dag](../error-handling.md#dag)（`LIFECYCLE_NAME_REQUIRED`, `LIFECYCLE_HAS_DOCUMENTS`）。

## Related
- Data: [LIFECYCLE](../data-model.md#lifecycle-entity)
- Depends on: 清空掛載經 [F009](F009-node-drawer-maintenance.md) 節點抽屜
- Blocks: [F008](F008-dag-node-edge.md), [F010](F010-create-document.md)
- 定案: OQ-E03-01（不需擁有部門欄位）、OQ-E03-02（循環狀態與文件狀態不聯動）、**OQ-E03-03（允許刪除，但需先清空全部文件掛載；停用不受限）**、OQ-E03-05（結構變更歷程採 [F038](F038-lifecycle-tree-change-history.md)）
