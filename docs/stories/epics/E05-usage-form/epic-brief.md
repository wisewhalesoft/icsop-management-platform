# Epic E05: 文件使用表單管理

> **Epic ID**: E05
> **Priority**: P1
> **Phase**: 1
> **Status**: Draft
> **Stories**: 3 個

## Epic Goal

管理 ICSOP 文件的「使用表單」。每份 ICSOP 文件可能對應多個實際工作流程會使用到的表單（excel 或 pdf 格式），例如檢查表、紀錄表等。

**模型定案（表單池）**：使用表單採**集中「表單池」**管理——ICSOP 管理員於獨立的「使用表單管理」畫面上傳/更新/移除表單（表單池 CRUD）；建立/編輯 ICSOP 文件時，從表單池**可搜尋多選**關聯所需表單（一份表單可被多份文件共用＝多對多）。本 Epic 負責表單池的維護、文件關聯，讓公司同仁於前台檢視文件時可一併取得所需表單。

本 Epic 與 [E04 ICSOP 文件管理](../E04-icsop-document/epic-brief.md) 密切相關但獨立成 Epic，原因是使用表單具備獨立的檔案生命週期（可多個、可個別更新/移除），且下載使用表單本身也需計入稽核軌跡（見 [E07](../E07-audit-trail/epic-brief.md)），值得獨立追蹤與驗收。

## User Stories

| Story ID | Title | Priority | File |
|---|---|---|---|
| US-040 | 使用表單上傳管理 | P1 | [US-040-usage-form-upload.md](US-040-usage-form-upload.md) |
| US-041 | 表單與文件關聯維護 | P1 | [US-041-form-document-association.md](US-041-form-document-association.md) |
| US-042 | 使用表單池管理（獨立畫面） | P1 | [US-042-usage-form-pool-management.md](US-042-usage-form-pool-management.md) |

## Dependencies

**Depends On**：
- [E04 ICSOP文件管理 / US-030](../E04-icsop-document/US-030-create-icsop-document.md) — ICSOP 文件須先存在，使用表單才有掛載對象。
- [E08 權限矩陣 / US-070](../E08-permission-matrix/US-070-role-function-matrix.md) — 表單管理權限（僅 ICSOP 管理員可寫）。

**Blocks**：
- [E06 前台RWD瀏覽](../E06-public-browsing/epic-brief.md) — 前台文件詳情頁需顯示可下載的使用表單清單。
- [E07 稽核與文件調閱歷程](../E07-audit-trail/epic-brief.md) — 表單下載動作需計入稽核軌跡。

## Success Criteria

- ICSOP 管理員可為任一 ICSOP 文件上傳/更新/移除多個使用表單（excel 或 pdf）。
- 前台與後台皆可正確列出並下載某文件所有關聯之使用表單。
- 表單檔案存放於 Azure Blob Storage，存取須經權限驗證。

## Open Questions

> 本 Epic 之 Open Questions **已全數定案**，完整決策紀錄見 [open-questions.md](../../../specs/open-questions.md)。

- [x] **單一 ICSOP 文件可掛載使用表單數量上限**（OQ-E05-01 ✅）— **定案**：不設固定上限。
- [x] **使用表單檔案大小上限與允許格式**（OQ-E05-02 ✅）— **定案**：同 OQ-E04-06（單檔 ≤ 50MB；格式 xlsx／xls／pdf）。
- [x] **（已定案，OQ-E05-04 ✅）** 一份使用表單可被**多份 ICSOP 文件共用**（表單池，多對多）：表單於「使用表單管理」表單池集中維護，文件建立/編輯時從池中可搜尋多選關聯。原「單一表單僅屬一份文件」之草案已由表單池模型取代。
- [x] **使用表單是否需版本對照機制，或僅覆蓋上傳？**（**OQ-E05-05** ✅ 2026-07-21 定案，採選項 a）— **維持覆蓋上傳、不保留歷史版本**（比照 E04「僅保存當前版本」原則）；因表單為跨文件共用（OQ-E05-04），**覆蓋被 ≥1 份其他文件引用之表單時須顯示「另被 N 份文件引用」警示並二次確認**（`USAGE_FORM_OVERWRITE_SHARED`）。未採 (b) 保留版本／(c) 記錄變更歷程。已落入 [F018](../../../specs/features/F018-usage-form-management.md)、error-handling。
