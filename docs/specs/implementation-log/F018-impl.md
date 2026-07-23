---
type: implementation-log
feature_id: F018
feature_name: 使用表單管理（下載稽核接真 AuditWriter + multipart）
status: complete
last_updated: 2026-07-23
---

# F018: 使用表單管理 — Implementation Log（storage-real worktree）

本輪範圍＝將 F018 下載稽核由佔位 `LoggingAuditRecorder` 接線至**真實 AuditWriter（F023，落地 AUDIT_LOG）**，並把表單池上傳/覆蓋端點升級為**真實 multipart**；共用 AzureBlobStore（見 F016-impl）。前端管理頁延後至後續整併。

## 本輪實作
1. **稽核接線**（`src/usage-forms/audit-writer-recorder.adapter.ts`）：新 `AuditWriterRecorder implements AuditRecorder`，注入 `AuditWriterService`（由 `AuditModule` export），將 F018 之 `UsageFormAuditEvent` 對映為 F023 契約 `AuditAccessEvent`（USAGE_FORM 變體）：`targetType='USAGE_FORM'`、`actionType='DOWNLOAD'`、`targetId=formId`、`actorId=accountId`、`occurredAt=now`。落地經 Outbox 非阻斷（下載主流程不因稽核 IO 中斷）。
2. **模組換綁**（`src/usage-forms/usage-forms.module.ts`）：`imports` 加 `AuditModule`；`AUDIT_RECORDER` 由 `useClass: AuditWriterRecorder` 取代 `LoggingAuditRecorder`。刪除佔位 `logging-audit-recorder.ts`（死碼）。
3. **multipart 端點**（`src/usage-forms/usage-forms.controller.ts`）：池上傳（POST）改 `FilesInterceptor('files', 20)`（單檔→uploadForm、多檔→uploadForms）；覆蓋（PUT）改 `FileInterceptor('file')`。經 `toUploadFile()` 轉服務層 `UploadFile`。
4. 服務層 `UsageFormsService` **未改動**——既有 25 項服務測試（授權/覆蓋警示/移除保護/下載稽核參數）全數綠燈；FakeAuditRecorder 注入方式不變。

## Test Results Summary
| Scenario / 測項 | 說明 | Status |
|---|---|---|
| usage-forms.service.spec（TS-001~030） | 既有服務層測試（含 TS-013 下載稽核參數）全回歸 | PASS（25） |
| audit-writer-recorder.adapter.spec | 對映正確（targetId=formId、actorId=accountId、occurredAt=Date）+ rejection 轉發 | PASS（2） |
| 全 backend 單元套件 | 無回歸 | PASS（70 suites / 822 tests） |
| tsc --noEmit（src + test） | 型別乾淨 | PASS |

> 「使用表單下載 → AUDIT_LOG 落地一列」端到端（真 DB）由 `test/int/storage.itest.ts` 涵蓋（**已備、本輪未跑**）。

## Files Changed
| File Path | Change Type | Description |
|---|---|---|
| backend/src/usage-forms/audit-writer-recorder.adapter.ts | new | UsageFormAuditEvent → AuditAccessEvent 轉接器 |
| backend/src/usage-forms/audit-writer-recorder.adapter.spec.ts | new | 轉接對映單元測試 |
| backend/src/usage-forms/usage-forms.module.ts | modified | imports AuditModule；AUDIT_RECORDER 換綁真 recorder |
| backend/src/usage-forms/logging-audit-recorder.ts | deleted | 佔位收集器（死碼移除） |
| backend/src/usage-forms/usage-forms.controller.ts | modified | 池上傳/覆蓋改真 multipart |

## Architectural Decisions
- **轉接器而非改服務簽名**：`UsageFormsService` 續依賴 `AUDIT_RECORDER` 抽象（單元測試以 fake 注入），僅在模組層換綁真實實作 → 測試不受影響、關注點分離。
- **documentId 於此 seam 落空**：F023 USAGE_FORM 變體以 `targetId` 承載 formId、`targetNumber` 承載顯示編號；本下載 seam 未持有文件編號快照，故僅帶 formId/actorId（符合任務指定對映），其餘身分/對象快照留 null。日後若前台下載需帶浮水印身分快照，於 controller 層補 sessionUser 身分欄。

## 需回報之 spec-doc 變更（未自行編輯共用 doc）
- `docs/specs/feature-status.md` F018 列：「下載稽核（佔位）…稽核接真 AuditWriter＝[integration]」更新為「下載稽核已接真 AuditWriter（AUDIT_LOG，經 Outbox）；int 已備未跑；剩前端管理頁」。
- USAGE_FORM_POOL / DOC_USAGE_FORM migration 既存（1722124800000）；AUDIT_LOG（1721952000000）＋append-only 觸發器（1722470400000）既存，本輪無新增 migration。
