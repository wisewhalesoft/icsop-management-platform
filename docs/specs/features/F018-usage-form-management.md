# F018: 使用表單管理
Priority: P1 | Status: Backend Implemented（unit-green；Azure Blob/multipart 為 [integration] 延後） | Last Updated: 2026-07-23
Epic/Story: E05 / US-040, US-041, US-042

> 合併理由：表單池管理（US-042）、上傳/移除（US-040）與前/後台關聯清單呈現與下載（US-041）為同一表單生命週期，共用同一組 API。

## Description
使用表單採**集中表單池**模型：ICSOP 管理員於**獨立「使用表單管理」畫面**維護表單池（上傳/更新/移除、查詢、檢視關聯文件）；ICSOP 文件建立/編輯時，從表單池**可搜尋多選**關聯表單（**多對多**，一表單可被多份文件共用）。前台與後台文件詳情頁列出該文件所有關聯表單並可個別下載；前台下載觸發稽核（比照 F023）。檔案存 Azure Blob。

## Preconditions
- ICSOP 文件已存在（F010）。
- 上傳/移除者為 ICSOP 管理員（F025，表單管理僅 ICSOPAdmin 可寫）。

## Main Flow
1. **表單池管理（獨立畫面 US-042）**：ICSOP 管理員上傳 excel/pdf 至表單池 → 存 Blob、加入池；清單顯示名稱/格式/大小/上傳者/**關聯文件數**，可展開檢視使用該表單之文件。
   - **更新（覆蓋上傳，OQ-E05-05 定案）**：以新檔取代既有表單檔——**維持覆蓋語意、不保留歷史版本**（比照全域「僅保存當前版本」原則）。因表單為**跨文件共用**（OQ-E05-04），覆蓋會同時改變所有引用文件所見內容；故**若該表單另被 ≥1 份文件引用，覆蓋前須顯示「此表單另被 N 份文件引用，覆蓋將同時更新全部引用文件所見內容」警示並要求二次確認**（`USAGE_FORM_OVERWRITE_SHARED`）；確認後舊檔不再可經任何文件存取。
2. **文件關聯**：文件建立/編輯（F010/F011）時自表單池可搜尋多選關聯表單（多對多）。
3. **移除表單**：若表單仍被文件關聯，二次確認（一併解除關聯）或提示先解除（`USAGE_FORM_IN_USE`）。
4. 文件詳情頁（前台/後台共用同一 API）列出該文件所有關聯表單之名稱與格式，提供個別下載連結。
5. 前台下載表單 → 記錄稽核（targetType=USAGE_FORM，actionType=DOWNLOAD）。

## Alternative Flows
- 無關聯表單：詳情頁顯示「無使用表單」提示，非錯誤或空白區塊。
- 一次上傳多個 excel/pdf：全部成功建立關聯。

## Edge Cases
- 上傳非 excel/pdf（如 .docx）：拒絕並提示格式。
- 超過大小上限：拒絕（上限值未定義，OQ-E05-02）。
- 移除前二次確認取消：表單保留不受影響。
- **覆蓋共用表單（OQ-E05-05 定案）**：更新被 ≥1 份其他文件引用之表單時，須先提示引用文件數並二次確認；使用者取消則原檔保留不變。僅被當前單一文件引用或無其他引用時仍可覆蓋，但不出現跨文件警示（一般確認即可）。
- 使用表單下載是否也需浮水印：未定案（OQ-E05-03）。

## Postconditions
- 文件持有 0..* 使用表單；前後台清單一致（共用 API）。

## Acceptance Criteria
- Given 選擇 excel/pdf 上傳, When 送出, Then 存 Blob、建立關聯、顯示於清單。
- Given 選擇非 excel/pdf 格式, When 上傳, Then 拒絕並回 `FILE_FORMAT_NOT_ALLOWED`，不建立任何關聯。
- Given 文件已有多個表單, When 移除其一（二次確認）, Then 解除關聯並移除，其餘不受影響。
- Given 文件有 3 個關聯表單, When 開啟詳情頁, Then 正確列出 3 筆並各自可下載。
- Given 文件無關聯表單, When 開啟詳情頁, Then 顯示「無使用表單」提示。
- Given 未登入/無權限使用者組合下載網址存取表單, When 請求, Then 拒絕（`FILE_ACCESS_DENIED`）。
- Given 前台下載表單成功, When 下載完成, Then 同步寫入正確稽核紀錄。
- Given 表單另被 N（≥1）份文件引用, When 上傳新檔覆蓋, Then 顯示「另被 N 份文件引用，覆蓋將同時更新全部」警示並要求二次確認（`USAGE_FORM_OVERWRITE_SHARED`），確認後方覆蓋。
- Given 覆蓋確認完成, When 完成, Then 舊檔不再可經任何引用文件存取、全部引用文件所見即為新內容，且不保留歷史版本。
- Given 覆蓋警示出現時取消, When 取消, Then 原表單檔保留不變、關聯不受影響。

## Error Scenarios
- 格式/大小/未授權/移除確認：見 [error-handling.md#file](../error-handling.md#file)。稽核：見 [F023](F023-audit-logging.md)。

## Related
- Data: [DOCUMENT_ATTACHMENT（USAGE_FORM）](../data-model.md#attachment-entity), [AUDIT_LOG](../data-model.md#auditlog-entity)
- Depends on: [F010](F010-create-document.md); 顯示於 [F019](F019-public-list-browsing.md); 稽核 [F023](F023-audit-logging.md)
- 定案: OQ-E05-04（表單池，多對多共用）、**OQ-E05-05（覆蓋上傳＋跨文件引用警示，不保留版本）**。OQ: OQ-E05-01（表單數量上限）, OQ-E05-02（大小/格式）, OQ-E05-03（表單下載浮水印?）。
