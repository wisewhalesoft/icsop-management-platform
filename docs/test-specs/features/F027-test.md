---
type: test-design-feature
feature_id: F027
feature_name: .xls 原件保存（RAG 內容來源）
priority: P0-MVP
related_spec: docs/specs/features/F027-xls-source-presentation-pdf.md
last_updated: 2026-07-22
status: draft
---

# F027 — .xls 原件保存 · Test Design
> source: docs/specs/features/F027-xls-source-presentation-pdf.md · worktree: storage · 2026-07-22

## 測試策略（unit 用假 Blob store＋純規則；真 Azure Blob/DB＝[integration]、序列化暫不自動化）

沿用 F016 之 `FakeBlobStore` 假體。另需：

- **`FakeXlsSourceStore`**：比照 `FakeStore` 風格，記憶體維護 `DOC_SOURCE_XLS`（`id`/`documentId`/`blobPath`/`fileName`/`contentType`/`size`/`edition`/`uploadedBy`/`uploadedAt`，1:1 覆蓋式），記錄寫入呼叫供斷言「驗證失敗時完全未寫入」。
- **模板驗證邏輯之單元測試邊界**：`icsop-template-analysis.md` 已確認真實樣本結構——標準模板 = **恰好 5 個工作表**（`封面`／`目錄&目的`／`.流程圖`／`作業流程`／`變更履歷`）且每表皆含「標準格式」旗標標記（O/P/Q 欄一帶）。本設計將「模板結構驗證」拆為**純規則層**（給定已解析之 `{ sheetNames: string[]; hasStandardFlag: Record<string, boolean> }` 摘要物件，判斷是否為 `XLS_TEMPLATE_INVALID`）與**二進位解析層**（真實 `.xls` 位元組解析出上述摘要物件，需真實 xls 解析函式庫與具代表性檔案樣本）。前者為 **[unit]**，後者為 **[integration]**（本 worktree 僅有 1 份真實樣本可用，變體率仍 `[BLOCKING]`，見開放設計問題）。
- **F028 抽取管線之觸發**：本 worktree 僅驗證「成功保存後呼叫了觸發抽取管線的 collaborator（如 `extractionTrigger.enqueue(documentId)`）」此 seam 存在性，不驗證抽取本身（F028 屬另一 feature、未來 worktree）。
- **RBAC**：沿用 `FunctionKey.ICSOP_DOCUMENT_MANAGEMENT`（.xls 為文件之附件欄位，非獨立功能）＋ `field-matrix.ts` 純判定。
- **[integration]**：真實 `.xls` 二進位解析（含損毀檔案）、真實 Azure Blob、F028/F030 實際管線執行。

## Test Scenarios

### 成功上傳

#### TS-F027-001 上傳符合標準模板之 .xls [unit]
- Given：ICSOPAdmin、副檔名 `.xls`、解析摘要 `sheetNames = [封面, 目錄&目的, .流程圖, 作業流程, 變更履歷]`（5 表齊全）、`hasStandardFlag` 全部為 `true`
- When：上傳
- Then：成功保存，建立/覆蓋 `DOC_SOURCE_XLS`；`edition` 欄位寫入當下 `ICSOP_DOCUMENT.edition` 快照值；觸發抽取管線 collaborator 被呼叫一次（帶正確 `documentId`）；**未**呼叫任何 PDF 產生/轉檔相關邏輯
- 對應 AC / 錯誤碼：AC1

#### TS-F027-002 文件尚無 .xls，首次上傳 [unit]
- Given：文件無既有 `DOC_SOURCE_XLS` 記錄
- When：上傳合法 .xls
- Then：建立新記錄（`documentId` 1:1）
- 對應 AC / 錯誤碼：資料模型（1:1、覆蓋式）

### 格式白名單（副檔名/MIME 層，先於模板結構驗證）

#### TS-F027-003 上傳副檔名為 .xlsx 之檔案 [unit]
- Given：ICSOPAdmin、`.xlsx`（即便內容結構符合五表）
- When：上傳
- Then：拒絕，回 `FILE_FORMAT_NOT_ALLOWED`（**非** `XLS_TEMPLATE_INVALID`——F027 僅接受 `.xls`，格式白名單判定應**先於**模板結構解析，未進入解析階段）
- 對應 AC / 錯誤碼：格式白名單分工邊界（prototype「ICSOP 原始檔＝.xls」明確排除 .xlsx）

#### TS-F027-004 上傳副檔名為 .csv / .docx 之檔案 [unit]
- Given：ICSOPAdmin、`.csv` 或 `.docx`
- When：上傳
- Then：`FILE_FORMAT_NOT_ALLOWED`
- 對應 AC / 錯誤碼：同上

