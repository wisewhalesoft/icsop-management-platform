# F032: 前台自然語言問答與引用來源
Priority: P0-MVP | Status: Draft | Phase: 3 | Last Updated: 2026-07-16
Epic/Story: E09 / US-095

> Phase 3 前台入口功能，聚焦「提問－顯示答案－顯示可跳轉引用」之互動流程。檢索/生成邏輯由 [F033](F033-permission-aware-retrieval.md)（權限感知檢索）與 [F035](F035-hallucination-guardrail.md)（防幻覺護欄）提供；本 feature 不重複定義其規則。問答互動 UI/UX 細節由 UI/UX Designer 設計，不在本 feature 規範範圍。

## Description
一般使用者於前台瀏覽頁以自然語言提問關於 ICSOP 文件內容的問題，系統以 RAG 檢索並生成答案回覆，**每個答案皆附引用來源（ICSOP 編號＋章節）且引用可點擊跳轉至對應文件之檢視位置**。跳轉目標為既有 [F020](F020-watermark.md) 文件檢視器，沿用其浮水印機制，不另建檢視路徑。

## Preconditions
- 使用者已登入（[F001](F001-auth-login-session.md)）並進入前台瀏覽頁（[F019](F019-public-list-browsing.md)）。
- Phase 1 索引已就緒（F029 有有效 chunk）；F033、F035 已到位。

## Main Flow
1. 使用者於智慧問答輸入框輸入自然語言問題並送出。
2. 系統經 F033 權限感知檢索取得相關 chunk（僅「已公告＋使用者所屬使用部門可見」）。
3. 系統經 F035 護欄僅依檢索到之 chunk 生成答案（無依據則明確拒答）。
4. 回覆答案並附引用來源：每筆引用顯示 ICSOP 文件編號＋章節（節次），可點擊跳轉至對應文件檢視位置。
5. 問答計入稽核並寫 [QA_LOG](../data-model.md#qalog-entity)（見 [F034](F034-qa-audit-watermark.md)）；經引用跳轉之檢視/下載沿用 F020 浮水印＋F023 稽核。
6. 本次瀏覽階段內保留問答歷程（問題與對應答案＋引用），便於回顧。

## Alternative Flows
- **多來源引用**：問題涉及多份文件/多章節時，答案同時附多筆引用，每筆可分別跳轉。
- **無結果**：F035 判定無依據時，回覆「找不到相關文件內容」而非編造（見 F035）。

## Edge Cases
- 連續多次提問：問答歷程正確保留並依序顯示。
- 引用之目標文件於檢視時需再次套用當下權限（檢視器仍受 F026/F033 可視範圍約束）。
- 空白/僅空白字元提問：拒絕並提示輸入問題（`RAG_QUERY_EMPTY`）。

## Postconditions
- 使用者取得附可跳轉引用之可查證答案，或明確之無結果告知；問答事件已稽核（F034）。

## Acceptance Criteria
- Given 我登入並進入前台瀏覽頁, When 於智慧問答輸入框輸入自然語言問題並送出, Then 系統以 RAG 檢索並生成答案回覆。
- Given 系統已生成答案, When 我查看回覆, Then 每個答案皆附其依據之 ICSOP 文件編號與章節引用，且引用可點擊跳轉至對應文件檢視位置。
- Given 我的問題涉及多份文件或多個章節, When 系統生成答案, Then 答案同時附多筆引用來源，每筆可分別跳轉。
- Given 我在同一次瀏覽中多次提問, When 查看問答介面, Then 可看到本次瀏覽階段內的問答歷程（問題與答案＋引用）。
- Given 我點擊答案中的引用連結進入文件檢視器, When 檢視/下載發生, Then 沿用 F020 浮水印與 F023 稽核，不因入口是 AI 問答而有差異（見 F034）。

## Error Scenarios
- 空問題/生成服務異常/無結果：見 [error-handling.md#rag-query](../error-handling.md#rag-query)（`RAG_QUERY_EMPTY`、`LLM_SERVICE_UNAVAILABLE`；無結果為功能性回應非錯誤）。

## Related
- Diagram: [../diagrams/F033-permission-aware-query.mmd](../diagrams/F033-permission-aware-query.mmd)
- Data: [DOCUMENT_CHUNK](../data-model.md#documentchunk-entity), [QA_LOG](../data-model.md#qalog-entity)
- Depends on: [F029](F029-chunking-metadata-index.md), [F033](F033-permission-aware-retrieval.md), [F035](F035-hallucination-guardrail.md), [F019](F019-public-list-browsing.md), [F020](F020-watermark.md); Blocks: [F034](F034-qa-audit-watermark.md)
- NFR: [RAG 檢索與生成品質](../nfr.md#rag-quality)
- OQ: OQ-E09-01（LLM 選型）, OQ-E09-06（延遲量化目標）
