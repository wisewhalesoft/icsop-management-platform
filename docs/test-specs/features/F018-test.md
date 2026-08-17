---
type: test-design-feature
feature_id: F018
feature_name: 使用表單管理
priority: P1
related_spec: docs/specs/features/F018-usage-form-management.md
last_updated: 2026-07-22
status: draft
---

# F018 — 使用表單管理 · Test Design
> source: docs/specs/features/F018-usage-form-management.md · worktree: storage · 2026-07-22

## 測試策略（unit 用假 Blob store＋純規則；真 Azure Blob/DB＝[integration]、序列化暫不自動化）

沿用 F016 之 `FakeBlobStore` 假體（見 `F016-test.md` 測試策略段）；另需：

- **`FakeFormPoolStore`**：比照 `documents.service.spec.ts` 之 `FakeStore` 風格，記憶體維護表單池記錄（`id`/`name`/`blobPath`/`format`/`size`/`uploadedBy`/`uploadedAt`）＋多對多關聯表（`documentId`↔`formId`，等效 `DOC_USAGE_FORM` 關聯，資料模型未明列此附屬表名，見開放設計問題）。`docs.length`（關聯文件數）純以陣列長度模擬，供 `USAGE_FORM_OVERWRITE_SHARED`／`USAGE_FORM_IN_USE` 門檻判定之單元測試。
- **`FakeAuditRecorder`**：記錄呼叫參數（`targetType`/`actionType`/`formId`/`documentId`/`accountId`）供斷言呼叫**是否發生、參數是否正確**；**不驗證真實 `AUDIT_LOG` 落地**——`AUDIT_LOG` 實體/模組本身屬 F023（`feature-status.md` 標「⬜ 未開始，全站無此實體」），F023 落地前，本 worktree 對「稽核」之測試上限即為「呼叫了正確參數的稽核收集器」，實際持久化與補償佇列（outbox）由 F023 之 worktree 負責整合。
- **RBAC**：沿用 `backend/src/rbac/function-matrix.ts` 之 `FunctionKey.USAGE_FORM_MANAGEMENT`（現有矩陣：SysAdmin=READ、ICSOPAdmin=CRUD、Supervisor/DeptContact/User=NONE）純判定函式，可直接單元測試。
- **[integration]**：真實 Azure Blob 私有容器之直接 URL 存取拒絕行為。

## Test Scenarios

### 表單池上傳（建立）

#### TS-F018-001 ICSOPAdmin 上傳 excel 表單至表單池 [unit]
- Given：ICSOPAdmin、`contentType` 對應 `.xlsx`
- When：上傳
- Then：建立表單池記錄，初始關聯文件數 = 0，顯示於清單
- 對應 AC / 錯誤碼：AC1

#### TS-F018-002 ICSOPAdmin 上傳 pdf 表單 [unit]
- Given：ICSOPAdmin、`.pdf`
- When：上傳
- Then：成功
- 對應 AC / 錯誤碼：AC1

#### TS-F018-003 ICSOPAdmin 上傳 .xls（非 .xlsx）表單 [unit]
- Given：ICSOPAdmin、`.xls`
- When：上傳
- Then：成功（OQ-E05-02 定案格式含 `xlsx/xls/pdf`）
- 對應 AC / 錯誤碼：OQ-E05-02

#### TS-F018-004 一次選取多個合法 excel/pdf 上傳 [unit]
- Given：ICSOPAdmin、同時選取 3 個檔案（`.xlsx`/`.pdf`/`.xls`，皆合法）
- When：批次上傳
- Then：全部成功，各自建立獨立表單池記錄
- 對應 AC / 錯誤碼：Alternative Flow「一次上傳多個 excel/pdf」

### 格式/大小驗證

#### TS-F018-005 上傳非 excel/pdf 格式（.docx） [unit]
- Given：ICSOPAdmin、`.docx`
- When：上傳
- Then：拒絕，回 `FILE_FORMAT_NOT_ALLOWED`，不建立任何關聯（此處為建立表單池記錄本身，尚無關聯對象）
- 對應 AC / 錯誤碼：AC2

#### TS-F018-006 上傳恰為 50MB 表單 [unit]
- Given：`size = 50MB`，格式合法
- When：上傳
- Then：成功（邊界含，OQ-E05-02 同 OQ-E04-06）
- 對應 AC / 錯誤碼：Edge Case

