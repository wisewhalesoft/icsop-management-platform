---
type: implementation-log
feature_id: F026
feature_name: 角色×欄位權限矩陣（AC5-9 附件／浮水印／使用部門子樹）
worktree: field-matrix (feature/field-matrix)
status: complete
last_updated: 2026-07-24
---

# F026 field-matrix track — 實作紀錄（AC5-9）

## 一句話結論
本 track **為純覆蓋（coverage-only）**：AC5-9 之欄位面 RBAC 判定與檔案下載授權**早已落地並在真實呼叫點行使**；
本次僅補上測試設計 `field-matrix-test-design.md` 之 6 個既有行為測試（TS-FM-001~006），**未新增任何 enforcement
程式碼**，並依人類裁決（OQ-FM-01）將「後台原始下載（RAW，不燒錄）」定調為既定行為、更正 F026 spec 之 AC6
Edge Case 舊措辭。

## TDD 紀律說明
測試設計本文將 TS-FM-001~006 標為「現況特徵測試（characterization）」——即描述既有正確行為。依 launching
指示，對「既有正確行為之特徵測試」係**先寫測試、再對現行碼確認通過並如實聲明**（非先製造 red）。
6 案**全數對現行碼即通過**（`npx jest src/attachments/... src/usage-forms/...` → 2 suites / 78 passed），
證實無實作缺口。**未弱化任何測試以求通過**；斷言皆為實質（精確 url 字串、精確錯誤碼、精確稽核物件、
建構子相依結構回歸防線）。

## 人類裁決落地（OQ-FM-01：後台下載維持 RAW、不燒錄）
- **裁決**：後台附件/使用表單下載一律核發指向**原始 blob** 之短效期 SAS URL，伺服器端不經手位元組、
  故**不燒錄浮水印**；浮水印燒錄＋調閱稽核僅存於**前台檢視器路徑（F020 `WatermarkController`）**。
- **理由記錄**：
  1. 後台下載係核發 SAS URL 指向原始 blob，**伺服器完全不經手位元組**，架構上無從燒錄。
  2. 使用表單常為 `.xlsx`（非 PDF），本無 PDF 浮水印可燒。
  3. 「管理存取（原件） vs 消費存取（可追溯燒錄件）」之刻意區分。
- **據此**：TS-FM-001/002 由「暫時性 characterization」升格為**永久之既定行為測試**（測試內文與 describe
  標題已改述為「既定管理存取行為」並引註裁決），作為「後台不接線 `PdfBurner`」之回歸防線；
  **未將任何 `PdfBurner` 接入** `AttachmentsService`／`UsageFormsService`。

## Test Results Summary
| Scenario ID | 目標檔案 | 說明 | 型別 | 狀態 |
|-------------|---------|------|------|------|
| TS-FM-001 | `attachments.service.spec.ts` | 後台 `getDownloadUrl` 核發原始 blob SAS URL、不燒錄（結構防線：建構子無 burner） | 既定行為 | PASS |
| TS-FM-002 | `usage-forms.service.spec.ts` | 前台 `downloadForm` 與後台 `downloadFromPool` 皆核發原始 SAS URL、不燒錄 | 既定行為 | PASS |
| TS-FM-003 | `usage-forms.service.spec.ts` | 主管（Supervisor）下載使用表單 → 允許、核發憑證＋稽核 | Positive | PASS |
| TS-FM-004 | `usage-forms.service.spec.ts` | 部門窗口（DeptContact）下載使用表單 → 允許（Edge Case 並列角色） | Positive | PASS |
| TS-FM-005 | `usage-forms.service.spec.ts` | 主管取代（`overwriteForm`）→ `PERMISSION_DENIED`、未寫入、原檔不變 | Negative | PASS |
| TS-FM-006 | `usage-forms.service.spec.ts` | 部門窗口取代 → `PERMISSION_DENIED`（Edge Case 並列角色） | Negative | PASS |

