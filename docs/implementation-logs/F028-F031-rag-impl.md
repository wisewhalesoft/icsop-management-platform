---
type: implementation-log
feature_id: F028,F029,F030,F031
feature_name: RAG ingestion 軌道 B（抽取／chunking／改版重抽／管理端可視性）
worktree: rag (feature/rag-F028-F031)
status: complete (unit-only；[integration] deferred)
last_updated: 2026-07-23
---

# F028–F031 RAG ingestion — 實作日誌（rag worktree）

範圍：E09 智慧問答（RAG）軌道 B 檢索內文之四功能，全部以 **unit-only** TDD 完成（`backend/src/ingestion/`）。
所有 embedder／vector store／xls 抽取／DB 落地皆以 fake/純函式替身；真實模型／pgvector／MSSQL／docker
一律列 `[integration]`。測試命令：`cd backend && npm test`（jest）、`cd frontend && npx vitest run`。

## 測試結果彙總

| 檔案 | 對應 TS | 結果 |
|---|---|---|
| `template-aware-extractor.spec.ts` | TS-F028-001~023 | 24 PASS |
| `indexing.spec.ts` | TS-F029-001~022 | 22 PASS |
| `reindex.service.spec.ts` | TS-F030-001~018 + onDocumentChanged 映射 | 21 PASS |
| `index-visibility.spec.ts` | TS-F031-001~017 | 22 PASS |
| `index-visibility.controller.spec.ts` | TS-F031-018~022 + 委派/路由序 | 11 PASS |
| `frontend/DocIndexPage.test.tsx` | TS-F031-013/014/019/023/024/001/006/007/009 | 7 PASS |

全 backend 套件：**57 suites / 660 tests GREEN**；全 frontend：**25 files / 126 tests GREEN**。backend tsc `--noEmit` 乾淨、frontend tsc 乾淨。

## 檔案異動

| 路徑 | 類型 | 說明 |
|---|---|---|
| `backend/src/ingestion/extraction.types.ts` | new | F028 ParsedXlsWorkbook/ExtractionResult 契約 |
| `backend/src/ingestion/template-aware-extractor.ts` | new | 抽取＋清洗＋合併接合＋章節正規化（純函式） |
| `backend/src/ingestion/extract-stage.ts` | new | runExtractStage（INDEX_RUN stage=extract 編排） |
| `backend/src/ingestion/index-run.ts` | new | INDEX_RUN 型別 + FakeIndexRunStore（跨 F028~F031 共用） |
| `backend/src/ingestion/chunking.types.ts` | new | DOCUMENT_CHUNK/VECTOR_EMBEDDING/EmbeddingClient/VectorIndexWriter/DocumentContext 契約 |
| `backend/src/ingestion/chunk-store.ts` | new | ChunkStore + FakeChunkStore（版本 new-then-swap + status 雙過濾） |
| `backend/src/ingestion/fake-embedder.ts` | new | FakeEmbedder（維度不可知）/FailingEmbedder |
| `backend/src/ingestion/fake-vector-store.ts` | new | FakeVectorStore（status/usingDeptIds 交集 AND 過濾 + upsertMetadataOnly） |
| `backend/src/ingestion/indexing.ts` | new | runIndexing 管線（切 chunk→embed→落地→失敗補償清理） |
| `backend/src/ingestion/reindex-trigger.port.ts` | new | DocumentChangedEvent/ReindexTriggerPort（task 契約）+ IndexBuilder/DocumentExists/StatusReader 埠 |
| `backend/src/ingestion/reindex.service.ts` | new | F030 onContentRevised/onStatusChanged/onDocumentChanged |
| `backend/src/ingestion/index-visibility.service.ts` | new | F031 chunk 預覽/三態/總覽/手動重索引 |
| `backend/src/ingestion/index-visibility.controller.ts` | new | `/admin/doc-index` 端點 + 逐端點 RBAC action |
| `backend/src/ingestion/ingestion.module.ts` | new | 模組接線（Fake 佔位；匯出 ReindexService） |
| `backend/src/database/migrations/1722297600000-rag-index.ts` | new | DOCUMENT_CHUNK+INDEX_RUN（App MSSQL，**未執行**）；VECTOR_EMBEDDING pgvector DDL＝註記 |
| `backend/src/app.module.ts` | modified | 註冊 IngestionModule |
| `frontend/src/pages/DocIndexPage.tsx` | new | F031 管理頁（prototype 21 移植，取代 ModulePlaceholder） |
| `frontend/src/api/types.ts` / `endpoints.ts` | modified | DocIndex* 型別與端點 |
| `frontend/src/App.tsx` | modified | 掛 `/admin/doc-index` route |

## 交付契約（供下游 worktree 對接）

### DOCUMENT_CHUNK（App MSSQL；`chunking.types.ts` DocumentChunk）
`id, documentId, indexRunId, content, chunkSeq` + 8 項 metadata `documentNumber, lifecycleId, chapterSection,
usingDeptIds(string[]), status('active'|'inactive'|'void'), announcedDate(string|null), edition, pageNumber` + `createdAt`。
status 用**英文內部碼**（見「spec 缺口」）；usingDeptIds MSSQL 以 JSON 陣列快照，權威過濾在向量庫 payload。

### VECTOR_EMBEDDING（pgvector 獨立庫，[integration]）
`id, chunkId(1:1), embeddingModel, vector(number[]), dimension, createdAt`。`dimension` 一律以**實際向量長度**寫入
（防呆，不寫死常數）。過濾 payload = `{documentId, status, usingDeptIds, announcedDate}`（DOCUMENT_CHUNK metadata 反正規化）。