#### TS-F018-007 上傳超過 50MB 表單 [unit]
- Given：`size = 50MB + 1byte`
- When：上傳
- Then：拒絕，回 `FILE_SIZE_EXCEEDED`
- 對應 AC / 錯誤碼：Edge Case

### 文件關聯（多對多）

#### TS-F018-008 文件建立/編輯時自表單池搜尋多選關聯表單 [unit]
- Given：ICSOPAdmin 編輯文件，自表單池選取 2 個既有表單
- When：儲存
- Then：建立 2 筆多對多關聯記錄，對應表單之「關聯文件數」各 +1
- 對應 AC / 錯誤碼：Main Flow #2

#### TS-F018-009 文件編輯時解除單一表單關聯（取消勾選） [unit]
- Given：文件目前關聯 3 個表單
- When：於文件編輯畫面取消勾選其中 1 個並儲存
- Then：該筆關聯移除，其餘 2 筆不受影響；**表單本身仍存於表單池**（僅解除關聯，非刪除表單池記錄——見開放設計問題 OQ-F018-01，此為 AC3 兩種可能解讀之一）
- 對應 AC / 錯誤碼：AC3（部分，見 OQ-F018-01）

### 詳情頁呈現

#### TS-F018-010 文件有 3 個關聯表單，開啟詳情頁 [unit]
- Given：文件關聯 3 個表單
- When：呼叫文件詳情頁 API
- Then：回傳 3 筆，各自含名稱/格式/下載連結
- 對應 AC / 錯誤碼：AC4

#### TS-F018-011 文件無關聯表單，開啟詳情頁 [unit]
- Given：文件關聯 0 個表單
- When：呼叫詳情頁 API
- Then：回傳空陣列（非錯誤／非 4xx）；前端顯示「無使用表單」提示
- 對應 AC / 錯誤碼：AC5

#### TS-F018-012 前後台詳情頁共用同一 API [unit]
- Given：同一文件、同一組關聯表單
- When：分別以前台/後台呼叫該詳情 API
- Then：回傳內容一致（不因呼叫端點差異而異，權限差異僅發生於「下載」動作本身，見 TS-013/014）
- 對應 AC / 錯誤碼：Description「前後台共用同一 API」

### 下載與稽核

#### TS-F018-013 前台使用者下載表單成功 [unit]
- Given：已登入使用者、表單存在且與該文件關聯
- When：下載表單
- Then：核發下載憑證；同步呼叫稽核收集器，參數 `targetType=USAGE_FORM`、`actionType=DOWNLOAD`、`formId`、`documentId` 正確
- 對應 AC / 錯誤碼：AC7

#### TS-F018-014 未登入使用者組合下載網址存取表單 [unit]
- Given：無有效 session
- When：呼叫下載端點
- Then：拒絕，回 `FILE_ACCESS_DENIED`；不核發憑證、不呼叫稽核收集器
- 對應 AC / 錯誤碼：AC6

### 覆蓋上傳（跨文件引用警示，OQ-E05-05）

> 門檻依據 `prototypes/19-usage-form-management.html` `overwriteForm()` 實測邏輯：`docs.length >= 2` 才觸發 `USAGE_FORM_OVERWRITE_SHARED`；`0` 或 `1` 皆走一般確認、不出現跨文件碼。此門檻與 AC8 逐字「另被 N（≥1）份文件引用」在 N=1 時的字面解讀有落差，見開放設計問題 OQ-F018-02。

#### TS-F018-015 表單目前被 0 份文件引用，覆蓋上傳 [unit]
- Given：`docs.length = 0`
- When：ICSOPAdmin 覆蓋上傳新檔
- Then：直接覆蓋成功，不出現 `USAGE_FORM_OVERWRITE_SHARED`（一般確認即可）
- 對應 AC / 錯誤碼：Edge Case「無其他引用時仍可覆蓋，但不出現跨文件警示」

#### TS-F018-016 表單目前恰被 1 份文件引用（邊界下緣），覆蓋上傳 [unit]
- Given：`docs.length = 1`
- When：覆蓋上傳
- Then：直接覆蓋成功，不觸發 `USAGE_FORM_OVERWRITE_SHARED`
- 對應 AC / 錯誤碼：Edge Case「僅被當前單一文件引用…不出現跨文件警示」；**邊界值測試，見 OQ-F018-02**

