# F035: 防幻覺護欄與無結果處理
Priority: P0-MVP | Status: Draft | Phase: 3 | Last Updated: 2026-07-16
Epic/Story: E09 / US-098

> 與 [F033](F033-permission-aware-retrieval.md) 緊密相關但關注點不同：F033 確保「**不檢索到**未授權內容」，F035 確保「基於**檢索到的內容誠實作答**，不編造」。兩者皆為信任/合規必要條件，缺一不可。護欄具體實作（prompt 設計限定僅引用 context、答案後處理檢查引用是否存在於檢索結果等）屬技術細節，待架構階段確認；本 feature 定義功能性 AC。

## Description
智慧問答**僅依據實際檢索到的 chunk 內容作答**，找不到依據時明確告知而非編造；任何實質性答案必附至少一筆引用；檢索相關性偏低時加註低信心提示，不以高確定性語氣呈現不確定推論。

## Preconditions
- 已由 [F033](F033-permission-aware-retrieval.md) 取得（權限過濾後之）檢索結果。

## Main Flow
1. 取得 F033 檢索到之 chunk（已權限過濾）。
2. 生成答案時**僅得基於檢索到之 chunk 內容**，不得混入模型訓練記憶之通用知識或檢索範圍外內容。
3. 生成任何實質性答案時，必附至少一筆引用來源（ICSOP 編號＋章節，見 [F032](F032-frontend-nl-qa.md)）。
4. 檢索無任何相關且有權限之 chunk 時，明確回覆「找不到相關文件內容」，`resultType=no_result`，不生成看似合理但無依據之答案。
5. 檢索結果與問題相關性偏低（如僅部分關鍵字匹配）時，於答案加註低信心提醒「以下內容可能非完全對應您的問題，請自行核對原文件」，`resultType=low_confidence`。

## Alternative Flows
- 無結果之回覆仍計入稽核（QA_LOG，見 [F034](F034-qa-audit-watermark.md)）。

## Edge Cases
- 提問文件庫中完全不存在的內容（如與 ICSOP 無關之通用知識）：明確拒答，不以通用知識回答。
- Prompt injection 誘導「假裝」某文件存在該內容：仍僅依實際檢索結果作答，或明確告知找不到。
- 「相關性閾值」「無結果門檻」「低信心判斷基準」為量化參數，待 PoC 依實測調整（OQ-E09-08），與 [NFR-010](../nfr.md#rag-quality) 拒答正確率目標一併驗證。

## Postconditions
- 使用者取得之答案要麼有依據且附引用、要麼明確告知無結果，不存在「有答案但無引用」或「無依據卻編造」之情況。

## Acceptance Criteria
- Given 系統已透過 RAG 檢索取得相關 chunk, When 生成答案, Then 答案內容僅基於檢索到的 chunk，不含檢索範圍以外之生成內容。
- Given 權限感知檢索（F033）未找到任何相關且有權限之 chunk, When 系統嘗試生成答案, Then 明確回覆「找不到相關文件內容」，不生成看似合理但無依據之答案。
- Given 系統生成任何實質性答案內容, When 使用者查看, Then 答案必附至少一筆引用來源，不存在「有答案但無引用」。
- Given 檢索到的 chunk 與問題相關性偏低, When 生成答案, Then 加註低信心提醒，而非以高確定性語氣呈現不確定推論。
- Given 使用者以 prompt 誘導系統「假裝」某文件存在該內容, When 處理該提問, Then 系統仍僅依實際檢索結果作答，或明確告知找不到。

## Error Scenarios
- 無結果為**功能性回應**（非 HTTP 錯誤）：見 [error-handling.md#rag-query](../error-handling.md#rag-query)（`no_result` 回應語意；生成服務不可用時 `LLM_SERVICE_UNAVAILABLE`）。

## Related
- Diagram: [../diagrams/F033-permission-aware-query.mmd](../diagrams/F033-permission-aware-query.mmd)
- Data: [DOCUMENT_CHUNK](../data-model.md#documentchunk-entity), [QA_LOG](../data-model.md#qalog-entity)
- Depends on: [F029](F029-chunking-metadata-index.md), [F033](F033-permission-aware-retrieval.md); Blocks: [F032](F032-frontend-nl-qa.md)
- NFR: [RAG 檢索與生成品質](../nfr.md#rag-quality)
- OQ: OQ-E09-08（相關性閾值/無結果門檻量化）, OQ-E09-06（拒答正確率目標）
