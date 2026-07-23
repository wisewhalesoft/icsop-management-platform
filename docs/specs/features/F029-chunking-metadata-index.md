# F029: 章/節 chunking、metadata 標註與向量索引建立
Priority: P0-MVP | Status: Implemented(unit) | Phase: 1 | Last Updated: 2026-07-23
Epic/Story: E09 / US-092

> 雙軌 ingestion 之**軌道 B（檢索內文）第二階段**：將抽取清洗後之內文依「節」切 chunk、掛結構化 metadata、產生 embedding 並寫入向量索引。metadata 中的「使用部門」「文件狀態」「公告日期」為 Phase 3 權限感知檢索（[F033](F033-permission-aware-retrieval.md)）之過濾依據（可見基底＝已公告＝有效且公告日期≤今日＋使用部門），**務必於索引時即正確寫入，不可於檢索後才過濾**（[NFR-009](../nfr.md#rag-security)）。

## Description
系統將 [F028](F028-template-aware-extraction.md) 產出之抽取內文依「節」（每節＝一個完整作業步驟，含執行者／時限／作業內容／檢查事項）切分為個別 [DOCUMENT_CHUNK](../data-model.md#documentchunk-entity)，每個 chunk 掛 8 項 metadata，並產生 [VECTOR_EMBEDDING](../data-model.md#vectorembedding-entity) 寫入向量資料庫，支援以 metadata 篩選查詢。全程記錄於 [INDEX_RUN](../data-model.md#indexrun-entity)。

## Preconditions
- 文件已完成抽取清洗（F028 成功）。

## Main Flow
1. 建立 INDEX_RUN（`status=running`）。
2. 依「節」切分抽取內文為個別 chunk，不將多個不相關步驟混入同一 chunk。
3. 每個 chunk 掛 metadata：ICSOP 文件編號、所屬循環、章節（節次）、使用部門（多值，反正規化自 [DOC_USING_DEPT](../data-model.md#doc-using-dept)）、文件狀態、公告日期、版次、原始頁次。
4. 對每個 chunk 產生 embedding（模型選型見 OQ-E09-02），建立 VECTOR_EMBEDDING。
5. 將向量＋metadata 寫入向量資料庫，確認可依 metadata（如 `status`、`usingDeptIds`）篩選查詢。
6. 更新 INDEX_RUN（`status=success`、`chunkCount`）。

## Alternative Flows
- 由 [F030](F030-reindex-version-status.md) 改版重抽觸發：先產生新一批 chunk/向量，成功後再取代舊版（見 F030 AC-4）。

## Edge Cases
- 一份多節文件：切分為對應數量 chunk，每 chunk 恰對應一個作業步驟。
- 規模參考：約 600 份文件、約 1 萬 chunk（見評估報告第七節），對向量庫屬小規模，非本 feature 效能瓶頸；索引建置吞吐目標見 [NFR-010](../nfr.md#rag-quality) AC5。
- chunk 切分或 embedding 過程失敗：標記索引失敗、不留部分索引殘留（見 Error Scenarios）。

## Postconditions
- 文件之 chunk 全數具完整且正確之 metadata，向量可經權限 metadata 過濾檢索；INDEX_RUN 記錄本次結果供 F031 呈現。

## Acceptance Criteria
- Given 一份已完成抽取清洗的文件, When 執行切分, Then 依「節」切為個別 chunk，每個 chunk 恰對應一個完整作業步驟。
- Given 切分完成的 chunk, When 寫入向量索引前, Then 每個 chunk 皆掛 8 項 metadata（ICSOP 編號/循環/章節/使用部門/狀態/公告日期/版次/頁次）且值正確。
- Given 已掛 metadata 的 chunk, When 執行索引建立, Then 向量成功寫入向量資料庫，且可依 metadata（如使用部門/狀態）篩選查詢。
- Given chunk 切分或 embedding 過程發生錯誤, When 執行索引建立, Then 該文件索引狀態標記「失敗」，不留部分/不完整索引殘留，並保留錯誤訊息供 F031 查詢。

## Error Scenarios
- 切 chunk/向量化/索引失敗：見 [error-handling.md#rag-ingestion](../error-handling.md#rag-ingestion)（`CHUNKING_FAILED`、`EMBEDDING_FAILED`、`INDEX_BUILD_FAILED`）；失敗不留部分索引。

## Related
- Diagram: [../diagrams/F028-rag-ingestion-pipeline.mmd](../diagrams/F028-rag-ingestion-pipeline.mmd)
- Data: [DOCUMENT_CHUNK](../data-model.md#documentchunk-entity), [VECTOR_EMBEDDING](../data-model.md#vectorembedding-entity), [INDEX_RUN](../data-model.md#indexrun-entity), [DOC_USING_DEPT](../data-model.md#doc-using-dept)
- Depends on: [F028](F028-template-aware-extraction.md); Blocks: [F030](F030-reindex-version-status.md), [F031](F031-admin-index-visibility.md), [F033](F033-permission-aware-retrieval.md)
- NFR: [RAG 檢索與生成品質](../nfr.md#rag-quality), [RAG 資料落地與存取安全](../nfr.md#rag-security)
- OQ: OQ-E09-02（embedding/reranker）, OQ-E09-03（向量庫選型）, OQ-E09-06（品質/吞吐量化目標）