#### TS-F018-017 表單目前恰被 2 份文件引用（邊界上緣），覆蓋上傳 [unit]
- Given：`docs.length = 2`
- When：覆蓋上傳
- Then：拒絕直接覆蓋，回 `USAGE_FORM_OVERWRITE_SHARED`（409），訊息含 `N=2`，需二次確認
- 對應 AC / 錯誤碼：AC8

#### TS-F018-018 表單被 5 份文件引用，確認覆蓋後 [unit]
- Given：`docs.length = 5`，已顯示 `USAGE_FORM_OVERWRITE_SHARED` 警示
- When：使用者二次確認覆蓋
- Then：新檔覆蓋成功；全部 5 份引用文件透過關聯查得之表單內容皆為新檔；舊 `blobPath` 不再可經任何引用文件存取；不保留歷史版本記錄
- 對應 AC / 錯誤碼：AC9

#### TS-F018-019 覆蓋警示彈出後使用者取消 [unit]
- Given：`docs.length >= 2`，警示已顯示
- When：使用者取消
- Then：原表單 `blobPath`/內容不變、關聯不受影響；`blobStore.put` 未被呼叫
- 對應 AC / 錯誤碼：AC10

#### TS-F018-020 覆蓋上傳新檔格式不合法 [unit]
- Given：`docs.length = 3`（原應觸發跨文件警示），新檔為 `.docx`
- When：覆蓋上傳
- Then：格式驗證優先於引用數判斷，直接回 `FILE_FORMAT_NOT_ALLOWED`；不進入 `USAGE_FORM_OVERWRITE_SHARED` 流程；既有表單完全不受影響
- 對應 AC / 錯誤碼：Edge Case 組合（格式驗證與跨文件警示之判斷順序）

### 移除保護（表單池整筆刪除，`USAGE_FORM_IN_USE`）

> `USAGE_FORM_IN_USE` 僅見於 feature spec Main Flow 與 prototype，未列入 `error-handling.md` 中央錯誤碼表，見開放設計問題 OQ-F018-03。

#### TS-F018-021 表單被 0 份文件引用，自表單池刪除 [unit]
- Given：`docs.length = 0`
- When：ICSOPAdmin 刪除表單
- Then：一般二次確認（無風險提示文字），確認後成功刪除
- 對應 AC / 錯誤碼：Edge Case「移除前二次確認」之無風險對照組

#### TS-F018-022 表單被 N(≥1) 份文件引用，自表單池刪除 [unit]
- Given：`docs.length = 3`
- When：ICSOPAdmin 嘗試刪除
- Then：回 `USAGE_FORM_IN_USE`（提示「已被 3 份文件使用，移除將一併解除全部關聯」），需二次確認；確認後解除全部 3 筆關聯並刪除表單池記錄
- 對應 AC / 錯誤碼：Main Flow #3 / `USAGE_FORM_IN_USE`

#### TS-F018-023 移除二次確認彈出後取消 [unit]
- Given：`docs.length >= 1`，確認彈窗已顯示
- When：使用者取消
- Then：表單保留、關聯不受影響
- 對應 AC / 錯誤碼：Edge Case「移除前二次確認取消：表單保留不受影響」

### RBAC（功能面，F025「文件使用表單管理」）

#### TS-F018-024 ICSOPAdmin 呼叫表單池任一 CRUD API [unit]
- Given：ICSOPAdmin
- When：查詢/上傳/覆蓋/刪除
- Then：全部允許（`FUNCTION_MATRIX['文件使用表單管理'].ICSOPAdmin = 'CRUD'`）
- 對應 AC / 錯誤碼：F025 矩陣正向

#### TS-F018-025 系統管理員呼叫查詢 API vs 寫入 API [unit]
- Given：SysAdmin（`FUNCTION_MATRIX['文件使用表單管理'].SysAdmin = 'READ'`）
- When：分別呼叫查詢/下載 API 與上傳/覆蓋/刪除 API
- Then：查詢/下載允許；寫入類拒絕（403）——**精確錯誤碼見 OQ-F018-04**（`canPerform(...,'write')` 對 READ 列回 false 理應是 `PERMISSION_DENIED`，但 prototype 明確標示 `FIELD_WRITE_FORBIDDEN`，兩者衝突）
- 對應 AC / 錯誤碼：F025「唯讀」；prototype 唯讀模式提示文字

#### TS-F018-026 主管呼叫表單池任一 API（含查詢） [unit]
- Given：Supervisor（`NONE`）
- When：呼叫任一表單池 API，包含查詢
- Then：一律拒絕，回 `PERMISSION_DENIED`（矩陣為「無」而非「唯讀」，查詢類同樣被拒，無歧義）
- 對應 AC / 錯誤碼：F025「無」/ `PERMISSION_DENIED`

