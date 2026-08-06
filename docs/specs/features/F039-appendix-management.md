# F039: 附錄管理
Priority: P1 | Status: Draft（規格已依 E10 stories 定稿；待 system-architect → ui-ux-designer → 人類閘門 → 實作） | Last Updated: 2026-08-06
Epic/Story: E10 / US-100, US-101, US-102

> **權威來源**：[E10 epic-brief](../../stories/epics/E10-appendix/epic-brief.md)、[US-100](../../stories/epics/E10-appendix/US-100-appendix-upload.md)、[US-101](../../stories/epics/E10-appendix/US-101-appendix-document-association.md)、[US-102](../../stories/epics/E10-appendix/US-102-appendix-pool-management.md)。
> **與 [F018](F018-usage-form-management.md) 之關係**：生命週期、共用語意、權限與稽核義務與使用表單同構，故版型比照 F018；
> 但**附錄多出「每份文件內之顯示順序」（`sortOrder`）**，此為刻意的結構性差異（使用表單無此概念），
> 凡涉排序之條款皆非鏡射 F018，須逐條實作與驗證。

## Description

附錄採**集中附錄池**模型：ICSOP 管理員於**獨立「附錄管理」畫面**維護附錄池（上傳／覆蓋更新／移除／查詢／檢視關聯文件）；
ICSOP 文件建立/編輯時，自附錄池**可搜尋多選**關聯附錄（**多對多**，一份附錄可被多份文件共用），並以**上移／下移**排定該文件內之顯示順序。
前台與後台文件詳情頁**一律依 `sortOrder` 遞增**列出該文件所有關聯附錄並可個別下載；前台下載觸發稽核（[F023](F023-audit-logging.md)）。檔案存 Azure Blob Storage。

### 本規格鎖定之命名（下游程式碼逐字使用，不得改寫）

