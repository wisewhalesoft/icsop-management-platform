---
type: implementation-log
feature_id: F007
feature_name: 循環池 CRUD（收尾）
status: complete
last_updated: 2026-07-23
---

# F007: 循環池 CRUD — Implementation Log（收尾）

## 範圍
- worktree：`lifecycle-e03`。F007 之 CRUD 主體（建立/查詢/編輯/停用/刪除保護 `LIFECYCLE_HAS_DOCUMENTS`／`LIFECYCLE_NAME_REQUIRED`）於前波已落地（`lifecycle.service/controller/store`＋前端 `LifecycleListPage`）。
- 本次**收尾兩項 AC 缺口**：
  - **(a) 建立循環成功 → 導向該循環 DAG 畫布編輯頁（F008）**（Main Flow 1／AC「回傳 UUID、導向 DAG 畫布編輯頁」）。
  - **(b) 刪除循環 → 記錄稽核**（Main Flow 4／AC「允許刪除（含其節點/連線）並記錄稽核」）。

## 落地
### (a) 建立 → 導向 DAG 畫布
- 前端 `LifecycleListPage`：`LifecycleModal` submit 於**新增**成功時取回 `createLifecycle` 回傳之 `LifecycleView`，經 `onSaved(created)` → 頁面 `navigate('/admin/lifecycles/'+created.id+'/canvas')`；**編輯**成功則 `onSaved()`（無參）→ 僅重載清單、不導向。
- 既有測試「新增循環：填名稱送出 → createLifecycle」不受影響（斷言仍成立）；新增測試斷言導向路徑。

### (b) 刪除 → 稽核
- `LifecycleService.deleteLifecycle(id, actor?)`：成功刪除後呼叫 `AuditWriter.recordAccess`（targetType=`LIFECYCLE`、actionType=`LIFECYCLE_DELETE`、targetId=id、targetNumber=循環名稱、操作者身分快照）；**非阻斷**（try/catch，稽核失敗不使刪除回退）。
- `AuditWriter` 以 `@Optional` 注入（module `useFactory` 傳入 `AuditWriterService`）→ 保留既有 `new LifecycleService(store)` 單元建構；無 writer 或無 actor 時靜默略過。
- Controller `remove` 加 `@Req()`，以 `toLifecycleAuditActor(req.sessionUser)` 帶入操作者（actorId＝loginId）。

## Test Results Summary
後端（`cd backend && npx jest src/lifecycle/lifecycle.service.spec`）：
| Scenario | 說明 | 狀態 |
|---|---|---|
| 既有 create/update/status/delete 保護 | 名稱空白、NOT_FOUND、HAS_DOCUMENTS、停用不受掛載限制 | PASS |
| 刪除成功 → 記一筆 LIFECYCLE_DELETE（targetType/targetId/名稱/操作者/時間） | 新增 | PASS |
| 仍有掛載被拒 → 不刪除、不記稽核 | 新增 | PASS |
| 稽核寫入失敗 → 不阻斷刪除 | 新增 | PASS |
| 未提供 actor / 無 AuditWriter → 略過稽核、刪除仍成功 | 新增 | PASS |

前端（`cd frontend && npx vitest run src/pages/LifecycleListPage.test.tsx`）：
| Scenario | 說明 | 狀態 |
|---|---|---|
| 新增成功 → 導向 `/admin/lifecycles/:id/canvas` | 新增 | PASS |
| 編輯成功 → 不導向（留在清單） | 新增 | PASS |
| 樹狀圖圖示 → 開新分頁 viewer（F036 入口） | 新增 | PASS |

全套件：後端 jest 72 檔 845 綠、前端 vitest 29 檔 164 綠；`tsc --noEmit` 皆 0 error。

## Files Changed
| 路徑 | 類型 | 說明 |
|---|---|---|
| backend/src/lifecycle/lifecycle.service.ts(.spec) | modified | deleteLifecycle 記 LIFECYCLE_DELETE（@Optional AuditWriter，非阻斷）＋LifecycleAuditActor |
| backend/src/lifecycle/lifecycle.controller.ts | modified | remove 帶入操作者（toLifecycleAuditActor） |
| backend/src/lifecycle/lifecycle.module.ts | modified | LifecycleService useFactory 注入 AuditWriterService（匯入 AuditModule） |
| backend/src/audit/audit.types.ts | modified | additive：`LIFECYCLE_DELETE` 加入 AuditActionType 與 LifecycleAuditEvent |
| frontend/src/pages/LifecycleListPage.tsx(.test) | modified | 新增成功導向 DAG 畫布；樹狀圖入口 |

## Architectural Decisions
- **刪除稽核走 F023 存取稽核（AUDIT_LOG）之新增動作 `LIFECYCLE_DELETE`**（additive，非改既有變體；`buildAuditRow` 依 targetType 對映故無邏輯變更）。此為依 launching 任務指示「call AuditWriter on delete, targetType LIFECYCLE」之忠實落地。
- 非阻斷語意比照 F020/F036 浮水印稽核（稽核為輔助紀錄，不得使主資料操作失敗）。

## Blocking Issues / spec-doc 變更需求（未自行修改共用 spec）
- **`LIFECYCLE_DELETE` 為新增動作碼，需架構師補入 data-model AUDIT_LOG.actionType 列舉與 error-handling/OQ-E07-02**。此動作**不在** F023 鎖定契約原列（原僅 VIEW/DOWNLOAD/PRINT 浮水印動作＋兩 CHANGE_LOG），屬本次為 F007 收尾之最小 additive 擴充。
- **語意張力（待架構師定案）**：OQ-E03-05 定「循環**結構**變更歷程採 F038」；F007 刪除「記錄稽核」本次以 **AUDIT_LOG 存取層**落地（F038 變更歷程尚未實作、無 writer）。二者為互補而非取代——若架構師認定刪除應僅入 F038 變更歷程，屆時可將此 `LIFECYCLE_DELETE` 移轉並移除本 additive。
- 刪除稽核之 `LIFECYCLE_DELETE` 非浮水印動作，故未帶 company/department/section 之 org 名稱快照（僅 loginId/姓名/員編/角色）；若稽核明細需部門欄，可於 controller 補 org 解析（F036 之浮水印路徑已具此能力）。