#### TS-F018-027 部門窗口呼叫表單池任一 API [unit]
- Given：DeptContact（`NONE`）
- Then：同 TS-026，`PERMISSION_DENIED`
- 對應 AC / 錯誤碼：F025「無」

#### TS-F018-028 一般使用者呼叫表單池後台管理 API [unit]
- Given：User（`NONE`）
- Then：`PERMISSION_DENIED`；註：前台文件詳情頁下載表單（TS-013/014）為獨立公開路徑（`DOCUMENT_DOWNLOAD_PRINT` 功能，全角色 READ），不受本列限制
- 對應 AC / 錯誤碼：F025「無」

### Blob 直接存取

#### TS-F018-029 未授權使用者略過後端直接以 Blob URL 存取表單檔案 [integration]
- Given：真實 Azure Blob 私有容器
- When：不經後端核發流程直接存取
- Then：拒絕
- 對應 AC / 錯誤碼：AC6 / `FILE_ACCESS_DENIED`；需真實 Azure Blob，非 unit 可覆蓋

### 操作記錄

#### TS-F018-030 上傳/覆蓋成功後正確記錄操作者與時間 [unit]
- Given：ICSOPAdmin 上傳或覆蓋表單
- When：操作完成
- Then：表單池記錄之 `uploadedBy`/`uploadedAt`（管理端操作記錄，非調閱稽核，data-model `DOCUMENT_ATTACHMENT` 必填欄位）正確反映本次操作者與時間
- 對應 AC / 錯誤碼：資料模型（`uploadedBy`/`uploadedAt` 必填）

## AC → TS 覆蓋對照表

| AC/來源 | 內容摘要 | 對應 TS |
|---|---|---|
| AC1 | 選擇 excel/pdf 上傳，存 Blob、建立、顯示於清單 | TS-001, TS-002, TS-004 |
| AC2 | 非 excel/pdf → `FILE_FORMAT_NOT_ALLOWED` | TS-005 |
| AC3 | 移除其一（二次確認）→ 解除，其餘不受影響 | TS-009（見 OQ-F018-01） |
| AC4 | 3 個關聯表單，詳情頁列出並可各自下載 | TS-010 |
| AC5 | 無關聯表單 → 「無使用表單」提示 | TS-011 |
| AC6 | 未登入/無權限下載 → `FILE_ACCESS_DENIED` | TS-014, TS-029 |
| AC7 | 前台下載成功 → 寫入稽核 | TS-013 |
| AC8 | 另被 N(≥1) 份引用，覆蓋 → `USAGE_FORM_OVERWRITE_SHARED` | TS-017 |
| AC9 | 覆蓋確認完成 → 全部引用文件同步更新、不留版本 | TS-018 |
| AC10 | 覆蓋警示取消 → 原檔保留 | TS-019 |
| Edge：格式/大小 | .xls 支援、50MB 邊界 | TS-003, TS-006, TS-007, TS-020 |
| Edge：覆蓋門檻 N=0/1 | 不觸發跨文件警示 | TS-015, TS-016 |
| Edge：移除保護 | `USAGE_FORM_IN_USE` | TS-021, TS-022, TS-023 |
| F025 矩陣（RBAC） | ICSOPAdmin CRUD／SysAdmin 唯讀／其餘無 | TS-024～028 |
| Description（共用 API） | 前後台一致 | TS-012 |
| Main Flow #2（多對多） | 建立關聯 | TS-008 |
| 資料模型（操作記錄） | `uploadedBy`/`uploadedAt` | TS-030 |

## 開放設計問題

- **OQ-F018-01（AC3 字面歧義）**：「Given 文件已有多個表單, When 移除其一（二次確認）, Then 解除關聯並移除，其餘不受影響」之「移除」語意未明確區分兩種不同操作：(a) 於**文件編輯畫面**取消勾選、解除該文件與某表單的關聯（表單仍留在池中，可能仍被其他文件引用）；(b) 於**表單池管理畫面**整筆刪除表單（`USAGE_FORM_IN_USE` 保護）。Main Flow 明確將「移除表單」的 `USAGE_FORM_IN_USE` 保護寫在「表單池管理（獨立畫面）」段落，暗示 AC3 應對應 (a)（文件情境的「其餘不受影響」讀起來也更像同一文件的其餘關聯表單，而非表單池的其他表單），但 AC3 文字本身可兩解。本設計已拆為 TS-009（解讀 a）與 TS-021～023（解讀 b，對應表單池刪除），**建議 spec 作者/architect 確認 AC3 意圖並在 spec 中補上消歧文字**，或明確承認兩者皆為獨立 AC。

