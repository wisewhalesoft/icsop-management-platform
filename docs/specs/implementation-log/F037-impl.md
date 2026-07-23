---
type: implementation-log
feature_id: F037
feature_name: ICSOP 程序書變更歷程（欄位層 Before/After Diff）
status: complete
last_updated: 2026-07-23
---

# F037: 程序書變更歷程 — Implementation Log（changehistory worktree）

本輪將 F011/F012 已發之 `DocumentChangedEvent` seam 綁定至**真實 publisher**，把欄位層 before/after diff 持久化為新表 `DOCUMENT_CHANGE_LOG`（append-only），並提供查詢 API＋前端「ICSOP 程序書」tab（prototype 23）＋ `CHANGE_LOG_VIEW` 稽核。與 F038 同屬獨立後台功能「文件變更歷程」，共用 change-history 模組與 prototype。

## 本輪實作

### 事件 seam 擴充（向後相容，決策 B）
- `documents/document-change-event.ts`：`DocumentChangedEvent` **加選填欄**（Noop 忽略、rag/public 逐字重用之核心欄不變）：`changes: DocumentFieldDelta[]`（逐欄位 old/new）、`documentNumber`、`actorId/actorName/actorEmployeeNo`（操作者身分快照，寫入當下）。加純函式 `toFieldValueString(v)`（null/Date/物件/純量字串化）。
- `DocumentsService.update/setStatus` 加選填 `actor` 參數（controller 自 `SessionUser.accountId/name/employeeNo` 帶入）：
  - `update()` 將既算之 `changes[{field,before,after}]` 映射為事件 `changes[{field,oldValue,newValue}]`（字串化）＋帶編號/操作者快照。
  - `setStatus()` 於 `updateStatus` 前擷取舊狀態 → 事件 `changes:[{field:'status',oldValue,newValue}]`；狀態未變則空 delta（無日誌）。
- `DocumentsController` update/setStatus 加 `@Req()`＋`actorOf(req)`。**setStatus 簽名新增 `@Req()`**（既有 controller 單測同步更新）。

### 落地與查詢（新 change-history 模組）
- 實體/表 `DOCUMENT_CHANGE_LOG`（entity + migration `1722643200000`，unique）：`documentId/documentNumber/changeType/field/oldValue/newValue/actorId/actorName/actorEmployeeNo/occurredAt`；索引 documentId、occurredAt、(documentId,occurredAt)；occurredAt 用 datetime2。
- `DocumentChangeLogStore`（介面**結構上不暴露 update/delete**，比照 AUDIT_LOG）＋ TypeOrm 實作（insert-only）＋ 純 `buildDocumentChangeLogRows(event)`（逐 delta 一列；空 delta→無列）。
- `DocumentChangeLogPublisher`（真實 publisher）：documents.module 以 `useExisting` 覆寫 `DOCUMENT_CHANGE_PUBLISHER` seam。
- `DocumentChangeHistoryService`：`queryChanges(filters)`（載全→純函式 `filterDocumentChanges` 篩選/排序新→舊，清單不寫稽核）；`viewDocument(id,actor)`（該文件列 ＋ 記 `CHANGE_LOG_VIEW` 稽核，targetId=documentId，經 AuditWriter Outbox 非阻斷）。
- `ChangeHistoryController`：`GET /admin/change-history/documents`（清單）、`GET .../documents/:documentId`（展開＋稽核）；RBAC `@RequirePermission(DOCUMENT_CHANGE_HISTORY, read)`。

### 前端（prototype 23 逐項對齊）
- `pages/ChangeHistoryPage.tsx`：`PageHeader` breadcrumb「稽核追溯 › 文件變更歷程」＋兩次分頁（ICSOP 程序書 ｜ 循環樹狀圖）；程序書 tab 篩選列（程序書/變更欄位/操作人/起訖）＋表格（同操作者/同程序書/60 秒聚合，客端）＋展開 before/after（觸發 `viewDocumentChanges` 記稽核）；scope note、append-only 註腳。RBAC 自我守門封鎖（不呼叫端點）。
- 路由 `/admin/change-history`（menu.ts 既有 `changehistory` 項，route/functionKey 已就緒）；`api/types.ts`＋`endpoints.ts` 加型別與端點。

