# F023: 稽核軌跡記錄
Priority: P0-MVP | Status: Implemented (unit) — audit worktree 2026-07-23；DB/整合待（[integration] TS-013/014/015）| Last Updated: 2026-07-23
Epic/Story: E07 / US-060

## Description
使用者查看、下載、列印 ICSOP 文件（及下載使用表單）時，各自產生一筆 append-only 稽核紀錄，內容與該次浮水印一致。稽核不可竄改/刪除；記錄失敗不阻斷使用者瀏覽，改進補償佇列重試補寫。

## Preconditions
- 使用者身分已識別（F001）；操作由 F020（文件）或 F018（使用表單下載）觸發。

## Main Flow
1. 使用者觸發 VIEW/DOWNLOAD/PRINT（或使用表單 DOWNLOAD）。
2. 以同一次請求之身分/部門/處室/時間快照組裝稽核內容（與浮水印同來源）。
3. 寫入 `AUDIT_LOG`（append-only），含操作人員、員工編號、部門、處/室、文件 ID/編號、操作類型、時間戳記、浮水印快照。

## Alternative Flows
- 使用表單下載：targetType=USAGE_FORM，記 formId。

## Edge Cases
- 稽核寫入服務暫時不可用：使用者仍正常看文件；失敗進補償佇列，服務恢復後重試補寫。
- 短時間重複開啟同文件：草案各自獨立記錄（是否節流/去重見 OQ-E07-01）。

## Postconditions
- 每次調閱皆有獨立且不可竄改之稽核紀錄，供 F024 查詢。

## Acceptance Criteria
- Given 使用者查看一份文件, When 檢視器載入, Then 產生 1 筆 VIEW 紀錄，欄位正確。
- Given 使用者下載並列印同文件, When 各操作完成, Then 分別產生 DOWNLOAD 與 PRINT 兩筆獨立紀錄。
- Given 觸發下載/列印, When 產生浮水印, Then 稽核之人員/部門/處室/時間與該次浮水印完全一致。
- Given 稽核寫入暫時異常, When 使用者查看文件, Then 仍正常看到內容，且服務恢復後成功補寫該筆。
- Given 任一角色經介面/API 修改或刪除稽核, When 送出, Then 拒絕（`AUDIT_IMMUTABLE`，403/405）。

### D9 delta：後台下載稽核 ＋ OJT 上傳稽核（🔴 2026-08-20 使用者裁決；缺失／變更 delta 第 5／8 項） {#d9-audit-delta}

