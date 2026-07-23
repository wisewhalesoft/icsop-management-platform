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

---

# 本輪（usageform worktree, 2026-07-23）— 前端管理頁 + 表單池總覽/個別下載端點

本輪範圍＝實作 F018 **前端使用表單管理頁**（prototype 19 逐項移植）並補齊其所需之**唯讀讀取端點**。服務層寫入/覆蓋/移除/下載稽核（前輪已完成）**未改動**，既有 31 項服務測試全綠。

## 本輪實作
1. **前端頁 `frontend/src/pages/UsageFormManagementPage.tsx`**（route `/admin/usage-forms`；menu 既有 `usageform` 項）：PageHeader topbar 動作（上傳表單，write-only）＋全寬清單；欄位＝表單名稱/格式(excel·pdf 徽章)/大小/上傳者·時間/**關聯文件數(可展開檢視使用文件)**/操作（下載·展開·覆蓋·移除）。上傳 modal（拖放式選檔＋名稱＋50MB 上限提示）、覆蓋二次確認（docCount≥2 → USAGE_FORM_OVERWRITE_SHARED 附引用文件清單）、移除二次確認（docCount≥1 → USAGE_FORM_IN_USE 解除全部關聯）、搜尋/格式篩選/清除/計數。RBAC 自我守門：ICSOPAdmin CRUD、SysAdmin 唯讀（唯讀提示、無寫入鈕、可下載）、主管/部門窗口/一般使用者 → 封鎖畫面（PERMISSION_DENIED）。
2. **表單池總覽端點 `GET /admin/usage-forms/overview`**（新）：回每筆表單 + `docCount` + `documents[{id,documentNumber,documentName}]`（供清單欄與展開）。store 新增 `listPoolOverview()`（TypeORM 單次載入 USAGE_FORM_POOL ⋈ DOC_USAGE_FORM ⋈ ICSOP_DOCUMENT，避免 N+1）；service `listPoolOverview()` 沿用 read gate。
3. **個別下載端點 `GET /admin/usage-forms/:formId/download`**（新）：read gate（SysAdmin 唯讀亦可下載），核發短效 URL。⚠ 管理端下載稽核義務未定（OQ-F018-06）→ 暫不記錄，flag。
4. **前端 endpoints.ts**：`getUsageFormPool`/`uploadUsageForms`(multipart files)/`overwriteUsageForm`(multipart file,confirmed)/`deleteUsageForm`(confirmed)/`downloadUsageForm`/`linkUsageForms`/`unlinkUsageForm`。multipart 以 FormData（不夾 Content-Type，瀏覽器自帶 boundary）。
5. **Icon 註冊表補圖**（`frontend/src/components/Icon.tsx`）：`upload/upload-cloud/file-spreadsheet/link/link-2-off/chevron-down/chevron-up/corner-down-right/hard-drive/eye`（先前未註冊→render null，補齊以還原 prototype 圖示，additive）。

## 🔴 Prototype 對齊註記（prototype 19 為權威）
- **關聯編輯不在本頁**：prototype 19 導言明訂「文件於建立/編輯時由此表單池選取關聯」，本頁對關聯僅**唯讀展開檢視**（非可搜尋多選編輯）。任務敘述之「文件多對多可搜尋多選關聯」屬**文件建立/編輯側（F014 DocumentCreatePage）**之能力；本輪已備 `linkUsageForms/unlinkUsageForm` 端點供該側消費，未於本頁加入關聯編輯 UI（忠實 prototype）。
- **檔案大小上限顯示 50MB**（非 prototype 之「20MB 示範值」）：後端 file-rules `MAX_FILE_SIZE_BYTES=50MB` 為真實裁決值，採真實值。
- **上傳自訂表單名稱未落地**：prototype 上傳 modal 有可編輯「表單名稱」欄，但既有 multipart 上傳端點以**檔名**為表單 name（不接受自訂 name 參數）→ 名稱欄目前僅自動帶入檔名、自訂改名不持久化。若需自訂命名，須後端 upload 端點加 name 欄位（flag，OQ）。
- **展開之關聯文件為資訊列（不可跳轉）**：prototype 有「跳轉至文件」按鈕；因文件詳情路由未定，本輪僅呈現文件編號＋名稱（flag，待文件詳情路由就緒再接）。

## Test Results Summary（本輪）
| Scenario / 測項 | 說明 | Status |
|---|---|---|
| UsageFormManagementPage.test（12） | 封鎖/清單/唯讀/搜尋/篩選/展開/上傳(合法·格式拒)/覆蓋共用/移除in-use/移除無關聯/下載 | PASS（12） |
| endpoints.test（+7） | usage-form 7 端點契約（URL/method/FormData/JSON） | PASS |
| usage-forms.service.spec（TS-031~033） | listPoolOverview read gate + docCount/documents；downloadFromPool read gate | PASS |
| 全前端套件 | 無回歸 | PASS（30 files / 190 tests） |
| 全後端套件 | 無回歸 | PASS（76 suites / 873 tests） |
| frontend tsc / backend tsc（src+test） | 型別乾淨 | PASS |

> `GET /admin/usage-forms/overview`（join）與 `:formId/download` 端到端（真 DB）由 `backend/test/int/usage-form-pool.itest.ts` 涵蓋（**已備、本輪未跑**）。

## Files Changed（本輪）
| File Path | Change | Description |
|---|---|---|
| frontend/src/pages/UsageFormManagementPage.tsx | new | F018 管理頁（prototype 19 移植） |
| frontend/src/pages/UsageFormManagementPage.test.tsx | new | 頁面 vitest（12） |
| frontend/src/App.tsx | modified | route `/admin/usage-forms` → 實頁 |
| frontend/src/api/endpoints.ts | modified | 7 個 usage-form 端點函式 |
| frontend/src/api/endpoints.test.ts | modified | 端點契約測試（+7） |
| frontend/src/api/types.ts | modified | UsageFormPoolItem/DocumentRef/DownloadGrant 型別 |
| frontend/src/components/Icon.tsx | modified | 補 10 個 lucide 圖示註冊 |
| backend/src/usage-forms/usage-forms.store.ts | modified | UsageFormPoolItem 型別 + FormPoolStore.listPoolOverview |
| backend/src/usage-forms/typeorm-usage-forms.store.ts | modified | listPoolOverview（三表 join，防 N+1） |
| backend/src/usage-forms/usage-forms.service.ts | modified | listPoolOverview/downloadFromPool + assertCanRead 抽出 |
| backend/src/usage-forms/usage-forms.controller.ts | modified | GET overview / GET :formId/download |
| backend/src/usage-forms/usage-forms.service.spec.ts | modified | FakeStore.listPoolOverview + TS-031~033 |
| backend/test/int/usage-form-pool.itest.ts | new | 總覽 join + 下載端點 int（未跑） |

## 需回報之 spec-doc 變更（未自行編輯共用 doc）
- `docs/specs/feature-status.md` F018 列：可更新為「前端管理頁已實作（prototype 19，vitest 綠）；新增表單池總覽/個別下載端點（int 已備未跑）；剩真 Azure 私有容器直存拒絕＝[integration]」。
- `docs/specs/data-model.md`：仍建議補 `USAGE_FORM_POOL`＋`DOC_USAGE_FORM`（OQ-F018-07）；本輪未動 schema（表既存）。
- OQ-F018-06（管理端下載是否稽核）本輪暫**不稽核**管理端個別下載，待 architect 定案。