## Files Changed
| File Path | Change Type | Description |
|-----------|------------|-------------|
| `backend/src/attachments/attachments.service.spec.ts` | modified | 新增 TS-FM-001（後台 RAW 下載既定行為區塊） |
| `backend/src/usage-forms/usage-forms.service.spec.ts` | modified | 新增 TS-FM-002（RAW 下載）＋ TS-FM-003~006（AC6 精確角色×動作）；補 `DOWNLOAD_URL_TTL_SECONDS` import |
| `docs/specs/features/F026-role-field-matrix.md` | modified | 更正 AC6 Edge Case 舊措辭（本 track 自有 feature 檔） |
| `docs/implementation-logs/field-matrix-impl.md` | new | 本紀錄 |

**未新增：** 任何 production 程式碼、任何 migration、任何 `*.itest.ts`、任何前端檔案。

## 是否需要新 enforcement 程式碼？
**否——純覆蓋（coverage-only）。** 逐案驗證真實呼叫點皆已行使既有授權：
- `AttachmentsService.getDownloadUrl`：`if (!session?.accountId) throw FILE_ACCESS_DENIED` → `findByBlobPath` →
  `blob.getDownloadUrl(...)`（原始 SAS，無燒錄）。
- `UsageFormsService.downloadForm`（前台，僅檢查 `accountId`）／`downloadFromPool`（後台 read gate）：皆
  原始 SAS，無燒錄。
- `UsageFormsService.overwriteForm` → `assertCanWrite` → `assertCanWriteDocumentAsset(role, USAGE_FORM_MANAGEMENT,
  USAGE_FORMS)`：主管/部門窗口於 `USAGE_FORM_MANAGEMENT` 功能面＝`NONE` → 第一關 `canPerform` 即
  `PERMISSION_DENIED`（不觸及欄位層、不寫檔）。
6 案全數對現行碼即綠，證實 enforcement 已存在。

## F026 AC6 Edge Case 更正（verbatim before/after）
本 track 擁有此 feature 檔，依 launching 指示自行更正（**未觸碰**其他凍結共用文件）。

**更正前（原文）：**
```
- 主管/部門窗口可下載 ICSOP PDF/使用表單（燒錄浮水印，F020），但上傳/取代該附件被拒。
```

**更正後：**
```
- 主管/部門窗口可下載 ICSOP PDF/使用表單：**後台下載提供原始檔案**（管理存取，經短效期 SAS URL 核發，
  伺服器不經手位元組故不燒錄浮水印），但上傳/取代該附件被拒。**浮水印燒錄與調閱稽核僅發生於前台檢視器
  路徑（F020）**；後台原始下載與前台燒錄下載係「管理存取 vs 消費存取」之刻意區分（且使用表單常為 .xlsx，
  無 PDF 浮水印可燒）。（OQ-FM-01 人類裁決，2026-07-24：後台維持 RAW、不接線 PdfBurner。）
```

## AC5-9 → 本 track 作為（逐字對照）
| AC | 逐字原文 | 現況 | 本 track 作為 |
|----|---------|------|--------------|
| AC5 | 一般使用者前台下載 ICSOP PDF → 允許並燒錄浮水印，但無法存取後台編輯介面 | ✅ 前台走 `WatermarkController`（會燒錄，`watermark.service.spec.ts` `TS-F020-017/024`）；後台功能面 `User=NONE` → 403（`role-permission.guard.spec` + FE `DocumentReadonlyPage/EditPage.test.tsx`） | 引用既有覆蓋，**不重工**（citation-only） |
| AC6 | 主管下載使用表單 → 允許；同角色上傳/取代 → 被拒 | 🟡→✅ 判定邏輯早已存在；本次補上指名角色×指名動作之直接斷言＋更正 Edge Case 燒錄措辭 | **新增 TS-FM-003~006（下載允許/取代 `PERMISSION_DENIED`）＋ TS-FM-001/002（RAW 不燒錄）；更正 F026 AC6 Edge Case** |
| AC7 | ICSOP 管理員編輯「文件使用部門」可選任一層級並儲存成功 | 🟡 持久層在 `documents.service.ts`（**doc-changelog track 界面，非本 track**） | **不於本 track 實作**；引用既有部分覆蓋 `documents.service.spec.ts` `F014-C1`（`usingDeptIds:['A2000','B0000']`＝ DEPARTMENT/DIVISION 兩層混合已落地）與 `TS-B-001`（編輯路徑可更新）。歸屬 documents-track。 |
| AC8 | 使用部門部層 `JA000` ⊃ 使用者 `JAC00` → 相符（子樹展開） | ✅ 已覆蓋 | **不重工**；引用 `org-sync/org-hierarchy.spec.ts` `TS-PS-ORG-002`（碼內註記「對應 F026 AC-F026-a」），共用純函式 `isWithinSubtree`（未複製子樹邏輯） |
| AC9 | 使用部門處室層 `JAC00`、使用者同部另一處室 → 不相符 | ✅ 已覆蓋 | **不重工**；引用 `org-sync/org-hierarchy.spec.ts` `TS-PS-ORG-004`（碼內註記「對應 F026 AC-F026-b」） |

