---
type: test-design-feature
feature_id: F016
feature_name: PDF 與 OJT 附件上傳
priority: P0-MVP
related_spec: docs/specs/features/F016-pdf-ojt-attachment.md
last_updated: 2026-07-22
status: draft
---

# F016 — PDF 與 OJT 附件上傳 · Test Design
> source: docs/specs/features/F016-pdf-ojt-attachment.md · worktree: storage · 2026-07-22

## 測試策略（unit 用假 Blob store＋純規則；真 Azure Blob/DB＝[integration]、序列化暫不自動化）

全站尚無任何 Blob/storage 抽象（`feature-status.md` 明載「全站無 Azure Blob/multipart/storage 抽象」），本設計假設最小合約（供 tdd-developer 落地時參考，非最終介面定案，見「開放設計問題」）：

```
interface BlobStore {
  put(path: string, content: Buffer, meta: { contentType: string; size: number }): Promise<{ blobPath: string }>;
  delete(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  getDownloadUrl(path: string, opts: { expiresInSeconds: number }): Promise<string>;
}
```

- **unit**：以 `FakeBlobStore`（`Map<string, {content, contentType, size}>` 記憶體實作，記錄 `put`/`delete`/`getDownloadUrl` 呼叫參數供斷言）＋ `FakeAttachmentStore`（比照 `backend/src/documents/documents.service.spec.ts` 之 `FakeStore` 風格，記錶 `DOCUMENT_ATTACHMENT` 列）驅動附件服務（`AttachmentsService` 或等效命名）之格式/大小/覆蓋/RBAC 純邏輯。格式白名單、大小上限（50MB，OQ-E04-06 定案）為**純規則**，不需真檔案位元組即可驗證（以 `{ size, contentType/extension }` 中繼資料驅動）。
- **RBAC 層**沿用既有 `backend/src/rbac/function-matrix.ts`（F025 功能面）＋ `backend/src/rbac/field-matrix.ts`（F026 欄位面，`FieldKey.ICSOP_PDF`／`FieldKey.OJT_SIGNIN` 已定義）之純判定函式（`canPerform`／`canWriteField`），可直接以既有 fixture 角色矩陣單元測試，不需啟動 Nest guard。
- **[integration]**：真實 Azure Blob 容器之私有 ACL、SAS Token 簽發與 TTL 到期強制、直接以 Blob URL 繞過後端存取之實際拒絕行為，以及 `.pdf`/`.jpg`/`.png` 真實二進位內容的完整往返（put→download byte-identical）。這些需要真 Azure Blob，本設計僅標記，不在 unit 範圍內斷言。

## Test Scenarios

### 上傳成功路徑

#### TS-F016-001 上傳合法 PDF 作為 ICSOP PDF [unit]
- Given：ICSOPAdmin 角色、文件已存在（F010）、上傳檔案 `contentType=application/pdf`、`size=2MB`
- When：呼叫上傳 ICSOP PDF 附件
- Then：`blobStore.put` 被呼叫一次並回傳 `blobPath`；`DOCUMENT_ATTACHMENT(type=ICSOP_PDF)` 建立/更新，含 `blobPath`/`fileName`/`contentType`/`size`/`uploadedBy`/`uploadedAt`
- 對應 AC / 錯誤碼：AC1

#### TS-F016-002 上傳 jpg 作為 OJT 簽到表 [unit]
- Given：ICSOPAdmin、`contentType=image/jpeg`
- When：上傳 OJT 附件
- Then：成功儲存，`DOCUMENT_ATTACHMENT(type=OJT_SIGNIN)` 建立
- 對應 AC / 錯誤碼：AC2

#### TS-F016-003 上傳 png 作為 OJT 簽到表 [unit]
- Given：ICSOPAdmin、`contentType=image/png`
- When：上傳 OJT 附件
- Then：成功儲存（格式清單涵蓋 jpg **與** png，OQ-E04-06 定案：「PDF 或圖片（jpg/png）」）
- 對應 AC / 錯誤碼：Edge Case（OQ-E04-06）

