---
type: test-design-feature
feature_id: F028
feature_name: .xls 模板感知內文抽取與清洗
priority: P0-MVP
related_spec: docs/specs/features/F028-template-aware-extraction.md
last_updated: 2026-07-23
status: draft
---

# F028 — .xls 模板感知內文抽取與清洗 · Test Design
> source: docs/specs/features/F028-template-aware-extraction.md · worktree: rag (F028-F031) · 2026-07-23

## 測試策略（unit 用「已解析工作表」fixture＋純規則抽取器；真 .xls 二進位解析＝[integration]）

F028 的輸入是**已通過 F027 上傳驗證**（`XLS_TEMPLATE_INVALID` 未觸發）的 `DOC_SOURCE_XLS`。但 F028 自身仍須**獨立判斷抽取是否成功**（`EXTRACTION_FAILED`），因為：
1. F030 可能在**沒有新上傳事件**的情況下重新觸發 F028（例：模板規則日後收斂調整，對既有已通過 F027 舊版規則之 .xls 重跑抽取）；
2. F027 僅驗證「工作表名稱集合＋標準格式旗標」（粗粒度模板閘門），F028 需要更深一層「內容區塊結構」是否可解析（細粒度抽取閘門）——見開放設計問題 OQ-F028-01。

### 測試替身輸入契約（`ParsedXlsWorkbook`，非真實 .xls 位元組）

單元測試一律以「已完成二進位解析」的結構化物件為輸入，模擬 F027 沿用之 xls 解析函式庫輸出（真實二進位解析為 [integration]，見 `F027-test.md` 測試策略同一分工）：

```
ParsedXlsWorkbook {
  sheetNames: string[]
  hasStandardFlag: Record<string, boolean>        // 沿用 F027 XlsTemplateSummary 之欄位形狀
  sheets: {
    封面: { headerBlock: HeaderFields; signOffBlock: SignOffBlock }
    '目錄&目的': { purpose: string; scope: string; linkedDocs: string[]; chapterOutline: ChapterOutlineEntry[] }
    '.流程圖': { /* 本 feature 不讀取此表內容，見 TS-F028-014 */ }
    作業流程: { sections: RawSectionBlock[] }
    變更履歷: { rows: ChangeLogRow[] }
  }
}

RawSectionBlock {
  chapterNo: string          // 如 "第2章"
  sectionNo: string | null   // 如 "第3節"；章層級無節細分時為 null
  executor: string
  timeLimit: string
  contentCells: MergedOrPlainCell[]   // 「作業內容」欄位之原始儲存格序列，依列順序排列
  pageNumber: number
}

MergedOrPlainCell {
  value: string | null       // 合併範圍內非錨點儲存格通常為 null（沿用主流 xls 解析函式庫慣例：合併值僅存在錨點儲存格）
  isMergeAnchor: boolean
  mergeSpan: number          // 1 = 非合併儲存格
}

HeaderFields { documentNumber: string; edition: string; draftingDept: string; pageOf: string; draftedDate: string }
SignOffBlock { chiefName?: string; deptManagerName?: string; signatureFields: string[] }
```

### 抽取器輸出契約（交付 F029 之中繼結果）

```
ExtractionResult {
  documentId: string
  status: 'success' | 'failed'
  sections: CleanedSection[]     // 僅 status='success' 有值
  failureReason?: string          // 僅 status='failed'
}

CleanedSection {
  chapterSection: string   // 正規化章節識別，如 "第2章第3節"
  executor: string
  timeLimit: string
  content: string          // 已接合、清洗完成之完整段落（純文字）
  pageNumber: number
}
```

