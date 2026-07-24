---
type: implementation-log
feature_id: F016
feature_name: PDF 與 OJT 附件上傳（真 Azure Blob + multipart 端點）
status: complete
last_updated: 2026-07-23
---

# F016: PDF 與 OJT 附件上傳 — Implementation Log（storage-real worktree）

本輪範圍＝將先前 unit-green 之 Blob 抽象接線至**真實 Azure Blob**，並把附件上傳端點由「中繼資料 body 佔位」升級為**真實 multipart**。前端上傳 UI 依任務指示延後至後續整併。

## 本輪實作
1. **AzureBlobStore**（`src/storage/azure-blob-store.ts`）：實作既有 `BlobStore` 介面（put/delete/exists/getDownloadUrl/getBytes），以 `@azure/storage-blob` 私有容器落地。
   - `getDownloadUrl` **選型＝短效期唯讀 SAS URL**（非後端代理）：回傳 `{ url, expiresInSeconds }` 讓前端直取、大型 PDF 由 Azure 直送、不佔 app server 記憶體/頻寬；授權在「核發 SAS 前」由服務層把關（session + blobPath 歸屬 + 兩道 RBAC 閘門），TTL 短效（預設 300s，含 60s 時鐘偏移回溯、限 https、`sp=r`）。
   - `getBytes` 保留為 F020 伺服器端浮水印燒錄之讀取 seam（架構 §5.2 代理模式），與 SAS 下載並存。
2. **StorageModule 生產綁定**（`src/storage/storage.module.ts`）：`createBlobStore()` 以 env（`AZURE_BLOB_CONNECTION_STRING`＋`AZURE_BLOB_CONTAINER`）驅動 AzureBlobStore；未設定時 fallback 至 FakeBlobStore 使 app 於無 Azure 設定環境仍可啟動。單元測試各 service spec 直接 `new FakeBlobStore()`，永不經此模組 → 不接觸真實 Azure。
3. **multipart 端點**（`src/attachments/attachments.controller.ts`）：`icsop-pdf` / `ojt` 上傳改用 `FileInterceptor('file')`（@nestjs/platform-express，記憶體 storage）+ `@UploadedFile()`，經 `toUploadFile()`（`src/storage/multipart.ts`）轉服務層 `UploadFile`。防衛性 transport 上限（50MB+1KB），精確 50MB 業務邊界仍由服務層 `assertSizeWithinLimit` 把關。缺檔 → `FILE_REQUIRED`。
4. **TTL env 覆寫**（`src/storage/blob-store.ts`）：`DOWNLOAD_URL_TTL_SECONDS` 改 `Number(process.env.DOWNLOAD_URL_TTL_SECONDS) || 300`。

## Test Results Summary
| Scenario / 測項 | 說明 | Status |
|---|---|---|
| attachments.service.spec（TS-001~022） | 既有服務層測試（授權/格式/大小/覆蓋/下載）全回歸 | PASS（22） |
| azure-blob-store.spec | getDownloadUrl SAS 離線驗證（https/sig/se/spr/sp=r、TTL≈now+ttl、不同 key 不同路徑） | PASS（4） |
| 全 backend 單元套件 | 無回歸 | PASS（70 suites / 822 tests） |
| tsc --noEmit（src + test） | 型別乾淨 | PASS |

> put/delete/exists/getBytes 需真實 Azure 連線 → 由 `test/int/storage.itest.ts` 涵蓋（**已備、本輪未跑**，orchestrator 合併後序列執行）。