#### TS-F016-004 上傳 pdf 作為 OJT 簽到表 [unit]
- Given：ICSOPAdmin、`contentType=application/pdf`
- When：上傳 OJT 附件
- Then：成功儲存（OJT 允許 pdf 或圖片，二擇一皆合法格式）
- 對應 AC / 錯誤碼：Description（OJT 格式雙軌）

### 格式白名單（負向）

#### TS-F016-005 上傳不允許格式（.exe）作為 ICSOP PDF [unit]
- Given：ICSOPAdmin、`contentType=application/x-msdownload`（或副檔名 `.exe`）
- When：上傳
- Then：拒絕，回 `FILE_FORMAT_NOT_ALLOWED` 並附允許格式清單；不建立任何 `DOCUMENT_ATTACHMENT`；`blobStore.put` 未被呼叫
- 對應 AC / 錯誤碼：AC3 / `FILE_FORMAT_NOT_ALLOWED`

#### TS-F016-006 上傳不允許格式（.docx）作為 OJT [unit]
- Given：ICSOPAdmin、`.docx`
- When：上傳 OJT
- Then：`FILE_FORMAT_NOT_ALLOWED`，不建立關聯
- 對應 AC / 錯誤碼：AC3 / `FILE_FORMAT_NOT_ALLOWED`

### 大小上限（邊界）

#### TS-F016-007 上傳恰為 50MB 之合法檔案 [unit]
- Given：ICSOPAdmin、`size = 50 * 1024 * 1024` bytes、格式合法
- When：上傳
- Then：成功（單檔上限 ≤50MB，含邊界，OQ-E04-06 定案）
- 對應 AC / 錯誤碼：Edge Case / OQ-E04-06

#### TS-F016-008 上傳 50MB + 1 byte 之合法格式檔案 [unit]
- Given：ICSOPAdmin、`size = 50*1024*1024 + 1`、格式合法
- When：上傳
- Then：拒絕，回 `FILE_SIZE_EXCEEDED`；不建立關聯、`blobStore.put` 未被呼叫
- 對應 AC / 錯誤碼：Edge Case / `FILE_SIZE_EXCEEDED`

### 覆蓋語意（1 份／欄位獨立）

#### TS-F016-009 重新上傳新 ICSOP PDF 覆蓋舊檔 [unit]
- Given：文件已有 ICSOP PDF（`blobPath=A`）
- When：上傳新 PDF（`blobPath=B`）
- Then：`DOCUMENT_ATTACHMENT(ICSOP_PDF)` 之 `blobPath` 更新為 B；透過文件記錄查詢附件時只回傳 B；A 不再可經文件記錄之附件參照存取
- 對應 AC / 錯誤碼：AC4

#### TS-F016-010 重新上傳新 OJT 簽到表覆蓋舊檔 [unit]
- Given：文件已有 OJT（`blobPath=A`）
- When：上傳新 OJT（`blobPath=B`）
- Then：同 TS-009 覆蓋語意（OJT 亦為 1 份覆蓋，非版本化）
- 對應 AC / 錯誤碼：Postconditions（data-model `DOCUMENT_ATTACHMENT`「各 1 份，重新上傳即覆蓋舊檔」）

#### TS-F016-011 更新 OJT 不影響既有 ICSOP PDF（欄位互相獨立） [unit]
- Given：文件已有 ICSOP PDF（`blobPath=P`）與 OJT（`blobPath=O1`）
- When：僅重新上傳 OJT（`blobPath=O2`）
- Then：ICSOP PDF 之 `blobPath` 仍為 P（未被觸碰）；OJT 更新為 O2
- 對應 AC / 錯誤碼：資料模型（`type` 區分之獨立記錄）

### RBAC — 上傳（寫入）