- **`FakeTemplateAwareExtractor`**：接受 `ParsedXlsWorkbook`，套用抽取＋清洗規則，回傳 `ExtractionResult`。此為 [unit] 可完全覆蓋之核心邏輯。
- **`FakeIndexRunStore`**：記憶體維護 `INDEX_RUN`（`id`/`documentId`/`triggerType`/`status`/`stage`/`errorStage`/`errorMessage`/`startedAt`/`endedAt`），供斷言「抽取失敗時 `stage=extract`、`errorStage=extract`」。
- **合併儲存格接合**：純字串/結構操作，[unit] 完全可測，不需真實 xls 函式庫。
- **[integration]**：真實 `.xls` 二進位解析成 `ParsedXlsWorkbook`（含真實檔案之合併儲存格中繼資料是否符合本測試假設之 `MergedOrPlainCell` 形狀）、對 `icsop-template-analysis.md` 唯一真實樣本以外之全 corpus（≈598 份）模板變體之抽取涵蓋率（OQ-E09-04 仍 `[BLOCKING]`）。

## Test Scenarios

### 標準五表抽取（AC1）

#### TS-F028-001 標準格式 .xls 抽取「目的／適用範圍」區塊 [unit]
- Given：`ParsedXlsWorkbook`，`目錄&目的` 工作表含 `purpose`/`scope` 非空字串
- When：執行抽取
- Then：`ExtractionResult.status='success'`；抽取結果中可追溯到目的／適用範圍文字（不遺漏、不截斷）
- 對應 AC / 錯誤碼：AC1

#### TS-F028-002 標準格式 .xls 依章/節抽出逐節作業流程 [unit]
- Given：`作業流程` 工作表含 3 個 `RawSectionBlock`（第1章第1節、第1章第2節、第2章第1節），各自 `executor`/`timeLimit`/`contentCells` 齊全
- When：執行抽取
- Then：`ExtractionResult.sections.length === 3`，逐一對應正確 `chapterSection`/`executor`/`timeLimit`/`content`
- 對應 AC / 錯誤碼：AC1

#### TS-F028-003 抽出變更履歷表格內容 [unit]
- Given：`變更履歷` 工作表含 2 筆 `ChangeLogRow`（版次/生效日期/變更項次/變更內容簡述）
- When：執行抽取
- Then：抽取結果含對應之變更履歷文字內容（供 RAG 檢索引用，非 F037 之權威來源，見 F028 spec Related 註記）
- 對應 AC / 錯誤碼：AC1

#### TS-F028-004 章層級無節細分（僅章無節）之區塊 [unit]
- Given：一個 `RawSectionBlock` 之 `sectionNo=null`（如「第3章 定期自檢及異常管理」整章僅一段內容、無逐節細分）
- When：執行抽取
- Then：仍成功抽出為一個區塊，`chapterSection` 正規化為僅含章號（如 `"第3章"`，不產生 `"第3章第null節"` 之類錯誤字串）
- 對應 AC / 錯誤碼：AC1（Edge Case 延伸）

### 清洗（AC2）

#### TS-F028-005 移除重複頁首區塊 [unit]
- Given：`封面`/`目錄&目的`/`作業流程`/`變更履歷` 各工作表之 `headerBlock` 含文件標題／`文件編號`／`制定部門`／`版次`／`頁次`／`制定日期`／「企業內部文件－僅供內部使用」字樣
- When：執行清洗
- Then：`ExtractionResult` 之 `content` 中**不含**上述頁首字樣（任一工作表皆不殘留）
- 對應 AC / 錯誤碼：AC2

#### TS-F028-006 移除簽核區（含人員姓名） [unit]
- Given：`封面.signOffBlock` 含 `chiefName`/`deptManagerName` 具體姓名字串
- When：執行清洗
- Then：抽取結果不含任何簽核區姓名字串（回歸驗證「不含人員姓名進入索引」，呼應範本分析 §3.2）
- 對應 AC / 錯誤碼：AC2

#### TS-F028-007 移除合併儲存格空白（非內容承載用途） [unit]
- Given：`RawSectionBlock.contentCells` 中含純粹版面用途之空白合併儲存格（`value=null` 且非「作業內容」欄位延續）
- When：執行清洗
- Then：不產生空白段落／不產生僅含空白字元之 `content`
- 對應 AC / 錯誤碼：AC2