- **OQ-F018-02（spec 文字 vs prototype 行為之數值落差）**：F018 AC8 逐字為「Given 表單另被 N（≥1）份文件引用, When 上傳新檔覆蓋, Then 顯示…警示」——字面讀法是 **N≥1 即應警示**。但 `prototypes/19-usage-form-management.html` 之 `overwriteForm()` 實際邏輯是 **`docs.length >= 2` 才警示**，`docs.length === 1` 走一般確認、無跨文件碼（理由似為：從表單池頁面操作覆蓋時，若僅 1 份文件引用，被視為「等同該文件自己的操作」而非「影響到其他文件」）。本測試設計以 prototype 行為為準（TS-016/017 之邊界），因 prototype 是唯一提供具體數值判準的產出物，但**這是文字定案與已產出 prototype 之間的落差，需 architect 定案何者為權威**，並回頭修正 spec 文字之精確措辭（例如改為「另被 N（≥2）份文件引用」或明確定義「另被」之計算基準）。若最終定案為「N≥1 即警示」，TS-016 之預期結果需整條翻轉。

- **OQ-F018-03**：`USAGE_FORM_IN_USE` 錯誤碼僅見於 F018 feature spec 之 Main Flow 內文與 prototype 程式碼，**未列入 `error-handling.md` 中央錯誤碼表**（該表第 51 行僅列 `USAGE_FORM_OVERWRITE_SHARED`，無 `USAGE_FORM_IN_USE` 列）。需確認是否為 `error-handling.md` 之遺漏（應補列），或此碼已在某次修訂中被廢棄改用其他表達方式（如統一以 409 + 訊息文字，不另立具名碼）。TS-022 暫依 spec 正文與 prototype 為準採用此碼。

- **OQ-F018-04（與 F016 OQ-F016-01 同一根因，此處另有 prototype 直接證據）**：系統管理員嘗試寫入表單池（上傳/覆蓋/刪除）之精確錯誤碼衝突——`FUNCTION_MATRIX['文件使用表單管理'].SysAdmin = 'READ'`，若端點沿用既有 `@RequirePermission(FunctionKey.USAGE_FORM_MANAGEMENT, 'write')` 路由層閘門模式（如 `documents.controller.ts` 慣例），`canPerform` 對 READ 列執行 write 動作回 `false` → `PERMISSION_DENIED`；但 prototype 第 71 行明確文案「唯讀模式 · 系統管理員僅可查詢與下載表單、檢視關聯文件，無法上傳或移除（**FIELD_WRITE_FORBIDDEN**）」——prototype 作者顯然預期是欄位層（或等效機制）之拒絕碼，而非功能層。此為本 worktree**兩個 feature（F016、F018）共通的架構層決策點**，應合併討論、一次定案（route-level 動作要求為 `'read'` 或 `'write'`），不宜各自為政分別實作出不一致的錯誤碼慣例。

- **OQ-F018-05**：批次上傳（Alternative Flow「一次上傳多個 excel/pdf」）中，若批次內部分檔案合法、部分格式不符或超限，行為未定義——整批擋下（任一失敗則全部不建立）或僅擋不合法者、其餘照常建立各自記錄？兩種語意皆合理但對使用者體驗與交易邊界影響顯著，無法在此假設任一結果並斷言，列為 gap，未納入正式 TS。

- **OQ-F018-06**：「後台管理頁下載表單」（相對於 AC7 明文的「前台下載」）是否也應觸發稽核，spec 僅明文「前台下載表單 → 記錄稽核」，Main Flow 未提及後台下載的稽核義務。若後台下載也需稽核但未落實，將是稽核完整性缺口；若刻意排除，spec 應明文排除理由。TS-013 僅覆蓋前台路徑，後台下載稽核義務暫列 gap。

- **OQ-F018-07**：多對多關聯附屬表（documentId↔formId）之資料模型未見於 `data-model.md`（僅有 `DOC_SECONDARY_CHIEF`／`DOC_USING_DEPT` 兩個附屬表明列，無對應 `DOC_USAGE_FORM` 或等效表定義），與「使用表單為表單池多對多（OQ-E05-04 定案）」之文字定案不完全對齊於資料模型章節。建議 data-model.md 補上此附屬表定義（比照既有兩個附屬表格式），供實作與測試雙方有一致的資料形狀依據。

