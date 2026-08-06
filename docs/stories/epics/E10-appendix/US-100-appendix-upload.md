# US-100: 附錄上傳管理

> **Story ID**: US-100
> **Epic**: [E10 附錄管理](epic-brief.md)
> **Priority**: P1
> **Phase**: 1
> **Estimated Points**: 5

## User Story

As an ICSOP 管理員,
I want 在「附錄管理」畫面上傳、更新、移除附錄檔案（excel 或 pdf 格式）,
So that 附錄可被集中建檔於附錄池，供後續任一 ICSOP 文件建立/編輯時搜尋多選關聯引用。

## Acceptance Criteria

### AC1：成功上傳附錄（單一或多筆）

**Given** 我是 ICSOP 管理員，已進入「附錄管理」畫面
**When** 我選擇一個或多個檔案（格式為 excel 或 pdf）並送出上傳
**Then** 系統將檔案存入 Azure Blob Storage，為每個檔案建立一筆附錄池記錄（初始關聯文件數為 0），畫面顯示已上傳附錄清單。

### AC2：格式不符時拒絕上傳

**Given** 我選擇之檔案非 excel 或 pdf 格式
**When** 送出上傳
**Then** 系統拒絕上傳並提示允許的檔案格式（`FILE_FORMAT_NOT_ALLOWED`），不建立任何附錄池記錄。

### AC3：檔案大小超限時拒絕上傳

**Given** 我選擇之檔案單檔超過 50MB
**When** 送出上傳
**Then** 系統拒絕並提示超出大小限制（`FILE_SIZE_EXCEEDED`）；恰為 50MB 之檔案應正常通過。

### AC4：自訂附錄名稱與長度限制

**Given** 我於上傳時輸入自訂附錄名稱
**When** 送出
**Then** 系統以 trim 後之名稱建檔；名稱空白或未提供時 fallback 採用原始檔名；trim 後名稱（含 fallback 檔名）超過 400 字元時拒絕並提示（`APPENDIX_NAME_TOO_LONG`）。

### AC5：移除未被任何文件關聯之附錄

**Given** 附錄池中某筆附錄目前關聯文件數為 0
**When** ICSOP 管理員選擇移除該附錄並完成二次確認
**Then** 系統將該附錄自 Blob 與附錄池移除，移除後不可再被任何文件搜尋或關聯。

### AC6：移除前之二次確認可取消

**Given** 我點擊移除某筆附錄，二次確認對話框已顯示
**When** 我選擇取消而非確認移除
**Then** 系統不執行任何移除動作，該附錄保留於附錄池不受影響。

## Technical Notes

- 檔案存放 Azure Blob Storage，命名/路徑規則需能追溯附錄池記錄本身（附錄與文件為多對多關聯，路徑不綁定單一文件）。
- 上傳/移除動作建議記錄操作人員與時間，作為附錄池之管理端操作記錄（與公司同仁前台調閱之 E07 稽核軌跡性質不同，需在架構設計時區分兩者，比照 [E05 US-040](../E05-usage-form/US-040-usage-form-upload.md) 之既有原則）。
- 移除「仍被 ≥1 份文件關聯」之附錄的警示與二次確認邏輯，由 [US-102](US-102-appendix-pool-management.md) AC4 定義，本 Story 僅涵蓋關聯文件數為 0 之基本移除路徑。
- **與 E05 模板之差異說明**：本 Story 之進入點定為「附錄管理」獨立畫面（與 [US-102](US-102-appendix-pool-management.md) 同一頁面），而非鏡射 [E05 US-040](../E05-usage-form/US-040-usage-form-upload.md) 原文中「某份 ICSOP 文件編輯畫面」之進入點——後者是使用表單池模型定案**前**遺留之舊描述（[US-042](../E05-usage-form/US-042-usage-form-pool-management.md) 之「Context / 補漏說明」已自陳此點），本 Story 直接採用現行（附錄池）模型書寫，不重現此已知不一致，避免把舊模型的矛盾帶入新 Epic。連帶地，本 Story 之 Dependencies 亦不比照 US-040 依賴「文件須先存在」，因為附錄池上傳/移除本身不需任何 ICSOP 文件先存在。

## Test Cases

| ID | 情境 | 類型 |
|---|---|---|
| TC-100-01 | 上傳單一 pdf 附錄 → 成功建立附錄池記錄並顯示於清單 | Happy Path |
| TC-100-02 | 一次上傳多個 excel/pdf 附錄 → 全部成功建立 | Happy Path |
| TC-100-03 | 上傳非 excel/pdf 格式檔案（如 .docx）→ 拒絕並提示格式錯誤（`FILE_FORMAT_NOT_ALLOWED`） | Error Case |
| TC-100-04 | 上傳檔案超過 50MB → 拒絕（`FILE_SIZE_EXCEEDED`）；恰 50MB → 成功 | Error Case |
| TC-100-05 | 上傳時自訂名稱，trim 後長度 > 400 字元 → 拒絕（`APPENDIX_NAME_TOO_LONG`） | Error Case |
| TC-100-06 | 上傳未輸入名稱 → fallback 採用檔名建檔 | Edge Case |
| TC-100-07 | 移除關聯文件數為 0 之附錄，二次確認時取消 → 附錄保留不受影響 | Edge Case |
| TC-100-08 | 移除關聯文件數為 0 之附錄，二次確認完成 → 自池與 Blob 移除 | Happy Path |

## Dependencies

- **Blocked By**：[E08 US-070 角色×功能權限矩陣](../E08-permission-matrix/US-070-role-function-matrix.md)
- **Blocks**：[US-101 附錄與文件關聯維護](US-101-appendix-document-association.md)、[US-102 附錄池管理（獨立畫面）](US-102-appendix-pool-management.md)

## Definition of Done

- [ ] Acceptance criteria met
- [ ] Unit tests passing (>80% coverage)
- [ ] Code review approved
- [ ] Documentation updated

## Related

- [Epic Brief: E10 附錄管理](epic-brief.md)
- [F039 附錄管理](../../../specs/features/F039-appendix-management.md)
- [NFR-002 資訊安全與身分驗證](../../non-functional/NFR-002-security.md)
- [NFR-004 可用性與備援](../../non-functional/NFR-004-availability-backup.md)
- Mirrors：[E05 US-040 使用表單上傳管理](../E05-usage-form/US-040-usage-form-upload.md)（差異說明見上方 Technical Notes）