> 前提裁決（逐題紀錄見 [open-questions §D9](../open-questions.md#d9--2026-08-20-缺失變更-delta來源stories2026-08-20-defect-delta-9md)）：
> **`OQ-D9-10`→選項 A：寫稽核，比照前台**（後台燒錄下載一律寫入 `AUDIT_LOG`）〔使用者〕｜
> **`OQ-D9-11`**（浮水印／身分快照＝執行下載動作之操作者本人）〔lead 預設〕｜
> **`OQ-D9-23`**（主管／部門窗口之 OJT 上傳寫入 `AUDIT_LOG`；⚠ 既有落差 `OQ-E01-09` 本輪**不一併償還**）〔lead 預設〕。
>
> **本 delta 之 AC 編號採 `AC-N#`**。欄位落值之權威＝[data-model AUDIT_LOG](../data-model.md#auditlog-entity)。
> ✅ **不需 migration**：`actionType` 為 `varchar(40)`、`targetType` 為 `varchar(30)`，**皆無 CHECK 約束**（`migrations/1721952000000-audit-log.ts`，2026-08-18 已查證）⇒ 新字面值落得下。

- **AC-N50**（🔴 OJT 上傳之稽核落列——新增 `actionType` 列舉值）：Given 主管或部門窗口成功上傳（含覆蓋）某文件之 OJT 附件, When 檢視稽核, Then `AUDIT_LOG` **恰新增一筆**，其 `actionType` 逐字為 **`ATTACHMENT_UPLOAD`**（**本 delta 新增，additive**）、`targetType` 為 `DOCUMENT`、`documentId`／`documentNumber` 為該文件、身分快照五欄為**執行上傳之操作者本人**、`watermarkSnapshot` 為 **`null`**（非浮水印動作）、`source` 為 `DIRECT`、`occurredAt` 為伺服器時間。<br>🔒 **既有 11 種 `actionType` 與 7 種 `targetType` 之語意與落列規則逐字不變**（比照 `LIFECYCLE_DELETE`／`APPENDIX`／`ACCESS_HISTORY_EXPORT` 之 additive 先例）。<br>⚠ **`targetId` 不會缺值**：`targetType='DOCUMENT'` ⇒ `buildAuditRow()` 取 `documentId`，**不會**觸發 `AUDIT_TARGET_REF_REQUIRED`（與 `ACCESS_HISTORY_EXPORT` 之未決落點問題**不同型**）。
- **AC-N51**（🔴 後台燒錄下載之稽核落列——**不新增任何列舉值**）：Given 任一後台角色自 [F020](F020-watermark.md#backend-burn-delta) 所列四條後台端點任一者成功下載, When 檢視稽核, Then `AUDIT_LOG` **恰新增一筆**，`actionType='DOWNLOAD'`（既有值），`targetType` 依檔案類別為 `DOCUMENT`／`USAGE_FORM`／`APPENDIX`（既有值），身分快照為操作者本人，`watermarkSnapshot` 於已燒錄（PDF）時**落值且與該次浮水印逐字相同**、於未燒錄（非 PDF）時為 `null`。<br>📌 **`documentId` 之唯一例外**：自**表單池管理頁**或**附錄池管理頁**下載者，其脈絡不隸屬任何文件 ⇒ `documentId` 為 `null`（見 [data-model AUDIT_LOG](../data-model.md#auditlog-entity) 之就地登錄；`formId`／`appendixId` 仍必填）。<br>🔴 **稽核寫入失敗不阻斷下載**（沿用本 feature 既有 AC「稽核寫入暫時異常 → 使用者仍正常取得內容、服務恢復後補寫」，逐字不變）。
- **AC-N52**（🔒 既有稽核行為回歸鎖定 ＋ 角色不對稱之明文）：Given 本 delta 實作完成, When 執行本 feature 之全部既有 AC, Then **全數維持綠燈**——VIEW／DOWNLOAD／PRINT 三類前台紀錄、身分與浮水印一致性、append-only（`AUDIT_IMMUTABLE`）、補償佇列語意**一字不變**。<br>🔴 **明文之角色不對稱（`OQ-D9-23` 之直接後果）**：Given **ICSOPAdmin** 成功上傳 OJT（或 ICSOP PDF）, Then **不寫入任何 `AUDIT_LOG` 列**（`AuditWriter` 完全未被呼叫）——`OQ-E01-09` 之既有落差本輪不償還。**本不對稱已提報為 [open-questions](../open-questions.md) `OQ-D9-29` 交回 lead**（含「調閱歷程表承載寫入事件」之分類學衝突）；在該題定案前為現行規格，行為權威＝[F016](F016-pdf-ojt-attachment.md#ojt-role-open-delta) `AC-N32`。

## Error Scenarios
- 補償重試/不可竄改：見 [error-handling.md#audit](../error-handling.md#audit)。保留年限見 [NFR-003](../nfr.md#audit-retention)。
- **後台下載與 OJT 上傳之稽核（2026-08-20）**：寫入失敗**不阻斷**下載／上傳，進補償佇列重試（沿用 [#audit](../error-handling.md#audit) 之既有規則）；**不新增任何錯誤碼**。

## Related
- Diagram: [../diagrams/F020-watermark-audit.mmd](../diagrams/F020-watermark-audit.mmd)
- Data: [AUDIT_LOG](../data-model.md#auditlog-entity)
- Depends on: [F020](F020-watermark.md), [F001](F001-auth-login-session.md); Blocks: [F024](F024-access-history-query.md)
- NFR: [稽核與資料保留](../nfr.md#audit-retention), [浮水印一致性](../nfr.md#watermark)
- OQ: OQ-E07-01（重複調閱節流?）, OQ-NFR003（狀態切換是否納稽核）
- **2026-08-20 使用者裁決（D9 delta）**：`OQ-D9-10`（後台燒錄下載寫稽核）／`OQ-D9-11`（身分＝操作者）／`OQ-D9-23`（OJT 上傳寫稽核，僅新開放之角色路徑）。見 [§D9 delta](#d9-audit-delta)。**新增 OQ（交回 lead）**：`OQ-D9-29`（同一端點兩種稽核行為＋調閱表承載寫入事件之分類學衝突）、`OQ-D9-30`（前後台稽核列於 F024 無法區分）。
