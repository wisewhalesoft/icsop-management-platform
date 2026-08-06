# Epic E10: 附錄管理

> **Epic ID**: E10
> **Priority**: P1
> **Phase**: 1
> **Status**: Draft
> **Stories**: 3 個

## Epic Goal

管理 ICSOP 文件的「附錄」。每份 ICSOP 文件除本文外，可能需要附加補充說明、對照表、範例文件等輔助資料（excel 或 pdf 格式），供閱讀者於檢視文件時一併取得。

**模型定案（附錄池，完全比照使用表單池）**：附錄採**集中「附錄池」**管理——ICSOP 管理員於獨立的「附錄管理」畫面上傳/更新/移除附錄（附錄池 CRUD）；建立/編輯 ICSOP 文件時，從附錄池**可搜尋多選**關聯所需附錄（一份附錄可被多份文件共用＝多對多）。本 Epic 負責附錄池的維護、文件關聯，讓公司同仁於前台檢視文件時可一併取得所需附錄。

本 Epic 之模型、權限、稽核義務與 [E05 文件使用表單管理](../E05-usage-form/epic-brief.md) **完全同構**（已與使用者確認：允許格式/大小上限完全比照、複製範圍全切面比照），故獨立成 Epic 而非併入 E04 的理由與 E05 相同：附錄具備獨立的檔案生命週期（可多個、可個別更新/移除、可跨文件共用），且下載附錄本身也需計入稽核軌跡（見 [E07](../E07-audit-trail/epic-brief.md)），值得獨立追蹤與驗收。各 Story 之 Related 段落標註對應的 E05 鏡射來源與必要差異說明。

## User Stories

| Story ID | Title | Priority | File |
|---|---|---|---|
| US-100 | 附錄上傳管理 | P1 | [US-100-appendix-upload.md](US-100-appendix-upload.md) |
| US-101 | 附錄與文件關聯維護 | P1 | [US-101-appendix-document-association.md](US-101-appendix-document-association.md) |
| US-102 | 附錄池管理（獨立畫面） | P1 | [US-102-appendix-pool-management.md](US-102-appendix-pool-management.md) |

## Dependencies

**Depends On**：
- [E04 ICSOP文件管理 / US-030](../E04-icsop-document/US-030-create-icsop-document.md) — ICSOP 文件須先存在，附錄才有掛載對象（此依賴適用於 US-101 文件關聯；US-100/US-102 之附錄池本身不需文件先存在即可上傳/管理，詳見 US-100 Technical Notes 之「與 E05 模板差異說明」）。
- [E08 權限矩陣 / US-070](../E08-permission-matrix/US-070-role-function-matrix.md) — 附錄管理權限（僅 ICSOP 管理員可寫，系統管理員唯讀，比照「文件使用表單管理」列）；欄位層權限見 [US-071](../E08-permission-matrix/US-071-role-field-matrix.md)「附錄（多）」列。兩份矩陣表格已於 2026-08-06 補上對應列（見 Open Questions 第 5 點）。

**Blocks**：
- [E06 前台RWD瀏覽](../E06-public-browsing/epic-brief.md) — 前台文件詳情頁需顯示可下載的附錄清單。
- [E07 稽核與文件調閱歷程](../E07-audit-trail/epic-brief.md) — 附錄下載動作需計入稽核軌跡。

## Success Criteria

- ICSOP 管理員可於「附錄管理」畫面集中上傳/更新/移除附錄（excel 或 pdf）。
- ICSOP 管理員可於 ICSOP 文件建立/編輯畫面從附錄池搜尋多選關聯附錄。
- 前台與後台皆可正確列出並下載某文件所有關聯之附錄。
- 附錄檔案存放於 Azure Blob Storage，存取須經權限驗證。
- 覆蓋被多份文件共用之附錄時，正確觸發警示與二次確認，不悄悄影響其他文件所見內容。

## Open Questions

1. [x] **（已定案，2026-08-06 使用者裁定）附錄顯示順序 → 支援自訂排序**：`DOC_APPENDIX` 關聯帶 `sortOrder`（每份文件內的附錄序位）；文件建立/編輯畫面之「已選附錄」清單提供上移/下移調整順序（非拖曳）；新加入之附錄預設接在末位；前後台文件詳情頁一律依 `sortOrder` 顯示，使其對得上 SOP 正文之「附錄一／二／三」引用。已落入 [US-101](US-101-appendix-document-association.md) AC1～AC6。
2. [x] **（已裁示延後 Phase 2）附錄是否需要分類/標籤**：維持本輪建議，MVP 不做分類，先以「關鍵字搜尋＋格式篩選」（見 [US-102](US-102-appendix-pool-management.md) AC1）驗證是否足夠，待附錄池規模成長後再評估是否需要類型篩選（如「說明文件」「對照表」「範例」）。
3. [x] **（已定案）附錄允許格式與大小上限**：完全比照使用表單＝xlsx／xls／pdf，單檔上限 50MB（沿用 [open-questions.md](../../../specs/open-questions.md) OQ-E04-06／OQ-E05-02 之定案值）。本次任務已由使用者直接確認，不再視為開放問題。
4. [x] **（已定案）附錄下載不需要浮水印**：比照使用表單（沿用 OQ-E05-03 之定案值），下載不燒錄浮水印。已於 [US-101](US-101-appendix-document-association.md) Technical Notes 以「已定案：不燒錄」措辭記載；F039 spec 用詞校正已轉交 spec-writer 處理。
5. [ ] **（下游依賴，非阻塞，已交辦）E08 US-070／US-071 權限矩陣表格尚未物理新增「附錄管理」功能列與「附錄（多）」欄位列**：權限值已知（比照「文件使用表單管理」列：系統管理員唯讀／ICSOP管理員CRUD／主管、部門窗口、一般使用者皆無；比照「使用表單（多）」欄位列：其餘角色唯讀可下載、ICSOP管理員可寫），已於本次一併補上兩份矩陣表格之對應列（見 [E08 US-070](../E08-permission-matrix/US-070-role-function-matrix.md)、[US-071](../E08-permission-matrix/US-071-role-field-matrix.md)）。
