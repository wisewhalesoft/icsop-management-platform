---
type: implementation-log
feature_id: F011,F012,F013,F015,F017
worktree: doc-edit
branch: feature/doc-edit-F011-F017
status: complete-unit
last_updated: 2026-07-23
---

# doc-edit（F011/F012/F013/F017/F015）— 實作日誌

TDD（unit）交付。backend 一律 `cd backend && npm test`（jest）；`[integration]` 標記為 TODO（未自動化）。
不改共用 spec 文件（data-model/error-handling/architecture/feature-status）；需求變更於文末「需 spec owner 處理」列出。

## 共用契約（rag/public/F037 逐字重用）

### DocumentChangedEvent / DocumentChangePublisher（決策 A seam；`documents/document-change-event.ts`）
```ts
interface DocumentChangedEvent {
  documentId: string;
  changeType: 'CONTENT' | 'STATUS' | 'META';
  changedFields?: string[];
  occurredAt: Date;
}
interface DocumentChangePublisher { publish(e: DocumentChangedEvent): Promise<void> }
export const DOCUMENT_CHANGE_PUBLISHER = Symbol('DOCUMENT_CHANGE_PUBLISHER');
class NoopDocumentChangePublisher implements DocumentChangePublisher { /* 預設綁定，no-op */ }
```
- F011 `update()` 成功 → `publish({documentId, changeType:'CONTENT', changedFields, occurredAt})`
- F012 `setStatus()` 成功 → `publish({documentId, changeType:'STATUS', changedFields:['status'], occurredAt})`
- 模組預設 `{ provide: DOCUMENT_CHANGE_PUBLISHER, useClass: NoopDocumentChangePublisher }`；
  rag 併回後覆寫此綁定即可消費事件。**契約不承載 reason/前後狀態/diff**（屬 F037，deferred）。

### GET /admin/documents/:id（回傳 DocumentView；public/rag 重用）
```ts
interface DocumentView {
  id: string; nodeId: string | null;
  lifecycleId: string; status: 'active'|'inactive'|'void';
  documentNumber: string; documentName: string;
  draftingCompanyId?: string | null; draftingDeptId?: string | null; draftingSectionId?: string | null;
  primaryChiefId?: string | null; edition?: string | null;
  announcedDate?: Date | null; contentSummary?: string | null;
}
```
查無 → 404 `DOCUMENT_NOT_FOUND`。連結點另走 `GET /admin/documents/:id/links`（F015）。

## 各功能

### F011 編輯 ICSOP 文件與版本對照 — complete（unit）
- `GET /admin/documents/:id`（read）、`PATCH /admin/documents/:id`（write）。
- `DocumentStore.update(id, patch)` 覆寫式（不留歷史、UUID 不變）；`DocumentUpdateResult{document, changes:[{field,before,after}]}` 供版本對照。
- 欄位面（F026）：唯讀欄寫→403 `FIELD_WRITE_FORBIDDEN`；系統/未知欄靜默忽略；**nodeId 編輯端一律唯讀**（決策：節點寫入僅經 F009 抽屜，`EDIT_READONLY_PROPS`）→ 解 OQ-F011-02。
- F010 必填合併現值後檢核（partial patch 僅影響觸及欄）；F012 狀態合法；F013 編號唯一（編輯側排除自身）。
- TS-F011-001~021 覆蓋（前端 TS-009/010/016/017/018＝`[unit-前端]`，本輪未做，見下）。

### F012 文件狀態切換 — complete（unit，記錄落地 deferred）
- `setStatus(id, status, reason?)`；`normalizeReason`（空字串/純空白→undefined，視同未填）。
- controller `PATCH :id/status` body 解構 `reason` 一併傳遞（缺鍵→undefined 不阻擋）。
- 成功發 `DocumentChangedEvent{STATUS}`。
- **再詮釋 TS-F012-008**：test-spec 之骨架事件 `{beforeStatus,afterStatus,reason}` 由決策 A 契約取代（seam 僅 STATUS，不承載 reason/前後狀態）。reason 現階段僅接收/正規化、**無持久化 sink**（F037 `DOCUMENT_CHANGE_LOG` deferred）。TS-F012-009 `[integration, blocked-by F037]`。

### F013 文件編號唯一性 — complete（unit；真併發 [integration]）
- `isUniqueConstraintViolation`（mssql 2601/2627）攔 `create`/`update` 之併發唯一鍵違反 → 409 `DOCUMENT_NUMBER_DUPLICATE`，不洩漏原始 DB 訊息。精確比對避免誤判 FK 547/逾時（TS-F013-003 負向）。→ 解 OQ-F013-01。
- 編輯側排除自身（`isNumberAvailable(num, holders, id)`）於 F011 `update()`；TS-F011-011~015。
- TS-F013-005/006（真實兩交易併發）＝`[integration]`，未自動化。

### F017 後台文件清單與搜尋 — complete（unit；真 join/分頁 [integration]）
- `applyDocumentQuery`（純函式）：制定公司/部門/室別、當責室長、精確編號/書名、既有 keyword 模糊；
  **狀態篩選相容原始值（active/inactive/void）與衍生顯示值（已公告/進度中/失效/作廢，today-aware）** → 解 OQ-F017-01（採衍生＋相容原始）。