#### TS-F028-008 流程圖繪製格不進入抽取結果 [unit]
- Given：`.流程圖` 工作表存在於 `ParsedXlsWorkbook.sheetNames`
- When：執行抽取
- Then：`ExtractionResult.sections` 中不含任何來源標記為 `.流程圖` 工作表之內容（回歸驗證 OQ-E09-05「不抽取流程圖影像內容」，本表格僅有稀疏文字亦不納入）
- 對應 AC / 錯誤碼：AC2 / OQ-E09-05

### 合併儲存格接合（AC3，headline scenario）

#### TS-F028-009 「作業內容」跨 2 列合併儲存格正確接合 [unit]
- Given：`contentCells = [{value:"執行者應先確認申請單完整性，", isMergeAnchor:true, mergeSpan:2}, {value:null, isMergeAnchor:false, mergeSpan:2}]`（合併範圍內僅錨點列有值，第二列依主流 xls 函式庫慣例為 `null`）
- When：執行接合
- Then：`content` 產出單一連續段落，不含來源列邊界痕跡、不斷句、不重複
- 對應 AC / 錯誤碼：AC3

#### TS-F028-010 「作業內容」跨 4 列合併，段落含標點延續 [unit]
- Given：4 列合併，錨點列 `value` 為完整長句（含逗號但無句尾標點，暗示邏輯延續），其餘 3 列皆 `null`
- When：執行接合
- Then：完整還原原句，不因合併列數增加而漏字/截斷
- 對應 AC / 錯誤碼：AC3

#### TS-F028-011 同一節內存在多個各自獨立的合併儲存格區塊 [unit]
- Given：`contentCells` 中含 2 個互不相鄰之合併範圍（如「作業內容」合併 3 列後接一般儲存格再接「檢查事項」合併 2 列，若欄位存在，見 OQ-F028-02）
- When：執行接合
- Then：兩個合併區塊個別正確還原、不互相竄接（不將區塊 A 尾字與區塊 B 首字誤接為同一段落）
- 對應 AC / 錯誤碼：AC3

#### TS-F028-012 合併儲存格內容含多段落（段落間需保留邏輯區隔） [unit]
- Given：合併範圍還原後之原句在語意上實際包含兩個獨立子步驟描述（例如以編號 1./2. 開頭）
- When：執行接合
- Then：接合結果保留原始編號/換行語意標記（不強制去除，不產生語意混淆的單一長字串），符合「不斷句」之精確定義——見開放設計問題 OQ-F028-03
- 對應 AC / 錯誤碼：AC3（Edge Case 精確化）

#### TS-F028-013 未合併之一般儲存格（`mergeSpan=1`）不誤判為需接合 [unit]
- Given：`contentCells` 全數 `mergeSpan=1`（無合併儲存格）
- When：執行接合
- Then：`content` 直接等於原始儲存格文字，未觸發合併接合邏輯（回歸驗證接合邏輯僅在偵測到 `mergeSpan>1` 時啟動，不影響一般情境）
- 對應 AC / 錯誤碼：AC3（防呆）

### 附件與流程圖排除範圍回歸驗證（OQ-E09-05）

#### TS-F028-014 使用表單附件（excel/pdf）內容不納入抽取 [unit]
- Given：文件之 `DOCUMENT_ATTACHMENT(type=USAGE_FORM)` 存在附件
- When：F028 執行抽取（僅讀 `DOC_SOURCE_XLS`）
- Then：抽取器未讀取／未接收任何 `USAGE_FORM` 附件內容作為輸入（介面存在性驗證：抽取器函式簽章僅接受 `ParsedXlsWorkbook`，不接受附件參照）
- 對應 AC / 錯誤碼：Edge Case「附件內容本輪不納入抽取範圍」/ OQ-E09-05

#### TS-F028-015 OJT 簽到表圖片不納入抽取 [unit]
- Given：文件之 `DOCUMENT_ATTACHMENT(type=OJT_SIGNIN)` 存在
- Then：同上，不納入抽取（無 OCR）
- 對應 AC / 錯誤碼：同上