#### TS-F027-005 上傳超過 50MB 之 .xls [unit]
- Given：`size = 50MB + 1byte`
- When：上傳
- Then：`FILE_SIZE_EXCEEDED`
- 對應 AC / 錯誤碼：OQ-E04-06 定案（單檔 ≤50MB）

#### TS-F027-006 上傳恰為 50MB 之合法 .xls [unit]
- Given：`size = 50MB`，模板結構合法
- When：上傳
- Then：成功（邊界含）
- 對應 AC / 錯誤碼：OQ-E04-06

### 模板結構驗證（XLS_TEMPLATE_INVALID）

#### TS-F027-007 工作表名稱集合與標準五表不符 [unit]
- Given：`.xls`、解析摘要 `sheetNames` 缺少「變更履歷」（僅 4 表）
- When：上傳
- Then：拒絕，回 `XLS_TEMPLATE_INVALID`，提示模板驗證失敗原因
- 對應 AC / 錯誤碼：AC2（依 `icsop-template-analysis.md` §2 標準五表定義）

#### TS-F027-008 工作表名稱集合齊全，但其中一表缺少「標準格式」旗標 [unit]
- Given：`sheetNames` 恰為標準五表，但 `hasStandardFlag['封面'] = false`
- When：上傳
- Then：拒絕，回 `XLS_TEMPLATE_INVALID`（**依 §5「建議的低成本盤點法」推論——名稱集合與旗標須皆滿足，此為推論規則，非 spec 逐字定案，見開放設計問題 OQ-F027-01**）
- 對應 AC / 錯誤碼：AC2（推論延伸）

#### TS-F027-009 檔案已損毀（非合法 Excel 二進位） [integration]
- Given：真實檔案位元組非合法 xls 格式（無法被 xls 解析函式庫開啟）
- When：上傳
- Then：拒絕，回 `XLS_TEMPLATE_INVALID`
- 對應 AC / 錯誤碼：Edge Case「已損毀」；需真實 xls 解析函式庫處理損毀位元組，非純規則單元測試可覆蓋

#### TS-F027-010 驗證失敗時既有檔案完全不受影響 [unit]
- Given：文件已有合法 `.xls`（`blobPath=A`）與 `ICSOP_PDF`（`blobPath=P`）
- When：上傳一份工作表名稱不符之新 .xls
- Then：`XLS_TEMPLATE_INVALID`；`DOC_SOURCE_XLS.blobPath` 仍為 A；`DOCUMENT_ATTACHMENT(ICSOP_PDF).blobPath` 仍為 P；`blobStore.put` 未被呼叫；抽取管線 collaborator 未被呼叫
- 對應 AC / 錯誤碼：AC2「既有 .xls 與既有 ICSOP PDF 皆保持不變」

### 覆蓋 + 觸發重抽

#### TS-F027-011 重新上傳新版合法 .xls 覆蓋舊檔 [unit]
- Given：文件已有 `.xls`（`blobPath=A`），已有 ICSOP PDF（`blobPath=P`）
- When：上傳新版合法 `.xls`（`blobPath=B`）
- Then：`DOC_SOURCE_XLS.blobPath` 更新為 B；觸發重抽 collaborator（對應 F030）被呼叫；`DOCUMENT_ATTACHMENT(ICSOP_PDF).blobPath` 仍為 P（完全不受影響，未被任何 store 呼叫觸碰）
- 對應 AC / 錯誤碼：AC3

#### TS-F027-012 覆蓋後舊 .xls 不再可經文件記錄存取 [unit]
- Given：TS-011 情境後
- When：查詢文件之 .xls 參照
- Then：僅回傳新版（blobPath=B），無歷史版本清單可查（不留歷史檔）
- 對應 AC / 錯誤碼：Alternative Flow「覆蓋舊 .xls，舊檔不再可經文件記錄存取」

### .xls 與 PDF 各自獨立（OQ-E09-10）

#### TS-F027-013 上傳 .xls 成功不呼叫任何 PDF 轉檔邏輯 [unit]
- Given：合法 .xls 上傳（TS-001 情境）
- When：上傳完成
- Then：驗證系統未呼叫任何 PDF 產生/轉檔相關 collaborator（回歸驗證 OQ-E09-10「取消自動轉檔」，`XLS_PDF_CONVERSION_FAILED` 路徑已不存在）
- 對應 AC / 錯誤碼：AC1「系統不產出任何 PDF」

#### TS-F027-014 上傳新 ICSOP PDF 不觸發 .xls 相關重抽 [unit]
- Given：文件已有 .xls
- When：透過 F016 路徑上傳新 ICSOP PDF
- Then：F027 服務未被呼叫、`DOC_SOURCE_XLS` 未變動、未觸發重抽（純粹驗證 F027 未訂閱 PDF 上傳事件，屬跨 feature 邊界的介面存在性驗證）
- 對應 AC / 錯誤碼：Postconditions「各自獨立」