### INDEX_RUN（App MSSQL；`index-run.ts`）
`id, documentId, triggerType('manual'|'document_edit'|'xls_update'|'status_change'|'batch'), status('running'|'success'|'failed'),
stage('extract'|'chunk'|'embed'), chunkCount, errorStage, errorMessage, startedAt, endedAt, triggeredBy`。

### ReindexTriggerPort（F030 對外埠，供 doc-edit/F011/F012/F027 於 merge 時接線）
```ts
interface DocumentChangedEvent { documentId: string; changeType: 'CONTENT'|'STATUS'|'META'; changedFields?: string[]; occurredAt: Date }
interface ReindexTriggerPort { onDocumentChanged(e: DocumentChangedEvent): Promise<void> }
```
內部另暴露 `onContentRevised(documentId, 'xls_update'|'document_edit'|'manual')` 與 `onStatusChanged(documentId, newStatus)`
（F030-test.md 直接測之）。`onDocumentChanged` 映射：CONTENT→onContentRevised('document_edit')、STATUS→讀當前狀態→
onStatusChanged、META→DOC_USING_DEPT/F014 TODO（見 OQ-F030-04）。`IngestionModule` 匯出 `ReindexService`。

## 架構決策（spec 邊界內）

- **OQ-F028-01（分工邊界）**：F028 重用 F027 `validateXlsTemplate` 為第一道粗粒度閘門（避免規則飄移），其上疊
  「作業流程須有可辨識章/節 + 必要標籤欄位」細粒度閘門。兩者失敗皆 `EXTRACTION_FAILED`。
- **OQ-F028-04（章節缺欄位失敗粒度）**：採**保守＝整份文件抽取失敗**（不採跳過壞節；對齊 AC4「不產生殘缺內容」）。
- **OQ-F029-02（失敗不留半索引策略）**：採**先全數計算成功才落地 + 落地階段失敗補償刪除**（`deleteByIndexRunId` +
  逐 chunk vector delete）。測試只斷言「最終不留殘留」，不綁中間過程。
- **OQ-F030-02（未知文件錯誤碼）**：採 `REINDEX_DOCUMENT_NOT_FOUND`（防孤兒 INDEX_RUN）。
- **OQ-F030-03（連續觸發序列化）**：未定案 → 不斷言合併/拒絕（TS-017 僅驗兩次皆完成）。
- **F031 RBAC**：逐端點 action —— overview/status/chunks='read'（SysAdmin 唯讀可查）、reindex='write'（SysAdmin→403）。
  以真實 `RolePermissionGuard` + mock ExecutionContext 逐端點驗證（本 feature 最易錯處）。

## 需回報 spec owner 之缺口（docs/specs 唯讀，未自行修改）

1. **data-model.md line 448 DOCUMENT_CHUNK.status 以中文標籤（有效/失效/作廢）描述**，但 F029-test.md 測試策略明訂用
   英文內部碼（active/inactive/void，對齊 document-status.ts）以利 F033 `WHERE status='active'` 直接比對。實作採**英文內部碼**，
   建議 data-model 對齊註記。
2. **VECTOR_EMBEDDING 維度/模型（OQ-E09-02 `[BLOCKING]`）**：pgvector `vector(N)` 之 N 待模型選型；migration 以註記佔位，
   不寫死。索引吞吐 NFR-010 AC5 待 [integration] 量測。
3. **F030 spec 範疇缺口（OQ-F030-04）**：使用部門變更（F014/DOC_USING_DEPT）未列為觸發來源，narrowing 方向會使
   `DOCUMENT_CHUNK.usingDeptIds` 與 `DOC_USING_DEPT` 飄移（NFR-009 風險）。建議 spec 補第四觸發來源 + `ReindexTriggerPort`
   增 `onUsingDeptChanged`。本輪 `onDocumentChanged` META 分支僅記錄 TODO。
4. **F030 接線責任（OQ-F030-01 `[BLOCKING]`）**：`ReindexTriggerPort` 之實際呼叫方（documents.service setStatus/update
   或事件匯流排）未定案；本 worktree 不改 documents.service，僅實作接收端 + 匯出 ReindexService。
5. **DocumentChangedEvent 不攜帶 STATUS 新值**：`onDocumentChanged` STATUS 分支需另讀授權狀態（`DocumentStatusReader`）。
   建議事件契約補 STATUS 之新狀態值，或確認由接收端讀權威狀態。
6. **F031 掛載點（OQ-F031-01 `[BLOCKING]`）**：F017 文件詳情頁不存在；本輪掛既有 `/admin/doc-index` 獨立總覽路由，
   單文件 chunk 預覽以 modal 呈現（不依賴詳情頁籤）。

## [integration] 待辦（本 worktree 不執行）

- 真實 `.xls` 二進位解析成 ParsedXlsWorkbook（TS-F028-024）；全 corpus≈598 份抽取涵蓋率（TS-F028-025，OQ-E09-04）。
- 真實 embedding 模型維度 vs `vector(N)`（TS-F029-023）；真實 pgvector upsert/過濾（TS-F029-024）；索引吞吐（TS-F029-025）。
- TypeOrmChunkStore/TypeOrmIndexRunStore（App MSSQL）取代 Fake；migration 執行。
- F011/F012 真實呼叫 ReindexTriggerPort（TS-F030-019）；`sp_getapplock` 併發互斥（TS-F030-020）。
- F031 前後端真串接 + 文件 metadata join（documentNumber/name/xls/chunkCount）；大量文件效能（TS-F031-025/026）。
- `IngestionModule` 目前以 Fake 佔位綁定（app 可啟動、F031 端點/守門可用）；[integration] 就位後替換 provider useFactory。