> 以下 3 條（TS-012～015）之精確錯誤碼／授權判定順序見「開放設計問題 OQ-F016-01」；本設計依現有 `field-matrix.ts` 已定義之 `FieldKey.ICSOP_PDF`／`FieldKey.OJT_SIGNIN`（`canWriteField` 對非 ICSOPAdmin 皆回 `FORBIDDEN`）與 F026 AC 文字為主要依據標註 `FIELD_WRITE_FORBIDDEN`，但**若附件端點沿用 `documents.controller.ts` 既有 `@RequirePermission(FunctionKey.ICSOP_DOCUMENT_MANAGEMENT,'write')` 寫入閘門模式，READ 層角色會在到達欄位判定前即被擋下，回碼將是 `PERMISSION_DENIED`**，兩者皆需列為候選、待 architect 定案。

#### TS-F016-012 ICSOPAdmin 上傳任一附件 → 允許 [unit]
- Given：ICSOPAdmin、格式/大小合法
- When：上傳 ICSOP PDF 或 OJT
- Then：成功（`canPerform('ICSOPAdmin','ICSOP文件管理','write')=true` 且 `canWriteField('ICSOPAdmin','ICSOP PDF')='WRITABLE'`）
- 對應 AC / 錯誤碼：F026 矩陣正向

#### TS-F016-013 系統管理員（功能面唯讀）嘗試上傳 ICSOP PDF [unit]
- Given：SysAdmin
- When：上傳
- Then：拒絕（403）；既有附件不受影響
- 對應 AC / 錯誤碼：F026 AC「Edge Cases：主管/部門窗口可下載…上傳/取代該附件被拒」比照系統管理員（OQ-E08-01 已收斂為比照主管）；**精確碼見 OQ-F016-01**

#### TS-F016-014 主管嘗試上傳 OJT [unit]
- Given：Supervisor
- When：上傳
- Then：拒絕（403）
- 對應 AC / 錯誤碼：同上，**精確碼見 OQ-F016-01**

#### TS-F016-015 部門窗口嘗試上傳 ICSOP PDF [unit]
- Given：DeptContact
- When：上傳
- Then：拒絕（403）
- 對應 AC / 錯誤碼：同上，**精確碼見 OQ-F016-01**

#### TS-F016-016 一般使用者嘗試上傳（功能面無存取） [unit]
- Given：User（`FUNCTION_MATRIX['ICSOP文件管理'].User = 'NONE'`）
- When：上傳
- Then：拒絕，回 `PERMISSION_DENIED`（`canPerform` 對 `NONE` 列一律 `false`，讀寫皆拒，此為唯一無歧義情境——不論端點如何設計，一般使用者連 read 動作都不可能通過，因此必定卡在功能閘門）
- 對應 AC / 錯誤碼：F025 矩陣「ICSOP 文件管理」User=無 / `PERMISSION_DENIED`（高信心，非 OQ-F016-01 範圍）

### 受控下載

#### TS-F016-017 授權角色請求下載已存在附件 [unit]
- Given：任一已登入角色（5 種角色之「下載/列印文件」功能皆為 READ，全角色可下載）、附件存在
- When：呼叫下載端點
- Then：後端呼叫 `blobStore.getDownloadUrl(blobPath, {expiresInSeconds})` 並回傳短效期憑證/URL 給前端
- 對應 AC / 錯誤碼：AC1「可於詳情下載」／F025「下載/列印文件」全角色可（浮水印，F020 負責燒錄）

#### TS-F016-018 未登入使用者請求下載端點 [unit]
- Given：無有效 session
- When：呼叫下載端點
- Then：拒絕，回 `FILE_ACCESS_DENIED`；`blobStore.getDownloadUrl` 未被呼叫（不核發任何憑證）
- 對應 AC / 錯誤碼：AC5 / `FILE_ACCESS_DENIED`

#### TS-F016-019 請求下載已被覆蓋的舊 blobPath [unit]
- Given：附件已被覆蓋（TS-009 情境後），呼叫端仍持有舊 `blobPath`／舊附件識別碼
- When：嘗試以舊識別碼取得下載憑證
- Then：拒絕存取（找不到記錄或視為已失效，不核發憑證）——「舊檔不再可經文件記錄存取」
- 對應 AC / 錯誤碼：AC4