---

# F018 — 表單編號 delta ＋「編輯編號」動作 · Test Design（Lane L7，2026-08-16 追加）

> source: `docs/specs/features/F018-usage-form-management.md` §表單編號 delta（`AC-D1`～`AC-D10`、`AC-D15`）
> ＋ §「編輯編號」動作（`AC-D16`～`AC-D21`）＋ `docs/specs/error-handling.md#usage-form-number`
> ＋ `docs/specs/architecture-spec.md` §10.7（決策 A7 與 A14）＋ `prototypes/19-usage-form-management.html`
> 缺失／變更 delta 第 18 項 · 2026-08-16 · lane L7
>
> ⚠ **本段不含 `AC-D11`／`AC-D12`／`AC-D14`（前台使用表單下載燒錄）**——該批屬 Lane C（浮水印線）。
> `AC-D13`（後台 RAW 回歸鎖定）之「使用表單管理頁」切片因檔案所有權落在本線，於本段涵蓋一條。

## 新增之契約（本 lane 據 §10.7／A14 定形，implementer 須照此形狀實作）

```
// 共用純函式（上傳與編輯兩條寫入路徑共用，避免 AC-D4／AC-D18 分歧）
backend/src/usage-forms/form-number.ts
  export const FORM_NUMBER_MAX_LENGTH = 100;
  export function normalizeFormNumber(v: string | null | undefined): string | null;  // trim；空→null
  export function assertFormNumberValid(v: string | null): void;                     // >100 → USAGE_FORM_NUMBER_TOO_LONG

// 端點（A14）
PATCH /admin/usage-forms/:formId/number    body { formNumber: string | null }（只此一鍵）
  @RequirePermission(FunctionKey.USAGE_FORM_MANAGEMENT, 'read')   ← 路由層
  service: assertCanWriteDocumentAsset(role, USAGE_FORM_MANAGEMENT, FieldKey.USAGE_FORMS) ← 欄位層
  → 200 ＋ 更新後之該列（不用 204）
  handler 名：UsageFormsController.updateNumber(req, formId, body)
  service：UsageFormsService.updateFormNumber(session, formId, formNumber)
  store：FormPoolStore.updateFormNumber(formId, formNumber)   ← 與 updateFile 分離＝AC-D20 之結構性保證

// 型別 additive
UsageFormRecord.formNumber: string | null；CreateFormInput.formNumber?: string | null
UsageFormsService.uploadForm(session, file, name?, formNumber?)
前端：endpoints.updateUsageFormNumber(formId, formNumber)；UsageFormPoolItem.formNumber
前端：frontend/src/domain/usage-form-label.ts → usageFormOptionLabel({formNumber, name})  ← AC-D8
```

## AC ↔ 約束對照

