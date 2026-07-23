---
type: implementation-log
feature_id: F016
feature_name: PDF 與 OJT 附件上傳
status: partial
last_updated: 2026-07-23
---

# F016: PDF 與 OJT 附件上傳 — Implementation Log

## 範圍與定案採用
- worktree：`storage`（branch `feature/storage-F016-F018-F027`）。**僅 [unit]**；[integration] 標記為 TODO。
- 採用 launching agent 定案（覆寫 stale OQ）：
  - **Blob 抽象（I）**：`backend/src/storage/blob-store.ts` 介面 `put(key,buffer,contentType)`／`delete(key)`／`exists(key)`／`getDownloadUrl(key,ttlSeconds)` + `FakeBlobStore` 記憶體假體。不呼叫真 Azure。
  - **RBAC 分層（G／OQ-F016-01 收斂）**：路由層 `@RequirePermission(ICSOP文件管理,'read')`；寫入決策下放欄位層 → `FIELD_WRITE_FORBIDDEN`。服務同時落實兩道閘門使 unit 可獨立驗證。
  - **端點（H）**：獨立 `AttachmentsController`，不擴張 `documents.controller.ts`。
  - **OQ-E04-06**：≤50MB；ICSOP PDF 僅 `pdf`；OJT `pdf/jpg/png`；違反 → `FILE_FORMAT_NOT_ALLOWED`／`FILE_SIZE_EXCEEDED`。單份覆蓋。
  - **OQ-F016-04**：覆蓋寫入新 blobPath + 刪除舊 blob（回收孤兒）；舊 blobPath 不再屬任何附件列 → 下載端點拒絕。
  - **OQ-F016-05**：TTL 未定案，暫 `DOWNLOAD_URL_TTL_SECONDS=300`（於 blob-store.ts 集中）。

## Test Results Summary（`cd backend && npx jest attachments/ storage/`）
| Scenario | 說明 | 狀態 |
|---|---|---|
| TS-F016-001~004 | PDF/jpg/png/pdf 上傳成功路徑 | PASS |
| TS-F016-005~006 | 格式白名單負向（exe/docx）→ FILE_FORMAT_NOT_ALLOWED | PASS |
| TS-F016-007~008 | 50MB 邊界／+1 → FILE_SIZE_EXCEEDED | PASS |
| TS-F016-009~011 | 覆蓋語意 + ICSOP_PDF/OJT 欄位獨立 | PASS |
| TS-F016-012~016 | RBAC：ICSOPAdmin 可／唯讀角色 FIELD_WRITE_FORBIDDEN／User PERMISSION_DENIED | PASS |
| TS-F016-017~019 | 受控下載成功／未登入 FILE_ACCESS_DENIED／舊參照拒絕 | PASS |
| TS-F016-022 | F020 燒錄來源 seam 指向最新版 | PASS |
| TS-F016-020,021 | 真 Azure 私有 ACL/SAS 到期 | **[integration] 延後（TODO）** |
| file-rules 純規則 | 格式白名單 + 大小上限 21 tests | PASS |

合計 F016 相關 unit：attachments 20 + file-rules 21 = 41 綠。全庫 424/424 綠。

## Files Changed
| 路徑 | 類型 | 說明 |
|---|---|---|
| backend/src/storage/blob-store.ts | new | BlobStore 介面 + BLOB_STORE token + TTL 常數 |
| backend/src/storage/fake-blob-store.ts | new | 記憶體假體（putCalls/deleteCalls/urlCalls 供斷言） |
| backend/src/storage/file-rules.ts(.spec) | new | 格式白名單 + 50MB 上限純規則 |
| backend/src/storage/document-asset-authz.ts | new | 共用兩道授權閘門（F016/F027/F018 共用） |
| backend/src/storage/storage.module.ts | new | 匯出 BLOB_STORE（暫綁 FakeBlobStore） |
| backend/src/attachments/attachments.store.ts | new | AttachmentStore 介面 + 型別 |
| backend/src/attachments/attachments.service.ts(.spec) | new | F016 服務 + 20 unit |
| backend/src/attachments/typeorm-attachments.store.ts | new | DOCUMENT_ATTACHMENT TypeOrm 實作 |
| backend/src/attachments/attachments.controller.ts | new | 獨立 controller（multipart [integration] 佔位） |
| backend/src/attachments/attachments.module.ts | new | 模組接線 |
| backend/src/database/entities/document-attachment.entity.ts | new | entity（未執行 migration） |
| backend/src/database/migrations/1721952000000-document-attachment.ts | new | migration（未執行） |
| backend/src/app.module.ts | modified | 掛載 AttachmentsModule |

## Architectural Decisions
- 服務層同時做「功能 read gate → 欄位 write gate」使 RBAC 五情境可於 unit 完整覆蓋（不需 boot guard）。
- 下載參照以 `blobPath` 反查現存附件列驗證歸屬（無「直接裸 URL 下載」路徑）→ 覆蓋後舊 blobPath 失效。
- `size` 以中繼資料驅動（非 buffer.length）→ 50MB 邊界可測而不需配置大 buffer。

## Blocking Issues / spec-doc 變更需求（未自行修改共用 spec）
- data-model：`DOCUMENT_ATTACHMENT` 現承載 ICSOP_PDF/OJT_SIGNIN；USAGE_FORM 改採表單池（見 F018 log）。
- OQ-F016-03（OJT 下載權限缺「可下載」註記）、OQ-F016-05（SAS TTL 秒數）仍待 architect 定案。
