# F018: 使用表單管理
Priority: P1 | Status: Implemented（unit-green；真 Azure Blob＋multipart＋下載稽核接真 AuditWriter；**前端管理頁已實作**（prototype 19 移植）；表單池總覽/個別下載端點（int 已備未跑）；**自訂表單名稱已接線**（public-seams：上傳 multipart 選填 `name`，trim／空值 fallback 檔名／上限 400 字＝`USAGE_FORM_NAME_TOO_LONG`；批次與覆蓋刻意不接受）；剩真 Azure 私有容器直存拒絕＝[integration]） | Last Updated: 2026-07-24
Epic/Story: E05 / US-040, US-041, US-042

> 合併理由：表單池管理（US-042）、上傳/移除（US-040）與前/後台關聯清單呈現與下載（US-041）為同一表單生命週期，共用同一組 API。
>
> **🔵 2026-08-16 additive delta（使用者裁決；缺失／變更 delta 第 18 項）——使用表單新增「表單編號」欄位**：`USAGE_FORM_POOL` 新增**選填、唯一**之 `formNumber`（供管理員設定），並呈現於使用表單管理頁清單與上傳／編輯表單。**本 delta 之 AC 編號採 `AC-D#`**（D＝2026-08-16 defect delta）。
> ⚠ **本項為 2026-08-16 delta 中唯一需 schema 變更＋migration 者**。加欄之前，須先**償還 `OQ-E10-05`**（`USAGE_FORM_POOL`／`DOC_USAGE_FORM` 尚未登錄於 data-model）——已於 [data-model.md#usage-form-entity](../data-model.md#usage-form-entity) 補登錄實體本體後再加欄，避免出現「只有新欄、沒有本體」之殘缺定義。
> 📌 **不擴及附錄**（OQ-D18-23）：`APPENDIX_POOL` **不**比照新增編號欄（使用者只提使用表單）。此不對稱已如實登錄為 [open-questions.md](../open-questions.md) `OQ-D18-23`，由人類日後決定是否補齊。
> **🔴 2026-08-16 人類閘門追加裁決（`OQ-D18-28`）——新增「編輯編號」動作**：使用表單管理頁每列新增一個**輕量之「編輯編號」入口**（形式由 ui-ux-designer 決定），**只改 `formNumber`、不碰檔案**。**理由**：存量表單之 `formNumber` 全為 `null`（無來源、migration 只能留空），若編號僅能於上傳時設定，**所有既有表單永遠補不上編號**，第 18 項需求對存量資料形同無效。**被否決之替代方案＝把編號欄加進覆蓋上傳彈窗**（會強迫為改一個編號而重傳檔案，且覆蓋共用表單將連帶影響所有引用文件並觸發 `USAGE_FORM_OVERWRITE_SHARED`）。AC 續編為 `AC-D16`～`AC-D20`，端點見 [§Interface Contract](#interface-contract)；**不新增錯誤碼、不新增矩陣列、不寫稽核**。
>
> **🔴 2026-08-16 CHANGE delta（同日第二次人類閘門；`OQ-D18-25` 定案）——前台使用表單下載改為燒錄浮水印**：**前台**文件詳情頁下載之 `format = pdf` 使用表單**必須燒錄浮水印**；非 PDF 維持原檔並於該列明示 `此格式不支援浮水印`（策略 A，與 [F039](F039-appendix-management.md#front-burn-delta) 附錄一致）。**此推翻 `OQ-E05-03` 之既有定案**（「使用表單暫不燒錄浮水印」），見 [§前台使用表單下載燒錄](#front-burn-delta)。AC 編號續用本檔 `AC-D#` 空間（`AC-D11`～`AC-D14`）。
> 🔴 **後台使用表單管理頁之個別下載維持 RAW、不燒錄、不寫稽核，一字不改**——[F026](F026-role-field-matrix.md) `OQ-FM-01`（2026-07-24）**維持有效**；缺失 delta #12／#13／#15 **明確不做**（`AC-D13` 回歸鎖定）。

## Description
使用表單採**集中表單池**模型：ICSOP 管理員於**獨立「使用表單管理」畫面**維護表單池（上傳/更新/移除、查詢、檢視關聯文件）；ICSOP 文件建立/編輯時，從表單池**可搜尋多選**關聯表單（**多對多**，一表單可被多份文件共用）。前台與後台文件詳情頁列出該文件所有關聯表單並可個別下載；前台下載觸發稽核（比照 F023）。檔案存 Azure Blob。**每份使用表單另可設定選填之「表單編號」（`formNumber`），全池唯一（2026-08-16 delta）。**

## Preconditions
- ICSOP 文件已存在（F010）。
- 上傳/移除者為 ICSOP 管理員（F025，表單管理僅 ICSOPAdmin 可寫）。

## Main Flow
1. **表單池管理（獨立畫面 US-042）**：ICSOP 管理員上傳 excel/pdf 至表單池 → 存 Blob、加入池；清單顯示**表單編號**/名稱/格式/大小/上傳者/**關聯文件數**，可展開檢視使用該表單之文件。<br>📝 **2026-08-16 additive**：原條文為「清單顯示名稱/格式/大小/上傳者/**關聯文件數**」，新增「表單編號」欄（置於「表單名稱」欄之前，AC-D1）。
   - **更新（覆蓋上傳，OQ-E05-05 定案）**：以新檔取代既有表單檔——**維持覆蓋語意、不保留歷史版本**（比照全域「僅保存當前版本」原則）。因表單為**跨文件共用**（OQ-E05-04），覆蓋會同時改變所有引用文件所見內容；故**若該表單另被 ≥1 份文件引用，覆蓋前須顯示「此表單另被 N 份文件引用，覆蓋將同時更新全部引用文件所見內容」警示並要求二次確認**（`USAGE_FORM_OVERWRITE_SHARED`）；確認後舊檔不再可經任何文件存取。
1a. **編輯編號（獨立輕量動作，2026-08-16 人類閘門追加裁決）**：清單每列提供「編輯編號」動作，**只更新 `formNumber`、不碰檔案**（不重傳、不觸發覆蓋共用警示）。此為既有表單補上編號之**唯一途徑**——存量列之 `formNumber` 全為 `null`，若僅能於上傳時設定則永遠補不上。見 [§「編輯編號」動作](#edit-number-action)。
2. **文件關聯**：文件建立/編輯（F010/F011）時自表單池可搜尋多選關聯表單（多對多）。
3. **移除表單**：若表單仍被文件關聯，二次確認（一併解除關聯）或提示先解除（`USAGE_FORM_IN_USE`）。
4. 文件詳情頁（前台/後台共用同一 API）列出該文件所有關聯表單之名稱與格式，提供個別下載連結。
5. 前台下載表單 → 記錄稽核（targetType=USAGE_FORM，actionType=DOWNLOAD）；**`format = pdf` 者於伺服器端燒錄浮水印後回傳，非 PDF 者維持原檔**（2026-08-16 使用者裁決，見 [§前台使用表單下載燒錄](#front-burn-delta)）。**後台下載一律 RAW、不寫稽核**（OQ-FM-01 有效）。

### 前台使用表單下載燒錄（🔴 2026-08-16 使用者裁決推翻 OQ-E05-03） {#front-burn-delta}

**現行定案（2026-08-16 起）**：
- **前台**文件詳情頁下載之使用表單，`format = pdf` 者**必須於伺服器端將浮水印燒錄進 PDF 內容層**（格式權威同 [NFR-007](../nfr.md#watermark)、機密聲明另起一行、比照 [F020](F020-watermark.md)）；`format ∈ {xlsx, xls}` 者**維持原檔位元組不作任何處理**，並於前台清單該列明示逐字文案 `此格式不支援浮水印`（策略 A，`OQ-D18-02`，與 [F039](F039-appendix-management.md#front-burn-delta) 附錄完全一致）。
- **後台**使用表單管理頁之個別下載**維持原檔（RAW）、不燒錄、不寫稽核**，一字不改（`OQ-FM-01` 維持有效）。
- 前台下載之**稽核義務不變**：燒錄與否皆恰寫入一筆 `targetType='USAGE_FORM'`／`actionType='DOWNLOAD'` 之紀錄；其 `watermarkSnapshot` 於 PDF（已燒錄）時落值、於非 PDF 時為 `null`（見 [data-model AUDIT_LOG](../data-model.md#auditlog-entity)）。

📝 **2026-08-16 使用者裁決推翻，理由：spec-writer 提報之 `OQ-D18-25` 不對稱（同一前台詳情頁上附錄 PDF 燒錄、使用表單 PDF 不燒錄）經人類閘門裁定「使用表單 PDF 也燒錄（前台）」**。
被推翻之 `OQ-E05-03` 原定案**逐字保留於此供追溯**：

> **定案**：使用表單暫不燒錄浮水印（僅 ICSOP 文件本身燒錄）。

⚠ **推翻範圍嚴格限於前台路徑**；「使用表單常為 .xlsx，本無 PDF 浮水印可燒」之觀察仍為真，正是採**策略 A**（僅 PDF 燒錄）之理由，使用者已知悉此前提。
📌 **前台燒錄範圍自此收斂為一致之四路徑**：檢視器（[F020](F020-watermark.md)）／詳情頁附件（ICSOP PDF・OJT）／詳情頁附錄（[F039](F039-appendix-management.md#front-burn-delta)）／詳情頁使用表單（本節）——**雙生結構之分歧已消除**。

## Alternative Flows
- 無關聯表單：詳情頁顯示「無使用表單」提示，非錯誤或空白區塊。
- 一次上傳多個 excel/pdf：全部成功建立關聯。
- **後台使用表單管理頁之個別下載（2026-08-16 經確認維持不變）**：核發短效期 SAS URL、伺服器不經手位元組，故**不燒錄浮水印、不寫稽核**（管理存取，比照 [F026](F026-role-field-matrix.md) `OQ-FM-01`）。⚠ 本檔無 Interface Contract 端點表（歷來以 Main Flow 與 AC 描述行為），故後台 RAW 之語意以本條 ＋ `AC-D13` 承載；端點層之前台/後台分流設計見 [F020](F020-watermark.md#front-burn-scope-delta) `AC-D3`（由 system-architect 定案）。

## Edge Cases
- 上傳非 excel/pdf（如 .docx）：拒絕並提示格式。
- 超過大小上限：拒絕（上限值未定義，OQ-E05-02）。
- 移除前二次確認取消：表單保留不受影響。
- **覆蓋共用表單（OQ-E05-05 定案）**：更新被 ≥1 份其他文件引用之表單時，須先提示引用文件數並二次確認；使用者取消則原檔保留不變。僅被當前單一文件引用或無其他引用時仍可覆蓋，但不出現跨文件警示（一般確認即可）。
- 使用表單下載是否也需浮水印：**已定案（2026-08-16 使用者裁決推翻 OQ-E05-03）＝前台 PDF 燒錄、前台非 PDF 維持原檔並明示 `此格式不支援浮水印`、後台一律 RAW**。見 [§前台使用表單下載燒錄](#front-burn-delta)。<br>📝 被推翻之原條文為「使用表單下載是否也需浮水印：**未定案（OQ-E05-03）**」→ 其後定案為「暫不燒錄」→ **2026-08-16 再推翻為前台燒錄**。<br>~~⚠ 2026-08-16 註記：同日使用者裁定「前台附錄之 PDF 須燒錄」但未提及使用表單，故本 feature 維持不燒錄…（`OQ-D18-25`）~~ **已於同日第二次人類閘門解消（`OQ-D18-25` 定案＝比照附錄燒錄）**。
- **前台下載非 PDF 使用表單**（2026-08-16）：原始檔位元組、不燒錄；該列於前台清單顯示 `此格式不支援浮水印`（`AC-D12`）。稽核照寫（`watermarkSnapshot = null`）。
- **表單編號為空**（2026-08-16）：既有表單一律留空、清單該欄顯示 `—`（不顯示 `null`／空白）；不自動產生編號。
- **表單編號唯一性比對**：比對前 **trim**、**不分大小寫**；`null` 不參與比對（多筆空編號可並存）。
- **表單編號僅為空白字元**（如 `"   "`）：trim 後為空 → 收斂為 `null`（**空字串不得落地**，比照 [error-handling.md#lifecycle-subcategory](../error-handling.md#lifecycle-subcategory) 之 `normalizeSubcategory` 慣例）。
- **以「編輯編號」動作送出與現值相同之編號**（2026-08-16）：**不視為衝突**（唯一性比對排除自身列），回 2xx；是否實際寫入 DB 由實作決定，可觀測結果為「成功且該列不變」。
- **對被 N ≥ 2 份文件引用之表單執行「編輯編號」**：**不出現任何覆蓋共用警示**（`USAGE_FORM_OVERWRITE_SHARED` 不得觸發）——編號更新與檔案覆蓋為兩條完全不同之路徑（`AC-D20`）。
- **「編輯編號」之並發**：兩個管理員同時對不同表單設定同一編號 → 以 DB filtered unique index 為最終保護，僅一筆成功、另一筆回 409 `USAGE_FORM_NUMBER_DUPLICATE`（比照 `AC-D5` 之雙保險）。

## Postconditions
- 文件持有 0..* 使用表單；前後台清單一致（共用 API）。
- `USAGE_FORM_POOL` 中 `formNumber` 非 `null` 之列，其 trim 後不分大小寫之值**全池唯一**。
- **（2026-08-16）** 前台下載之 `format = pdf` 使用表單，其位元組之 PDF 內容層必含浮水印；後台下載同一表單之位元組為原始檔且不含浮水印，兩者不相等。

## Acceptance Criteria
- Given 選擇 excel/pdf 上傳, When 送出, Then 存 Blob、建立關聯、顯示於清單。
- Given 選擇非 excel/pdf 格式, When 上傳, Then 拒絕並回 `FILE_FORMAT_NOT_ALLOWED`，不建立任何關聯。
- Given 文件已有多個表單, When 移除其一（二次確認）, Then 解除關聯並移除，其餘不受影響。
- Given 文件有 3 個關聯表單, When 開啟詳情頁, Then 正確列出 3 筆並各自可下載。
- Given 文件無關聯表單, When 開啟詳情頁, Then 顯示「無使用表單」提示。
- Given 未登入/無權限使用者組合下載網址存取表單, When 請求, Then 拒絕（`FILE_ACCESS_DENIED`）。
- Given 前台下載表單成功, When 下載完成, Then 同步寫入正確稽核紀錄。
- Given 表單另被 N（≥1）份文件引用, When 上傳新檔覆蓋, Then 顯示「另被 N 份文件引用，覆蓋將同時更新全部」警示並要求二次確認（`USAGE_FORM_OVERWRITE_SHARED`），確認後方覆蓋。
- Given 覆蓋確認完成, When 完成, Then 舊檔不再可經任何引用文件存取、全部引用文件所見即為新內容，且不保留歷史版本。
- Given 覆蓋警示出現時取消, When 取消, Then 原表單檔保留不變、關聯不受影響。

### 表單編號 delta（🔵 2026-08-16 使用者裁決；缺失／變更 delta 第 18 項） {#form-number-delta}

> 前提裁決：**OQ-D18-22**＝唯一（trim、不分大小寫）／可空（`nullable`）／既有列一律留空／不自動產生／MSSQL 以 **filtered unique index**（`WHERE formNumber IS NOT NULL`）實作；**OQ-D18-23**＝**不**擴及 `APPENDIX_POOL`，且 [F017](F017-backend-document-list.md) 之「使用表單」篩選下拉顯示字串改為 `{編號} {名稱}`。
> 欄位定義權威＝[data-model.md#usage-form-entity](../data-model.md#usage-form-entity)（本 delta 同時償還 `OQ-E10-05`，補登錄 `USAGE_FORM_POOL`／`DOC_USAGE_FORM` 實體本體）。

- **AC-D1**（清單欄位）：Given 進入使用表單管理頁, When 檢視表格表頭, Then 其欄位由左至右逐字為 `表單編號`／`表單名稱`／`格式`／`大小`／`上傳者 / 上傳時間`／`關聯文件數`／`操作`（**新增之「表單編號」置於首欄**）；`formNumber` 為 `null` 之列，該格顯示 `—`。
- **AC-D2**（上傳時可設定編號）：Given ICSOPAdmin 於上傳表單填入 `表單編號 = "  FM-001  "`, When 送出, Then 建檔之 `formNumber` 恰為 `"FM-001"`（trim 後值）；Given 未填或填入純空白, When 送出, Then `formNumber` 落地為 **`null`**（**不得為空字串**）。
- **AC-D3**（編輯既有表單之編號；**2026-08-16 人類閘門追加裁決後就地補實載體**）：Given 某既有表單之 `formNumber` 為 `null`, When ICSOPAdmin 自使用表單管理頁該列之**「編輯編號」動作**（見 `AC-D16`）設定為 `FM-002` 並儲存, Then 儲存成功、清單該列顯示 `FM-002`；When 再自同一動作清空並儲存, Then 落地為 `null`、清單顯示 `—`（**null → `FM-002` → null 之往返皆為合法操作**）。**覆蓋上傳（換檔）不改變 `formNumber`**（比照「覆蓋不改名稱」之既有語意）。<br>🔴 **驗證載體（兩處，缺一不可）**：① **前端頁面層**——使用表單管理頁存在該列動作、開啟後可輸入/清空並儲存，清單即時反映（`AC-D16` 之選擇器）；② **API 層**——直接呼叫編號更新端點（見 [§Interface Contract](#interface-contract)）亦達成同一往返，**不經 UI 亦成立**。<br>📝 **2026-08-16 補記（載體來源）**：本條原無 UI 載體——ui-ux-designer 於 prototype 傳播時回報「`19` 頁只有上傳 modal 可設定編號，既有表單無任何編輯入口」。經人類閘門裁決**新增「編輯編號」動作**（`AC-D16`～`AC-D20`），本條自此可驗證。
- **AC-D4**（🔴 唯一性）：Given 池中已有一筆 `formNumber = 'FM-001'`, When 以 `FM-001` 建立或編輯另一筆, Then 回 **409 `USAGE_FORM_NUMBER_DUPLICATE`** 且**不寫入任何記錄／不上傳 blob**；When 以 `fm-001`（大小寫不同）或 `'  FM-001  '`（前後空白）送出, Then **同樣**回 409（比對前 trim、不分大小寫）；When 編輯該筆自身而維持原值 `FM-001`, Then **不視為衝突**、儲存成功（排除自身列，比照 [F013](F013-document-number-uniqueness.md) 之既有慣例）。
- **AC-D5**（多筆空編號可並存）：Given 池中已有 3 筆 `formNumber = null`, When 再建立一筆未填編號者, Then 成功、不回 409（`null` 不參與唯一性比對）。<br>📌 **實作約束**：MSSQL 之一般 UNIQUE 索引視多個 `NULL` 為相等，故須以 **filtered unique index（`WHERE formNumber IS NOT NULL`）** 或等效機制實作；應用層另做同一驗證（雙保險，比照 [error-handling.md#document](../error-handling.md#document) 之並發處置）。
- **AC-D6**（長度上限）：Given `formNumber` trim 後長度為 101 字元, When 送出, Then 回 **400 `USAGE_FORM_NUMBER_TOO_LONG`** 且不建立記錄；Given 恰 100 字元, Then 建立成功。
- **AC-D7**（🔒 既有列不回填、不自動產生）：Given migration 執行完成, When 檢視既有全部 `USAGE_FORM_POOL` 列, Then 其 `formNumber` **一律為 `null`**（系統從未收集過此資訊、上游亦無對應欄位，**不得**塞入任何自動產生之假值）；且系統**不提供**任何自動編號機制。
- **AC-D8**（[F017](F017-backend-document-list.md) 篩選下拉之顯示字串）：Given 後台文件清單之「使用表單」篩選下拉, When 渲染選項, Then `formNumber` 非 `null` 者之 label 為 `{編號} {名稱}`（兩者間恰一個半形空格，如 `FM-001 進件申請書`）；`formNumber` 為 `null` 者之 label **僅為名稱**（`進件申請書`，**不得**出現前導空格、`null` 或 `—`）；兩種情形之選項值**恆為 `formId`**。
- **AC-D9**（🔒 不擴及附錄）：Given 本 delta 實作完成, When 檢視 [F039](F039-appendix-management.md) 之 `APPENDIX_POOL` 與附錄管理頁, Then **未新增任何編號欄位或欄**——附錄之實體欄位、清單表頭與全部既有 AC 逐項不變（OQ-D18-23 裁決＝不主動擴及）。
- **AC-D10**（🔒 既有行為回歸鎖定）：Given 本 delta 實作完成, When 執行本 feature 之全部既有 AC 與 [F017](F017-backend-document-list.md)／[F019](F019-public-list-browsing.md) 之表單相關條款, Then 全部維持綠燈——`formNumber` 為 **additive 選填欄**，不改變上傳／覆蓋／移除／關聯／下載／稽核之任何既有語意。

- **AC-D15**（🔴 表單編號之逐字文案與選擇器契約；**2026-08-16 補訂**，權威＝`prototypes/19-usage-form-management.html`）：Given 使用表單管理頁渲染完成, When 檢視清單與上傳 modal, Then 下列**逐字成立**——
  - ① **清單編號欄**：儲存格帶 `data-form-number` 屬性；`formNumber` 為 `null` 之列，其內容為逐字 `—`（U+2014）並帶 `title` 屬性 `此表單未設定編號`（**不得**顯示 `null` 或空白）；有值者以等寬字（`mono`）呈現。
  - ② **上傳 modal 之編號欄**：`<input>` 之 DOM id 為 `upNumber`、`maxlength="100"`、placeholder 逐字為 `例：FM-001（不填則留空）`；其 `<label>` 可見文字為 `表單編號` 並緊接一段逐字 `（選填）`（全形括號）。
  - ③ **兩則使用者可見錯誤訊息**（[error-handling.md#usage-form-number](../error-handling.md#usage-form-number) 只定義了錯誤碼與語意、未定義訊息文字，本項補齊）：<br>長度超限（`USAGE_FORM_NUMBER_TOO_LONG` · 400）→ 逐字 `表單編號超過長度上限（100 字元）。`<br>編號重複（`USAGE_FORM_NUMBER_DUPLICATE` · 409）→ 逐字 `表單編號已存在（比對前 trim、不分大小寫）。`<br>兩者皆呈現於 `upNumber` 下方之錯誤區（DOM id `upNumberErr`），且該輸入框加上錯誤邊框樣式。
  
  📌 **本條之存在理由**：`AC-D1`～`AC-D14` 規範了行為、驗證順序與錯誤碼，但**未定義任何使用者可見之訊息文字或選擇器**。本輪約束環為簡化版（僅 jest/vitest、無 fidelity 測試）⇒ **AC 是唯一防線**；未入 AC 之文案與掛鉤，test-generator 只能自行臆造。

#### 「編輯編號」動作（🔴 2026-08-16 人類閘門追加裁決） {#edit-number-action}

> **裁決＝新增一個輕量之「編輯編號」入口**（列內 inline 或小 modal，形式由 ui-ux-designer 決定），**只改 `formNumber`、不碰檔案**。
> **理由（裁決註記，不得省略）**：現存表單之 `formNumber` **全為 `null`**（無來源，migration 只能留空，`AC-D7`）。若編號僅能於**上傳時**設定，則**所有既有表單永遠補不上編號**——缺失 delta 第 18 項需求對**存量資料形同無效**。
> 📝 **被否決之替代方案**：把編號欄加進**覆蓋上傳彈窗**。否決理由：① 強迫使用者為了改一個編號而**重傳檔案**；② 覆蓋共用表單會**連帶改變所有引用文件所見內容**並觸發 `USAGE_FORM_OVERWRITE_SHARED` 二次確認（`OQ-E05-05`）——以「改編號」為由觸發一個檔案層級之破壞性動作，風險與意圖完全不成比例。此不對稱正是 `AC-D20` 所鎖定者。

- **AC-D16**（動作存在、逐字文案與選擇器）：Given ICSOPAdmin 進入使用表單管理頁, When 檢視清單任一列之「操作」欄, Then 存在一個無障礙名稱為逐字 **`編輯編號`** 之動作元件（帶 `data-edit-number` 屬性，供定位到所屬列）；When 觸發該動作, Then 開啟編號編輯介面（DOM id `editNumberModal`），其中：
  - 標題逐字為 **`編輯表單編號`**；
  - 欄位 `<label>` 可見文字為 `表單編號` 並緊接逐字 `（選填）`（與 `AC-D15` ② 一致）；輸入框 DOM id 為 **`enNumber`**、`maxlength="100"`、placeholder 逐字為 `例：FM-001（不填則留空）`（與上傳 modal **同一 placeholder**，不另造）；
  - 介面內含一句逐字說明 **`僅更新編號，不會變更表單檔案。`**（此句為裁決理由之 UI 體現，**不得省略**）；
  - 主要按鈕可見文字逐字為 **`儲存`**、次要按鈕為 **`取消`**；
  - 錯誤呈現於 DOM id **`enNumberErr`** 之區塊，其兩則訊息**逐字沿用** `AC-D15` ③（`表單編號超過長度上限（100 字元）。`／`表單編號已存在（比對前 trim、不分大小寫）。`），**不另造新文案**；
  - 成功回饋：設定或變更為非空值 → 逐字 `已更新表單編號。`；清空為 `null` → 逐字 `已清除表單編號。`；
  - When 點擊 `取消`, Then 關閉介面且該表單之 `formNumber` **不變**。
- **AC-D17**（權限）：Given 角色為 **ICSOPAdmin**, When 呼叫編號更新端點, Then 允許（[F026](F026-role-field-matrix.md) 矩陣「使用表單（多）」＝ICSOPAdmin 可寫）；Given 角色為 **SysAdmin**, When 呼叫, Then 回 **403 `FIELD_WRITE_FORBIDDEN`**（欄位層；SysAdmin 對本頁為唯讀，比照 [F039](F039-appendix-management.md) AC-32 之守門鏈）；Given 角色為 **Supervisor／DeptContact／User**, When 呼叫, Then 回 **403 `PERMISSION_DENIED`**（路由層；三者無「使用表單管理」功能權限）。**[F025](F025-role-function-matrix.md)／[F026](F026-role-field-matrix.md) 矩陣皆逐格不變**——本動作沿用「使用表單管理」既有功能列與「使用表單（多）」既有欄位列，**不新增任何矩陣列**；惟後端恆為權威（前端不渲染僅為體驗優化，不構成防護）。
  - **🔴 前端側之呈現要求（2026-08-16 補訂，ui-ux-designer 實測後裁定）**：Given 角色為 SysAdmin／Supervisor／DeptContact／User（任一無「使用表單（多）」寫入權者）, When 渲染使用表單管理頁清單, Then 該列之「編輯編號」動作元件**必須自 DOM 移除**（條件式渲染，`canWrite` 為偽時**根本不輸出該節點**），**不得**以 `display:none`／`visibility:hidden`／`.write-only` 之類**僅視覺隱藏**之方式達成。
  - **逐字斷言**：`queryByLabelText('編輯編號')` 之回傳為 **`null`**；且 `container.querySelector('[data-edit-number]')` 亦為 **`null`**。When 角色切換回 ICSOPAdmin, Then 兩者皆非 `null`（**切角色須即時重繪**）。
  - ⚠ **為何必須「移除」而非「隱藏」（不得省略之理由）**：Testing Library 之 `*ByLabelText`／`*ByText` 系列**不尊重 `display:none`**（僅 `*ByRole` 預設排除 a11y tree 之隱藏元素）。若實作沿用 CSS 隱藏，本條之 `queryByLabelText(...) === null` **必然紅燈**；若為了讓它綠而改斷言為 `*ByRole`＋`hidden:false`，則該權限元件**仍實際存在於 DOM 中**，唯讀角色可自 devtools 直接看到並觸發之（雖後端仍會擋，但這是把「不應存在的入口」留在畫面上）。**兩害相權，取「移除」。**
  - 🔴 **本頁存在兩種隱藏機制之刻意不一致，不得「順手統一」**：`prototypes/19-usage-form-management.html` 之**其餘**寫入動作（上傳／覆蓋／移除）沿用既有 CSS 類別 `.write-only`（`body:not([data-role="icsop_admin"]) .write-only{display:none !important}`）；**僅「編輯編號」一個元件採 DOM 移除**。此為**本 delta 刻意之局部差異**——統一為 CSS 隱藏會使本條無法驗證（見上），統一為 DOM 移除則屬既有元件之改造、**超出本 delta 範圍**。日後之收斂方向登錄於 [open-questions.md](../open-questions.md) `OQ-D18-29`，**在該題定案前，任何「統一為 `.write-only`」之重構皆會使本條紅燈，屬回歸而非整理**。
- **AC-D18**（驗證沿用既有錯誤碼、編輯時排除自身列）：Given 池中另一筆之 `formNumber` 為 `FM-001`, When 對本列以 `FM-001`／`fm-001`／`'  FM-001  '` 任一形式儲存, Then 回 **409 `USAGE_FORM_NUMBER_DUPLICATE`**、**該列 `formNumber` 不變**；Given 本列自身之 `formNumber` 已為 `FM-001`, When 以 `FM-001` 再次儲存（值未變）, Then **不視為衝突**、回 2xx（**唯一性比對排除自身列**）；Given 送出之值 trim 後長度為 101 字元, Then 回 **400 `USAGE_FORM_NUMBER_TOO_LONG`**、該列不變；恰 100 字元通過。**驗證順序沿用** [error-handling.md#usage-form-number](../error-handling.md#usage-form-number)（長度先於唯一性）；**不新增任何錯誤碼**。
- **AC-D19**（清空為合法操作）：Given 某表單之 `formNumber` 為 `FM-002`, When 以空字串／純空白儲存, Then 正規化為 **`null`** 並持久化、回 2xx（**空字串不得落地**）、清單該格回復為 `—`＋`title="此表單未設定編號"`；**清空不觸發唯一性比對**（`null` 不參與，`AC-D5`）。
- **AC-D20**（🔴 副作用邊界——只改編號、不碰檔案）：Given 對某表單執行編號更新（含清空）成功, When 逐欄比對該 `USAGE_FORM_POOL` 列之更新前後, Then **`blobPath`／`format`／`size`／`name`／`uploadedBy`／`uploadedAt` 六欄逐欄未變**、Blob 中之檔案位元組**未被讀取亦未被寫入**、`DOC_USAGE_FORM` 之全部關聯**未變**——**唯一改變者為 `formNumber`**（若實體具 `updatedAt` 類稽核欄則其亦可變，為唯一例外）。<br>且 When 該表單被 N ≥ 2 份文件引用時執行本動作, Then **不得出現覆蓋共用警示**——`USAGE_FORM_OVERWRITE_SHARED` **不得被觸發**（`AC-D20` 之核心：本動作與覆蓋上傳是兩條完全不同之路徑，共用引用數與本動作無關）。<br>📌 **不寫稽核**：本動作屬管理端維護，比照 [F003](F003-account-role-management.md) `AC-P21` 與後台下載之既有取向，**不寫入 `AUDIT_LOG`**（`targetType` 列舉無對應值）；[F023](F023-audit-logging.md)／[F024](F024-access-history-query.md) 不需 delta。
- **AC-D21**（🔴 「編輯編號」之補充文案與選擇器；**2026-08-16 二次補訂**，來源＝ui-ux-designer 實作 `prototypes/19` 後回報之 4 項 AC 未涵蓋項）：Given 「編輯編號」動作與其編輯介面, When 檢視, Then 下列**逐字成立**——
  - ① **列內動作之 icon 鍵為 `hash`**（**非** `pencil`／`edit`）。<br>📌 **理由（保留，不得改為 `pencil`）**：`pencil` 會被讀成「編輯**這張表單**（含檔案）」，正是 `AC-D20` 所要劃清之界線；`hash`（`#`）指向「編號」此一具體對象，與動作之實際副作用範圍一致。指定 icon 鍵之慣例已見於 [F011](F011-edit-with-comparison.md#back-edition-delta) `AC-D1`（`arrow-left`）與 [F039](F039-appendix-management.md#export-delta) `AC-D4`（`download`），本條補齊 `AC-D16` 之遺漏。
  - ② **編輯介面內回顯被編輯之表單名稱**：存在 DOM id **`enFormName`** 之元素，其文字**恰為該表單之 `name`**（**無任何前綴或後綴文字**，如 `進件申請書` 而非 `表單：進件申請書`）。<br>📌 **理由**：介面不指明編輯對象時，使用者無從確認選到哪一列——清單可能有多筆名稱相近之表單。此為**新增之使用者可見元素**，`AC-D16` 未涵蓋。
  - ③ **介面右上關閉鈕之 `aria-label` 逐字為 `關閉`**（`AC-D16` 只定義了 `儲存`／`取消` 兩個按鈕，未涵蓋關閉鈕）。When 觸發關閉鈕, Then 行為與 `取消` 相同（關閉介面、`formNumber` 不變）。
  - ④ **錯誤時輸入框加上錯誤邊框樣式**：Given 送出後回 `USAGE_FORM_NUMBER_TOO_LONG` 或 `USAGE_FORM_NUMBER_DUPLICATE`, When 呈現錯誤, Then 除 `enNumberErr` 顯示對應訊息外，`enNumber` 輸入框**亦加上錯誤邊框樣式**（與 [§`AC-D15` ③](#form-number-delta) 對上傳 modal 之既有要求**一致**）。<br>📌 **邊框之具體色票與 class 名稱屬設計裁量、不入 AC**（見 [open-questions.md](../open-questions.md) `OQ-D18-27` 乙表）；本條只約束「錯誤時該輸入框之呈現與正常態可區分」此一可觀測事實。
  
  📌 **本條之存在理由**：與 `AC-D15`／`AC-D16` 同——本輪為簡化版約束環（僅 jest/vitest、無 fidelity 測試），**未入 AC 之文案與選擇器，test-generator 只能自行臆造**。designer 已依 `AC-D16` 逐字實作且零偏差，本條收攏其實作過程中浮現、而 `AC-D16` 未預見之四項。

### 前台使用表單下載燒錄 delta（🔴 2026-08-16 同日第二次人類閘門；`OQ-D18-25` 定案，推翻 `OQ-E05-03`）

> 前提裁決：**OQ-D18-25**→前台使用表單之 PDF **比照附錄一併燒錄**；**OQ-D18-02**→策略 A（僅 PDF 燒錄，非 PDF 明示不支援）；**OQ-D18-01**→只做前台、**後台維持 RAW**（`OQ-FM-01` 有效）；**OQ-D18-03**→前台燒錄後**仍寫調閱稽核**。
> 規則權威段落＝[§前台使用表單下載燒錄](#front-burn-delta)；燒錄能力側之宣告見 [F020](F020-watermark.md#front-burn-scope-delta)。

- **AC-D11**（前台 PDF 使用表單燒錄）：Given 一般使用者於**前台**文件詳情頁下載一份 `format = pdf` 之使用表單, When 下載完成, Then 回應之位元組其 **PDF 內容層已燒錄浮水印**（非原始檔位元組、非僅前端疊加），其字串與同一使用者於同一時刻經 [F020](F020-watermark.md) 檢視器下載所得之浮水印**逐字相同**（僅時間戳依當下產生）；`PdfBurner.burnPdf` 之 spy **呼叫次數為 1**。
- **AC-D12**（非 PDF 原檔＋UI 明示）：Given 某使用表單之 `format ∈ {xlsx, xls}`, When 於前台文件詳情頁下載, Then 回應之位元組與 Blob 中之原始檔**逐位元組相同**、`PdfBurner.burnPdf` 之 spy **呼叫次數為 0**；且 When 渲染前台詳情頁之使用表單清單, Then 該列顯示逐字文案 `此格式不支援浮水印`；`format = pdf` 之列**不得**出現該文案（`within(pdfRow).queryByText('此格式不支援浮水印') === null`）。<br>📌 **「回應之位元組」＝應用層代理回傳之 body，非 SAS URL**：本條隱含**前台一律代理串流（非 PDF 亦然）**，此為 architecture-spec §5.2 之**刻意例外、僅限前台路徑**（後台仍走 SAS），理由與完整契約見 [F020](F020-watermark.md#front-burn-scope-delta) `AC-D3a`。<br>📌 **UI 旗標之資料來源**：同 [F039](F039-appendix-management.md#export-delta) `AC-D2`——依**伺服器端旗標**渲染，前端不得自行以 `format` 字串重算。格式判定以上傳時經白名單驗證之伺服器端事實為權威，**非** client-supplied `content-type`。
- **AC-D13**（🔒 後台 RAW 回歸鎖定；`OQ-FM-01` 維持有效）：Given 同一份 `format = pdf` 之使用表單, When 以 ICSOPAdmin／SysAdmin／Supervisor／DeptContact 任一角色自**後台**（使用表單管理頁個別下載、後台文件唯讀詳情、編輯頁）下載, Then 取得**原始檔位元組**（與 Blob 逐位元組相同）、`PdfBurner.burnPdf` 之 spy **呼叫次數為 0**、**不寫入任何稽核**；且該位元組與 `AC-D11` 所得之前台位元組**不相等**。既有「未登入／無權限者組合下載網址 → `FILE_ACCESS_DENIED`」之 AC 維持不變。
- **AC-D14**（稽核義務不變＋快照落值）：Given `AC-D11` 之前台 PDF 下載成功（含燒錄）, When 檢視稽核, Then `AUDIT_LOG` 恰新增一筆 `targetType='USAGE_FORM'`／`actionType='DOWNLOAD'`／`formId` 落列之紀錄（既有 AC「前台下載表單成功 → 同步寫入正確稽核紀錄」**語意不變**），且其 `watermarkSnapshot` **與該次燒錄之浮水印字串逐字相同**；Given `AC-D12` 之非 PDF 下載成功, Then **同樣寫入該筆稽核**，惟 `watermarkSnapshot` 為 `null`。**燒錄與否不改變稽核義務。**

- **AC-D22**（🔴 前台使用表單下載之專屬端點與前後台分流；**2026-08-16 三次補訂**，容器／瀏覽器驗收揪出「一條 route 兩個相衝呼叫端」）：既有 `GET /documents/:documentId/usage-forms/:formId/download` 為**前後台共用之單一 route**，但兩端期待相反——前台需**燒錄後之位元組**、後台需 **`{ url }` 之 SAS JSON**；且該服務對 PDF 燒錄 ⇒ **後台若改取位元組即違反 [F020](F020-watermark.md#front-burn-scope-delta) `AC-D4`**（後台恆 RAW、`PdfBurner.burnPdf` spy 必須為 0）。**「一條 route 同時滿足兩者」在架構上不可能**，故比照 [F020](F020-watermark.md#front-burn-scope-delta) `AC-D8` 之附件作法分流：

  | 用途 | 方法／路徑 | handler | 權限閘門 | 回應 |
  |---|---|---|---|---|
  | **前台**（新增） | GET `/public/documents/:documentId/usage-forms/:formId/download` | `downloadUsageFormPublic` | 功能 `下載列印文件`（`DOCUMENT_DOWNLOAD_PRINT`）**read** | **代理串流之檔案位元組**（`Content-Disposition: attachment`）；`format = pdf` → 已燒錄；非 PDF → 原檔 |
  | **後台**（既有，維持） | GET `/documents/:documentId/usage-forms/:formId/download` | 既有 handler | 既有閘門不變 | **`{ url }` 之短效期 SAS JSON**、RAW、**不燒錄** |

  - ① **前台端點之行為沿用既有 AC，不重複規範**：燒錄／非 PDF 原檔＝`AC-D11`／`AC-D12`；代理串流（不得回 SAS URL、不得 3xx）＝[F020](F020-watermark.md#front-burn-scope-delta) `AC-D3a`；`此格式不支援浮水印` 之列內文案＝`AC-D12`。**本條只補齊「端點存在、handler 名稱、閘門值、回應型態」四項 route-metadata。**
  - ② **稽核義務隨前台路徑移轉**：`AC-D14` 之「恰寫入一筆 `targetType='USAGE_FORM'`／`actionType='DOWNLOAD'`」自本條起**由前台專屬端點承擔**；**後台路徑不寫稽核**（管理存取，比照 `OQ-FM-01` 與 [F039](F039-appendix-management.md) 後台下載）。⚠ **此使既有共用 route 之稽核行為由「兩端皆寫」收斂為「不寫」**——為分流之直接後果，非額外裁決。
  - ③ **[F041](F041-user-subtype-business-scope.md) 可見性檢查於服務層生效**：業務子分類使用者對使用部門不相符之文件呼叫前台端點, Then 回 **404 `DOCUMENT_NOT_FOUND`**、不回傳任何位元組、不寫稽核。
  - 📌 **路徑形狀已與 architecture-spec §10.1「路徑命名空間分流」一致，不需另行拍板**（`/public/...` ＝前台專屬命名空間，與 `AC-D8` 之 `/public/documents/:id/attachments/{icsop-pdf,ojt}/download` 同型）。<br>⚠ **不得**改採「比照附錄之 `/documents/...` 前台＋`/admin/...` 後台」形狀：既有 `GET /admin/usage-forms/:formId/download` 之閘門為 `USAGE_FORM_MANAGEMENT` read，而 **Supervisor／DeptContact 對「使用表單管理」無權**（[F025](F025-role-function-matrix.md)），改走該路徑會使兩者於後台唯讀詳情頁下載表單時吃 403，**直接牴觸 [F026](F026-role-field-matrix.md) 矩陣「使用表單（多）＝唯讀（可下載）」**。
- **AC-D23**（🔒 後台使用表單下載 RAW 回歸鎖定）：Given 同一份 `format = pdf` 之使用表單, When 自**後台唯讀詳情頁**（`/admin/documents/:id`）觸發下載, Then 取得之回應為 **`{ url }` 形狀之 JSON**（非位元組），依該 URL 取得之檔案與 Blob **逐位元組相同**、`PdfBurner.burnPdf` 之 spy **呼叫次數為 0**、**不寫入任何稽核**；且該位元組與 `AC-D22` 前台端點所得**不相等**。Supervisor／DeptContact 執行同一操作亦**允許**（不得回 403）。
## Interface Contract（端點） {#interface-contract}

> ⚠ **本檔歷來無完整端點表**（行為與資料契約以 Main Flow ＋ AC 描述，端點形狀由 system-architect 決定）。本節**僅登錄 2026-08-16 追加裁決所新增之單一端點**，不追溯補齊既有端點；既有上傳／覆蓋／移除／關聯／下載之端點形狀維持現況、不受本節影響。

| 方法 | 路徑（**待 system-architect 確認，不綁死**） | 權限閘門 | 說明 |
|---|---|---|---|
| PATCH | `/admin/usage-forms/:formId/number`〔建議形狀〕 | 功能 `使用表單管理` read ＋ 欄位 `使用表單` write | **（2026-08-16 新增）編號專用更新端點**：body 僅接受 `{ formNumber: string \| null }`；trim 後空值收斂為 `null`。**只更新 `formNumber`**——`blobPath`／`format`／`size`／`name`／`uploadedBy`／`uploadedAt` 與 Blob 檔案位元組**皆不得被讀取或寫入**（`AC-D20`）。驗證沿用 [#usage-form-number](../error-handling.md#usage-form-number)（長度先於唯一性、唯一性**排除自身列**）；**不寫稽核**。 |

- 🔴 **刻意採「編號專用端點」而非併入既有覆蓋端點**：併入 `PUT /admin/usage-forms/:formId`（覆蓋上傳）會使「改編號」與「換檔案」共用同一條 multipart 路徑，必然要求送出檔案、並觸發 `USAGE_FORM_OVERWRITE_SHARED` 二次確認——此即人類閘門**已否決之替代方案**（見 [§「編輯編號」動作](#edit-number-action) 之裁決註記）。
- 📌 **方法與路徑之最終形狀由 system-architect 定**（`PATCH` vs `PUT`、是否改為 `/admin/usage-forms/:formId` 之部分更新）；**不變者為其可觀測契約**：只接受編號、只改編號、驗證與錯誤碼沿用既有、不寫稽核、不觸發覆蓋警示。

## Error Scenarios
- 格式/大小/未授權/移除確認：見 [error-handling.md#file](../error-handling.md#file)。稽核：見 [F023](F023-audit-logging.md)。
- **表單編號（2026-08-16）**：重複 → `USAGE_FORM_NUMBER_DUPLICATE`（409）；超長 → `USAGE_FORM_NUMBER_TOO_LONG`（400）。**編輯情境（「編輯編號」動作）之唯一性比對排除自身列**、清空為合法且不觸發比對。見 [error-handling.md#usage-form-number](../error-handling.md#usage-form-number)。
- **「編輯編號」之權限**：SysAdmin → `FIELD_WRITE_FORBIDDEN`（403，欄位層）；Supervisor／DeptContact／User → `PERMISSION_DENIED`（403，路由層）。**不新增錯誤碼**（`AC-D17`）。

## Related
- Data: [USAGE_FORM_POOL／DOC_USAGE_FORM](../data-model.md#usage-form-entity)（**2026-08-16 補登錄，償還 OQ-E10-05；含新欄 `formNumber`**）, [DOCUMENT_ATTACHMENT（USAGE_FORM，歷史型態）](../data-model.md#attachment-entity), [AUDIT_LOG](../data-model.md#auditlog-entity)
- Depends on: [F010](F010-create-document.md); 顯示於 [F019](F019-public-list-browsing.md); 篩選於 [F017](F017-backend-document-list.md)（`AC-D2` 第 11 項）; 稽核 [F023](F023-audit-logging.md)
- 定案: OQ-E05-04（表單池，多對多共用）、**OQ-E05-05（覆蓋上傳＋跨文件引用警示，不保留版本）**、~~OQ-E05-03（表單下載**不**燒錄浮水印）~~ → **🔴 2026-08-16 使用者裁決推翻（僅前台）：前台 PDF 使用表單燒錄、非 PDF 維持原檔並明示；後台維持 RAW（`OQ-FM-01` 有效）**，見 [§前台使用表單下載燒錄](#front-burn-delta)。OQ: OQ-E05-01（表單數量上限）, OQ-E05-02（大小/格式）, OQ-E10-04（覆蓋門檻散文 ≥1 vs 實作 ≥2 之既有落差，**本 delta 未修正**）。
- **2026-08-16 使用者裁決**: OQ-D18-22（唯一/可空/不自動產生/filtered unique index）、OQ-D18-23（不擴及附錄、篩選顯示字串）、**OQ-D18-25（同日第二次閘門：前台使用表單 PDF 一併燒錄，推翻 OQ-E05-03）**。見 [§表單編號 delta](#form-number-delta)、[§前台使用表單下載燒錄](#front-burn-delta)。
- **燒錄能力側之權威**：[F020](F020-watermark.md#front-burn-scope-delta)（跨路徑共用燒錄能力＋前台/後台分流行為契約）；同構之附錄側見 [F039](F039-appendix-management.md#front-burn-delta)。
- **待 ui-ux-designer（本 delta 新增）**：① `prototypes/19-usage-form-management.html` 之表頭新增首欄「表單編號」、上傳 modal 新增選填「表單編號」輸入欄；② `prototypes/04-public-document-detail.html` 之**使用表單清單**，非 PDF 列須顯示逐字文案 `此格式不支援浮水印`（`AC-D12`），PDF 列則比照附件區之「檢視/下載將燒錄浮水印」語意呈現。
- **🔴 待 ui-ux-designer（2026-08-16 追加裁決：「編輯編號」動作）**——**下列文案與掛鉤由 spec-writer 定稿，designer 逐字照抄、不得自行發明**（權威＝`AC-D16`；形式（列內 inline 或小 modal）由 designer 決定，文案不變）：

  | 元素 | 逐字值 |
  |---|---|
  | 列內動作元件之無障礙名稱／可見文字 | `編輯編號` |
  | 該元件之定位屬性 | `data-edit-number`（每列一個，供定位到所屬列） |
  | 編輯介面容器 DOM id | `editNumberModal` |
  | 介面標題 | `編輯表單編號` |
  | 欄位 label | `表單編號` ＋ 緊接之 `（選填）`（全形括號，與上傳 modal 一致） |
  | 輸入框 DOM id／`maxlength`／placeholder | `enNumber`／`100`／`例：FM-001（不填則留空）`（**與上傳 modal 同一 placeholder，不另造**） |
  | 說明句（**不得省略**） | `僅更新編號，不會變更表單檔案。` |
  | 主要／次要按鈕 | `儲存`／`取消` |
  | 錯誤區 DOM id | `enNumberErr` |
  | 錯誤訊息（兩則，**逐字沿用上傳 modal**） | `表單編號超過長度上限（100 字元）。`／`表單編號已存在（比對前 trim、不分大小寫）。` |
  | 成功回饋 | 設定或變更為非空 → `已更新表單編號。`；清空 → `已清除表單編號。` |
  | 列內動作之 icon 鍵（`AC-D21` ①） | `hash`（**非** `pencil`——避免被讀成「編輯整張表單含檔案」） |
  | 編輯對象回顯（`AC-D21` ②） | DOM id `enFormName`，文字**恰為該表單之 `name`**、無前綴後綴 |
  | 關閉鈕（`AC-D21` ③） | `aria-label` 逐字 `關閉`；行為同 `取消` |
  | 錯誤時輸入框（`AC-D21` ④） | `enNumber` 加錯誤邊框樣式（比照上傳 modal）；色票與 class 為設計裁量 |

  ⚠ **無寫入權之角色（SysAdmin／Supervisor／DeptContact／User）該動作元件必須自 DOM 移除，不得僅以 CSS 隱藏**（`AC-D17`）——本頁其餘寫入動作沿用 `.write-only` CSS 隱藏，**此局部不一致為刻意，不得統一**（理由與收斂方向見 `AC-D17` 與 [open-questions.md](../open-questions.md) `OQ-D18-29`）。
  ✅ **2026-08-16 已完成傳播**：ui-ux-designer 已依上表逐字實作於 `prototypes/19-usage-form-management.html`，**零偏差、無異議**；`AC-D21` 之四項即為其實作過程中回報、而 `AC-D16` 未預見者，已補入 AC。<br>⚠ **不得**把編號欄加進覆蓋上傳彈窗以取代本動作——該替代方案已於人類閘門**明確否決**（理由見 [§「編輯編號」動作](#edit-number-action)）。
- **待 system-architect（本 delta 新增）**：① `formNumber` 之 migration（唯一 filtered index 之確切 DDL 與既有列處置）、唯一性比對之大小寫不敏感實作（collation vs 正規化欄位）——⚠ 依既有教訓，**migration 寫完必須對真 SOP DB 實跑**；② **前台使用表單下載之燒錄路徑與後台 RAW 路徑分流**（與附錄、附件共用同一分流設計，見 [F020](F020-watermark.md#front-burn-scope-delta) `AC-D3`）。<br>⚠ **既有 `architecture-spec.md` 有兩處需其擁有者同步**：`§下載策略表`（將 `USAGE_FORM` 列為「無浮水印需求，草案 OQ-E05-03」而採 SAS 直連）與 `§燒錄範圍表`（「使用表單｜維持現況（不燒錄）」）——本 delta 已推翻該前提，**惟該檔屬 system-architect 所有，spec-writer 未修改**。