- 排序（編號/公告日期，null 排最後）；**real pagination**（1-based page/pageSize 預設 50，取代 take 2000）→ 解 OQ-F017-02（比照 F024=50）。
- `list` 回 `DocumentListPage{items,total,page,pageSize,hasNext}`。
- 名稱解析（`DocumentsService` 注入 org-foundation `NameResolutionService`，選填）：制定公司/部門/室別→`resolveOrgUnitName`；當責室長→`resolvePersonNames`（去重批次）。
- **再詮釋 TS-F017-003 / OQ-F017-05**：原 test-spec 因「PERSON 表待建」限「僅顯示員編」；org-foundation 併回後 `resolvePersonName` **已就緒** → 改為解析姓名（查無→null，前端 fallback 員編）。
- TypeOrmStore.list 下推 SQL（filter/sort/OFFSET-FETCH + getManyAndCount + linkTargetId EXISTS 子查詢）。
- 前端欄位渲染/combobox/樹狀圖導覽（TS-024/026/027/028 等 `[unit-前端]`）本輪未做。

### F015 文件連結點 — complete（unit；DB FK/唯一 [integration]）
- **決策：links 隨 PATCH :id 整批送出**（解 OQ-F015-01 / OQ-F011-05）。`update()` 自 payload 抽 `links[]` → 差集同步（新增缺少/移除多餘），單向 source=id。
- 目標存在性於任何寫入前預查 → 缺 400 `DOCUMENT_LINK_TARGET_NOT_FOUND`；作廢/失效目標允許（OQ-E04-05）。
- `GET :id/links`：回連結清單＋各目標編號/書名/目前狀態。
- 非 ICSOPAdmin 於 links 欄位面 → `FIELD_WRITE_FORBIDDEN`（解 OQ-F015-02：batched 路徑走欄位面）；User 之功能面 `PERMISSION_DENIED` 由既有 route guard（role-permission.guard.spec）涵蓋。
- `DocumentLinkStore` + TypeOrm 實作 + `DocumentLinkEntity`（(source,target) 複合唯一，單向 OQ-E04-04）。
- migration `1722297600000-document-link` 僅撰寫未執行。

## 檔案異動（backend/src）
| 檔案 | 類型 | 說明 |
|---|---|---|
| documents/document-change-event.ts | new | 變更事件 seam（決策 A） |
| documents/db-error.ts (+spec) | new | mssql 唯一鍵違反判斷式（F013） |
| documents/status-reason.ts (+spec) | new | 切換原因正規化（F012） |
| documents/document-list-query.ts (+spec) | new | 清單篩選/排序/分頁純函式（F017） |
| documents/document-link.store.ts | new | 連結點 store 介面/型別（F015） |
| documents/typeorm-document-link.store.ts | new | 連結點 TypeOrm 實作 |
| documents/documents.service.ts | mod | update/getDocument/getDocumentLinks；publisher/resolver/linkStore 注入；create/setStatus 擴充 |
| documents/documents.store.ts | mod | update()＋DocumentPatch/UpdateResult/FieldChange；清單型別擴充＋DocumentListPage |
| documents/typeorm-documents.store.ts | mod | update()；list() 下推 filter/sort/paginate |
| documents/documents.controller.ts | mod | GET :id、PATCH :id、GET :id/links、list 全參數 |
| documents/documents.module.ts | mod | 匯入 OrgDirectoryModule；provide 連結 store＋no-op publisher |
| documents/documents.service.spec.ts | mod | F011/F012/F015/F017 場景＋FakeStore.update/list/FakePublisher/FakeLinkStore/FakeNameResolver |
| documents/documents-controller.spec.ts | new | controller body 貫穿（F012 reason、F011 update） |
| documents/documents-controller-routes.spec.ts | new | 路由/RBAC metadata（TS-F011-021）＋不遮蔽 |
| database/entities/document-link.entity.ts | new | DOCUMENT_LINK 實體 |
| database/migrations/1722297600000-document-link.ts | new | 遷移檔（未執行） |

## [integration]（TODO，未自動化）
- F013 TS-005/006：真實 MSSQL 兩交易併發 filtered unique index 違反（含 create vs 失效切回有效）。
- F017：衍生狀態 today 之 SQL 比較、分頁 tie-breaker 穩定性、org_unit 真實 join 效能。
- F015：DOCUMENT_LINK FK 完整性、(source,target) 唯一併發去重。
- F012 TS-009：切換事件經 F024 可查（blocked-by F037）。

## 需 spec owner 處理（未改共用 spec 文件）
- **error-handling.md**：`DOCUMENT_LINK_TARGET_NOT_FOUND` 已於 spec 存在（HTTP 400）；本實作沿用，無新增碼。
- **F037/變更歷程**：`DocumentChangedEvent` seam 已就緒但**無持久化**；F037 到位後綁真實 publisher 消費 CONTENT/STATUS 事件，並補 reason/前後狀態/欄位 diff 之落地（F012 AC「供 F024 查詢」屆時方可完整驗收）。
- **data-model**：`DOCUMENT_LINK` 表結構（(source,target) 複合唯一、單向）建議補入正式 data-model（目前僅本 wave entity/migration）。
- **F026**：`nodeId` 編輯端「入口限定」以 `EDIT_READONLY_PROPS` 白名單於 F011 端點強制（OQ-F011-02 選項 a）；`field-matrix.ts` 之三值模型未擴充第四值。
- **前端（`[unit-前端]`）**：F011 編輯頁/取消不污染/所屬節點唯讀＋跳畫布、F017 欄位渲染/combobox/樹狀圖導覽、F015 連結 chips UI 本輪**未實作**（後端契約已就緒供前端串接：`GET :id`、`PATCH :id`（含 links）、`GET :id/links`、`GET /admin/documents`（DocumentListPage 分頁）、`PATCH :id/status`（reason））。
- **前端清單 API 合約變更**：`GET /admin/documents` 由陣列改回 `DocumentListPage{items,...}`；現有 `frontend/DocumentListPage` 及其測試需同步改讀 `.items` 與分頁（本輪未動前端，前端 vitest 仍綠）。
