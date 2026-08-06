# US-101: 附錄與文件關聯維護

> **Story ID**: US-101
> **Epic**: [E10 附錄管理](epic-brief.md)
> **Priority**: P1
> **Phase**: 1
> **Estimated Points**: 8

## User Story

As a **ICSOP 管理員**（建立/編輯文件時關聯附錄並排定順序）**或公司同仁**（前台/後台檢視關聯附錄）,
I want **在 ICSOP 文件建立/編輯畫面從附錄池搜尋多選關聯附錄、以上移/下移調整顯示順序，並在文件詳情頁（前台或後台）依該順序看到該文件所有關聯附錄並可個別下載**,
So that **管理員能將正確的附錄依 SOP 正文引用順序（如「附錄一/附錄二」）掛載到文件上，且使用者於檢視文件時能依對應順序一併取得所需附錄，不必另外詢問或查找**。

## Acceptance Criteria

### AC1：建立/編輯文件時搜尋多選關聯附錄，新選取項目預設置於末位

**Given** ICSOP 管理員位於「ICSOP 文件」建立或編輯畫面
**When** 開啟附錄選取區，以關鍵字或格式篩選搜尋附錄池，勾選一筆以上附錄
**Then** 系統於送出儲存後，建立該文件與所選附錄之關聯（多對多）並各自指定 `sortOrder`；新選取之附錄一律加入於目前已選清單之**末位**（接續現有最大 `sortOrder`），關聯結果隨即反映於文件詳情頁。

### AC2：調整已選附錄之顯示順序（上移/下移）

**Given** 我於附錄選取區（或既有已關聯清單）已選取兩筆以上附錄
**When** 我對其中一筆點擊「上移」或「下移」
**Then** 該筆附錄與相鄰項目互換順位，畫面即時反映新順序；本 Story 僅提供上移/下移按鈕操作，不支援拖曳排序。

### AC3：送出前於選取區取消勾選

**Given** 我已於附錄選取區勾選若干附錄，尚未送出表單
**When** 我取消勾選其中一筆
**Then** 該筆附錄不列入本次送出之關聯清單，其餘已勾選項目與其相對順序不受影響。

### AC4：儲存後順序持久化

**Given** 我已完成附錄選取與排序（含上移/下移調整）並送出儲存
**When** 我重新開啟該份文件之編輯畫面
**Then** 已關聯附錄清單依先前儲存之 `sortOrder` 呈現，順序與上次送出時完全一致，不因重新載入而重置或打亂。

### AC5：解除既有關聯（不影響附錄池本身，且不影響其餘附錄之相對順序）

**Given** 某份 ICSOP 文件已關聯 3 筆以上附錄，各自具備明確 `sortOrder`
**When** ICSOP 管理員於編輯畫面解除其中一筆關聯並送出
**Then** 系統僅解除該文件與該附錄之關聯，附錄本身仍保留於附錄池，可被其他文件關聯或再次選取；其餘附錄之相對順序維持不變，不因移除中間一筆而重新洗牌或產生順位缺口導致顯示錯亂。

### AC6：文件詳情頁依序列出關聯附錄（前後台一致）

**Given** 某份 ICSOP 文件已關聯一個或多個附錄，且具備既定顯示順序
**When** 使用者（前台一般使用者或後台管理角色）開啟該文件詳情頁
**Then** 畫面依 `sortOrder` 順序列出所有關聯附錄之名稱與格式（excel/pdf），並提供個別下載連結；前台與後台所見順序一致，且與編輯畫面所排定之順序相符。

### AC7：無關聯附錄時的呈現

**Given** 某份 ICSOP 文件尚未關聯任何附錄
**When** 使用者開啟該文件詳情頁
**Then** 畫面明確顯示「無附錄」或等同提示，不顯示錯誤或空白區塊。

### AC8：下載附錄觸發稽核記錄

**Given** 使用者於前台文件詳情頁點擊下載某附錄
**When** 下載請求成功
**Then** 系統記錄一筆稽核軌跡（操作人員、部門/處室、文件、附錄、操作類型=下載、targetType=APPENDIX，時間戳記），比照 [E07 US-060](../E07-audit-trail/US-060-audit-trail-logging.md) 之記錄規則。

## Technical Notes