## 錯誤碼確認（對照 error-handling.md，未修改該檔）
- `FIELD_WRITE_FORBIDDEN`（403）：唯讀角色（如 SysAdmin）寫入欄位／上傳附件（F016 之 SysAdmin/Supervisor/
  DeptContact 已由既有 `TS-013~015` 覆蓋）。
- `PERMISSION_DENIED`（403）：功能面「無」角色寫入型 API——**本 track TS-FM-005/006 之主管/部門窗口取代使用表單
  即此碼**（`USAGE_FORM_MANAGEMENT` 對此二角色＝`NONE`，第一關即擋）。
- `FILE_ACCESS_DENIED`（403）：未登入下載／`blobPath` 查無現存列（既有 `TS-018/019`、`TS-014` 覆蓋）。

## 給 orchestrator 的集中處理事項
### OQ-FM-03：`DOCUMENT_PDF_NOT_FOUND` 未列於 `error-handling.md`（本 track 不改該凍結檔，僅回報）
`backend/src/public/watermark.service.ts` 之 `getOriginalPdf`／`burnAndAudit` 使用 `DOCUMENT_PDF_NOT_FOUND`
（404，查無原始 PDF），但 `docs/specs/error-handling.md` 錯誤碼總表未收錄。建議 orchestrator 於該檔集中補上一列：

| 錯誤碼 | HTTP | 情境 | Feature |
|--------|------|------|---------|
| `DOCUMENT_PDF_NOT_FOUND` | 404 | 前台檢視器 VIEW/DOWNLOAD/PRINT 或 `getOriginalPdf` 查無文件之原始 PDF（`WatermarkService`） | F020 |

### OQ-FM-04（低風險，供 tracker 解凍時處理）
`docs/specs/feature-status.md` F026 列「AC5-9 之附件/浮水印欄位權限判定未實作」與實況已有落差（欄位面
RBAC 早已落地；真正處理的是「後台下載 RAW vs 前台燒錄」之定調與 AC6 精確組合補測）。建議依本紀錄 AC5-9
對照表重新措辭該列。**本 track 未修改該凍結檔。**

## 測試層級：全數 unit（不新增 itest）
AC5/AC6 判定本質為記憶體內角色×動作查表（`canPerform`/`canWriteField`/`assertCanWriteDocumentAsset`），
以既有 `FakeBlobStore`/`FakeFormPoolStore`/`FakeAuditRecorder` 對**真實 service 公開方法**斷言即滿足
「端點存在≠可用」DoD；`blobPath` 持久化一致性另有既有 `attachments.itest.ts`/`usage-form-pool.itest.ts`
覆蓋（本 track 未涉新資料表/新查詢路徑）。AC8/AC9 之 `isWithinSubtree` 為無 IO 純函式。

## 驗證結果（DoD）
- `backend`：`npx jest` → **94 suites / 1088 tests passed**（baseline 1082，+6）。
- `backend`：`npx tsc --noEmit` → 乾淨（exit 0）。
- `frontend`：`npx vitest run` → **35 files / 374 tests passed**（baseline 不變，無前端變更）。
- `frontend`：`npx tsc --noEmit` → 乾淨（exit 0）。