#### TS-F027-015 .xls 與既有 ICSOP PDF 內容標記不一致 [unit]
- Given：測試替身層面模擬「.xls 版本標記」與「ICSOP PDF 版本標記」不同（如各自附帶不同的模擬版本註記）
- When：分別各自成功上傳
- Then：系統不執行任何一致性檢查、不告警，兩者各自成功保存且共存
- 對應 AC / 錯誤碼：AC4

### 索引狀態（供 F031 使用，僅驗證資料旗標本身）

#### TS-F027-016 文件僅有 PDF 無 .xls [unit]
- Given：文件僅有 `DOCUMENT_ATTACHMENT(ICSOP_PDF)`，無 `DOC_SOURCE_XLS`
- When：查詢該文件之 RAG 內容來源狀態
- Then：呈現「無來源」/「尚未建立索引」旗標（本 feature 僅需暴露正確旗標；F031 之呈現字樣/UI 邏輯不在本 worktree 範圍，見開放設計問題 OQ-F027-04）
- 對應 AC / 錯誤碼：AC5

### RBAC

#### TS-F027-017 ICSOPAdmin 上傳 .xls [unit]
- Given：ICSOPAdmin
- When：上傳合法 .xls
- Then：允許
- 對應 AC / 錯誤碼：AC6 反面對照

#### TS-F027-018 系統管理員上傳 .xls [unit]
- Given：SysAdmin（`ICSOP文件管理`=READ）
- When：上傳
- Then：拒絕（403）；**精確碼待定，見 F016 OQ-F016-01（同一根因）**
- 對應 AC / 錯誤碼：AC6

#### TS-F027-019 主管上傳 .xls [unit]
- Given：Supervisor（READ）
- Then：同上，拒絕（403，精確碼待定）
- 對應 AC / 錯誤碼：AC6

#### TS-F027-020 部門窗口上傳 .xls [unit]
- Given：DeptContact（READ）
- Then：同上
- 對應 AC / 錯誤碼：AC6

#### TS-F027-021 一般使用者上傳 .xls [unit]
- Given：User（`ICSOP文件管理`=NONE）
- Then：拒絕，回 `PERMISSION_DENIED`（無歧義，`NONE` 列讀寫皆拒）
- 對應 AC / 錯誤碼：AC6 / `PERMISSION_DENIED`

### 對外存取邊界

#### TS-F027-022 一般使用者/前台無 .xls 下載端點 [integration]
- Given：.xls 為 authoring source（非 `DOCUMENT_ATTACHMENT`，僅供 F028 抽取管線讀取，非使用者可見附件）
- When：任何角色嘗試取得 .xls 之下載憑證/URL
- Then：預期系統未提供對外下載端點（消極驗證：路由不存在或一律拒絕）
- 對應 AC / 錯誤碼：Description「.xls 僅作 RAG 內容來源」；需實際路由/架構確認端點是否存在，見開放設計問題 OQ-F027-03

### 資料模型細節

#### TS-F027-023 edition 欄位快照當下文件版次 [unit]
- Given：文件當下 `edition = "26'03"`
- When：上傳 .xls
- Then：`DOC_SOURCE_XLS.edition = "26'03"`（快照值，非之後文件版次變動時同步更新的即時參照——之後文件 edition 改為 `"26'04"` 時，`DOC_SOURCE_XLS.edition` 仍維持上傳當下之 `"26'03"`，除非重新上傳 .xls）
- 對應 AC / 錯誤碼：data-model `DOC_SOURCE_XLS.edition`「上傳當下文件版次快照」

## AC → TS 覆蓋對照表

| AC/來源 | 內容摘要 | 對應 TS |
|---|---|---|
| AC1 | 符合模板 .xls 上傳成功，觸發抽取，不產 PDF | TS-001, TS-013 |
| AC2 | 模板不符/損毀 → `XLS_TEMPLATE_INVALID`，既有檔案不變 | TS-007, TS-008, TS-009, TS-010 |
| AC3 | 重新上傳覆蓋並觸發 F030 重抽，PDF 不受影響 | TS-011, TS-012 |
| AC4 | .xls 與 PDF 內容不一致，不阻擋不告警 | TS-015 |
| AC5 | 僅有 PDF 無 .xls → 「尚未建立索引」 | TS-016 |
| AC6 | 非 ICSOP 管理員上傳 → 依 F025/F026 拒絕 | TS-017～021 |
| 格式白名單邊界 | .xls-only，非 .xlsx | TS-003, TS-004 |
| 大小上限 | ≤50MB | TS-005, TS-006 |
| OQ-E09-10（各自獨立） | 不產生 PDF 轉檔耦合 | TS-013, TS-014 |
| 資料模型（1:1/覆蓋） | 首次建立、edition 快照 | TS-002, TS-023 |
| 對外存取邊界 | .xls 非使用者可見 | TS-022 |

