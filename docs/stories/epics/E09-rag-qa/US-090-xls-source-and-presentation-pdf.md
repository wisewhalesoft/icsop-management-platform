# US-090: 保存 .xls 原始檔（RAG 內容來源）與呈現用 PDF ── 各自獨立上傳

> **Story ID**: US-090
> **Epic**: [E09 智慧問答（本地開源 LLM + RAG）](epic-brief.md)
> **Priority**: P0 (Must Have)
> **Phase**: 1
> **Estimated Points**: 5

---

## User Story

**As a** ICSOP 管理員,
**I want** 上傳／更新 ICSOP 文件時保存 .xls 原始檔（authoring source，作為 RAG 內容抽取來源）,
**So that** 系統能保有一份忠實的權威原始檔供後續章節抽取（US-091）使用；呈現用 PDF 則透過既有 [E04 US-036](../E04-icsop-document/US-036-pdf-ojt-attachment-upload.md) 管道由管理員獨立手動上傳，兩者為各自獨立、互不觸發的上傳管道（**2026-07-17 OQ-E09-10 定案：取消 .xls→PDF 自動轉檔**），一致性由 ICSOP 管理員自行負責維護。

---

## Acceptance Criteria

### AC-1: 上傳 .xls 原始檔
- **Given** 我建立或編輯一筆 ICSOP 文件
- **When** 我上傳一份符合 ICSOP 標準格式的 .xls 檔案作為原始檔
- **Then** 檔案成功保存至檔案儲存，並與該文件記錄關聯（1 份，覆蓋既有檔案，呼應 E04「不留歷史版本檔案」之版本管理精神）；此檔案僅供 RAG 抽取（[US-091](US-091-template-aware-extraction-cleaning.md)）使用，不對一般使用者呈現或提供下載

### AC-2: 呈現用 PDF 獨立管理（不自動產出，2026-07-17 OQ-E09-10 定案）
- **Given** 我已上傳 .xls 原始檔
- **When** 系統處理該上傳
- **Then** 系統**不**觸發任何 PDF 轉檔或產出動作；ICSOP PDF 欄位（即 E04 文件欄位清單中的「ICSOP PDF」，UI 顯示標籤「檔案」）維持完全獨立地經 [E04 US-036](../E04-icsop-document/US-036-pdf-ojt-attachment-upload.md) 管道上傳／覆蓋，兩者之間無資料流關聯，管理員需分別各自維護

### AC-3: 兩檔案各自獨立、系統不檢查同步
- **Given** 文件已有 .xls 原始檔（本 story）與 ICSOP PDF（US-036 獨立上傳）
- **When** 管理員於文件詳情頁查看
- **Then** 可分別看到「.xls 原始檔」與「呈現用 PDF」兩個獨立檔案入口，各自顯示各自的上傳／更新時間；系統不假設、也不自動檢查兩者內容是否同步一致（例如 .xls 已更新但 PDF 未跟著更新之情況，系統不會攔截或警示——見 Open Questions）

---

## Technical Notes

- **已定案（2026-07-17，OQ-E09-10）**：.xls 原始檔與呈現用 PDF 為兩條完全獨立的上傳管道，彼此不擴充、不取代、不觸發：.xls 走本 story（US-090，RAG 專用內容來源，不對一般使用者呈現/下載），PDF 走既有 [E04 US-036 PDF與OJT附件上傳](../E04-icsop-document/US-036-pdf-ojt-attachment-upload.md)（ICSOP PDF 欄位，前台檢視/下載/浮水印之來源）。系統不提供兩者內容一致性的自動化檢查，一致性由 ICSOP 管理員人工維護（如更新 .xls 後應自行同步更新 PDF）。原「.xls→PDF 轉換技術方案選型」「是否保留手動上傳 PDF 備援路徑」等技術/Open Question 因轉檔機制整體取消而消解，不再適用。
- .xls 原始檔存放於既有檔案儲存（Azure Blob Storage，依 E04／E05 慣例），存取需經權限驗證（見 [NFR-002 資訊安全與身分驗證](../../non-functional/NFR-002-security.md)）。
- 本 story 為 [US-091 模板感知抽取](US-091-template-aware-extraction-cleaning.md) 的前置條件——抽取器直接讀取此處保存的 .xls 原始檔，不讀取 PDF（此假設在轉檔機制取消後依然成立、且更為純粹）。

---

## Test Cases

### TC-090-01: 上傳 .xls 原始檔（Happy Path）
- **Given**: 我持有一份符合 ICSOP 標準模板的 .xls 檔案
- **When**: 我上傳作為文件原始檔
- **Then**: 檔案成功保存，系統不觸發任何 PDF 產出或轉檔動作，ICSOP PDF 欄位維持其原有值不受影響

### TC-090-02: 覆蓋既有 .xls 檔案（Edge）
- **Given**: 文件已有 .xls 原始檔
- **When**: 我重新上傳新版 .xls
- **Then**: 新檔覆蓋舊檔，舊檔不再可透過文件記錄存取；文件的 ICSOP PDF 欄位（經 US-036 獨立管理）完全不受此次 .xls 覆蓋影響

### TC-090-03: .xls 與 PDF 各自獨立顯示（Happy Path）
- **Given**: 文件已分別上傳 .xls 原始檔（本 story）與 ICSOP PDF（US-036）
- **When**: 管理員於文件詳情頁查看
- **Then**: 可分別看到「.xls 原始檔」與「呈現用 PDF」兩個獨立入口，各自顯示各自的上傳／更新時間，不隱含或顯示任何「兩者同步」之保證

---

## Dependencies

- **Blocked By**: [E04 US-030 建立 ICSOP 文件](../E04-icsop-document/US-030-create-icsop-document.md)
- **Blocks**: [US-091 ICSOP .xls 模板感知內文抽取與清洗](US-091-template-aware-extraction-cleaning.md)

---

## Definition of Done

- [ ] Acceptance criteria met
- [ ] Unit tests passing (>80% coverage)
- [ ] Code review approved
- [ ] Documentation updated

---

## Related

- **Epic Brief**: [E09 智慧問答（本地開源 LLM + RAG）](epic-brief.md)
- **NFRs**: [NFR-002 資訊安全與身分驗證](../../non-functional/NFR-002-security.md)
- **Related Stories**: [E04 US-036 PDF與OJT附件上傳](../E04-icsop-document/US-036-pdf-ojt-attachment-upload.md)（呈現用 PDF 之獨立上傳管道，與本 story 平行、互不擴充）、[US-091](US-091-template-aware-extraction-cleaning.md)

---

## Open Questions

- [ ] **兩檔案一致性風險（2026-07-17 OQ-E09-10 定案後新增）**：.xls 原始檔與呈現用 PDF 之內容一致性完全由 ICSOP 管理員人工維護，系統不強制檢查、不阻擋不同步狀態。是否需要 UI 層面之軟性提醒（例如「.xls 更新時間晚於 PDF，請確認是否需同步更新呈現用 PDF」之類的提示，非阻擋性驗證），待使用者確認，非阻塞本 story 之開發。