| AC | 約束 | 檔案 · ID |
|---|---|---|
| `AC-D1` 表頭七欄逐字、null 顯示 `—` | `getAllByRole('columnheader')` 逐字陣列比對 | `UsageFormManagementPage.formNumber` TS-D18-060/062 |
| `AC-D2` 上傳可設定編號、trim、空→null | 服務層 ＋ **前端主線**（於上傳 modal 填入編號 → 該值隨 `uploadUsageForms` 送出；2026-08-16 補，原三條既有上傳測試皆為「留空」情境、不足以涵蓋） | `usage-forms.service.number` TS-D18-010/011；`UsageFormManagementPage.formNumber` **TS-D18-082** |
| `AC-D3` null→FM-002→null 往返（兩處載體） | ① UI 往返 ② 服務層往返 | TS-D18-071/072；TS-D18-020/021 |
| `AC-D4` 唯一性（trim／不分大小寫／不寫記錄不上傳 blob） | 三種大小寫變體參數化 ＋ `blob.putCalls` 為 0 | TS-D18-013/014 |
| `AC-D5` 多筆 null 並存 | 4 筆 null 皆成功 | TS-D18-012 |
| `AC-D6` 100 通過／101 → 400 | 純函式 ＋ 服務層 | TS-D18-007/008；TS-D18-015/016 |
| `AC-D7` 既有列一律 null、不自動產生 | ⛔ **本環涵蓋不到**（見下表 #1） | — |
| `AC-D8` F017 下拉 label `{編號} {名稱}` | 純函式 | `usage-form-label` TS-D18-090～094 |
| `AC-D9` 不擴及附錄 | ⛔ 屬 F039／Lane L5 之檔案所有權，本線不建 | 見下表 #4 |
| `AC-D10` 🔒 既有行為回歸 | 既有 `usage-forms.service.spec.ts`／`UsageFormManagementPage.test.tsx` 維持綠燈且期望值未改 | 既有檔（未改動） |
| `AC-D15` ① 編號欄 `data-form-number`／`—`／`title`／mono | 逐字 | TS-D18-061/062 |
| `AC-D15` ② 上傳 modal `#upNumber`／maxlength／placeholder／label | 逐字 | TS-D18-063 |
| `AC-D15` ③／`AC-D16` 兩則錯誤訊息逐字（沿用同一組） | 於 `#enNumberErr` 斷言逐字 | TS-D18-074/075 |
| `AC-D16` 動作存在、`data-edit-number`、modal 各元素逐字、取消不變更 | 逐項 | TS-D18-064/066～069 |
| `AC-D17` 🔴 無寫入權角色之動作**自 DOM 移除** | `queryByLabelText('編輯編號') === null` ＋ `[data-edit-number] === null`；ICSOPAdmin 皆非 null | TS-D18-078/079 |
| `AC-D17` 服務層三分角色 | ICSOPAdmin 2xx／SysAdmin `FIELD_WRITE_FORBIDDEN`／其餘三角 `PERMISSION_DENIED` | `usage-forms.service.number` TS-D18-032～034 |
| `AC-D17` 路由層閘門為 read | route metadata ＋ `RolePermissionGuard` 逐角色 | `usage-forms.controller.number` TS-D18-041/043/044 |
| `AC-D18` 排除自身列、大小寫變體、長度 | 六個案例 | TS-D18-022～025 |
| `AC-D18` 並發（DB filtered unique index 為最終保護） | 2601／2627 → 409；547 不得誤映射 | `usage-forms.number-concurrency` TS-D18-050～052 |
| `AC-D19` 清空為合法、不觸發比對、UI 回 `—` | 服務層 ＋ UI | TS-D18-026/027；TS-D18-072/073 |
| `AC-D20` 六欄未變／Blob 未讀未寫／關聯未變／不寫稽核／不觸發覆蓋警示／body 只一鍵 | 逐欄比對 ＋ `blob.{put,delete,url}Calls` 皆 0 ＋ `updateFileCalls` 為空 ＋ audit events 為空 ＋ 夾帶其他鍵被忽略 | TS-D18-028～030；`controller.number` TS-D18-045～047 |
| `AC-D21` ① icon `hash`（非 pencil） | `.lucide-hash` 存在、`.lucide-pencil` 不存在 | TS-D18-065 |
| `AC-D21` ② `#enFormName` **恰為** name | 全等比對（非 contain） | TS-D18-068 |
| `AC-D21` ③ 關閉鈕 `aria-label` 逐字 `關閉`、行為同取消 | — | TS-D18-070 |
| `AC-D21` ④ 錯誤時輸入框呈現與正常態可區分 | className 前後不相等（色票／class 名屬設計裁量、不入斷言） | TS-D18-076 |
| `AC-D13`（切片） 後台個別下載仍走既有 helper | `downloadPoolForm` 被呼叫、無任何前台燒錄 helper 被呼叫 | TS-D18-081 |
| §10.7 A14 端點不得併入覆蓋上傳 | 路徑／方法／handler 皆不同 | `controller.number` TS-D18-040/042 |

## 🔴 本環涵蓋不到

| # | 涵蓋不到者 | 為何 | 把關手段 |
|---|---|---|---|
| 1 | `AC-D7`／migration：欄位與 filtered unique index 是否真的建了、既有列是否一律 `null` | §10.15 第 6 項「原理上測不到」——單元測試全綠證明不了 schema 存在 | 見交付物 ③ (乙) 之三條驗收查詢 |
| 2 | `formNumber` 之**大小寫不敏感**是否真的成立 | §10.15 第 7 項「原理上測不到」——記憶體 fake 用正規化比對會恆綠，即使 DB 為 `_CS_` | 對真 SOP DB 實測兩案 |
| 3 | `DocumentListPage` 之「使用表單」下拉**是否真的消費** `usageFormOptionLabel` | 該頁測試檔屬其他分線（L4），本線不得改動 | 瀏覽器煙霧：開後台文件清單 → 使用表單篩選下拉，確認有編號者顯示 `FM-001 進件申請書` |
| 4 | `AC-D9`（不擴及附錄）之回歸鎖定 | `AppendixManagementPage*` 與 `backend/src/appendices/**` 屬其他分線 | 由該線或 lead 於合併時以 `git diff --stat` 確認 `APPENDIX_POOL` 相關檔未被本 delta 觸及 |
| 5 | 「編輯編號」在真瀏覽器之 modal 疊層／焦點行為 | jsdom 無版面 | 瀏覽器煙霧 |