### 非標準模板抽取失敗（AC4，`EXTRACTION_FAILED`）

#### TS-F028-016 工作表名稱集合不符標準五表 [unit]
- Given：`sheetNames` 缺少「變更履歷」
- When：執行抽取
- Then：`ExtractionResult.status='failed'`，`failureReason` 記錄具體缺漏原因；不產出任何 `sections`
- 對應 AC / 錯誤碼：AC4 / `EXTRACTION_FAILED`

#### TS-F028-017 名稱集合齊全但「作業流程」內容結構無法解析 [unit]
- Given：`sheetNames`/`hasStandardFlag` 皆通過（即：本情境**已通過 F027 上傳時的粗粒度模板閘門**），但 `作業流程.sections` 為空陣列（無任何可辨識之 `第X章`/`第X節` 標記）
- When：執行抽取
- Then：`status='failed'`，`failureReason` 明確指出「作業流程」內容區塊無法辨識章/節結構（此為 F028 獨有之細粒度抽取閘門，區別於 F027 之 `XLS_TEMPLATE_INVALID`，見測試策略前言）
- 對應 AC / 錯誤碼：AC4 / `EXTRACTION_FAILED`（與 F027 `XLS_TEMPLATE_INVALID` 之分工邊界，見 OQ-F028-01）

#### TS-F028-018 「作業流程」區塊存在但缺少必要標籤欄位（如 `executor` 空白） [unit]
- Given：`RawSectionBlock.executor=''`（空字串）
- When：執行抽取
- Then：依保守假設判定該節抽取失敗（不產生缺漏 metadata 來源之殘缺 chunk 候選）——**此判定是否應為「整份文件抽取失敗」或「僅該節跳過、其餘節照常抽出」未在 spec 中定案**，見開放設計問題 OQ-F028-04
- 對應 AC / 錯誤碼：AC4（推論延伸，需定案）

#### TS-F028-019 抽取失敗時不產生殘缺內容進入索引 [unit]
- Given：TS-F028-016 情境
- When：抽取失敗
- Then：`ExtractionResult.sections` 為空陣列（非部分內容），不存在「失敗但仍回傳幾筆片段」之中間態
- 對應 AC / 錯誤碼：AC4「不產生殘缺/錯誤內容進入索引」

### INDEX_RUN（`stage=extract`）記錄

#### TS-F028-020 抽取成功時 INDEX_RUN 不標記 extract 階段失敗 [unit]
- Given：TS-F028-001 成功情境，抽取器於 `ingestion-worker` 流程中執行（`INDEX_RUN` 已由外層建立 `status=running`）
- When：抽取完成
- Then：`INDEX_RUN.stage` 未被設為失敗態（抽取本身不直接寫 `status=success`——整體索引成功與否要等 F029 embed 階段完成，見 F029-test.md），僅該階段之中繼結果正確交付 F029
- 對應 AC / 錯誤碼：資料模型 `INDEX_RUN.stage`

#### TS-F028-021 抽取失敗時 INDEX_RUN 標記 `status=failed, stage=extract, errorStage=extract` [unit]
- Given：TS-F028-016 情境
- When：抽取失敗
- Then：`INDEX_RUN` 更新為 `status='failed'`、`stage='extract'`、`errorStage='extract'`、`errorMessage` 含具體原因；流程**不進入** F029 切 chunk 階段（介面存在性：驗證後續 collaborator 未被呼叫）
- 對應 AC / 錯誤碼：data-model `INDEX_RUN` / error-handling `EXTRACTION_FAILED`

### 觸發來源

