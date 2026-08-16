# F039: 附錄管理
Priority: P1 | Status: Draft（規格已依 E10 stories 定稿；待 system-architect → ui-ux-designer → 人類閘門 → 實作） | Last Updated: 2026-08-06
Epic/Story: E10 / US-100, US-101, US-102

> **權威來源**：[E10 epic-brief](../../stories/epics/E10-appendix/epic-brief.md)、[US-100](../../stories/epics/E10-appendix/US-100-appendix-upload.md)、[US-101](../../stories/epics/E10-appendix/US-101-appendix-document-association.md)、[US-102](../../stories/epics/E10-appendix/US-102-appendix-pool-management.md)。
> **與 [F018](F018-usage-form-management.md) 之關係**：生命週期、共用語意、權限與稽核義務與使用表單同構，故版型比照 F018；
> 但**附錄多出「每份文件內之顯示順序」（`sortOrder`）**，此為刻意的結構性差異（使用表單無此概念），
> 凡涉排序之條款皆非鏡射 F018，須逐條實作與驗證。
>
> **🔴 2026-08-16 delta（使用者裁決；缺失／變更 delta 第 5b／14 項）**：① **前台**下載之 PDF 格式附錄**改為燒錄浮水印**（推翻本檔既有定案，見 [§前台附錄下載燒錄](#front-burn-delta)）；② 附錄管理頁**新增匯出清單功能**（CSV，見 [§附錄池匯出](#export-delta)）。**本 delta 之 AC 編號採 `AC-D#`**（D＝2026-08-16 defect delta），與本檔既有 `AC-01`～`AC-34` 之編號空間區隔、不重號。
> 🔴 **後台附錄管理頁之個別下載（`GET /admin/appendices/:appendixId/download`）維持 RAW、不燒錄、不寫稽核，一字不改**——使用者裁定「只做前台，後台維持 RAW」，[F026](F026-role-field-matrix.md) OQ-FM-01（2026-07-24）**維持有效**；缺失 delta 第 15 項（後台附錄下載燒錄）**明確不做**。

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
7. **前台下載附錄** → 寫入稽核（`targetType=APPENDIX`、`actionType=DOWNLOAD`、`appendixId`＋`documentId` 皆落列）。**PDF 格式者燒錄浮水印；非 PDF 者維持原檔**（2026-08-16 使用者裁決，見下）。
8. **匯出附錄池清單（US 外，2026-08-16 使用者裁決）**：附錄管理頁提供「匯出」動作，將**當前篩選條件之全部結果**輸出為 CSV（見 [§附錄池匯出](#export-delta)）。

### 前台附錄下載燒錄（🔴 2026-08-16 使用者裁決推翻既有定案） {#front-burn-delta}

**現行定案（2026-08-16 起）**：
- **前台**文件詳情頁下載之附錄，`format = pdf` 者**必須於伺服器端將浮水印燒錄進 PDF 內容層**（格式權威同 [NFR-007](../nfr.md#watermark)、機密聲明另起一行、比照 [F020](F020-watermark.md)）；`format ∈ {xlsx, xls}` 者**維持原檔位元組不作任何處理**，並於前台清單該列明示逐字文案 `此格式不支援浮水印`（策略 A，OQ-D18-02）。
- **後台**附錄管理頁之個別下載**維持原檔（RAW）、不燒錄、不寫稽核**，一字不改（OQ-FM-01 維持有效）。
- 前台下載之**稽核義務不變**：燒錄與否皆恰寫入一筆 `targetType=APPENDIX` 之 `DOWNLOAD` 紀錄（AC-27 不變，OQ-D18-03）。

📝 **2026-08-16 使用者裁決推翻，理由：使用者明確要求「前台 document detail 附錄的下載缺少浮水印」應予燒錄（缺失 delta 第 5b 項）**。
被推翻之原條文**逐字保留於此供追溯**：

> ### 下載浮水印（已定案：不燒錄）
> 附錄下載**不燒錄浮水印**，沿用 OQ-E05-03 對使用表單之定案值（僅 ICSOP 文件本身經前台檢視器路徑燒錄，見 [F020](F020-watermark.md)）。
> 本條為**已定案事項**，非開放問題；規格中不得再以「未定案」措辭描述。附錄多為 .xlsx，本無 PDF 浮水印可燒，與 [F026](F026-role-field-matrix.md) 之 OQ-FM-01 裁決一致。

⚠ **推翻範圍嚴格限於前台路徑**。原條文所援引之兩項理由，其現況為：
- **OQ-E05-03**（使用表單不燒錄）：✅ **已於同日第二次人類閘門一併推翻**——spec-writer 提報之 **`OQ-D18-25`**（「附錄之 PDF 燒錄、使用表單之 PDF 不燒錄」之不對稱）經使用者裁定「**使用表單 PDF 也燒錄（前台）**」。⇒ **前台燒錄範圍收斂為一致之四路徑**（檢視器／附件／附錄／使用表單），**雙生結構之分歧已消除**。使用表單側之權威改寫見 [F018 §前台使用表單下載燒錄](F018-usage-form-management.md#front-burn-delta)。
- **「附錄多為 .xlsx，本無 PDF 浮水印可燒」**：此觀察仍然為真，正是採**策略 A**（僅 PDF 燒錄）而非策略 B（轉檔）／C（Office 原生浮水印）／D（禁止非 PDF）之理由；使用者已知悉「需求無法對 .xlsx 100% 滿足」此一前提。
- **OQ-FM-01**（後台維持 RAW）：**未被推翻、仍然有效**。

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
| **匯出時符合筆數為 0**（2026-08-16） | 產生**僅含表頭列**之 CSV，非錯誤、非空檔（AC-D9） |
| **匯出時符合筆數 > 10,000**（2026-08-16） | 400 `EXPORT_ROW_LIMIT_EXCEEDED`，**不產生任何檔案**；提示縮小篩選條件（AC-D8） |
| **前台下載非 PDF 附錄**（2026-08-16） | 原始檔位元組、不燒錄；該列於前台清單顯示 `此格式不支援浮水印`（AC-D2） |

## Postconditions

- 文件持有 0..* 附錄；同一份附錄可被 0..* 份文件引用（多對多）。
- 任一文件之關聯集合，其 `sortOrder` 恆為 **1..N 之連續整數且互異**（無重複、無缺口）。
- 前台與後台詳情頁所見附錄集合與順序完全一致（共用同一 API）。
- 附錄池記錄僅保存當前版本；覆蓋後舊 blob 已回收，且不可經任何引用文件存取。
- 前台每次成功下載附錄，`AUDIT_LOG` 恰增加一筆 `targetType=APPENDIX` 之紀錄（**燒錄與否不改變本義務**，2026-08-16）。
- **（2026-08-16）** 前台下載之 `format = pdf` 附錄，其位元組之 PDF 內容層必含浮水印；後台下載同一附錄之位元組為原始檔且不含浮水印，兩者不相等。
- **（2026-08-16）** 匯出產生之 CSV 恆以 UTF-8 BOM 開頭，且其資料列數等於當前篩選之全部符合筆數（≤ 10,000）。

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
- **AC-29**（**🔴 2026-08-16 使用者裁決推翻，就地改寫；理由：使用者要求前台附錄下載須燒錄浮水印（缺失 delta 第 5b 項）**）：Given 前台下載一份 `format = pdf` 之附錄成功，When 檢查回應之檔案內容，Then 其 **PDF 內容層已燒錄浮水印**（非原始檔位元組、非僅前端疊加），字串格式與欄位順序同 [NFR-007](../nfr.md#watermark)、機密聲明另起一行；Given 下載 `format ∈ {xlsx, xls}` 之附錄，Then 為**原始檔位元組、未經任何浮水印處理**（策略 A）。<br>📝 **被推翻之原條文（逐字保留供追溯）**：「Given 前台下載附錄成功，When 檢查回應之檔案內容，Then 為原始檔位元組、**未疊加或燒錄浮水印**（已定案）。」<br>⚠ **後台下載不適用本條**——見 AC-D3。
- **AC-30**：Given `AUDIT_LOG` 中存在 `targetType='APPENDIX'` 之紀錄，When 於 [F024](F024-access-history-query.md) 調閱歷程以類型「文件」篩選查詢，Then 該筆納入結果（「文件」類＝`DOCUMENT` ∪ `USAGE_FORM` ∪ `APPENDIX`）。

### 權限

- **AC-31**（US-102 AC5）：Given 角色為 ICSOPAdmin，When 存取附錄管理之查詢與寫入端點，Then 全數允許（CRUD）。
- **AC-32**（US-102 AC5）：Given 角色為 SysAdmin，When 呼叫附錄池查詢／關聯檢視／後台下載端點，Then 允許；When 呼叫上傳／覆蓋／移除／關聯／解除關聯端點，Then 拒絕（欄位層 403 `FIELD_WRITE_FORBIDDEN`，與 F018 之守門鏈一致）。
- **AC-33**（US-102 AC5）：Given 角色為 Supervisor／DeptContact／User，When 呼叫任一 `/admin/appendices*` 或 `/admin/documents/:documentId/appendices*` 端點，Then 路由層拒絕，回 403 `PERMISSION_DENIED`。
- **AC-34**：Given 任一已登入角色（含 User），When 開啟文件詳情之附錄清單或下載附錄，Then 允許（屬前台瀏覽／下載列印權限，不受「附錄管理」功能權限限制）。

### 前台燒錄與附錄池匯出 delta（🔴 2026-08-16 使用者裁決；缺失／變更 delta 第 5b／14 項） {#export-delta}

> 前提裁決：**OQ-D18-01**→只做前台、後台維持 RAW；**OQ-D18-02**→策略 A（僅 PDF 燒錄、非 PDF 明示不支援）；**OQ-D18-03**→前台燒錄後仍寫稽核；**OQ-D18-16**→CSV UTF-8 **with BOM**、範圍＝當前篩選之全部結果、上限 10,000 筆、欄位＝畫面所見、檔名含時間戳、**向 [error-handling.md#export](../error-handling.md#export) 之共用規則對齊**。
> 🔴 **2026-08-16 事實更正（system-architect 查證，spec-writer 據以改寫）**：`OQ-D18-16` 原表述為「與 [F024](F024-access-history-query.md) 既有匯出**同構**」，惟 **F024 之匯出並不產生 CSV 檔案**（`GET /admin/access-history/export` 回傳 JSON `{rows,total}`，前端收到後直接丟棄、僅跳 toast）。⇒ **無可對齊之既有樣板**，三處匯出之 CSV 產生器為**淨新增**；「同構」之基準改為本次新寫之 [#export](../error-handling.md#export) 共用規則。**此為措辭與基準之更正，不改變任何格式要求之實質內容。**
> ⚠ **範圍紀律（不變）**：本 delta **不得改動 [F024](F024-access-history-query.md) 之任何 AC 或既有行為，亦不得為其「匯出不產生檔案」之缺口撰寫任何 AC**——該缺口已如實登錄於 [open-questions.md](../open-questions.md) `OQ-D18-26`，F024 不在本 delta 範圍。

#### 前台燒錄（#5b）

- **AC-D1**（前台 PDF 附錄燒錄）：Given 一般使用者於前台文件詳情頁下載一份 `format = pdf` 之附錄, When 下載完成, Then 回應之位元組其 PDF 內容層**已燒錄浮水印**，其字串與同一使用者於同一時刻經 [F020](F020-watermark.md) 檢視器下載所得之浮水印**逐字相同**（僅時間戳依當下產生）；`PdfBurner.burnPdf` 之 spy **呼叫次數為 1**。
- **AC-D2**（非 PDF 原檔＋UI 明示）：Given 某附錄之 `format ∈ {xlsx, xls}`, When 於前台文件詳情頁下載, Then 回應之位元組與 Blob 中之原始檔**逐位元組相同**、`PdfBurner.burnPdf` 之 spy **呼叫次數為 0**；且 When 渲染前台詳情頁之附錄清單, Then 該列顯示逐字文案 `此格式不支援浮水印`；`format = pdf` 之列**不得**出現該文案（`within(pdfRow).queryByText('此格式不支援浮水印') === null`）。<br>📌 **「回應之位元組」＝應用層代理回傳之 body，非 SAS URL**：本條隱含**前台一律代理串流（非 PDF 亦然）**，此為 architecture-spec §5.2「非浮水印檔案走 SAS Token」之**刻意例外、僅限前台路徑**（後台仍走 SAS），理由與完整契約見 [F020](F020-watermark.md#front-burn-scope-delta) `AC-D3a`——**不得**日後以「與 §5.2 不一致」為由改回 SAS。<br>📌 **UI 旗標之資料來源**：`此格式不支援浮水印` 之呈現依據為**伺服器端旗標**（`GET /documents/:documentId/appendices` 每列 additive 回傳之布林欄），**前端不得自行以 `format` 字串重算**——判定式只能有一份，且它已是伺服器端決定是否呼叫 `burnPdf` 之同一分支；前端重算日後必與白名單擴充漂移，且漂移形式為「UI 說支援、實際沒燒」之靜默錯誤。<br>⚠ **策略 A 之定義邊界（明示不修）**：格式判定以**上傳時經白名單驗證之 `APPENDIX_POOL.format`** 為權威（非 `content-type`——後者為客戶端可控輸入）。故將 PDF 更名為 `.xlsx` 上傳者於前台不燒錄；上傳者恆為受信任之 ICSOPAdmin，威脅模型不成立，本輪**不做 magic-byte 嗅探**。
- **AC-D3**（🔒 後台 RAW 回歸鎖定）：Given 同一份 `format = pdf` 之附錄, When 以 ICSOPAdmin 或 SysAdmin 自**後台附錄管理頁**點擊個別下載, Then 取得**原始檔位元組**（與 Blob 逐位元組相同）、`PdfBurner.burnPdf` 之 spy **呼叫次數為 0**、**不寫入任何稽核**；且該位元組與 AC-D1 所得之前台位元組**不相等**。既有 AC-28（未授權者 403、不核發 URL、不寫稽核）維持不變。

#### 附錄池匯出（#14）

- **AC-D4**（匯出動作存在與權限）：Given 角色為 ICSOPAdmin 或 SysAdmin 進入附錄管理頁, When 檢視 topbar 動作區, Then 存在無障礙名稱為 `匯出` 之按鈕（icon 鍵 `download`，比照 [F024](F024-access-history-query.md) 既有匯出鈕之呈現慣例）；Given 角色為 Supervisor／DeptContact／User 直接呼叫匯出端點, When 請求, Then 回 403 `PERMISSION_DENIED`（路由層，比照 AC-33）。<br>📌 **匯出為讀取類動作**：SysAdmin 唯讀角色**允許匯出**（比照 AC-32 之「查詢／關聯檢視／後台下載允許」）。
- **AC-D5**（匯出範圍＝當前篩選之全部結果）：Given 附錄池共 120 筆、頁面每頁 50 筆且目前位於第 1 頁、已套用格式篩選 `excel` 使符合者為 80 筆, When 點擊匯出, Then 產生之 CSV **恰含 80 筆資料列**（＋1 列表頭），**非**當前頁之 50 筆；Given 未套用任何篩選, Then 含全部 120 筆。
- **AC-D6**（CSV 格式與欄位）：Given 匯出成功, When 檢視檔案, Then ① 其位元組**以 UTF-8 BOM（`EF BB BF`）開頭**（否則 Excel 開啟中文亂碼）；② 第 1 列為表頭，其欄位逐字為 `附錄名稱,格式,大小,上傳者,上傳時間,關聯文件數`（＝畫面所見六欄，「操作」欄不匯出；畫面之「上傳者 / 上傳時間」單一欄於 CSV 拆為兩欄）；③ 欄值含 `,`／`"`／換行時以雙引號包覆並將內部 `"` 逸出為 `""`（RFC 4180）；④ 列序與畫面當前排序一致。<br>⚠ **③ 之逸出須在 `AC-D11` 之注入前綴之後套用**（先加前綴、再引號包覆）。
- **AC-D7**（檔名含時間戳）：Given 匯出成功, When 檢視 `Content-Disposition` 之 `filename`, Then 其形狀為 `appendices_{YYYYMMDD}_{HHmmss}.csv`（伺服器時間，UTC+8，比照 [NFR-007](../nfr.md#watermark) OQ-NFR007b 之時區慣例）。
- **AC-D8**（🔴 匯出筆數上限）：Given 符合當前篩選之結果為 10,001 筆, When 點擊匯出, Then 回 **400 `EXPORT_ROW_LIMIT_EXCEEDED`**（訊息含上限值 10,000 並提示縮小篩選條件），**不產生任何檔案**；Given 恰為 10,000 筆, Then 匯出成功（邊界值含）。
- **AC-D9**（空結果匯出）：Given 當前篩選之結果為 0 筆, When 點擊匯出, Then 產生**僅含表頭列**之 CSV（非錯誤、非空檔）。
- **AC-D10**（🔒 **不外溢**回歸鎖定；**2026-08-16 就地改寫**）：Given 本 delta 之匯出實作完成, When 檢視 [F024](F024-access-history-query.md) 之 `GET /admin/access-history/export` 與其前端匯出處理, Then **兩者皆與本 delta 導入前逐字相同**（`git diff` 於該 controller 與該頁之匯出區段為空）——本 delta **不得**順手使 F024 開始輸出 CSV、亦不得改其 JSON 回應形狀；若共用 CSV 產生器，該產生器**須以參數承接欄位定義與 scope**，F024 既有程式路徑不因此被修改。<br>📝 **2026-08-16 就地改寫，理由：原條文鎖住的是 no-op**。原條文為「…Then 其**端點、參數、輸出欄位與檔名逐字與本 delta 導入前相同**…」——「輸出欄位與檔名」預設 F024 會輸出一份有欄位、有檔名之 CSV，而 system-architect 查證 **F024 從未產生任何檔案**，該斷言無可驗證之對象。改寫後之驗證標的改為「F024 既有程式路徑未被觸及」，範圍紀律 J 之語意不變。

- **AC-D11**（🔴 CSV 注入防護；2026-08-16 lead 裁定）：Given 某附錄之 `name` 為 `=cmd|'/c calc'!A1`, When 匯出, Then 該儲存格於 CSV 中之值為 `'=cmd|'/c calc'!A1`（**最前面多一個半形單引號**），再依 RFC 4180 引號包覆與逸出；Given `name` 分別以 `+`、`-`、`@`、Tab（`\t`）、CR（`\r`）開頭, Then 同樣加前綴；Given `name` 為 `作業對照表`（不以上述六種字元開頭）, Then **不加任何前綴**（轉換為恆等）。**表頭列不套用本規則**（`AC-D6` ② 之逐字表頭斷言不受影響）。<br>⚠ **對 `AC-D6` 值層斷言之影響（test-generator 必讀）**：本 AC 使「CSV 儲存格值 ＝ 畫面所見字串」**不再恆成立**——凡以上述六種字元開頭者相差一個前導 `'`。故 `AC-D6` 之「欄位＝畫面所見」僅約束**表頭與欄位集合**；**值層之期望值一律為「畫面所見字串經本規則轉換後之結果」**，不得直接以畫面原字串斷言。規則權威＝[error-handling.md#export](../error-handling.md#export)。<br>📌 **理由（不得省略）**：Excel／LibreOffice 會把 `=` 開頭之儲存格當公式執行（DDE 執行、`HYPERLINK` 資料外洩）；附錄名稱為 ICSOPAdmin 可自訂之字串，為真實可達之注入面。
- **AC-D12**（🔴 匯出之使用者可見回饋；**2026-08-16 補訂**，權威＝`prototypes/24-appendix-management.html`）：Given 匯出成功, When 檢視回饋, Then 其文字**以逐字片段 `已匯出附錄清單（CSV，UTF-8 BOM）` 起始**（其後可附筆數與表頭資訊，該部分不逐字約束）。<br>When 符合筆數超過上限, Then 錯誤回饋之文字**含逐字片段** `符合條件之筆數為 {N} 筆，超過匯出上限 10000 筆，請縮小篩選條件`（`{N}` 為實際筆數），**且字串 `EXPORT_ROW_LIMIT_EXCEEDED` 出現於同一回饋容器內**。<br>📝 **2026-08-16 斷言方式調整（ringC 回報 `ToastApi` 無 code 參數）**：原寫「並附錯誤碼標記 `EXPORT_ROW_LIMIT_EXCEEDED · 400`」隱含錯誤碼為獨立元素，該形狀不可達；改為兩段式，達成方式不拘。規則權威＝[error-handling.md#export](../error-handling.md#export)。<br>⚠ **與 [F037](F037-document-change-history.md#export-delta) `AC-D10`／[F038](F038-lifecycle-tree-change-history.md#export-delta) `AC-D6` 之句式差異為刻意**：本頁之範圍限定詞為「**篩選**條件」（附錄池為篩選式清單）、變更歷程兩 tab 為「**查詢**條件」，且本頁量詞為「筆數」、變更歷程為「事件」。三處**不得**互相對齊為同一句。<br>📌 **本條之存在理由**：[error-handling.md#export](../error-handling.md#export) 只規定「訊息含上限值並提示縮小條件」之語意、未定逐字；本輪約束環為簡化版（僅 jest/vitest）⇒ AC 是唯一防線。
- **AC-D13**（🔴 CSV 值層格式；**2026-08-16 補訂**，lead 裁示）：Given 匯出成功, When 檢視資料列之各儲存格值, Then 下列成立——
  - ① **`格式` 欄**之值為 `APPENDIX_POOL.format` 之原值（`xlsx`／`xls`／`pdf`），與畫面該欄逐字相同。
  - ② **`大小` 欄**之值 **＝ 畫面所見之同一格式化結果**（人類可讀，如 `56 KB`；數字與單位間一個**半形空格**），且 CSV 與畫面**共用同一格式化函式**（後端不得另寫一份）。可驗證邊界：`57344` bytes → `56 KB`；`52428800` bytes → `50 MB`。<br>📌 **不輸出原始 bytes**——「欄位＝畫面所見」；若日後需機器可讀之位元組數，應**新增一欄**而非改本欄。
  - ③ **`上傳時間` 欄**之值為 **`YYYY-MM-DD HH:mm:ss`**（UTC+8，**不附 `(UTC+8)` 字樣**；顯式 +8 位移，不得依賴行程 TZ）。<br>⚠ **本項為「欄位＝畫面所見」原則之唯一明列例外，且範圍僅限時間戳欄**：畫面因欄寬限制只顯示日期（`prototypes/24` 之 `at:'2026-06-10'`），但**匯出為存查用途，日期粒度不足以區分同日多次覆蓋**（`uploadedAt` 於每次覆蓋皆更新）。此為 spec-writer 之判斷，已如實標明；若 lead 認為應與畫面完全一致（僅 `YYYY-MM-DD`），改動範圍僅本項一句。
  - ④ **`上傳者` 欄**之值為上傳（或最後覆蓋）者之姓名，與畫面該欄逐字相同；**`關聯文件數`** 為十進位整數（無千分位、無單位後綴）。
  - 規則權威＝[error-handling.md#export](../error-handling.md#export) 之「值層通則」。
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
| `EXPORT_ROW_LIMIT_EXCEEDED` | 400 | **（2026-08-16 新增）** 匯出之符合筆數 > 10,000（訊息含上限值），不產生檔案 |

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
| GET | `/admin/appendices/:appendixId/download` | 功能 `附錄管理` read | 後台個別下載（核發短效期 URL；管理存取，**不寫稽核、不燒錄浮水印**，比照 F026 OQ-FM-01）。<br>🔴 **2026-08-16 經使用者再次確認維持不變**——缺失 delta 第 15 項（後台附錄下載燒錄）**明確裁定不做**；本列一字不改（AC-D3 回歸鎖定） |
| GET | `/admin/appendices/export` | 功能 `附錄管理` read | **（2026-08-16 新增）** 匯出附錄池清單為 CSV；接受與 `GET /admin/appendices/overview` **相同之篩選參數**（關鍵字／格式），匯出範圍＝符合該篩選之**全部結果**（非僅當前頁）；超過 10,000 筆回 400 `EXPORT_ROW_LIMIT_EXCEEDED`。**不寫稽核**（管理存取，比照後台下載） |
| POST | `/admin/documents/:documentId/appendices` | 同寫入 | **附加**關聯：body `{ appendixIds: string[] }`，依陣列順序接續現有最大 `sortOrder` 之後；已存在之關聯忽略且其 `sortOrder` 不變 |
| PUT | `/admin/documents/:documentId/appendices` | 同寫入 | **取代整組關聯並依陣列索引重寫 `sortOrder`（1-based）**；建立／編輯畫面送出「已選＋排序」最終狀態之權威路徑（delete-then-insert replace-set，單一交易，比照 [F014](F014-accountable-dept-chief.md) 多值欄位既有模式） |
| DELETE | `/admin/documents/:documentId/appendices/:appendixId` | 同寫入 | 解除單一關聯；附錄仍留於池中，剩餘關聯重新編號為連續 1..N |
| GET | `/documents/:documentId/appendices` | 功能 `前台瀏覽` read | 前後台共用之文件附錄清單，**依 `sortOrder` 遞增排序回傳** |
| GET | `/documents/:documentId/appendices/:appendixId/download` | 功能 `下載列印文件` read | 前台下載＋**寫稽核**（`targetType=APPENDIX`、`actionType=DOWNLOAD`）。<br>🔴 **2026-08-16 改寫**：`format = pdf` 者**於伺服器端燒錄浮水印後回傳**（位元組流經應用層，不再核發 SAS 由前端直取）；非 PDF 者維持原檔。**前台/後台之分流方式由 system-architect 決定**——不得以「讓前後台共用之 `GET /documents/attachments/download` 一律燒錄」達成（該端點之呼叫端含後台三頁，會違反 OQ-FM-01） |

**與文件建立／編輯之整合**：[F010](F010-create-document.md)／[F011](F011-edit-with-comparison.md) 之建立／編輯 payload 若攜帶有序之 `appendixIds`，其語意等同上表 `PUT /admin/documents/:documentId/appendices`（取代整組並重寫 `sortOrder`）。實際採「文件端點內嵌」或「獨立呼叫附錄端點」由 system-architect 決定，但**兩路徑不得產生不同的排序語意**。

## Related

- **Prototype**：[24-appendix-management.html](../../../prototypes/24-appendix-management.html)（附錄管理頁之版面／結構／文案／欄寬權威）。
  建立／編輯之多選＋上移／下移（prototypes 14／15）、後台唯讀詳情（16）、前台詳情（04）之附錄區塊**尚未於 prototype 呈現**，待 ui-ux-designer 傳播；本規格僅規範行為與資料契約，不規範版面。<br>
  **🔴 2026-08-16 待 ui-ux-designer 傳播（本 delta 新增）**：① `24-appendix-management.html` topbar 動作區新增「匯出」鈕（AC-D4）；② `04-public-document-detail.html` 之附錄清單，非 PDF 列須顯示逐字文案 `此格式不支援浮水印`（AC-D2），且該檔第 252 行既有註解「附錄不燒錄浮水印」須改寫為前台燒錄語意。
- **Data**：[APPENDIX_POOL／DOC_APPENDIX](../data-model.md#appendix-entity)、[AUDIT_LOG](../data-model.md#auditlog-entity)、[ICSOP_DOCUMENT](../data-model.md#document-entity)
- **權限**：[F025](F025-role-function-matrix.md)（功能列「附錄管理」）、[F026](F026-role-field-matrix.md)（欄位列「附錄（多）」）
- **稽核**：[F023](F023-audit-logging.md)（`AuditWriter` 契約＋`targetType=APPENDIX` additive 擴充）、[F024](F024-access-history-query.md)（類型「文件」篩選涵蓋 `APPENDIX`）
- **同構樣板**：[F018](F018-usage-form-management.md)（除排序外逐項同構；F018 之覆蓋門檻敘述落差見 [open-questions.md](../open-questions.md) OQ-E10-04）
- **Depends on**：[F010](F010-create-document.md)（文件關聯之前提）、[F016](F016-pdf-ojt-attachment.md)（共用 `file-rules` 白名單機制與 Blob 存取層）
- **顯示於**：[F019](F019-public-list-browsing.md)（前台文件詳情）
- **定案**：格式／大小（OQ-E04-06／OQ-E05-02）、跨文件共用（OQ-E05-04）、覆蓋不留版本（OQ-E05-05，門檻 ≥2）、~~下載不燒錄浮水印（OQ-E05-03）~~ → **🔴 2026-08-16 使用者裁決推翻（僅前台）：前台 PDF 附錄燒錄、非 PDF 維持原檔；後台維持 RAW（OQ-FM-01 有效）**，見 [§前台附錄下載燒錄](#front-burn-delta)、自訂排序與分類延後（E10 epic-brief Open Questions 1／2）
- **2026-08-16 使用者裁決**：OQ-D18-01／02／03／16（見 [§前台燒錄與附錄池匯出 delta](#export-delta)）
- **未決（不阻塞實作）**：[open-questions.md](../open-questions.md) OQ-E10-01～OQ-E10-04（**OQ-E10-05 已於 2026-08-16 償還結案**）。~~OQ-D18-25~~ **已於 2026-08-16 同日第二次人類閘門定案＝前台使用表單 PDF 一併燒錄**（推翻 `OQ-E05-03`），見 [F018 §front-burn-delta](F018-usage-form-management.md#front-burn-delta)
- **待 system-architect（本 delta 新增）**：① 前台附錄下載之燒錄路徑與後台 RAW 路徑之分流設計（見 [F020](F020-watermark.md#front-burn-scope-delta) `AC-D3`）；② 匯出端點之串流/緩衝策略與 10,000 筆上限之檢查時點（查詢前 count vs 產生中計數）；③ 三處匯出（[F024](F024-access-history-query.md)／本檔／[F037](F037-document-change-history.md)＋[F038](F038-lifecycle-tree-change-history.md)）是否共用同一 CSV 產生器
