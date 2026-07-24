# F012: 文件狀態切換
Priority: P0-MVP | Status: 🟡 實作（狀態切換＋切換原因 reason 持久化；狀態折入 update() 共用核心；單元綠；整合已寫未跑；見 implementation-logs/doc-changelog-impl.md） | Last Updated: 2026-07-24
Epic/Story: E04 / US-032

## Description
ICSOP 管理員手動切換文件狀態（有效/失效/作廢），單步驟即時生效，無簽核流程。狀態變更即時反映於前台，並記錄稽核。狀態機見 [document-status-lifecycle.mmd](../diagrams/document-status-lifecycle.mmd)。

**儲存狀態 vs 顯示狀態**：儲存維持三值 `有效`/`失效`/`作廢`（僅 ICSOPAdmin 手動切換，本 feature 不改變此儲存模型）；清單/卡片/統計卡則依「公告日期（announcedDate）」把「有效」**衍生顯示**為「已公告」（公告日期 ≤ 今日）或「進度中」（公告日期 > 今日）。衍生值僅為顯示層計算，不另存欄位、不改變儲存之狀態值；`失效`/`作廢` 照原樣顯示。

## Preconditions
- 文件已存在（F010）；操作者為 ICSOP 管理員（F025/F026，僅 ICSOPAdmin 可寫）。

## Main Flow
1. 檢視文件詳情，選擇新狀態（有效/失效/作廢），並可**選填「切換原因」**（自由文字，非必填；OQ-E04-02 定案）。
2. 若目標狀態為「有效」，重新驗證編號唯一性（比對「有效＋作廢」，見 [F013](F013-document-number-uniqueness.md)）；衝突則阻擋切換。
3. 系統立即更新狀態欄位，無需簽核或多層核准。
4. 記錄操作者、切換前後狀態、**切換原因（若有填）**與時間 → 寫入變更歷程（[F037](F037-document-change-history.md) 之「文件狀態」變更事件）；稽核依 F023/OQ-NFR003。

## Alternative Flows
- 由「失效」切「作廢」、「有效」切「失效」等：任意方向皆允許（管理員判斷）。
- 顯示衍生：清單/統計卡以公告日期把「有效」文件衍生顯示為「已公告」（公告日期已過）或「進度中」（公告日期未到）；此為顯示層計算，儲存狀態不變。

## Edge Cases
- 連續快速切換兩次：以最後一次送出為準，無競態導致不一致。
- 公告日期當日（＝今日）：判定為「已公告」（採 ≤ 今日）。
- 文件為「失效」或「作廢」：不套用已公告/進度中衍生，直接顯示失效/作廢。

## Postconditions
- 狀態即時生效；前台清單依 F019 篩選反映最新狀態。
- 儲存狀態仍為 有效/失效/作廢；清單顯示依公告日期衍生為 已公告/進度中/失效/作廢。

## Acceptance Criteria
- Given 檢視有效文件, When 切為失效或作廢, Then 立即更新狀態，無簽核步驟。
- Given 狀態已切為失效/作廢, When 前台查詢, Then 依 F019 篩選規則正確反映最新狀態。
- Given 完成一次切換, When 送出, Then 記錄操作者、前後狀態與時間供 F024 查詢。
- Given 切換狀態時填寫「切換原因」, When 送出, Then 原因隨該次狀態變更事件一併記錄於變更歷程（F037）並可於變更歷程檢視。
- Given 切換狀態時**未**填「切換原因」（非必填）, When 送出, Then 切換仍成功，變更歷程之原因欄留空。
- Given 某「失效」文件之編號已被他筆文件重用, When 嘗試將其切回「有效」, Then 依 F013 重驗唯一性、阻擋切換並回 `DOCUMENT_NUMBER_DUPLICATE`，提示需先更換編號。
- Given 非 ICSOP 管理員, When 切換狀態, Then 阻擋並回 `PERMISSION_DENIED`。
- Given 連續快速切換兩次, When 送出, Then 以最後一次為準，無不一致。
- Given 有效文件且公告日期已過（≤今日）, When 於清單/統計卡呈現, Then 衍生顯示為「已公告」，儲存狀態仍為「有效」。
- Given 有效文件且公告日期未到（>今日）, When 於清單/統計卡呈現, Then 衍生顯示為「進度中」，儲存狀態仍為「有效」。

## Error Scenarios
- 權限不足/非法狀態值：見 [error-handling.md#permission](../error-handling.md#permission)、[#document](../error-handling.md#document)（`DOCUMENT_STATUS_INVALID`）。

## Related
- Diagram: [../diagrams/document-status-lifecycle.mmd](../diagrams/document-status-lifecycle.mmd)
- Data: [ICSOP_DOCUMENT.status](../data-model.md#document-entity)
- Depends on: [F010](F010-create-document.md), [F013](F013-document-number-uniqueness.md)（切回「有效」時重驗編號唯一性）; Blocks: [F019](F019-public-list-browsing.md), [F023](F023-audit-logging.md), [F037](F037-document-change-history.md)（狀態變更事件來源）
- 定案: **OQ-E04-02（新增「切換原因」選填欄位，非必填，記於變更歷程 F037）**、OQ-NFR003（稽核保留 ≥3 年，變更歷程適用同一政策）
