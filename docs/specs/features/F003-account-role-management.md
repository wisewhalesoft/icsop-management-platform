# F003: 帳號與角色指派管理
Priority: P0-MVP | Status: Draft | Last Updated: 2026-07-15
Epic/Story: E01 / US-005, US-006

> 合併理由：帳號 CRUD 與角色指派為同一後台管理畫面之連續操作，共用帳號實體與稽核。

## Description
系統管理員於後台建立/查詢/編輯/停用帳號，區分「手動建立」與「上游同步」兩來源；並將 5 種固定角色之一指派給帳號。

## Preconditions
- 操作者為系統管理員（依 F025，帳號管理與角色指派僅 SysAdmin 可 CRUD）。

## Main Flow
### 帳號管理
1. 建立手動帳密帳號：填帳號、初始密碼、指派角色 → 密碼雜湊儲存，`source=manual`。
2. 查詢：依來源（手動/上游）、角色、啟用狀態篩選，清單標示來源類型。
3. 停用帳號：立即無法登入，既有 session 強制失效，記錄稽核。

### 角色指派
4. 選定帳號，從 5 種固定角色選一並儲存 → 下次該帳號請求即套用新權限。
5. 由管理類角色降級為一般使用者：送出前顯示影響提示，二次確認後執行。

## Alternative Flows
- 上游同步帳號：基本資料（姓名/部門）以同步結果為準，管理員原則上僅能調整角色與啟用狀態（覆寫與否見 OQ-E01-03）。

## Edge Cases
- 停用一個已登入使用者：其既有 session 立即失效（連動 F001/F005 之 token 撤銷）。
- 系統管理員降級自身：草案應阻擋，避免無管理員可操作（OQ-E01-05）。

## Postconditions
- 帳號存在於清單（停用為軟刪除，非移除），角色變更即時生效。

## Acceptance Criteria
- Given 系統管理員填寫新帳號, When 送出建立, Then 建立帳號、密碼雜湊儲存、標記 `source=manual`。
- Given 帳號名稱重複, When 建立, Then 回 `ACCOUNT_USERNAME_EXISTS`，拒絕建立。
- Given 選定帳號執行停用, When 送出, Then 立即無法登入、既有 session 失效、記錄稽核。
- Given 選定帳號指派角色, When 儲存, Then 更新角色且下次請求即生效。
- Given 由管理類角色降級為一般使用者, When 送出前, Then 顯示失去後台權限提示並需二次確認。
- Given API 傳入非法角色字串, When 寫入, Then 回 `ROLE_INVALID`（400），拒絕寫入。
- Given 角色選擇下拉載入, When 開啟, Then 僅顯示 5 種固定角色，不可新增/刪除角色種類。

## Error Scenarios
- 帳號重複/上游唯讀/非法角色/自我降級：見 [error-handling.md#auth](../error-handling.md#auth)（`ACCOUNT_USERNAME_EXISTS`, `ACCOUNT_UPSTREAM_READONLY`, `ROLE_INVALID`, `ROLE_SELF_DOWNGRADE_BLOCKED`）。

## Related
- Data: [ACCOUNT](../data-model.md#account-entity), [ROLE](../data-model.md#role-entity)
- Depends on: [F025 角色×功能矩陣](F025-role-function-matrix.md)
- Related: [F005 離職停用](F005-auto-disable-departed.md)（session 撤銷機制共用）
- OQ: OQ-E01-03/05
