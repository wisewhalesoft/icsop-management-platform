# US-036: PDF 與 OJT 附件上傳

> **Story ID**: US-036
> **Epic**: [E04 ICSOP 文件管理](epic-brief.md)
> **Priority**: P0 (Must Have)
> **Phase**: 1
> **Estimated Points**: 5

## User Story

As a **ICSOP 管理員**,
I want **為文件上傳／更新 ICSOP PDF（1 份）與 OJT 實體簽到表（1 份，pdf 或圖片）**,
So that **文件內容與教育訓練簽到證明能被完整保存並供使用者檢視／下載**。

## Acceptance Criteria

**AC1 — 上傳 ICSOP PDF**
- Given 我編輯一筆文件
- When 我上傳一份 PDF 檔案作為 ICSOP PDF
- Then 檔案成功儲存至 Azure Blob Storage，並與該文件記錄關聯（1 份，覆蓋既有檔案）

**AC2 — 上傳 OJT 簽到表**
- Given 我編輯一筆文件
- When 我上傳一份 PDF 或圖片檔案作為 OJT 實體簽到表
- Then 檔案成功儲存並與該文件記錄關聯（1 份，覆蓋既有檔案）

**AC3 — 檔案格式驗證**
- Given 我上傳的檔案格式不在允許清單內
- When 我送出上傳
- Then 系統阻擋上傳並提示允許的格式清單

## Technical Notes

- 檔案存放於 Azure Blob Storage（技術棧決策），資料庫僅存 Blob 參照路徑/URL
- ICSOP PDF 與 OJT 簽到表皆為「1 份」欄位，重新上傳即覆蓋舊檔（呼應「不留歷史版本」之版本管理策略）
- 檔案大小上限與允許格式清單（PDF 限定？圖片是否限 jpg/png？）未於原始需求定義，為 Open Question，需與 NFR-001 效能考量一併確認
- 附件下載需經權限驗證，不可透過猜測網址直接存取（見 [NFR-002 資訊安全與身分驗證](../../non-functional/NFR-002-security.md)）
- 使用表單（excel/pdf，多個）為獨立管理流程，見 [E05 US-040](../E05-usage-form/US-040-usage-form-upload.md)，不在本 story 範圍

## Test Cases

- **TC-036-01（Happy Path）**：上傳合法格式 PDF 作為 ICSOP PDF，成功儲存並可於文件詳情下載
- **TC-036-02（Happy Path）**：上傳 jpg 圖片作為 OJT 簽到表，成功儲存
- **TC-036-03（Error）**：上傳不允許格式（如 .exe）,系統阻擋並提示
- **TC-036-04（Edge）**：重新上傳新 ICSOP PDF 覆蓋既有檔案，舊檔案不再可透過文件記錄存取
- **TC-036-05（Error — 未授權存取）**：未登入或無權限之使用者嘗試直接以 Blob URL 存取附件，系統拒絕

## Dependencies

**Blocked By**:
- [US-030 建立 ICSOP 文件](US-030-create-icsop-document.md)

**Blocks**: 無直接下游 story，為 [E06 US-053/US-054](../E06-public-browsing/US-053-viewer-watermark-overlay.md) 前台檢視/下載浮水印功能提供來源檔案

## Definition of Done

- [ ] Acceptance criteria met
- [ ] Unit tests passing (>80% coverage)
- [ ] Code review approved
- [ ] Documentation updated

## Related

- [Epic Brief: E04 ICSOP 文件管理](epic-brief.md)
- [NFR-002 資訊安全與身分驗證](../../non-functional/NFR-002-security.md)
- [E05 使用表單管理](../E05-usage-form/epic-brief.md)