## Test Results Summary
| Scenario / 測項 | 說明 | Status |
|---|---|---|
| document-change-log-publisher.spec | 純 builder 逐欄位/STATUS/空 delta/缺快照；publisher append | PASS（6） |
| document-change-history.service.spec | 篩選/排序、清單不稽核、view 記 CHANGE_LOG_VIEW、無 actor 不稽核 | PASS（4） |
| documents.service.spec（擴充） | CONTENT 事件承載 diff＋actor 快照；未變更→空 delta；STATUS old/new | PASS（回歸全綠） |
| documents-controller.spec（更新） | update/setStatus 貫穿 actor 快照 | PASS |
| change-history.controller.spec | 路由/RBAC metadata＋委派＋403（Supervisor/DeptContact/User） | PASS（10，與 F038 共檔） |
| ChangeHistoryPage.test.tsx（前端） | 程序書列渲染、展開記稽核、RBAC 封鎖 | PASS |
| 全 backend 單元 | 無回歸 | PASS（81 suites / 900 tests） |
| 全 frontend 單元 | 無回歸 | PASS（30 files / 176 tests） |
| tsc（backend src+itest / frontend） | 型別乾淨 | PASS |
| migration:run vs SOP | `DOCUMENT_CHANGE_LOG` 建表＋索引＋REVOKE 成功 | 已執行 |

> 端到端（真 SOP）：`test/int/changehistory.itest.ts`「編輯文件 → DOCUMENT_CHANGE_LOG 落列（field/old/new/actorId 快照）＋查詢/展開」**已備、本輪未跑**（orchestrator 序列化 test:int）。

## Files Changed（F037 相關；完整清單見 F038-impl 共列）
| File Path | Change | Description |
|---|---|---|
| backend/src/documents/document-change-event.ts | modified | 事件加 changes/actor/documentNumber 選填欄＋toFieldValueString |
| backend/src/documents/documents.service.ts | modified | update/setStatus 帶 actor＋映射欄位 diff/擷取舊狀態 |
| backend/src/documents/documents.controller.ts | modified | actorOf(req)；setStatus 加 @Req |
| backend/src/change-history/document-change-log.store.ts | new | store 契約（append-only） |
| backend/src/change-history/typeorm-document-change-log.store.ts | new | TypeOrm 實作 |
| backend/src/change-history/document-change-log-publisher.ts | new | 真實 publisher＋純 builder |
| backend/src/change-history/document-change-query.ts | new | 純函式篩選/排序 |
| backend/src/change-history/document-change-history.service.ts | new | 查詢＋viewDocument（稽核） |
| backend/src/database/entities/document-change-log.entity.ts | new | 實體 |
| backend/src/database/migrations/1722643200000-document-change-log.ts | new | 建表 migration（已對 SOP 執行） |
| frontend/src/pages/ChangeHistoryPage.tsx | new | prototype 23 移植（程序書 tab） |

## Architectural Decisions / Flags（需 system-architect 補 spec 缺口）
- **事件 seam 由 minimal 擴充為承載 diff/actor**（決策 B）：原 seam 註記「不承載 diff/前後狀態（F037 deferred）」；本輪 F037 到位，以**向後相容選填欄**擴充，Noop 與 rag 消費者不受影響。TS-F012-008 骨架「STATUS 不承載前後狀態」據此再詮釋為「承載 status old/new」（已於測試更新註記）。
- **稽核粒度＝展開單一文件**（targetId=documentId）：AuditWriter 契約 targetId 依 targetType 必填；跨文件清單查詢無單一 targetId，故清單不寫稽核、以「展開檢視」為稽核動作（滿足 AC「查詢或展開檢視 → 記 CHANGE_LOG_VIEW」之展開路徑）。
- **操作者身分快照**：以 `SessionUser.name/employeeNo` 落地於變更日誌（免 join ACCOUNT），滿足人員篩選/顯示；稽核列之 company/department/section 目前留 null（SessionUser 僅有 orgCode，未解析組織全名）——如需與浮水印同等身分快照，後續於 controller 補組織解析（同 F020 watermark 來源）。**flag architect**。
- **交易邊界**：變更日誌於來源交易成功「之後」發事件落地（非同一 DB 交易）。F037 spec「宜同一交易」屬架構決策（待 system-architect）；本輪採 seam publish-after-commit，與 F011/F012 既有 seam 一致。**flag architect**。
- **未改動之 shared spec docs**（僅於此 flag，不自行編輯）：`data-model.md`（`DOCUMENT_CHANGE_LOG` schema 落地欄位）、`error-handling.md`。