---

## 🔴 2026-08-16 追加 — `AC-D14` 前台使用表單下載之稽核義務與快照落值（lane **L3/L4 代管**，原屬 L2）

> 由來：Lane C（L2）回報 `G-L2-01`——`AC-D14` 之 **service 層**無測試載體（當時 `backend/src/usage-forms/**` 屬 Lane A）。
> 2026-08-16 由 lead 改指派 Lane B 補齊，**只補 `AC-D14` 一條**。
> 權威＝[F018 §前台使用表單下載燒錄](../../specs/features/F018-usage-form-management.md#front-burn-delta) `AC-D14`
> ＋ [F020 `AC-D5`](../../specs/features/F020-watermark.md#front-burn-scope-delta)
> ＋ [architecture-spec §10.1](../../specs/architecture-spec.md#ch10-defect-delta)（使用表單前台下載作**與附錄逐字相同**之改動；快照取自 `WatermarkService.buildSnapshot()`，不得自行組字）。

| AC | 主張 | 測試載體 |
|---|---|---|
| `AC-D14` PDF | 恰一筆 `targetType='USAGE_FORM'`／`actionType='DOWNLOAD'`／`formId`＋`documentId` 落列 | `usage-forms.front-burn.service.spec.ts` `TS-F018-D14-001` |
| `AC-D14` PDF | `watermarkSnapshot` 與**該次燒錄**之字串逐字相同；且其唯一來源＝`WatermarkService.buildSnapshot()` | 同上 `TS-F018-D14-002`／`003` |
| `AC-D14` 非 PDF | **同樣寫入該筆稽核**，惟 `watermarkSnapshot` 為 `null` | 同上 `TS-F018-D14-004`／`005` |
| `AC-D14` 不變式 | 兩種格式之稽核筆數 1:1，僅快照落值不同（「燒錄與否不改變稽核義務」） | 同上 `TS-F018-D14-006` |
| 既有語意 | 失敗路徑（未登入／表單不存在）不燒錄、不寫稽核 | 同上 `TS-F018-D14-007`／`008` |

### 本輪由 test-generator 釘下之新契約（可申訴）

| 項目 | 契約 |
|---|---|
| `UsageFormAuditEvent` additive | 新增 `watermarkSnapshot: string \| null`（現況無此欄 ⇒ 型別紅） |
| 燒錄協作點之注入位置 | `UsageFormsService` 建構子**第 6 參數**（前 5 為既有 `blob`／`store`／`audit`／`uploaderDir?`／`orgResolver?`）。附錄側為第 7 參數，位置不同僅因既有建構子長度不同 |

### 🔴 跨線待裁決（**不由本 lane 自行處置**）

`AC-D11`／`AC-D12`／§10.1 要求前台 `downloadForm()` 由回傳 `DownloadGrant`（SAS URL）改為回傳位元組，且稽核事件加欄。
這會使**既有** `backend/src/usage-forms/usage-forms.service.spec.ts` 之下列案例失效：

| 既有案例 | 失效原因 |
|---|---|
| `TS-013 前台下載成功 → 核發憑證 + 稽核參數正確` | `expect(grant.url).toContain(...)`（改回位元組後無 `url`）＋ `expect(audit.events).toEqual([{…5 鍵}])`（加欄後 exact match 失敗） |
| `TS-FM-003`／`TS-FM-004`（主管／部門窗口經 `downloadForm` 下載） | 同上；另含「後台角色走前台方法」之語意問題——`AC-D13` 只列舉後台**頁面**，未規範後台角色打前台端點 |

**附錄側存在完全同型之遺留**（Lane C 亦未處置 `appendices.service.spec.ts:428/452` 之 `grant` 斷言）⇒ 兩處應由 lead 一次裁決，本 lane 不單方面修改（檔案所有權未明示授予）。詳見 `risks-and-gaps` `G-L3-05`。
