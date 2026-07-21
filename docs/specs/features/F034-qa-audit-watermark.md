# F034: 問答稽核與經 AI 導引之浮水印/稽核
Priority: P0-MVP | Status: Draft | Phase: 3 | Last Updated: 2026-07-16
Epic/Story: E09 / US-097

> [F023](F023-audit-logging.md)/[F024](F024-access-history-query.md) 稽核之直接擴充：新增「問答事件」為稽核類型（記於 [QA_LOG](../data-model.md#qalog-entity)），並將「AI 問答導引」標示為既有檢視/下載紀錄之來源分類（[AUDIT_LOG](../data-model.md#auditlog-entity) `source=AI_QA`），而非另建一套獨立稽核系統。確保新增 AI 問答管道不出現稽核缺口。

## Description
AI 智慧問答本身的每次提問，以及經其導引之文件檢視/下載，都比照既有調閱歷程一併記錄稽核軌跡。問答事件寫 QA_LOG；經 AI 導引之檢視/下載沿用 F020 浮水印＋F023 稽核，並以 `source=AI_QA`＋`qaLogId` 標示來源，供 F024 查詢區分。

## Preconditions
- 問答已由 [F032](F032-frontend-nl-qa.md) 發生；身分識別自 [F001](F001-auth-login-session.md)。
- 既有稽核與浮水印機制到位（[F020](F020-watermark.md)、[F023](F023-audit-logging.md)、[F024](F024-access-history-query.md)）。

## Main Flow
1. 使用者透過智慧問答提出一次問題並取得答案。
2. 系統寫入一筆 QA_LOG：操作人員、部門/處室、問題內容、回覆所引用之文件清單（`citedDocumentNumbers`/`citedChunkIds`）、`resultType`、時間戳記。
3. 使用者點擊答案引用連結進入檢視器或下載文件：比照 [F023](F023-audit-logging.md) 產生對應 VIEW/DOWNLOAD/PRINT 稽核紀錄，套用 [F020](F020-watermark.md) 浮水印；該筆 AUDIT_LOG 標 `source=AI_QA`、`qaLogId` 回指本次問答。
4. 稽核管理者於 [F024](F024-access-history-query.md) 查詢時可命中該筆並標示「來源為 AI 智慧問答」，以區分一般前台瀏覽路徑。

## Alternative Flows
- 稽核記錄寫入失敗：使用者仍正常取得答案（不阻斷問答），失敗事件進補償佇列，服務恢復後重試補寫（比照 F023 原則，統一技術方案）。

## Edge Cases
- 問題內容是否完整記錄（涉及使用者輸入原始文字）或僅記摘要/雜湊：待稽核政策/個資考量確認（OQ-E09-09）。
- 同一次問答導引多次檢視/下載：各自產生獨立 AUDIT_LOG（比照 F023 每次獨立記錄），皆標 `source=AI_QA`＋同一 `qaLogId`。
- 無結果之問答（`resultType=no_result`）：仍寫 QA_LOG（記錄「誰於何時問了什麼、系統無依據」），`citedChunkIds` 為空。

## Postconditions
- 「誰、何時、透過 AI 問答得知了哪些文件內容」可完整追溯；問答與導引調閱皆計入稽核且不因入口而遺漏。

## Acceptance Criteria
- Given 使用者透過智慧問答提出一次問題並取得答案, When 系統完成該次問答, Then 記錄一筆 QA_LOG，含操作人員、部門/處室、問題內容、回覆引用之文件清單、時間戳記。
- Given 使用者點擊答案引用連結進入檢視器或下載文件, When 該動作發生, Then 比照 F023 產生對應檢視/下載稽核並套用 F020 浮水印，不因入口是 AI 問答而有差異或遺漏。
- Given 管理者於 F024 查詢命中某筆經 AI 問答導引之檢視/下載紀錄, When 查詢, Then 該紀錄可被查到並標示「來源為 AI 智慧問答」以區分一般前台路徑。
- Given 稽核紀錄寫入發生錯誤, When 使用者完成一次問答, Then 使用者仍正常取得答案，且系統以補償/重試機制避免稽核資料遺漏。

## Error Scenarios
- 補償重試/不可竄改：見 [error-handling.md#audit](../error-handling.md#audit)（QA_LOG 亦 append-only）。存取控管見 [NFR-009](../nfr.md#rag-security) AC4。

## Related
- Diagram: [../diagrams/F033-permission-aware-query.mmd](../diagrams/F033-permission-aware-query.mmd), [../diagrams/F020-watermark-audit.mmd](../diagrams/F020-watermark-audit.mmd)
- Data: [QA_LOG](../data-model.md#qalog-entity), [AUDIT_LOG](../data-model.md#auditlog-entity)
- Depends on: [F032](F032-frontend-nl-qa.md), [F020](F020-watermark.md), [F023](F023-audit-logging.md), [F024](F024-access-history-query.md)
- NFR: [RAG 資料落地與存取安全](../nfr.md#rag-security), [稽核與資料保留](../nfr.md#audit-retention)
- OQ: OQ-E09-09（問題內容記錄範圍：全文/摘要/雜湊）