#### TS-F028-022 由 F027 上傳成功觸發之抽取呼叫 [unit]
- Given：F027 成功保存 `DOC_SOURCE_XLS`（比照 `F027-test.md` TS-F027-001 之 `extractionTrigger.enqueue(documentId)` collaborator）
- When：`ingestion-worker` 認領該筆 job（`triggerType` 對應）
- Then：以正確 `documentId` 呼叫抽取器；抽取完成後結果交付 F029（介面存在性驗證，非真實佇列輪詢，見 F030-test.md 之佇列/事件介面設計）
- 對應 AC / 錯誤碼：Preconditions「由 F027 保存成功…觸發」

#### TS-F028-023 由 F030 改版重抽觸發之抽取呼叫（無新上傳事件） [unit]
- Given：F030 判定為「內容改版分支」（見 F030-test.md），對既有 `DOC_SOURCE_XLS`（未變更 blobPath，僅觸發重跑）呼叫抽取
- When：F028 執行
- Then：抽取邏輯本身與「首次上傳觸發」路徑完全相同（F028 不感知觸發來源差異，僅接收 `ParsedXlsWorkbook` 並回傳 `ExtractionResult`），驗證 F028 對觸發來源保持無感知（解耦設計，呼應 F030 觸發介面之單一入口原則）
- 對應 AC / 錯誤碼：Preconditions「或 F030 改版偵測觸發」

### [integration] 佔位場景（本 worktree 不執行，序列化 DB/真實檔案環境待後續階段）

#### TS-F028-024 真實 .xls 二進位解析為 `ParsedXlsWorkbook` [integration]
- Given：`icsop-template-analysis.md` 引用之唯一真實樣本檔案
- When：以實際 xls 解析函式庫讀取
- Then：解析出之工作表/儲存格/合併範圍結構符合本檔案 TS-001～013 假設之 `ParsedXlsWorkbook`/`MergedOrPlainCell` 形狀（驗證測試替身之結構假設未偏離真實函式庫行為）
- 對應 AC / 錯誤碼：測試替身有效性驗證

#### TS-F028-025 全 corpus（≈598 份）模板變體抽取涵蓋率量測 [integration]
- Given：可存取之全 corpus .xls 檔案（前置：上游提供檔案存取，見 `icsop-template-analysis.md` §5）
- When：對全量檔案執行抽取
- Then：量測抽取成功率，回填 OQ-E09-04（`[BLOCKING]`）與 NFR-010 AC5 之風險評估基準
- 對應 AC / 錯誤碼：OQ-E09-04

## AC → TS 覆蓋對照表

| AC/來源 | 內容摘要 | 對應 TS |
|---|---|---|
| AC1 | 標準格式 .xls 依五表結構抽出內容區塊 | TS-001, TS-002, TS-003, TS-004 |
| AC2 | 清洗頁首頁尾/簽核區/合併空白/流程圖繪製格 | TS-005, TS-006, TS-007, TS-008 |
| AC3 | 「作業內容」跨列合併儲存格正確接合 | TS-009～013 |
| AC4 | 非標準模板抽取失敗，不產生殘缺內容 | TS-016～019 |
| OQ-E09-05（回歸） | 附件/流程圖不納入抽取 | TS-008, TS-014, TS-015 |
| 資料模型 INDEX_RUN | stage=extract 記錄 | TS-020, TS-021 |
| Preconditions | 觸發來源（F027/F030） | TS-022, TS-023 |

## 開放設計問題

- **OQ-F028-01（F027 `XLS_TEMPLATE_INVALID` 與 F028 `EXTRACTION_FAILED` 之分工邊界，核心設計缺口）**：F027 之 `validateXlsTemplate`（純規則層，見 `backend/src/xls-source/xls-template-rules.ts`）僅檢查「工作表名稱集合＋每表『標準格式』旗標」，屬粗粒度上傳閘門；F028 之 spec AC4 卻又獨立宣告「上傳之 .xls 不符標準五表模板 → 抽取失敗」，字面上與 F027 職責重疊。本測試設計採**兩階段閘門**假設：F027＝粗粒度（名稱＋旗標），F028＝細粒度（內容區塊結構，如 TS-017 之「作業流程無可辨識章節標記」）。此假設**未經 spec 逐字確認**，且兩者是否應共用同一份 `STANDARD_SHEET_NAMES`/`validateXlsTemplate` 規則常數（避免定義飄移）亦未定案。建議 F028 實作時明確重用 F027 已建立之純規則層作為第一道閘門，僅在其之上疊加內容結構驗證，避免規則重複定義導致兩處判準逐漸不一致。