- 建立/編輯畫面之附錄選取 UI 與 [US-102](US-102-appendix-pool-management.md) 附錄池清單共用同一份查詢/搜尋邏輯，避免兩處篩選規則不一致。
- 附錄下載是否疊加浮水印：比照使用表單，**已定案：不燒錄浮水印**（沿用 OQ-E05-03 之定案值）。
- 後台與前台之關聯清單呈現邏輯應共用同一組 API（`GET /documents/:documentId/appendices`），依 `sortOrder` 排序回傳，避免兩處資料或順序不一致。
- **顯示順序（已定案：支援自訂排序，2026-08-06 使用者裁定）**：`DOC_APPENDIX` 關聯需帶 `sortOrder` 欄位（每份文件內的附錄序位）；文件建立/編輯畫面之「已選附錄」清單提供上移/下移操作調整順序（非拖曳）；新加入之附錄預設接在末位；前後台文件詳情頁一律依 `sortOrder` 顯示，使其對得上 SOP 正文之「附錄一／二／三」引用。此為附錄相對於使用表單池模型的一項刻意結構性差異（使用表單無此排序需求），不屬於鏡射 E05 的範圍，資料模型（`DOC_APPENDIX.sortOrder` 新增欄位）與端點 contract 之影響請 spec-writer／system-architect 於下一輪落實。
- **與 E05 模板之差異說明**：AC1／AC2／AC3（建立/編輯時之搜尋多選、排序調整與解除關聯）為本 Story 新增之明確驗收標準；[E05 US-041](../E05-usage-form/US-041-form-document-association.md) 原文並未針對「文件建立/編輯時之搜尋多選」訂出明確 AC（僅於 Technical Notes 提及「文件建立/編輯」帶過，未 AC 化，E04 US-030/US-031 亦未涵蓋此段行為，屬 E05 既有之隱性缺口），且使用表單池模型本身無排序概念。本次因使用者原始需求明確點名「用搜尋/多選的方式附加在 ICSOP 文件上」，且經裁定確認附錄需支援自訂排序，故補齊此段之明確驗收標準與排序機制，而非沿用 E05 的省略處理；建議日後回頭為 E05 US-041 補上對應 AC，但此非本次任務授權範圍，不予修改。

## Test Cases

| ID | 情境 | 類型 |
|---|---|---|
| TC-101-01 | 建立文件時以關鍵字搜尋附錄池 → 正確過濾結果 | Happy Path |
| TC-101-02 | 建立文件時依序勾選 3 筆附錄並送出 → 文件成功建立，3 筆附錄依勾選順序取得 `sortOrder`（1/2/3） | Happy Path |
| TC-101-03 | 已選 3 筆附錄，將第 3 筆上移兩次 → 順序變為第 3/第 1/第 2，畫面即時反映 | Happy Path |
| TC-101-04 | 送出前於選取區取消勾選 → 該筆不列入本次關聯，其餘順序不變 | Edge Case |
| TC-101-05 | 已排序並儲存後，重新開啟編輯畫面 → 附錄清單順序與上次儲存時完全一致 | Happy Path |
| TC-101-06 | 編輯已關聯 3 筆附錄（順序 A/B/C）之文件，解除 B 之關聯後送出 → 剩餘 A/C 相對順序不變（不因移除中間一筆而重排） | Edge Case |
| TC-101-07 | 文件有 3 個依序關聯之附錄 → 前台與後台詳情頁皆依相同 `sortOrder` 列出，且與編輯畫面排定順序一致，各自可下載 | Happy Path |
| TC-101-08 | 文件無關聯附錄 → 顯示「無附錄」提示 | Happy Path |
| TC-101-09 | 未登入或無權限使用者嘗試直接組合下載網址存取附錄 → 拒絕存取（`FILE_ACCESS_DENIED`） | Error Case |
| TC-101-10 | 下載附錄成功 → 稽核紀錄同步寫入，且 targetType=APPENDIX 正確 | Edge Case |

## Dependencies

- **Blocked By**：[US-100 附錄上傳管理](US-100-appendix-upload.md)、[E04 US-030 建立ICSOP文件](../E04-icsop-document/US-030-create-icsop-document.md)
- **Blocks**：[E06 US-050 前台清單與排序規則](../E06-public-browsing/US-050-public-list-sorting.md)（文件詳情頁需顯示附錄清單）

## Definition of Done

- [ ] Acceptance criteria met
- [ ] Unit tests passing (>80% coverage)
- [ ] Code review approved
- [ ] Documentation updated

## Related

- [Epic Brief: E10 附錄管理](epic-brief.md)
- [F039 附錄管理](../../../specs/features/F039-appendix-management.md)
- [E07 US-060 查看/下載/列印稽核軌跡記錄](../E07-audit-trail/US-060-audit-trail-logging.md)
- [NFR-002 資訊安全與身分驗證](../../non-functional/NFR-002-security.md)
- Mirrors：[E05 US-041 表單與文件關聯維護](../E05-usage-form/US-041-form-document-association.md)（差異說明見上方 Technical Notes）
