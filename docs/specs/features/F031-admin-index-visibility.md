# F031: 管理端提取結果預覽與重新索引狀態
Priority: P1 | Status: Draft | Phase: 1 | Last Updated: 2026-07-16
Epic/Story: E09 / US-094

> Phase 1「管理端可視性」定案項目：讓管理員在 Phase 3 前台問答上線前，獨立驗證 ingestion 管線品質，並在索引失敗時即時察覺排查。P1（非 P0）：管線本身（F027–F030）為核心必要，本 feature 為輔助驗證工具，時程緊迫時可暫以 DB 查詢/日誌替代，但上線前建議補齊。

## Description
ICSOP 管理員於後台檢視某文件的 chunk 提取結果預覽與重新索引狀態（進行中／成功／失敗），並可查看失敗詳情與手動觸發重新索引，另有跨文件的索引狀態總覽。chunk 預覽僅供管理員檢視（不對一般使用者開放），為 [F029](F029-chunking-metadata-index.md)/[F030](F030-reindex-version-status.md) 執行紀錄之呈現層。

## Preconditions
- 存取權限依 [F025](F025-role-function-matrix.md)「文件索引管理」列：**ICSOP 管理員 CRUD**（預覽／查詢／手動重新索引皆可）、**系統管理員 唯讀**（查詢類允許回傳；手動重新索引等寫入類一律回 403，比照其對 ICSOP 文件管理／循環管理之唯讀原則）、**主管／部門窗口／一般使用者 無**（呼叫本功能任何 API 即回 403）。
- 索引資料來源為 [DOCUMENT_CHUNK](../data-model.md#documentchunk-entity) 與 [INDEX_RUN](../data-model.md#indexrun-entity)。
- 入口可掛載於後台文件清單（[F017](F017-backend-document-list.md)）之文件詳情頁籤。

## Main Flow
1. 於文件詳情開啟「AI 索引狀態」頁籤。
2. 顯示該文件切分出的全部 chunk 清單：每個 chunk 之內容片段與其 metadata（ICSOP 編號／循環／章節／使用部門／狀態／版本／頁次）。
3. 顯示索引狀態三態之一：「進行中」／「成功」（含最後索引時間）／「失敗」（含失敗原因摘要）。
4. 狀態為「失敗」時，點擊查看詳情顯示具體失敗階段（抽取失敗／切 chunk 失敗／向量化失敗）與錯誤訊息，並可手動觸發重新索引。
5. 進入「AI 索引管理」總覽頁：顯示全部文件索引狀態彙總（成功 N／失敗 N／進行中 N），可篩選失敗項目逐一處理。

## Alternative Flows
- 手動重新索引：觸發 F030（`triggerType=manual`）；成功後狀態更新為「成功」。

## Edge Cases
- 文件尚未上傳 .xls／從無 INDEX_RUN：顯示「尚未建立」而非誤判為「失敗」。
- 大量文件之總覽：以彙總計數＋分頁/篩選呈現，不逐筆全載。

## Postconditions
- 管理員可獨立確認任一文件之抽取品質與索引狀態，並排查/重試失敗項目。

## Acceptance Criteria
- Given 一份已成功索引的文件, When 開啟其「AI 索引狀態」頁籤, Then 可看到完整 chunk 清單與各 chunk 的 8 項 metadata。
- Given 一份索引尚在處理中的文件, When 查看其索引狀態, Then 顯示「進行中」。
- Given 一份索引失敗的文件, When 查看詳情, Then 顯示具體失敗階段與錯誤訊息，並可手動觸發重新索引。
- Given 總覽頁存在多筆失敗項目, When 篩選失敗項目並對其一手動重新索引, Then 重新索引成功後該筆狀態更新為「成功」。
- Given 文件尚未上傳 .xls 原始檔, When 查看其索引狀態, Then 顯示「尚未建立」而非「失敗」。
- Given 主管／部門窗口／一般使用者, When 呼叫本功能任一 API, Then 依 F025 拒絕（`PERMISSION_DENIED`，回 403）。
- Given 系統管理員, When 呼叫本功能**查詢**類 API（chunk 預覽／索引狀態／總覽）, Then 依 F025「文件索引管理」唯讀允許回傳；When 呼叫**寫入**類 API（手動重新索引）, Then 回 403（`PERMISSION_DENIED`）。

## Error Scenarios
- 失敗階段呈現/重新索引：見 [error-handling.md#rag-ingestion](../error-handling.md#rag-ingestion)。權限：[error-handling.md#permission](../error-handling.md#permission)。

## Related
- Diagram: [../diagrams/F028-rag-ingestion-pipeline.mmd](../diagrams/F028-rag-ingestion-pipeline.mmd)
- Data: [DOCUMENT_CHUNK](../data-model.md#documentchunk-entity), [INDEX_RUN](../data-model.md#indexrun-entity)
- Depends on: [F029](F029-chunking-metadata-index.md), [F030](F030-reindex-version-status.md); 入口掛載 [F017](F017-backend-document-list.md)
- OQ: OQ-E09-04（模板變體影響抽取品質）