- **OQ-F028-02（spec 與範本分析對「檢查事項」欄位之矛盾，中風險）**：F028 spec Main Flow 步驟 3 明確列出逐節作業流程欄位為「執行者／時限／作業內容／**檢查事項**」（4 欄），但 `icsop-template-analysis.md` §3.4（基於**唯一真實樣本**之結構分析）僅確認「作業流程」工作表含「**執行者、作業時限、作業內容**」3 個標籤化欄位，**未提及「檢查事項」欄位**。此矛盾可能來自：(a) spec 撰寫時之草案假設與真實樣本不符，(b) 「檢查事項」實際存在於樣本但範本分析文件遺漏記錄，或 (c) 「檢查事項」對應範本分析 §3.3 提及的「第3章 定期自檢及異常管理」（章層級而非逐節欄位）。TS-011 暫以「若欄位存在」為條件式假設帶過，**此欄位是否存在、存在時屬節層級或章層級，需待更多真實樣本或與業務單位確認後定案**，否則 F029 之 8 項 metadata（無「檢查事項」相關項）與 F028 實際抽取範圍可能產生不對稱落差。

- **OQ-F028-03（「不斷句」之精確定義未定案）**：F028 spec AC3 要求合併儲存格接合「不斷句、不重複、不漏字」，但當合併範圍還原之原文本身包含業務語意上的多個子步驟（如編號 1./2./3.）時，「不斷句」是否意味著必須保留原始編號/換行結構，或允許正規化為單一連續段落（可能反而混淆語意邊界）？TS-012 假設保留原始標記，但未經 spec 或範本真實樣本逐句驗證。此定義直接影響 F029 chunk 內容之可讀性與後續生成引用之準確性（NFR-010 AC2 引用正確率）。

- **OQ-F028-04（章節缺欄位時之失敗粒度未定案）**：TS-018 中，單一節缺少必要標籤欄位（如 `executor` 空白）時，應判定為「整份文件抽取失敗」（保守、簡單，但一節有瑕疵拖累全份文件不進索引）或「僅該節跳過、其餘節正常抽出並索引」（寬鬆、複雜，需額外記錄「部分節被跳過」之品質警訊供 F031 呈現，且與 AC4「不產生殘缺內容進入索引」之精神是否衝突需釐清——因為“跳過壞節但索引好節”本身已是一種部分性內容）？兩種選擇對 F031 管理端「失敗原因摘要」的呈現粒度、以及 OQ-E09-04 全 corpus 變體率評估時的「涵蓋率」計算基準（以文件數或以節數計）皆有直接影響，建議與 architect／product 一併定案。

- **OQ-F028-05（F028 抽出之頁首欄位與 `ICSOP_DOCUMENT` DB 記錄不一致時之處理未定案）**：範本分析 §3.1 指出頁首之「文件編號／版次／制定部門」可作為 metadata 抽取來源，但 F029 spec 之 8 項 metadata（`documentNumber`/`edition` 等）依 data-model 定義為「反正規化快照」，語意上應以 `ICSOP_DOCUMENT` DB 記錄（權威來源）為準，而非 F028 從 .xls 文字解析出的頁首字串。若兩者不一致（如管理員忘記同步更新 .xls 頁首文字與系統編輯之版次），F028 是否需要進行交叉比對並告警，或完全捨棄頁首解析值、僅供人工 debug 參考？本測試設計未針對此情境設計 TS（假設 F029 一律採 DB 記錄為準，F028 頁首解析純屬抽取副產物），**需與 architect 確認 F028 輸出契約是否應包含頁首解析值供交叉檢查**。
