# F030: 改版重抽與重建索引、舊版排除
Priority: P0-MVP | Status: Implemented(unit) | Phase: 1 | Last Updated: 2026-07-23
Epic/Story: E09 / US-093

> 兩種不同機制須明確區分：**(1) 內容改版**（換 .xls 或編輯內容）→ 需重跑 [F028](F028-template-aware-extraction.md)/[F029](F029-chunking-metadata-index.md) 產生新版索引；**(2) 純狀態切換**（有效↔失效↔作廢）→ 僅更新 chunk 的 `status` metadata，不需重抽內文，效能較輕量。

## Description
文件改版（內容更新或狀態切換）時，系統自動維持向量索引與最新有效文件一致，並將舊版排除於有效檢索範圍，使 Phase 3 問答永遠依據最新且有效內容，不引用過期/失效資訊。

## Preconditions
- 文件已建立過索引（[F029](F029-chunking-metadata-index.md) 曾成功），或首次改版將補建。
- 觸發來源：換 .xls（[F027](F027-xls-source-presentation-pdf.md)）、內容編輯（[F011](F011-edit-with-comparison.md)）、狀態切換（[F012](F012-document-status-toggle.md)）。

## Main Flow
1. 系統偵測改版事件（建議以事件/webhook 串接 F011/F012/F027，技術方案由 Architect 定）。
2. **內容改版分支**：建立新 INDEX_RUN（`triggerType=document_edit`／`xls_update`），重跑 F028 抽取 + F029 切 chunk/索引，產生新版 chunk/向量。
3. 新版索引建立成功後，以新版取代舊版；舊版 chunk 依「狀態」metadata 排除，不再出現於檢索結果。
4. **狀態切換分支**：建立輕量 INDEX_RUN（`triggerType=status_change`，`stage=chunk`），僅同步更新該文件全部 chunk 的 `status` metadata，**不重抽內文**。
5. 更新 INDEX_RUN 結果供 [F031](F031-admin-index-visibility.md) 呈現。

## Alternative Flows
- **狀態還原**（失效→有效）：僅將對應 chunk 的 `status` metadata 還原為「有效」，重新納入有效檢索範圍，無需重抽。
- 首次改版但先前無索引：等同 F029 初建。

## Edge Cases
- 重抽/重建過程失敗：**保留舊版索引繼續可用**（直到重抽成功），標記重新索引狀態「失敗」供 F031 查詢；文件不落入「完全無索引」（AC-4）。
- AC-4 之「保留舊版索引至重抽成功」為技術層過渡緩衝，非永久保留舊版；重抽成功後舊版即被取代，不違反 E04「不保留歷史版本檔」之文件版本策略。
- 狀態切為「作廢」：對應 chunk 立即被排除於有效檢索，不需重抽。

## Postconditions
- 有效檢索範圍僅含最新有效版本 chunk；舊版/失效/作廢 chunk 一律排除；重抽失敗期間舊版仍可服務檢索。

## Acceptance Criteria
- Given 一份已產生索引的文件, When 管理員更新其 .xls 原件或編輯內容, Then 系統自動觸發 F028 抽取與 F029 切 chunk/索引，產生新版索引。
- Given 文件已產生新版索引, When 前台問答（Phase 3）執行檢索, Then 檢索結果僅含最新有效版本 chunk，舊版依狀態 metadata 被排除。
- Given 文件狀態被切換為失效/作廢, When 系統偵測狀態變更, Then 對應文件全部 chunk 之狀態 metadata 同步更新以排除於「有效」檢索範圍，且不需重新抽取內文。
- Given 文件改版觸發重抽, When 新版抽取或索引建立失敗, Then 系統保留舊版索引繼續可用並標記重新索引狀態「失敗」供 F031 查詢，文件不處於「完全無索引」狀態。
- Given 文件狀態由失效切回有效, When 系統偵測狀態變更, Then 對應 chunk 重新納入有效檢索範圍（無需重抽，僅 metadata 還原）。

## Error Scenarios
- 重抽/重建索引失敗：見 [error-handling.md#rag-ingestion](../error-handling.md#rag-ingestion)（`REINDEX_FAILED`，保留舊索引）。

## Related
- Diagram: [../diagrams/F028-rag-ingestion-pipeline.mmd](../diagrams/F028-rag-ingestion-pipeline.mmd)
- Data: [DOCUMENT_CHUNK](../data-model.md#documentchunk-entity), [INDEX_RUN](../data-model.md#indexrun-entity), [ICSOP_DOCUMENT.status](../data-model.md#document-entity)
- Depends on: [F029](F029-chunking-metadata-index.md), [F011](F011-edit-with-comparison.md), [F012](F012-document-status-toggle.md); Blocks: [F031](F031-admin-index-visibility.md), [F033](F033-permission-aware-retrieval.md)
- OQ: OQ-E09-06（品質/吞吐量化目標）
