---
type: implementation-log
feature_id: F024
feature_name: 文件調閱歷程查詢後台
status: partial
last_updated: 2026-07-23
---

# F024: 文件調閱歷程查詢後台 — Implementation Log

> worktree: `feature/audit-F023-F024`（icsop-audit）· unit-only · 前端頁取代 `/admin/access-history` ModulePlaceholder

## Test Results Summary

| Scenario | 說明 | 測試檔 | 狀態 |
|----------|------|--------|------|
| TS-F024-001 | 文件編號查詢 → 新到舊 | access-history-filter.spec | PASS |
| TS-F024-002 | 時間區間 + 人員 → AND | access-history-filter.spec | PASS |
| TS-F024-003 | SysAdmin/ICSOPAdmin → 放行（table-driven） | access-history.controller.spec | PASS |
| TS-F024-004 | Supervisor/DeptContact/User → 403 PERMISSION_DENIED | access-history.controller.spec | PASS |
| TS-F024-005 | 路由/RBAC metadata 契約（query + export） | access-history.controller.spec | PASS |
| TS-F024-006 | 空條件 → 近 30 天預設、非阻斷 | access-history-filter.spec | PASS |
| TS-F024-007 | 展開含浮水印 → 浮水印快照原樣 | AccessHistoryPage.test | PASS |
| TS-F024-008 | 展開變更歷程（無浮水印）→ 留空非錯誤 | AccessHistoryPage.test | PASS |
| TS-F024-009 | 類型＝循環 → 僅 LIFECYCLE | access-history-filter.spec | PASS |
| TS-F024-010 | 類型＝變更 → 僅變更歷程檢視/下載 | access-history-filter.spec | PASS |
| TS-F024-011 | 類型＝全部 → 三類混合、不因缺值拋錯 | access-history-filter.spec | PASS |
| TS-F024-012 | 文件編號 + 類型＝循環 → 空結果非錯誤 | access-history-filter.spec | PASS |
| TS-F024-013 | 分頁邊界（每頁 50） | access-history-filter.spec | PASS |
| TS-F024-014 | 非文件類 documentId null → 容許空值 | access-history-filter.spec | PASS |
| TS-F024-015 | 匯出遵循查詢條件（非全表） | access-history.controller.spec | PASS |
| TS-F024-016 | 匯出角色守門同查詢 → 403 | access-history.controller.spec | PASS |
| TS-F024-017 | 效能/索引 P95<2s | — | **[integration] DEFERRED**（需真實 MSSQL+索引+k6/JMeter） |
| TS-F024-018 | 跨年度排序/篩選正確性 | — | **[integration] DEFERRED**（需真實 DB 跨年度資料） |

前端頁另附 9 個 RTL 案例（渲染/RBAC 封鎖/類型切換再查/展開浮水印/空狀態/預設範圍提示/匯出/人員 AND）。
本功能單測：backend controller+filter 併入 F023 之 51；frontend +9（全量 115 passed / 23 files，無回歸）。

## Files Changed

| 路徑 | 類型 | 說明 |
|------|------|------|
| backend/src/audit/access-history.controller.ts | new | GET /admin/access-history（查詢）+ /export；@RequirePermission(文件調閱歷程查詢,'read') |
| backend/src/audit/access-history-filter.ts | new | kindToTargetTypes + resolveAuditQuery（篩選/排序/分頁/近 30 天預設） |
| frontend/src/pages/AccessHistoryPage.tsx | new | F024 頁（prototype 17 移植），取代 access-history ModulePlaceholder |
| frontend/src/pages/AccessHistoryPage.test.tsx | new | 9 RTL 案例 |
| frontend/src/api/types.ts | modified | AccessHistoryRow/AccessHistoryPage/AccessHistoryFilters/AuditKind |
| frontend/src/api/endpoints.ts | modified | getAccessHistory / exportAccessHistory |
| frontend/src/components/Icon.tsx | modified | 註冊 download/globe/user-search/file-search/file-badge/stamp |
| frontend/src/App.tsx | modified | 新增 `access-history` 路由 → AccessHistoryPage |

## 架構決策（spec 邊界內）

- **kind ↔ targetType 對照**（開放問題#7）：文件→`[DOCUMENT,USAGE_FORM]`、循環→`[LIFECYCLE]`、變更→`[DOCUMENT_CHANGE_LOG,LIFECYCLE_CHANGE_LOG]`。此對照使 TS-009/010 之 actionType 集合自然成立（無需另列 actionType 白名單）。建議 architect 於 F024 spec 補此顯式對照表。
- **空條件行為**（開放問題#1）：採 prototype 17 **非阻斷**路線——伺服器套用近 30 天預設 `from` 並回 200，`Page.appliedDefaultRange=true` 供前端顯示「已套用近 30 天預設」提示；**不**回 400 `QUERY_CONDITION_REQUIRED`。error-handling.md 之「或」語意需 architect 對齊為非阻斷。
- **範圍恆全公司**（開放問題#6）：`scope={company:'ALL'}`，SysAdmin/ICSOPAdmin 皆全公司唯讀；保留 scope 參數以利日後多公司分權。
- **匯出**（開放問題#3）：與查詢共用 filters + 角色守門（`GET /export`，同 `@RequirePermission` read）；回 `{rows,total}`，`pageSize=EXPORT_MAX`（草案 100000）。CSV/Excel 位元組序列化未定案、未自動化。
- **對象欄呈現**：`documentNumber ?? lifecycleName ?? formId`；角色以 `roleMeta(roleCode).label` 顯示中文。

## Blocking / Spec-doc changes needed（唯讀，僅回報）

1. **error-handling.md**：`QUERY_CONDITION_REQUIRED` 目前為 400；本實作依 prototype 採非阻斷（不丟該碼）。需 architect 對齊語意（改為敘述性/移除 400 路線），否則前後端行為與 error-handling.md 字面不一致（見 F024-test 開放問題#1）。
2. **F024 spec**：補 `kind`（前端顯示值）↔ `targetType`/`actionType` 顯式對照表（開放問題#7）。
3. 承 F023：`watermarkSnapshot` 條件必填、`targetName` 顯示欄、分頁大小 50 定案——見 F023-impl.md「Spec-doc changes needed」。
4. **feature-status.md**（唯讀，未改）：F023/F024 由 ⬜/🔵 → 🟡（unit 完成，DB/整合待）；建議 owner 同 commit 更新。
