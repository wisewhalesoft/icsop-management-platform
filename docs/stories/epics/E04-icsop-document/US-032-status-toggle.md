# US-032: 文件狀態切換

> **Story ID**: US-032
> **Epic**: [E04 ICSOP 文件管理](epic-brief.md)
> **Priority**: P0 (Must Have)
> **Phase**: 1
> **Estimated Points**: 3

## User Story

As a **ICSOP 管理員**,
I want **直接手動切換 ICSOP 文件狀態（有效／失效／作廢）**,
So that **文件的生命週期狀態能即時反映實際管理需求，不需經過簽核流程**。

## Acceptance Criteria

**AC1 — 狀態切換**
- Given 我檢視一筆 ICSOP 文件詳情
- When 我選擇將狀態由「有效」切換為「失效」或「作廢」
- Then 系統立即更新狀態欄位，無需任何簽核或多層核准步驟

**AC2 — 狀態變更即時生效於前台**
- Given 文件狀態已被切換為「失效」或「作廢」
- When 一般使用者於前台瀏覽（[E06](../E06-public-browsing/epic-brief.md)）查詢文件
- Then 前台清單依 [E06 US-052 篩選](../E06-public-browsing/US-052-filter-dept-status-lifecycle.md) 規則正確反映最新狀態

**AC3 — 狀態切換留下最基本操作紀錄**
- Given 我完成一次狀態切換
- When 切換動作送出
- Then 系統記錄操作者、切換前後狀態與時間，供 [E07 稽核](../E07-audit-trail/epic-brief.md) 查詢

**AC4 — 清單顯示狀態為衍生（依公告日期）**
- Given 一筆儲存狀態為「有效」的文件
- When 於清單／統計卡呈現
- Then 依公告日期衍生顯示：公告日期已過（≤今日）顯示「已公告」、公告日期未到（>今日）顯示「進度中」；此為顯示層計算，儲存狀態仍維持「有效」，「失效」／「作廢」照原樣顯示

**AC5 — 切換原因（選填，2026-07-17 OQ-E04-02 定案）**
- Given 我進行一次狀態切換操作
- When 我在切換操作介面額外輸入「切換原因」文字（欄位為**選填、非必填**）
- Then 系統將此原因與本次狀態切換一併記錄，寫入 [E07 US-062 ICSOP 程序書變更歷程](../E07-audit-trail/US-062-document-change-history.md) 對應之異動事件（fieldName＝文件狀態，附帶切換原因文字）
- Given 我進行一次狀態切換操作但未填寫切換原因
- When 我送出切換
- Then 系統仍正常完成切換，變更歷程對應紀錄之切換原因以空值記錄，不因未填寫而阻擋切換

## Technical Notes

- 無簽核流程為已定案決策，狀態切換為單步驟即時生效操作
- 狀態切換權限依 [E08 US-070 角色×功能權限矩陣](../E08-permission-matrix/US-070-role-function-matrix.md)，草案僅 ICSOP 管理員可執行
- **儲存**狀態列舉值固定為：有效／失效／作廢，不可自訂新狀態（本 story 不改變儲存模型）
- **顯示**衍生：清單／卡片／統計卡以「公告日期（announcedDate）」把「有效」衍生顯示為「已公告」（≤今日）或「進度中」（>今日）；衍生值不另存欄位、不改變儲存狀態；統計卡計數採衍生值
- **已定案（2026-07-17，OQ-E04-02）**：新增選填欄位「切換原因」（暫定屬性名 `changeReason`，實際命名由架構師/data-model 定案），非必填；不新增獨立儲存欄位於 `ICSOP_DOCUMENT` 本體，而是隨本次切換事件一併寫入 [E07 US-062 變更歷程](../E07-audit-trail/US-062-document-change-history.md)（fieldName＝文件狀態之異動紀錄），供稽核追溯原因（如有填寫）；不影響既有「無簽核流程、單步驟即時生效」之操作模式

## Test Cases

- **TC-032-01（Happy Path）**：將「有效」文件切換為「失效」，狀態立即更新且前台不再顯示（或依規則標示失效）
- **TC-032-02（Happy Path）**：將「失效」文件切換為「作廢」，狀態正確更新
- **TC-032-03（Error）**：非 ICSOP 管理員角色嘗試切換狀態，系統阻擋並回傳權限錯誤
- **TC-032-04（Edge）**：連續快速切換狀態兩次，系統以最後一次送出為準，無競態(race condition)導致的資料不一致
- **TC-032-05（Edge — 顯示衍生）**：有效文件且公告日期已過（≤今日），清單顯示「已公告」；公告日期未到（>今日），清單顯示「進度中」；儲存狀態皆維持「有效」
- **TC-032-06（Happy Path — 切換原因）**：切換狀態並填寫切換原因，預期成功儲存，且 US-062 變更歷程對應紀錄含此原因文字
- **TC-032-07（Edge — 切換原因選填）**：切換狀態不填寫切換原因，預期仍成功切換（驗證非必填、不阻擋）

## Dependencies

**Blocked By**:
- [US-030 建立 ICSOP 文件](US-030-create-icsop-document.md)

**Blocks**:
- [E06 US-052 部門/狀態/循環篩選](../E06-public-browsing/US-052-filter-dept-status-lifecycle.md)
- [E07 US-060 稽核軌跡記錄](../E07-audit-trail/US-060-audit-trail-logging.md)（狀態切換事件記錄）
- [E07 US-062 ICSOP 程序書變更歷程](../E07-audit-trail/US-062-document-change-history.md)（切換原因文字之記錄去處，2026-07-17 OQ-E04-02 定案）

## Definition of Done

- [ ] Acceptance criteria met
- [ ] Unit tests passing (>80% coverage)
- [ ] Code review approved
- [ ] Documentation updated

## Related

- [Epic Brief: E04 ICSOP 文件管理](epic-brief.md)
- [E08 US-070 角色×功能權限矩陣](../E08-permission-matrix/US-070-role-function-matrix.md)