| 類別 | 字串 | 說明 |
|---|---|---|
| 功能鍵（F025 列名） | `附錄管理` | 建議常數 `FunctionKey.APPENDIX_MANAGEMENT`；與 [US-070](../../stories/epics/E08-permission-matrix/US-070-role-function-matrix.md) 矩陣列名一致。**刻意不沿用**使用表單之「文件使用表單管理」句型 |
| 欄位鍵（F026 列名） | `附錄`（矩陣列名顯示為「附錄（多）」） | 建議常數 `FieldKey.APPENDICES`；比照既有慣例「使用表單（多）」→ 鍵值 `使用表單`（去括號補述） |
| 檔案類別 | `APPENDIX` | `file-rules.ts` 之 `FileCategory` 新增類別，白名單 `xlsx／xls／pdf`、上限沿用 `MAX_FILE_SIZE_BYTES`（50MB） |
| 資料表 | `APPENDIX_POOL`、`DOC_APPENDIX(documentId, appendixId, sortOrder)` | 見 [data-model.md#appendix-entity](../data-model.md#appendix-entity) |
| 稽核 | `targetType='APPENDIX'`、`AUDIT_LOG.appendixId` | additive 擴充，見 [data-model.md#auditlog-entity](../data-model.md#auditlog-entity) |
| 錯誤碼 | `APPENDIX_NOT_FOUND`／`APPENDIX_IN_USE`／`APPENDIX_OVERWRITE_SHARED`／`APPENDIX_NAME_TOO_LONG` | 見 [error-handling.md#appendix](../error-handling.md#appendix) |

## Preconditions

- 操作者已登入且具備有效 session（[F001](F001-auth-login-session.md)）。
- **附錄池 CRUD（上傳／覆蓋／移除／查詢）不以任何 ICSOP 文件存在為前提**（US-100 Technical Notes 明訂；此為與 F018 敘述之刻意差異）。
- **文件關聯**（Main Flow 2）之前提為目標 ICSOP 文件已存在（[F010](F010-create-document.md)）。
- 寫入類動作之操作者角色為 ICSOPAdmin（[F025](F025-role-function-matrix.md)「附錄管理」列＝CRUD；SysAdmin 唯讀；其餘角色無）。

## Main Flow

1. **附錄池管理（獨立畫面，US-102）**：ICSOP 管理員上傳 xlsx／xls／pdf 至附錄池 → 存 Blob、建立 `APPENDIX_POOL` 記錄（初始關聯文件數＝0）。
   清單欄位＝附錄名稱／格式／大小／上傳者＋上傳時間／**關聯文件數**／操作；支援**關鍵字搜尋（比對附錄名稱）＋格式篩選（excel／pdf）**。
2. **檢視關聯文件（US-102 AC3）**：關聯文件數 > 0 之附錄可展開，列出引用該附錄之 ICSOP 文件（文件編號＋文件名稱）並可跳轉至該文件。
3. **更新（覆蓋上傳）**：以新檔取代既有附錄檔——**維持覆蓋語意、不保留歷史版本／版本對照**（比照全域「僅保存當前版本」原則）。
   因附錄為跨文件共用，覆蓋會同時改變所有引用文件所見內容；故**關聯文件數 ≥ 2 且未二次確認時，回 `APPENDIX_OVERWRITE_SHARED`（409，訊息含 N）並不寫入**；關聯文件數 ≤ 1 時直接覆蓋、不出現跨文件警示。
   確認後：寫入新 blob → 更新記錄 → 回收舊 blob；舊檔即時不再可經任何引用文件存取。**覆蓋不改附錄名稱**。
4. **移除附錄**：關聯文件數 ≥ 1 且未帶二次確認 → 回 `APPENDIX_IN_USE`（409，訊息含 N）；帶確認後解除全部關聯＋刪除池記錄＋回收 blob。關聯文件數＝0 者直接移除（二次確認為前端 UI 責任）。
5. **文件關聯與排序（US-101）**：ICSOP 文件建立／編輯（[F010](F010-create-document.md)／[F011](F011-edit-with-comparison.md)）時，自附錄池搜尋多選附錄；
   已選清單提供**上移／下移**調整順序（**不支援拖曳**）；新選取者一律加入清單**末位**。送出儲存時以「已選清單之最終順序」持久化 `DOC_APPENDIX.sortOrder`（1-based、連續、每份文件內唯一）。
6. **詳情頁呈現**：文件詳情頁（前台／後台共用同一 API）依 `sortOrder` 遞增列出該文件所有關聯附錄之名稱與格式，並提供個別下載連結。
7. **前台下載附錄** → 寫入稽核（`targetType=APPENDIX`、`actionType=DOWNLOAD`、`appendixId`＋`documentId` 皆落列）。**不燒錄浮水印**（已定案，見下）。

### 下載浮水印（已定案：不燒錄）

附錄下載**不燒錄浮水印**，沿用 OQ-E05-03 對使用表單之定案值（僅 ICSOP 文件本身經前台檢視器路徑燒錄，見 [F020](F020-watermark.md)）。
本條為**已定案事項**，非開放問題；規格中不得再以「未定案」措辭描述。附錄多為 .xlsx，本無 PDF 浮水印可燒，與 [F026](F026-role-field-matrix.md) 之 OQ-FM-01 裁決一致。

## Alternative Flows

- **無關聯附錄**：詳情頁顯示「無附錄」提示（非錯誤、非空白區塊）。
- **一次上傳多個檔案**：**先全部驗證（格式＋大小）再全部建立**，任一檔違規則整批不建立（不得部分寫入）。多檔路徑**不接受自訂名稱**，各檔一律以其檔名建檔（比照 F018 既有慣例；單檔路徑才接受選填 `name`）。
- **系統管理員（SysAdmin）進入附錄管理頁**：可查詢附錄池、展開關聯文件、後台下載；上傳／覆蓋／移除／關聯等寫入類動作一律拒絕。

## Edge Cases

| 情境 | 預期行為 |
|---|---|
| 上傳非 xlsx／xls／pdf（如 .docx） | 400 `FILE_FORMAT_NOT_ALLOWED`，不建立任何記錄、不寫 blob |
| 單檔 > 50MB | 400 `FILE_SIZE_EXCEEDED`；**恰 50MB（52,428,800 bytes）通過** |
| 名稱未提供／trim 後為空 | fallback 採用原始檔名（含副檔名）建檔 |
| 名稱 trim 後 > 400 字元（含 fallback 檔名） | 400 `APPENDIX_NAME_TOO_LONG`；恰 400 字元通過 |
| 覆蓋上傳之檔案格式／大小不合法，且該附錄被多份文件引用 | **格式／大小驗證優先於引用數判斷**，先回 `FILE_FORMAT_NOT_ALLOWED`／`FILE_SIZE_EXCEEDED`，不回 `APPENDIX_OVERWRITE_SHARED` |
| 覆蓋警示（≥2 引用）時取消 | 不執行覆蓋，原檔內容與全部既有關聯不變 |
| 移除前二次確認取消 | 不執行移除，附錄與其關聯不受影響 |
| 解除文件與某附錄之關聯 | 附錄本身保留於池中；**該文件剩餘關聯依原相對順序重新編號為連續 1..N**，不留順位缺口 |
| 指定之 `appendixId` 不存在（關聯／覆蓋／移除／下載） | 404 `APPENDIX_NOT_FOUND` |
| 關聯清單中出現重複 `appendixId` | 去重後處理，同一附錄於同一文件至多一筆關聯（`(documentId, appendixId)` 為唯一鍵） |
| 未登入／無權限者以組合網址直接存取附錄檔 | 403 `FILE_ACCESS_DENIED`，不核發短效期 URL、不寫稽核 |
| 附錄數量上限 | **不設固定上限**（比照 OQ-E05-01 對使用表單之定案） |

## Postconditions

- 文件持有 0..* 附錄；同一份附錄可被 0..* 份文件引用（多對多）。
- 任一文件之關聯集合，其 `sortOrder` 恆為 **1..N 之連續整數且互異**（無重複、無缺口）。
- 前台與後台詳情頁所見附錄集合與順序完全一致（共用同一 API）。
- 附錄池記錄僅保存當前版本；覆蓋後舊 blob 已回收，且不可經任何引用文件存取。
- 前台每次成功下載附錄，`AUDIT_LOG` 恰增加一筆 `targetType=APPENDIX` 之紀錄。

## Acceptance Criteria

> 每條標註對應之 story AC。所有條件以可斷言之具體值（HTTP 狀態碼、錯誤碼、筆數、順序）表述。

### 附錄池上傳與驗證

- **AC-01**（US-100 AC1）：Given ICSOPAdmin 已登入，When 以 `POST /admin/appendices` 上傳 1 個合法檔（xlsx／xls／pdf，≤50MB），Then 回 2xx，`APPENDIX_POOL` 新增 1 筆（`name`／`format`／`size`／`blobPath`／`uploadedBy`／`uploadedAt` 皆非空），該筆之 `docCount`＝0，且出現於 `GET /admin/appendices` 之結果。
- **AC-02**（US-100 AC1）：Given 一次選取 3 個合法檔，When 送出，Then 建立 3 筆記錄；Given 其中任一檔格式或大小不合法，When 送出，Then 回 400 且 `APPENDIX_POOL` **筆數不變**（無部分寫入）。
- **AC-03**（US-100 AC2）：Given 選擇 `.docx` 檔，When 上傳，Then 回 400 `FILE_FORMAT_NOT_ALLOWED`，附錄池筆數不變。
- **AC-04**（US-100 AC3）：Given 檔案大小為 52,428,801 bytes，When 上傳，Then 回 400 `FILE_SIZE_EXCEEDED`；Given 檔案大小恰為 52,428,800 bytes，When 上傳，Then 建立成功。
- **AC-05**（US-100 AC4）：Given 上傳時 `name` 為 `"  作業對照表  "`，When 送出，Then 建檔 `name` 恰為 `"作業對照表"`（trim 後值）。
- **AC-06**（US-100 AC4）：Given 上傳時未提供 `name` 或 `name` trim 後為空字串，When 送出，Then 建檔 `name` 等於原始檔名（含副檔名）。
- **AC-07**（US-100 AC4）：Given `name` trim 後長度為 401 字元，When 上傳，Then 回 400 `APPENDIX_NAME_TOO_LONG` 且不建立記錄；Given 長度恰 400 字元，Then 建立成功；Given 未提供 `name` 而 fallback 檔名長度 > 400，Then 同樣回 `APPENDIX_NAME_TOO_LONG`。

### 附錄池移除

- **AC-08**（US-100 AC5）：Given 某附錄 `docCount`＝0，When ICSOPAdmin 送出移除，Then 回 2xx，該記錄自 `APPENDIX_POOL` 消失、blob 已刪除，且該 `appendixId` 不再出現於 `GET /admin/appendices` 與任何文件關聯候選。
- **AC-09**（US-100 AC6）：Given 移除之二次確認對話框已顯示，When 使用者選擇取消（前端不發出移除請求），Then `APPENDIX_POOL` 該筆與其 blob 均不變。
- **AC-10**（US-102 AC4）：Given 某附錄 `docCount`＝N（N ≥ 1），When 送出移除但未帶二次確認（`confirmed` 未為真），Then 回 409 `APPENDIX_IN_USE`、訊息含 N，且記錄與關聯皆不變；When 帶二次確認再送出，Then 解除全部 N 筆關聯、刪除池記錄並回收 blob。

### 附錄池覆蓋更新

- **AC-11**（US-102 AC6）：Given 某附錄 `docCount`＝3，When 以新檔覆蓋且未帶二次確認，Then 回 409 `APPENDIX_OVERWRITE_SHARED`、訊息含引用文件數 3，且 `blobPath`／`size`／`format` 皆未變更。
- **AC-12**（US-102 AC7）：Given 某附錄 `docCount`＝0 或 1，When 以新檔覆蓋（未帶二次確認），Then 直接完成覆蓋、回 2xx，且**不**回 `APPENDIX_OVERWRITE_SHARED`。
- **AC-13**（US-102 AC8）：Given AC-11 之警示已二次確認並完成覆蓋，When 任一引用文件之詳情頁取得該附錄下載連結，Then 取得者為新檔內容；舊 blob 不再可經任何引用文件存取；系統不保留舊檔之歷史版本或版本對照記錄（查詢不存在任何歷史版本端點或欄位）。
- **AC-14**（US-102 AC9）：Given AC-11 之警示畫面，When 使用者選擇取消，Then 附錄檔案內容與其全部既有關聯（含 `sortOrder`）皆不變。
- **AC-15**：Given 某附錄被 3 份文件引用，When 以 `.docx` 或 > 50MB 之檔案送出覆蓋，Then 回 400 `FILE_FORMAT_NOT_ALLOWED`／`FILE_SIZE_EXCEEDED`（**非** 409 `APPENDIX_OVERWRITE_SHARED`）。

### 附錄池清單與關聯檢視

- **AC-16**（US-102 AC1）：Given 附錄池有多筆記錄，When 開啟附錄管理頁，Then 每列呈現附錄名稱／格式／大小／上傳者＋上傳時間／關聯文件數；輸入關鍵字時僅保留名稱含該關鍵字之列；選擇格式篩選 `excel` 時僅保留 `format ∈ {xlsx, xls}` 之列，選擇 `pdf` 時僅保留 `format = pdf` 之列。
- **AC-17**（US-102 AC3）：Given 某附錄被 3 份文件引用，When 展開該列，Then 列出該 3 份文件之文件編號與文件名稱，且每筆提供可跳轉之連結。

### 文件關聯與排序（附錄特有）

- **AC-18**（US-101 AC1）：Given ICSOPAdmin 位於文件建立或編輯畫面且該文件已關聯 2 筆附錄（`sortOrder` 1、2），When 自附錄池再勾選 1 筆並送出儲存，Then 新關聯之 `sortOrder`＝3（接續現有最大值之末位），且原 2 筆之 `sortOrder` 不變。
- **AC-19**（US-101 AC1）：Given 建立文件時依序勾選 3 筆附錄 A、B、C，When 送出，Then `DOC_APPENDIX` 產生 3 筆，`sortOrder` 分別為 A=1、B=2、C=3。
- **AC-20**（US-101 AC2）：Given 已選清單為 A、B、C，When 對 C 點擊「上移」兩次，Then 畫面清單順序即時變為 C、A、B；When 對第一筆點擊「上移」或對最末筆點擊「下移」，Then 順序不變且不產生錯誤。
- **AC-21**（US-101 AC2）：Given 附錄選取區已渲染，When 檢視排序操作元件，Then **僅提供上移／下移按鈕**，不存在拖曳排序（drag-and-drop）互動。
- **AC-22**（US-101 AC3）：Given 已勾選 A、B、C 尚未送出，When 取消勾選 B，Then 本次送出之關聯清單為 A、C（不含 B），且 A 在 C 之前。
- **AC-23**（US-101 AC4）：Given 已完成排序（C、A、B）並送出儲存，When 重新開啟該文件之編輯畫面，Then 已關聯附錄清單順序恰為 C、A、B，且 `sortOrder` 分別為 1、2、3。
- **AC-24**（US-101 AC5）：Given 某文件已關聯 A(1)、B(2)、C(3)，When 於編輯畫面解除 B 之關聯並送出，Then `DOC_APPENDIX` 僅剩 A、C 兩筆且 `sortOrder` 為 A=1、C=2（相對順序不變、無缺口）；附錄 B 仍存在於 `APPENDIX_POOL`，且可被其他文件關聯或再次選取。
- **AC-25**（US-101 AC6）：Given 某文件關聯 3 筆附錄且 `sortOrder` 為 1、2、3，When 分別以前台與後台詳情頁開啟該文件，Then 兩者所列附錄之順序完全相同、皆依 `sortOrder` 遞增，且與編輯畫面所排定之順序一致；每筆顯示名稱與格式並各自提供下載連結。
- **AC-26**（US-101 AC7）：Given 某文件無任何關聯附錄，When 開啟詳情頁（前台或後台），Then 顯示「無附錄」提示，不顯示錯誤或空白區塊，HTTP 回應為 200 且附錄清單為空陣列。

### 下載與稽核

- **AC-27**（US-101 AC8）：Given 已登入使用者於前台文件詳情頁下載某附錄，When 下載請求成功，Then `AUDIT_LOG` 恰新增一筆，其 `targetType='APPENDIX'`、`actionType='DOWNLOAD'`、`appendixId`＝該附錄 id、`documentId`＝該文件 id，並含操作者身分快照（帳號／員工編號／姓名／部門／處室）與伺服器時間戳記。
- **AC-28**：Given 未登入或無權限之請求者以組合網址存取附錄下載端點或 Blob URL，When 請求，Then 回 403 `FILE_ACCESS_DENIED`，不核發短效期 URL、**不寫入任何稽核紀錄**。
- **AC-29**：Given 前台下載附錄成功，When 檢查回應之檔案內容，Then 為原始檔位元組、**未疊加或燒錄浮水印**（已定案）。
- **AC-30**：Given `AUDIT_LOG` 中存在 `targetType='APPENDIX'` 之紀錄，When 於 [F024](F024-access-history-query.md) 調閱歷程以類型「文件」篩選查詢，Then 該筆納入結果（「文件」類＝`DOCUMENT` ∪ `USAGE_FORM` ∪ `APPENDIX`）。

### 權限

- **AC-31**（US-102 AC5）：Given 角色為 ICSOPAdmin，When 存取附錄管理之查詢與寫入端點，Then 全數允許（CRUD）。
- **AC-32**（US-102 AC5）：Given 角色為 SysAdmin，When 呼叫附錄池查詢／關聯檢視／後台下載端點，Then 允許；When 呼叫上傳／覆蓋／移除／關聯／解除關聯端點，Then 拒絕（欄位層 403 `FIELD_WRITE_FORBIDDEN`，與 F018 之守門鏈一致）。
- **AC-33**（US-102 AC5）：Given 角色為 Supervisor／DeptContact／User，When 呼叫任一 `/admin/appendices*` 或 `/admin/documents/:documentId/appendices*` 端點，Then 路由層拒絕，回 403 `PERMISSION_DENIED`。
- **AC-34**：Given 任一已登入角色（含 User），When 開啟文件詳情之附錄清單或下載附錄，Then 允許（屬前台瀏覽／下載列印權限，不受「附錄管理」功能權限限制）。

### Story AC ↔ 本規格 AC 對照（完整性檢核）

| Story | Story AC | 本規格 AC |
|---|---|---|
| US-100 | AC1 成功上傳（單一或多筆） | AC-01、AC-02 |
| US-100 | AC2 格式不符 | AC-03 |
| US-100 | AC3 大小超限 | AC-04 |
| US-100 | AC4 自訂名稱與長度限制 | AC-05、AC-06、AC-07 |
| US-100 | AC5 移除未被關聯之附錄 | AC-08 |
| US-100 | AC6 移除二次確認可取消 | AC-09 |
| US-101 | AC1 搜尋多選、新選取置末位 | AC-18、AC-19 |
| US-101 | AC2 上移／下移調序 | AC-20、AC-21 |
| US-101 | AC3 送出前取消勾選 | AC-22 |
| US-101 | AC4 儲存後順序持久化 | AC-23 |
| US-101 | AC5 解除關聯不影響其餘順序 | AC-24 |
| US-101 | AC6 前後台依序列出 | AC-25 |
| US-101 | AC7 無關聯附錄之呈現 | AC-26 |
| US-101 | AC8 下載觸發稽核 | AC-27（另 AC-28／AC-29／AC-30 為衍生邊界） |
| US-102 | AC1 附錄池清單（搜尋＋格式篩選） | AC-16 |
| US-102 | AC2 上傳新附錄至池 | AC-01、AC-03（上傳規則以 US-100 為權威） |
| US-102 | AC3 檢視被哪些文件使用 | AC-17 |
| US-102 | AC4 移除之關聯保護 | AC-10 |
| US-102 | AC5 角色權限 | AC-31、AC-32、AC-33（另 AC-34 補前台路徑） |
| US-102 | AC6 覆蓋共用（≥2）警示 | AC-11（另 AC-15 驗證優先序） |
| US-102 | AC7 引用 ≤1 直接覆蓋 | AC-12 |
| US-102 | AC8 覆蓋後舊檔即時失效、不留版本 | AC-13 |
| US-102 | AC9 覆蓋警示時取消 | AC-14 |

## Error Scenarios

| 錯誤碼 | HTTP | 觸發情境 |
|---|---|---|
| `FILE_FORMAT_NOT_ALLOWED` | 400 | 上傳／覆蓋之副檔名不在 `xlsx／xls／pdf` 白名單 |
| `FILE_SIZE_EXCEEDED` | 400 | 單檔 > 50MB |
| `APPENDIX_NAME_TOO_LONG` | 400 | 名稱（trim 後，含 fallback 檔名）> 400 字元 |
| `APPENDIX_NOT_FOUND` | 404 | 指定 `appendixId` 不存在（關聯／覆蓋／移除／下載） |
| `APPENDIX_IN_USE` | 409（需二次確認） | 移除仍被 N ≥ 1 份文件引用之附錄且未確認 |
| `APPENDIX_OVERWRITE_SHARED` | 409（需二次確認） | 覆蓋被 N ≥ 2 份文件引用之附錄且未確認 |
| `FILE_ACCESS_DENIED` | 403 | 未授權者直接組合網址存取附錄檔 |
| `PERMISSION_DENIED` | 403 | 無「附錄管理」功能權限之角色呼叫後台端點 |
| `FIELD_WRITE_FORBIDDEN` | 403 | 對「附錄」欄位為唯讀之角色（含 SysAdmin）觸發寫入類動作 |
| `DOCUMENT_NOT_FOUND` | 404 | 關聯／詳情查詢之 `documentId` 不存在 |

詳細語意與重試／回退：見 [error-handling.md#appendix](../error-handling.md#appendix)、[error-handling.md#file](../error-handling.md#file)、[error-handling.md#permission](../error-handling.md#permission)。稽核寫入失敗之補償：見 [error-handling.md#audit](../error-handling.md#audit)、[F023](F023-audit-logging.md)。

## Interface Contract（端點）

> 路徑沿用既有慣例（後台 `/admin/...`；前後台共用 `/documents/:documentId/...`），並與 F018 之 `usage-forms` 端點一一對位。

| 方法 | 路徑 | 權限閘門 | 說明 |
|---|---|---|---|
| GET | `/admin/appendices` | 功能 `附錄管理` read | 附錄池清單（名稱／格式／大小／上傳者／上傳時間） |
| GET | `/admin/appendices/overview` | 功能 `附錄管理` read | 附錄池總覽：每筆附 `docCount` ＋關聯文件精簡清單（文件編號＋名稱）＋上傳者姓名／部門（供 US-102 AC1／AC3 一次載入） |
| POST | `/admin/appendices` | 功能 `附錄管理` read ＋ 欄位 `附錄` write | multipart 上傳（欄位名 `files`）。單檔可帶選填 `name`；多檔不接受 `name`、先全部驗證再全部建立 |
| PUT | `/admin/appendices/:appendixId` | 同上 | 覆蓋上傳（欄位名 `file`；`?confirmed=true` 放行共用警示）。**不改名稱** |
| DELETE | `/admin/appendices/:appendixId` | 同上 | 自池移除（`?confirmed=true` 一併解除全部關聯） |
| GET | `/admin/appendices/:appendixId/download` | 功能 `附錄管理` read | 後台個別下載（核發短效期 URL；管理存取，**不寫稽核、不燒錄浮水印**，比照 F026 OQ-FM-01） |
| POST | `/admin/documents/:documentId/appendices` | 同寫入 | **附加**關聯：body `{ appendixIds: string[] }`，依陣列順序接續現有最大 `sortOrder` 之後；已存在之關聯忽略且其 `sortOrder` 不變 |
| PUT | `/admin/documents/:documentId/appendices` | 同寫入 | **取代整組關聯並依陣列索引重寫 `sortOrder`（1-based）**；建立／編輯畫面送出「已選＋排序」最終狀態之權威路徑（delete-then-insert replace-set，單一交易，比照 [F014](F014-accountable-dept-chief.md) 多值欄位既有模式） |
| DELETE | `/admin/documents/:documentId/appendices/:appendixId` | 同寫入 | 解除單一關聯；附錄仍留於池中，剩餘關聯重新編號為連續 1..N |
| GET | `/documents/:documentId/appendices` | 功能 `前台瀏覽` read | 前後台共用之文件附錄清單，**依 `sortOrder` 遞增排序回傳** |
| GET | `/documents/:documentId/appendices/:appendixId/download` | 功能 `下載列印文件` read | 前台下載＋**寫稽核**（`targetType=APPENDIX`、`actionType=DOWNLOAD`） |

**與文件建立／編輯之整合**：[F010](F010-create-document.md)／[F011](F011-edit-with-comparison.md) 之建立／編輯 payload 若攜帶有序之 `appendixIds`，其語意等同上表 `PUT /admin/documents/:documentId/appendices`（取代整組並重寫 `sortOrder`）。實際採「文件端點內嵌」或「獨立呼叫附錄端點」由 system-architect 決定，但**兩路徑不得產生不同的排序語意**。

## Related

- **Prototype**：[24-appendix-management.html](../../../prototypes/24-appendix-management.html)（附錄管理頁之版面／結構／文案／欄寬權威）。
  建立／編輯之多選＋上移／下移（prototypes 14／15）、後台唯讀詳情（16）、前台詳情（04）之附錄區塊**尚未於 prototype 呈現**，待 ui-ux-designer 傳播；本規格僅規範行為與資料契約，不規範版面。
- **Data**：[APPENDIX_POOL／DOC_APPENDIX](../data-model.md#appendix-entity)、[AUDIT_LOG](../data-model.md#auditlog-entity)、[ICSOP_DOCUMENT](../data-model.md#document-entity)
- **權限**：[F025](F025-role-function-matrix.md)（功能列「附錄管理」）、[F026](F026-role-field-matrix.md)（欄位列「附錄（多）」）
- **稽核**：[F023](F023-audit-logging.md)（`AuditWriter` 契約＋`targetType=APPENDIX` additive 擴充）、[F024](F024-access-history-query.md)（類型「文件」篩選涵蓋 `APPENDIX`）
- **同構樣板**：[F018](F018-usage-form-management.md)（除排序外逐項同構；F018 之覆蓋門檻敘述落差見 [open-questions.md](../open-questions.md) OQ-E10-04）
- **Depends on**：[F010](F010-create-document.md)（文件關聯之前提）、[F016](F016-pdf-ojt-attachment.md)（共用 `file-rules` 白名單機制與 Blob 存取層）
- **顯示於**：[F019](F019-public-list-browsing.md)（前台文件詳情）
- **定案**：格式／大小（OQ-E04-06／OQ-E05-02）、跨文件共用（OQ-E05-04）、覆蓋不留版本（OQ-E05-05，門檻 ≥2）、下載不燒錄浮水印（OQ-E05-03）、自訂排序與分類延後（E10 epic-brief Open Questions 1／2）
- **未決（不阻塞實作）**：[open-questions.md](../open-questions.md) OQ-E10-01～OQ-E10-05