#### TS-F016-020 未授權/未登入使用者略過後端直接以 Blob URL 存取容器 [integration]
- Given：真實 Azure Blob 容器（私有 ACL）、已知或猜測之 blob 路徑
- When：不經後端核發流程直接以裸 URL 存取
- Then：Azure 拒絕（403/404），無法取得檔案內容
- 對應 AC / 錯誤碼：AC5 / `FILE_ACCESS_DENIED`（NFR-002 短效期憑證）；需真實 Azure Blob 私有容器設定，非 unit 可覆蓋

#### TS-F016-021 已核發之短效期憑證於 TTL 到期後再次使用 [integration]
- Given：真實 Azure Blob、已核發之 SAS Token
- When：TTL 到期後再次以該 URL 存取
- Then：拒絕
- 對應 AC / 錯誤碼：NFR-002；**TTL 秒數未定義（見開放設計問題），無法設計精確到期邊界測試，僅能驗證「確實會到期」這件事**

### 跨功能銜接（F020 燒錄來源）

#### TS-F016-022 附件上傳成功後暴露可供 F020 燒錄模組取用之來源介面 [unit]
- Given：ICSOP PDF 已成功上傳
- When：查詢文件之附件參照（供 F020 讀取原始 PDF 以燒錄浮水印）
- Then：可取得該附件之 `blobPath`／等效參照（僅驗證「介面存在且指向最新版」此 seam，不驗證燒錄本身，燒錄屬 F020 不在本 worktree 範圍）
- 對應 AC / 錯誤碼：Postconditions「供 F020 前台檢視/下載來源」

## AC → TS 覆蓋對照表

| AC/來源 | 內容摘要 | 對應 TS |
|---|---|---|
| AC1 | 合法 PDF 上傳為 ICSOP PDF，存 Blob 並關聯，可於詳情下載 | TS-001, TS-017 |
| AC2 | jpg 作為 OJT 成功儲存 | TS-002 |
| AC3 | 不允許格式 → `FILE_FORMAT_NOT_ALLOWED` | TS-005, TS-006 |
| AC4 | 重新上傳覆蓋舊檔，舊檔不再可經文件記錄存取 | TS-009, TS-019 |
| AC5 | 未登入/無權限直接以 Blob URL 存取 → `FILE_ACCESS_DENIED` | TS-018, TS-020 |
| Edge：大小上限（OQ-E04-06） | ≤50MB | TS-007, TS-008 |
| Edge：格式清單（OQ-E04-06） | pdf/jpg/png（OJT）、pdf（ICSOP PDF） | TS-003, TS-004 |
| F026 矩陣（RBAC） | 僅 ICSOPAdmin 可寫附件欄位 | TS-012～016 |
| 資料模型（覆蓋獨立性） | ICSOP_PDF／OJT_SIGNIN 各自獨立覆蓋 | TS-010, TS-011 |
| NFR-002（短效期憑證） | SAS Token TTL | TS-021 |
| Postconditions（F020 銜接） | 附件為浮水印燒錄來源 | TS-022 |

## 開放設計問題

