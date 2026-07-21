# US-020: 循環池 CRUD

> **Story ID**: US-020
> **Epic**: [E03 循環池與 DAG 畫布維護](epic-brief.md)
> **Priority**: P0
> **Phase**: 1
> **Estimated Points**: 5

## User Story
As a ICSOP 管理員
I want 對循環（Life Cycle）池進行建立、查詢、編輯、刪除／停用
So that 我可以維護公司內各項工作流程循環的清單，作為後續 DAG 結構與 ICSOP 文件掛載的容器

## Acceptance Criteria

### AC1: 新增循環並導向 DAG 編輯頁
- **Given** 我是已登入的 ICSOP 管理員在循環管理頁面
- **When** 我點選「新增循環」並輸入循環名稱與說明後送出
- **Then** 系統建立一筆新循環，配發系統 UUID，並導向該循環的 DAG 畫布編輯頁

### AC2: 循環清單查詢與篩選
- **Given** 循環清單頁面已有多筆循環資料
- **When** 我瀏覽清單
- **Then** 系統顯示每筆循環的名稱、狀態、節點數量、最後更新時間，並可依名稱或狀態篩選

### AC3: 刪除阻擋（尚有文件掛載，2026-07-17 OQ-E03-03 定案）
- **Given** 一個循環內至少一個節點掛載了 ICSOP 文件（所屬節點指向本循環之任一節點）
- **When** 我嘗試刪除該循環
- **Then** 系統拒絕刪除並提示「循環仍有文件掛載，請先解除所有節點的文件掛載後再刪除」——此為刪除之**前置條件**，非「僅允許停用」的絕對限制；停用（AC5）為獨立於刪除規則之外、隨時可用的操作，不受掛載狀態影響

### AC4: 刪除允許（已清空文件掛載或原無掛載）
- **Given** 一個循環尚無任何文件掛載（原本就無掛載，或管理員已透過節點抽屜 [US-023](US-023-node-drawer-maintenance.md) 逐一解除全部掛載）
- **When** 我刪除該循環
- **Then** 系統允許刪除，該循環之所有節點與連線一併清除（cascade），並記錄稽核軌跡

### AC5: 停用不受掛載狀態限制
- **Given** 一個循環（無論是否有文件掛載）
- **When** 我將其狀態切換為停用
- **Then** 系統允許停用，既有節點/文件掛載關係不受影響；停用與刪除為兩個獨立操作，停用不要求先清空掛載

## Technical Notes
- 循環欄位草案：`id (UUID)`、`name`、`description`、`status (啟用/停用)`、`createdAt`、`updatedAt`。
- 刪除採條件式（2026-07-17 OQ-E03-03 定案）：尚有文件掛載時阻擋刪除（錯誤語意＝需先解除全部掛載，非「僅能停用」），需在 Service 層做關聯檢查（是否有 US-023 節點掛載的 ICSOP 文件）；掛載清空後允許實際刪除，刪除時循環之節點/邊一併清除（cascade）。停用（狀態切換）為獨立於刪除規則之外的操作，任何時候皆可執行、不要求先清空掛載。
- 後端 NestJS + TypeORM，資料表建議 `lifecycle`；前端 React + TypeScript 清單頁採後台管理框架既有的表格元件。

## Test Cases
| ID | 情境 | 類型 |
|---|---|---|
| TC-020-01 | 建立新循環，輸入合法名稱，預期成功建立並回傳 UUID | Happy Path |
| TC-020-02 | 編輯既有循環名稱／說明，預期更新成功且 `updatedAt` 更新 | Happy Path |
| TC-020-03 | 對已有文件掛載的循環發出刪除請求，預期回傳 409 錯誤並提示需先解除全部文件掛載才能刪除 | Error Case |
| TC-020-04 | 建立循環時名稱為空字串，預期回傳驗證錯誤 | Error Case |
| TC-020-05 | 停用一個仍有效的循環，預期循環狀態變更但既有節點/文件掛載關係不受影響 | Edge Case |
| TC-020-06 | 解除循環內所有節點之文件掛載後再次嘗試刪除，預期刪除成功（循環連同其節點/連線一併清除）並記錄稽核 | Happy Path |

## Dependencies
- **Blocked By**: [E08 US-070 角色×功能權限矩陣](../E08-permission-matrix/US-070-role-function-matrix.md)
- **Blocks**: [US-021 DAG 節點與連線維護](US-021-dag-node-edge-maintenance.md)、[E04 US-030 建立 ICSOP 文件](../E04-icsop-document/US-030-create-icsop-document.md)

## Definition of Done
- [ ] Acceptance criteria met
- [ ] Unit tests passing (>80% coverage)
- [ ] Code review approved
- [ ] Documentation updated

## Related
- Epic: [epic-brief.md](epic-brief.md)
- [US-021 DAG 節點與連線維護](US-021-dag-node-edge-maintenance.md)
