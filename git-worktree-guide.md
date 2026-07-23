# Worktree Guide: feature/rag-F028-F031 (Wave 2)

> 導航指引，不重複 spec 內容。
> ⚠ **依 /tdd：先寫 test-spec → 失敗測試（red）→ 最小實作（green）→ 重構 → impl log。不得跳過測試設計直接實作。**

## 目標
E09 RAG 索引管線（P0，Phase 1 段）。全新後端模組＋一個管理頁，與其他線不重疊。
- **F028 .xls 模板感知抽取與清洗**：五表模板 parser（來源＝F027 `DOC_SOURCE_XLS`）、頁首尾/簽核/合併儲存格清洗、合併儲存格段落重組、`EXTRACTION_FAILED`、`INDEX_RUN` stage=extract。
- **F029 章/節 chunking、metadata、向量索引**：章節 chunker、8 項 metadata（含 usingDeptIds/status/announcedDate 供 F033）、embedding 整合、`VECTOR_EMBEDDING` 寫入 pgvector、metadata 過濾查詢、`INDEX_RUN` success/chunkCount、失敗不留半索引。
- **F030 改版重抽與重建索引**：變更偵測事件接線（F011/F012/F027 → reindex）、內容改版分支（重跑 F028/F029、新建再換）、輕量 status 分支（只更 chunk 狀態 metadata）、失敗保舊索引、`REINDEX_FAILED`。
- **F031 管理端提取結果與重新索引狀態**：chunk 預覽＋8 metadata、三態（running/success/failed）＋失敗階段、手動重索引、跨文件總覽、RBAC（取代 `/admin/doc-index` ModulePlaceholder）。

## 可用地基（Wave 1 已併 main，**重用勿重建**）
- **.xls 來源**：`backend/src/xls-source/`（`DOC_SOURCE_XLS` 實體、F027）＋`backend/src/storage/` `BlobStore`。F028 取原件由此。
- **pgvector**：`docker-compose.yml` 之 pgvector 容器＋`infra/pgvector-init/01-extension.sql`（`CREATE EXTENSION vector`，**無表**）。F029 建 `VECTOR_EMBEDDING`/`DOCUMENT_CHUNK` schema。
- **模板依據**：`docs/specs/icsop-template-analysis.md`（五表結構、「標準格式」旗標）。
- **RAG 評估**：repo 根 `AI-RAG-評估報告.md`。

## 指派 Features
| F### | 名稱 | P | Ph | 狀態 | 依賴 |
|------|------|---|----|------|------|
| F028 | 模板感知抽取 | P0 | 1 | ⬜ | F027 .xls 來源（有） |
| F029 | chunk/metadata/向量索引 | P0 | 1 | ⬜ | F028、pgvector、embedding model（新相依/服務） |
| F030 | 改版重抽 | P0 | 1 | ⬜ | F028/F029、變更事件（F011/F012/F027） |
| F031 | 管理端狀態頁 | P1 | 1 | ⬜ | F028/F029 資料 |

## Spec 參照
| F### | Feature Spec | Test Design | Prototype |
|------|-------------|-------------|-----------|
| F028 | `docs/specs/features/F028-template-aware-extraction.md` | ⚠ 先產出 | —（後端） |
| F029 | `docs/specs/features/F029-chunking-metadata-index.md` | ⚠ 先產出 | —（後端） |
| F030 | `docs/specs/features/F030-reindex-version-status.md` | ⚠ 先產出 | —（後端） |
| F031 | `docs/specs/features/F031-admin-index-visibility.md` | ⚠ 先產出 | 見 `docs/ui-ux-design-overview.md`（文件索引管理） |

## 全域參照
完成度：`docs/specs/feature-status.md`｜模板分析：`docs/specs/icsop-template-analysis.md`｜Data Model：`docs/specs/data-model.md`｜Error：`docs/specs/error-handling.md`

## 跨分支依賴 / 衝突面
- 需先合併：無。全新模組（extraction/chunking/index/retrieval 之類）＋F031 管理頁，與 doc-edit/public 不重疊。
- 衝突熱點：`app.module.ts`、migration 時間戳（新 `INDEX_RUN`/`DOCUMENT_CHUNK`/`VECTOR_EMBEDDING` 表，勿撞其他線）；前端僅 F031 一頁（`endpoints.ts`/`App.tsx` additive）。
- ⚠ **embedding 模型/pgvector 連線**：單元以替身（fake embedder/fake vector store）測；真模型呼叫與 pgvector schema＝`[integration]` 延後。F030 變更事件對 F011/F012（doc-edit 線在做）先以介面/事件匯流排接、避免直接改 documents.service（減少跨線耦合）。

## TDD 流程
先產 `docs/test-specs/features/F###-test.md` → red → green（fake embedder/vector store）→ refactor → impl log ＋ 更新 `Fxxx-*.md` Status。**勿改** shared spec，回報缺口（embedding 模型選型、chunk 粒度、metadata schema 等設計分叉列入 test-spec 開放問題）。

## 並行硬限制（同 Wave 1）
單元測試（fake embedder/vector store，不碰真模型/pgvector/DB）可並行；真索引＝`[integration]` 序列化。埠固定。各自 `npm install`。migration 勿執行。conventional commits ＋ `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
