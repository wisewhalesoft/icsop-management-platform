# F016: PDF 與 OJT 附件上傳
Priority: P0-MVP | Status: Backend Implemented（unit-green；Azure Blob/multipart 為 [integration] 延後） | Last Updated: 2026-07-23
Epic/Story: E04 / US-036

## Description
為文件上傳/更新 ICSOP PDF（1 份）與 OJT 實體簽到表（1 份，pdf 或圖片）。檔案存 Azure Blob Storage（storage 介面抽象化），DB 僅存 Blob 參照；重新上傳即覆蓋舊檔（不留歷史版本）。使用表單（多個）為獨立流程（F018），不在本 feature。

## Preconditions
- 文件已存在（F010）；操作者對附件欄位具寫入權（F026）。

## Main Flow
1. 編輯文件，上傳一份 PDF 作為 ICSOP PDF → 存 Blob、與文件關聯（1 份，覆蓋既有）。
2. 上傳一份 PDF 或圖片作為 OJT 簽到表 → 存 Blob、與文件關聯（1 份，覆蓋既有）。
3. 上傳前驗證格式（允許清單）。

## Alternative Flows
- 重新上傳覆蓋：舊檔不再可經文件記錄存取。

## Edge Cases
- 格式不在允許清單（如 .exe）：阻擋並提示允許格式。
- 超過大小上限：阻擋（上限值未定義，見 OQ-E04-06）。

## Postconditions
- 文件持有最新 ICSOP PDF 與 OJT 附件（各 1 份），供 F020 前台檢視/下載來源。

## Acceptance Criteria
- Given 上傳合法 PDF 作為 ICSOP PDF, When 送出, Then 存 Blob 並關聯，可於詳情下載。
- Given 上傳 jpg 作為 OJT 簽到表, When 送出, Then 成功儲存。
- Given 上傳不允許格式, When 送出, Then 阻擋並回 `FILE_FORMAT_NOT_ALLOWED`＋允許清單。
- Given 重新上傳新 ICSOP PDF, When 送出, Then 覆蓋舊檔，舊檔不再可經文件記錄存取。
- Given 未登入/無權限使用者直接以 Blob URL 存取, When 請求, Then 拒絕（`FILE_ACCESS_DENIED`）。

## Error Scenarios
- 格式/大小/未授權存取：見 [error-handling.md#file](../error-handling.md#file)。存取控管見 [NFR-002](../nfr.md#security)（短效期憑證）。

## Related
- Data: [DOCUMENT_ATTACHMENT](../data-model.md#attachment-entity)
- Depends on: [F010](F010-create-document.md); 來源檔供 [F020](F020-watermark.md)
- OQ: OQ-E04-06（檔案大小上限/允許格式）