## Files Changed
| File Path | Change Type | Description |
|---|---|---|
| backend/src/storage/azure-blob-store.ts | new | 真 Azure Blob 實作（SAS 下載 + getBytes 代理 seam） |
| backend/src/storage/azure-blob-store.spec.ts | new | SAS 核發離線單元測試 |
| backend/src/storage/storage.module.ts | modified | env 驅動 Azure 綁定 + Fake fallback（app 可啟動） |
| backend/src/storage/multipart.ts | new | MulterUploadedFile 型別 + toUploadFile 轉換 + 共用 interceptor 選項 |
| backend/src/storage/blob-store.ts | modified | DOWNLOAD_URL_TTL_SECONDS 可經 env 覆寫 |
| backend/src/attachments/attachments.controller.ts | modified | 上傳改真 multipart（FileInterceptor/@UploadedFile） |
| backend/test/int/storage.itest.ts | new | 真 Blob roundtrip + 使用表單稽核落地（已備未跑） |
| backend/package.json | modified | 新增 `@azure/storage-blob@^12.33.0` |

## Architectural Decisions
- **下載＝SAS 而非代理**：介面文件既載明 SAS；NFR-002 短效期憑證；避免大檔穿透 app server。代理路徑僅 F020 燒錄以 getBytes 讀原始位元組。
- **Fake fallback 於無 env**：確保 app 於本機/部分 CI 無 Azure 設定仍能 boot（正式部署務必提供 env）；不改變單元測試（不經模組）。
- **multer 型別**：自定 `MulterUploadedFile` 最小介面，避免新增 `@types/multer` 依賴。

## 需回報之 spec-doc 變更（未自行編輯共用 doc）
- `docs/specs/feature-status.md` F016 列：由「真 Azure Blob＋migration＝[integration]」更新為「真 Azure Blob（SAS 下載）＋multipart 端點已接線；int 已備未跑；剩前端上傳 UI」。
- `.env` 已含 `AZURE_BLOB_CONNECTION_STRING`＋`AZURE_BLOB_CONTAINER`；如需自訂下載憑證效期可加 `DOWNLOAD_URL_TTL_SECONDS`（預設 300）。
- 新錯誤碼 `FILE_REQUIRED`（multipart 缺檔）——建議補入 error-handling.md。
- DOCUMENT_ATTACHMENT migration 既存（1721955600000），本輪無新增 migration。

---

## 前端整併（doc-frontend worktree · 2026-07-23）

補齊「剩前端上傳 UI」——消費既有 multipart 附件端點與使用表單下載，完成 F016 前端面。

### 本輪實作（前端）
- 端點：`uploadIcsopPdf(documentId, file)`／`uploadOjtAttachment(documentId, file)`（`FormData` multipart，欄位名 `file`，
  不手動設 Content-Type 交瀏覽器帶 boundary）；`downloadUsageForm(documentId, formId)` → `{url, expiresInSeconds}`（前台下載用）。
- **建立頁 STEP4**（F010）：ICSOP PDF／OJT 選檔，建立取得 UUID 後上傳。
- **編輯頁**（F011）：ICSOP PDF／OJT「取代」上傳（覆蓋式，即時上傳）；唯讀角色停用（欄位面 FIELD_WRITE_FORBIDDEN 由後端把關）。
- **唯讀頁**（F016 檢視）：附件區列出關聯之**使用表單**並提供下載（核發短效期 URL→開新視窗），標示浮水印/稽核說明。

### 已知後端缺口（前端回報，未改後端）
- **無附件列表端點**：ICSOP PDF／OJT 現有檔名/連結無法列示（後端僅 upload + `getAttachmentRef` service seam，未暴露 GET）。
  → 編輯頁附件僅提供上傳/取代（不顯示現檔）；唯讀頁附件區僅列使用表單。建議補 `GET /admin/documents/:id/attachments`
  回單份 ICSOP PDF/OJT 之 metadata（fileName/blobPath/uploadedAt）供編輯/唯讀/清單「檔案」欄呈現與下載。

### 需回報之 Status 變更
- `docs/specs/features/F016-pdf-ojt-attachment.md` Status：由「Backend Implemented（…前端上傳 UI 延後至整併）」→
  建議「Implemented（真 Azure Blob；前端 ICSOP PDF/OJT 上傳/取代＋使用表單下載已接線；唯讀檢視完成）」。

### 前端測試 / 建置
- 唯讀頁 6 例、編輯頁 8 例、建立 STEP4 3 例；全前端套件 194 綠、tsc 0 err、vite build 通過。
