# US-054: 下載/列印 PDF 浮水印燒錄

> **Story ID**: US-054
> **Epic**: [E06 前台RWD瀏覽](epic-brief.md)
> **Priority**: P0
> **Phase**: 1
> **Estimated Points**: 8

## User Story

As a 公司同仁,
I want 下載或列印 ICSOP 文件時，取得的 PDF 檔案本身已燒錄我的身分浮水印,
So that 即使檔案被另存、轉傳或列印成紙本，仍可追溯來源，達成稽核與管控目的。

## Acceptance Criteria

### AC1：下載檔案已燒錄浮水印

**Given** 使用者於前台點擊「下載」某份 ICSOP 文件
**When** 下載完成
**Then** 取得的 PDF 檔案內容層已燒錄浮水印（格式同 [US-053](US-053-viewer-watermark-overlay.md)：`{員工編號}-{姓名}-{公司名稱}-{部門}-{處/室}-{僅供內部使用非經許可不得複製翻印或轉製成其他形式呈現}-{當下時間}`），非僅前端顯示疊加。

### AC4：燒錄內容之欄位定案與收合規則須與檢視器一致

**Given** 使用者下載或列印之 PDF 已燒錄浮水印
**When** 燒錄內容產生
**Then** 公司名稱（`COMPFULLNM` 全稱）、部門（所屬部層完整名稱）、處/室（所屬最細單位名稱）之取值規則，以及無下層單位者「處/室」留空並自動收合分隔符之規則，須與 [US-053 檢視器疊加](US-053-viewer-watermark-overlay.md) 完全一致，確保同一使用者對同一文件於「檢視器疊加」「PDF 燒錄」「稽核快照」三種情境下浮水印字串逐字相同（見 [NFR-007](../../non-functional/NFR-007-watermark-integrity.md) 一致性要求，詳見[上游人資來源資料契約 §8](../../../specs/upstream-hr-source-contract.md)）。

### AC2：列印觸發燒錄後之列印流程

**Given** 使用者於前台點擊「列印」
**When** 系統產生列印用 PDF
**Then** 該列印用 PDF 內容層同樣已燒錄浮水印，確保實體紙本上亦顯示浮水印內容。

### AC3：下載/列印同步觸發稽核記錄

**Given** 使用者成功取得下載檔案或觸發列印
**When** 該操作完成
**Then** 系統記錄對應之「下載」或「列印」稽核軌跡（見 [E07 US-060](../E07-audit-trail/US-060-audit-trail-logging.md)），操作類型需明確區分「查看」「下載」「列印」三者。

## Technical Notes

- 浮水印燒錄需於伺服器端以 PDF 處理套件（如 pdf-lib 類技術，實際套件由架構師決定）動態疊加浮水印圖層後再回傳檔案，確保另存新檔後浮水印仍存在（見 [NFR-007](../../non-functional/NFR-007-watermark-integrity.md)）。
- 「列印」與「下載」在瀏覽器層面技術上可能共用同一份已燒錄浮水印的 PDF（使用者透過瀏覽器原生列印功能列印該 PDF），此細節由架構師決定，但兩種操作類型仍須於稽核記錄中區分。

## Test Cases

| ID | 情境 | 類型 |
|---|---|---|
| TC-054-01 | 下載文件 → 取得 PDF 檔案內容層含正確浮水印文字 | Happy Path |
| TC-054-02 | 列印文件 → 列印預覽/輸出內容含浮水印 | Happy Path |
| TC-054-03 | 下載後以 PDF 編輯工具嘗試移除浮水印圖層 → 依技術設計評估其困難度，記錄於 NFR-007 風險評估 | Error Case |
| TC-054-04 | 下載與列印各自產生獨立稽核紀錄，操作類型正確區分 | Edge Case |
| TC-054-05 | 未授權角色嘗試直接呼叫下載 API（略過前台 UI）→ 依 [E08](../E08-permission-matrix/epic-brief.md) 權限矩陣拒絕存取 | Error Case |
| TC-054-06 | 下載無處/室下層使用者（如掛於本部層）之文件 → PDF 燒錄內容「處/室」留空並自動收合分隔符，與該使用者檢視器疊加結果逐字比對一致 | Edge Case |
| TC-054-07 | 下載課層使用者之文件 → PDF 燒錄「處/室」欄顯示課名（略過中間處層），與檢視器疊加結果一致 | Edge Case |

## Dependencies

- **Blocked By**：[US-053 網頁檢視器浮水印疊加](US-053-viewer-watermark-overlay.md)
- **Blocks**：[E07 US-060 查看/下載/列印稽核軌跡記錄](../E07-audit-trail/US-060-audit-trail-logging.md)

## Definition of Done

- [ ] Acceptance criteria met
- [ ] Unit tests passing (>80% coverage)
- [ ] Code review approved
- [ ] Documentation updated

## Related

- [Epic Brief: E06 前台RWD瀏覽](epic-brief.md)
- [NFR-007 浮水印防竄改與一致性](../../non-functional/NFR-007-watermark-integrity.md)
- [NFR-002 資訊安全與身分驗證](../../non-functional/NFR-002-security.md)
- [E07 US-060 查看/下載/列印稽核軌跡記錄](../E07-audit-trail/US-060-audit-trail-logging.md)
- Spec: [上游人資來源資料契約](../../../specs/upstream-hr-source-contract.md)（浮水印欄位對應與收合規則定案 §8）