- **OQ-F016-01（重要，證據衝突）：附件寫入拒絕之精確錯誤碼與授權判定順序未定案。**
  - 證據 A（既有後端程式碼慣例）：`backend/src/documents/documents.controller.ts` 之 `create`/`setStatus` 皆以 `@RequirePermission(FunctionKey.ICSOP_DOCUMENT_MANAGEMENT, 'write')` 作路由層閘門；`FUNCTION_MATRIX['ICSOP文件管理']` 對 SysAdmin/Supervisor/DeptContact 皆為 `READ`，`canPerform(...,'write')` 對 READ 列一律回 `false`。**若附件上傳端點沿用同一模式，這三種角色會在觸及欄位層判定前就被路由層擋下，回碼是 `PERMISSION_DENIED`，`field-matrix.ts` 中已定義之 `FieldKey.ICSOP_PDF`/`FieldKey.OJT_SIGNIN`（`FORBIDDEN` for 非 ICSOPAdmin）將永遠無法被觸及（現行矩陣下屬「不可達分支」）。**
  - 證據 B（`field-matrix.ts` 原始碼註解＋F018 prototype UI 文案）：`document-field-write.ts` 明文「附件（ICSOP PDF/OJT/使用表單）走 F016 檔案通道，不在此 JSON 酬載內」，暗示附件端點**另有獨立授權路徑**（非沿用泛用文件 PATCH 之 `classifyFields`），且刻意在 `field-matrix.ts` 定義了這三個附件 `FieldKey`；`prototypes/19-usage-form-management.html` 明確將系統管理員之被拒上傳標示為 `FIELD_WRITE_FORBIDDEN`（非 `PERMISSION_DENIED`），暗示端點路由層僅要求 `'read'` 存取、實際寫入與否交由欄位層判定。
  - **兩者互斥，需 architect 於實作前定案**：附件上傳端點的 `@RequirePermission` 動作應為 `'read'`（讓 READ 角色可觸及、由欄位層擋下 → `FIELD_WRITE_FORBIDDEN`）或 `'write'`（比照既有文件 CRUD 模式 → `PERMISSION_DENIED`）。本文件 TS-013～015 暫依證據 B（較貼近 spec AC 文字與 prototype 行為）標註，但**明確保留為待確認**，tdd-developer 實作時務必先與此 OQ 對齊，不得逕自二選一。
  - 品質風險：若未定案即實作，後續任何一方修正都會導致既有測試全面改碼，且前端錯誤處理（toast 文案/i18n key）亦需同步調整。

- **OQ-F016-02**：Blob 抽象介面之確切形狀（方法名、`put`/`upload` 命名、回傳型別、是否含 `contentType` 驗證於介面層或服務層）未定案；本文件之 `BlobStore` 介面僅為測試設計假設之最小合約，非架構定案，供 tdd-developer 參考起點。

- **OQ-F016-03**：`F026` 角色×欄位矩陣中「OJT 簽到表」列缺少「(可下載)」註記（相較 ICSOP PDF／使用表單皆明確標註「唯讀（可下載）」，OJT 僅寫「唯讀」）。是否代表 OJT 簽到表之下載權限與 ICSOP PDF/使用表單不同（例如僅後台角色可下載、前台一般使用者不可下載 OJT），或僅為文件撰寫時的遺漏？影響 TS-017 是否對 OJT 附件同等適用；需確認後補上明確 AC。

- **OQ-F016-04**：覆蓋語意的實作策略未定案——新檔覆蓋是否重用**同一** `blobPath`（Blob 原地覆寫）或寫入**新** `blobPath` 並僅改資料庫參照（舊 blob 成孤兒、留待清理排程回收）？兩種策略下 TS-009/010/019 的驗證手法不同（前者可直接斷言同一 blob 內容已變更；後者需額外驗證是否存在孤兒清理機制或永久佔用儲存空間的取捨）。

- **OQ-F016-05**：短效期憑證（SAS Token）之 TTL 秒數（NFR-002「短效期」未給出具體數值）未定案，`architecture-spec.md` §8.3 之 OQ-E04-06 列仍標「Blocking」（與 `open-questions.md` 已定案 ✅ 的檔案大小/格式部分不一致，但**未涵蓋 TTL 秒數本身**，兩份文件對「已定案範圍」認知略有落差，建議一併釐清 TTL 是否也已定案或仍待補）。TS-021 僅能整合層驗證「有到期」，無法斷言精確秒數邊界。

- **OQ-F016-06**：附件與 `ICSOP_DOCUMENT`（documents worktree）的掛接點——附件上傳/下載端點是否掛在 `DocumentsController` 底下（如 `POST /admin/documents/:id/attachments/icsop-pdf`），或獨立 `AttachmentsController` 以 `documentId` 為外部參照？此為與 doc-family worktree 的唯一衝突面，需盡早對齊路由前綴與 `DocumentsService` 依賴方向（何者依賴何者），避免雙方各自實作出不相容的介面。
