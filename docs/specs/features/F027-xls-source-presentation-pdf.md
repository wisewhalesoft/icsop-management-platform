# F027: .xls 原件保存（RAG 內容來源）
Priority: P0-MVP | Status: Draft | Phase: 1 | Last Updated: 2026-07-17
Epic/Story: E09 / US-090

> 雙軌 ingestion 之**軌道 A（權威原件）**入口：保存可再編輯的 .xls 原始檔，作為抽取管線（[F028](F028-template-aware-extraction.md)）之內容來源。
> **OQ-E09-10 定案（材質變更）：取消 .xls→PDF 自動轉檔**——呈現用 PDF 改由 [F016](F016-pdf-ojt-attachment.md) **手動上傳**，與 .xls **各自獨立、互不觸發**；兩者內容一致性**由 ICSOPAdmin 人工負責**，系統不自動產出、不驗證一致性。

## Description
ICSOP 管理員建立/編輯文件時上傳一份符合 ICSOP 標準格式的 .xls 原始檔（authoring source），系統驗證模板並保存原件（1 份，覆蓋既有、不留歷史檔），作為 F028 抽取內文之唯一來源。**.xls 不再產出任何 PDF**；使用者實際檢視/下載之「ICSOP PDF（UI 標籤『檔案』）」為管理員經 [F016](F016-pdf-ojt-attachment.md) 另行上傳之**獨立檔案**。抽取管線讀 .xls 原件，不讀 PDF。

## Preconditions
- 文件已存在或正在建立（[F010](F010-create-document.md)）。
- 操作者為 ICSOP 管理員，對附件欄位具寫入權（[F026](F026-role-field-matrix.md)）。
- 檔案儲存為 Azure Blob（storage 介面抽象化），存取需經權限驗證（[NFR-002](../nfr.md#security)）。

## Main Flow
1. 管理員於文件建立/編輯畫面上傳一份 .xls 原始檔。
2. 系統驗證其為 ICSOP 標準模板（**僅格式驗證**；不符則阻擋，見 Error Scenarios）。
3. 保存 .xls 至 Blob，建立/覆蓋 [DOC_SOURCE_XLS](../data-model.md#docsourcexls-entity)（1 份，覆蓋既有，不留歷史檔）。
4. 保存成功後觸發抽取/重抽管線（見 [F028](F028-template-aware-extraction.md)、[F030](F030-reindex-version-status.md)）。
5. 文件詳情頁分別呈現「.xls 原始檔」與「ICSOP PDF（檔案）」兩個**各自獨立**之檔案入口（PDF 來源見 F016）。

## Alternative Flows
- **重新上傳新版 .xls**：覆蓋舊 .xls，舊檔不再可經文件記錄存取；觸發 F030 重抽重建索引。**不連動 PDF**（呈現用 PDF 須管理員另行於 F016 更新）。
- **呈現用 PDF 之維護**：循 [F016](F016-pdf-ojt-attachment.md) 既有手動上傳路徑（覆蓋式），與 .xls 各自獨立、互不觸發。

## Edge Cases
- .xls 不符標準模板/已損毀：阻擋此次上傳（`XLS_TEMPLATE_INVALID`），既有 .xls 與既有 ICSOP PDF 皆不受影響。
- **.xls 與 ICSOP PDF 內容不一致**（如僅更新其一）：系統**不偵測、不阻擋、不告警**；一致性由 ICSOPAdmin 人工負責（索引可視性見 [F031](F031-admin-index-visibility.md)）。
- 僅上傳 .xls 未上傳 PDF：允許（前台無可檢視檔案；屬「允許無附件」範疇，OQ-E04-01a 定案）。
- 僅上傳 PDF 未上傳 .xls：允許，但無 RAG 內容來源 → 該文件不進索引，F031 呈現「尚未建立索引」（非錯誤）。
- 非 ICSOP 管理員上傳：依 [F025](F025-role-function-matrix.md)/[F026](F026-role-field-matrix.md) 拒絕。

## Postconditions
- 文件持有最新 .xls 原件供 F028 抽取；呈現用 PDF 由 F016 獨立維護，供 [F020](F020-watermark.md) 前台檢視/下載燒錄浮水印之來源。
- 系統**不保證** .xls 與 PDF 內容一致（人工責任，非系統不變式）。

## Acceptance Criteria
- Given 上傳符合 ICSOP 標準模板之 .xls, When 送出, Then .xls 成功保存並觸發抽取管線；**系統不產出任何 PDF**。
- Given 上傳之 .xls 格式不符標準模板或損毀, When 送出, Then 阻擋此次上傳並提示模板驗證失敗原因（`XLS_TEMPLATE_INVALID`），既有 .xls 與既有 ICSOP PDF 皆保持不變。
- Given 文件已有 .xls, When 重新上傳新版 .xls, Then 新檔覆蓋舊檔並觸發 F030 重抽；**既有 ICSOP PDF 不受影響、不被自動替換**。
- Given .xls 與 ICSOP PDF 內容不一致, When 系統處理, Then 不阻擋、不告警（一致性由 ICSOPAdmin 人工負責）。
- Given 文件僅有 PDF 而無 .xls, When 檢視索引狀態, Then F031 呈現「尚未建立索引」（無 RAG 內容來源），非錯誤。
- Given 非 ICSOP 管理員, When 上傳 .xls 原件, Then 依 F025/F026 拒絕。

## Error Scenarios
- 模板不符：見 [error-handling.md#rag-ingestion](../error-handling.md#rag-ingestion)（`XLS_TEMPLATE_INVALID`）。**`XLS_PDF_CONVERSION_FAILED` 已隨自動轉檔取消而移除**（OQ-E09-10 定案）。
- 檔案格式/大小/未授權存取：見 [error-handling.md#file](../error-handling.md#file)（單檔 ≤ 50MB，OQ-E04-06 定案）；短效期憑證見 [NFR-002](../nfr.md#security)。

## Related
- Diagram: [../diagrams/F028-rag-ingestion-pipeline.mmd](../diagrams/F028-rag-ingestion-pipeline.mmd)
- Data: [DOC_SOURCE_XLS](../data-model.md#docsourcexls-entity)（原「衍生 PDF」相關欄位語意隨取消轉檔調整/移除，見 data-model 註記）、[DOCUMENT_ATTACHMENT](../data-model.md#attachment-entity)（`type=ICSOP_PDF` 改由 F016 手動上傳）
- Depends on: [F010](F010-create-document.md)、[F016](F016-pdf-ojt-attachment.md)（呈現用 PDF 之獨立手動上傳路徑）; Blocks: [F028](F028-template-aware-extraction.md), [F030](F030-reindex-version-status.md)
- NFR: [RAG 資料落地與存取安全](../nfr.md#rag-security)
- 定案: **OQ-E09-10（取消 .xls→PDF 自動轉檔；.xls 與呈現用 PDF 分開手動上傳、各自獨立，一致性由 ICSOPAdmin 人工負責）**、OQ-E04-06（單檔 ≤50MB）
- OQ: OQ-E09-04（.xls 模板變體盤點，**仍待辦**）