## 開放設計問題

- **OQ-F027-01（模板驗證規則粒度未定案，核心風險）**：`icsop-template-analysis.md` §5 僅提出「**建議的**低成本盤點法」——(a) 工作表名稱集合是否恰為標準五表、(b) 是否含「標準格式」旗標——但未定案：
  1. (a)、(b) 是否**皆為必要條件**（本文件 TS-007/008 採此推論，兩者缺一即 `XLS_TEMPLATE_INVALID`），或僅其一即可判定？
  2. 名稱集合是否要求**恰好**5 表（多餘工作表混入是否也判定失敗），或僅要求**至少包含**這 5 表（允許額外工作表存在）？
  3. 「標準格式」旗標須**全部 5 表皆有**才算通過，或**任一表有**即視為模板一致？
  4. 工作表名稱比對是否**精確字串相等**（含前導點 `.流程圖` 字面），或允許大小寫/前後空白容錯？

  這些規則細節目前**僅有 1 份真實樣本**可佐證（`icsop-template-analysis.md` §5 明言「仍 `[BLOCKING]`」），OQ-E09-04（全 corpus 變體率）尚未收斂。**在此規則精確定案前，`XLS_TEMPLATE_INVALID` 之邊界測試（TS-007/008）僅能視為最保守假設下的設計草稿，非權威 oracle**；一旦取得更多真實 corpus 樣本，此測試檔案的模板驗證段落需要重新校準。品質風險：規則定得過嚴會誤擋合法但格式略有差異的既有文件（598 份 corpus 尚未盤點），定得過寬則放行實質不符模板的內容進入 RAG 索引產生殘缺/錯誤答案（F028/F029 下游風險）。

- **OQ-F027-02（與 F016/F018 同根因）**：非 ICSOPAdmin 角色上傳 .xls 被拒之精確錯誤碼（`PERMISSION_DENIED` vs `FIELD_WRITE_FORBIDDEN`）依附件端點路由層 `@RequirePermission` 動作設計（`'read'` 或 `'write'`）而定，詳見 `F016-test.md` 之 `OQ-F016-01`。TS-018～020 暫不斷言精確碼。

- **OQ-F027-03**：`.xls` 是否存在任何形式的對外下載端點未定義。Spec 定位 `.xls` 為「authoring source，僅作 RAG 內容來源」，隱含不應對一般使用者/前台開放下載，但也未明文「禁止下載」或「僅限 ICSOPAdmin 可下載原件供編輯之用」（例如 ICSOPAdmin 是否需要「取回目前上傳的 .xls 供修改後重新上傳」的工作流程？若需要，就必須有下載端點，只是限縮存取角色）。TS-022 之「消極驗證」在端點確實不存在時才有意義；若架構決定提供 ICSOPAdmin 專用下載端點，則本 TS 之預期結果需整條修正為「驗證僅 ICSOPAdmin 可下載，其餘角色 `FILE_ACCESS_DENIED`」。需與 architect 確認是否需要「取回原件」工作流程。

- **OQ-F027-04**：F031（文件索引管理，`⬜ 未開始`）之「尚未建立索引」旗標確切資料形狀（本 feature／F027 服務應寫入哪個欄位、或由查詢時即時判斷「有無 `DOC_SOURCE_XLS` 記錄」推導，無需獨立旗標欄位）未定義。TS-016 假設為「即時推導」（無 `DOC_SOURCE_XLS` 記錄即代表無來源），此為最簡單、最貼合 data-model 現有欄位定義的推論，但需 F031 之 worktree 或 architect 確認介面契約一致。

- **OQ-F027-05**：F028 抽取管線與 F030 重抽管線之觸發介面（同步呼叫、內部事件匯流排、或外部 job queue）未於 architecture-spec.md 定義；TS-001/011 僅驗證「觸發 hook 被呼叫」之抽象存在性，非確切呼叫簽章/非同步語意。F028/F030 屬未來 worktree 範圍，需及早與該 worktree 對齊介面契約（例如是否為 `EventEmitter.emit('xls.uploaded', {documentId})` 或直接的 service-to-service 呼叫），避免本 worktree 先行實作出的觸發點介面與下游 worktree 的期待不相容。

- **OQ-F027-06**：`architecture-spec.md` §8.3 之開放問題表仍將 `OQ-E04-06 / OQ-E05-02`（檔案大小上限/允許格式清單）標記為「**Blocking**」，但 `open-questions.md` 該條目已標「[已定案 ✅]」並給出具體數值（≤50MB；PDF/OJT=pdf,jpg,png；使用表單=xlsx,xls,pdf）。兩份文件對「此問題是否仍屬 Blocking」的認知不一致，建議 architecture-spec.md 同步更新該表格列狀態，避免下游誤判此問題仍待確認而重新開會討論已定案事項。
