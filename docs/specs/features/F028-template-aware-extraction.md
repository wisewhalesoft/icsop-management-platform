# F028: ICSOP .xls 模板感知內文抽取與清洗
Priority: P0-MVP | Status: Draft | Phase: 1 | Last Updated: 2026-07-16
Epic/Story: E09 / US-091

> 雙軌 ingestion 之**軌道 B（檢索內文）第一階段**：以「模板感知」parser 抽取 .xls 真正內文並清洗雜訊。因 ICSOP 皆為固定五表標準模板，採規則式/模板式 parser（不必靠 LLM 逐份猜版面），品質穩定、成本低。本 feature 僅處理「抽取＋清洗」，不含切 chunk/掛 metadata（見 [F029](F029-chunking-metadata-index.md)）。

## Description
系統於文件建立/改版時，自動對 [DOC_SOURCE_XLS](../data-model.md#docsourcexls-entity) 原始檔執行模板感知抽取：依五表結構（封面／目錄&目的／流程圖／作業流程／變更履歷）抽出有效內文，並清洗每頁重複頁首頁尾、簽核區、合併儲存格空白、流程圖繪製格等雜訊。抽取結果為中繼資料，僅供 F029 切 chunk 與 [F031](F031-admin-index-visibility.md) 管理端預覽，不直接呈現給一般使用者。

## Preconditions
- 文件已保存 .xls 原始檔（[F027](F027-xls-source-presentation-pdf.md)）。
- 由 F027 保存成功或 [F030](F030-reindex-version-status.md) 改版偵測觸發。

## Main Flow
1. 讀取 DOC_SOURCE_XLS 原件。
2. 驗證其為標準五表模板結構；否則標記抽取失敗（見 Alternative Flows）。
3. 逐表抽取有效內容區塊：目的／適用範圍、逐節作業流程（執行者／時限／作業內容／檢查事項）、流程圖說明文字、使用表單、變更履歷。
4. 清洗：移除每頁重複頁首頁尾（文件編號／版次／頁次／制定日期／「企業內部文件－僅供內部使用」）、簽核區、合併儲存格空白、流程圖繪製格。
5. **接合合併儲存格**：將「作業內容」等跨多列合併儲存格內容拼回完整段落，不斷句、不重複、不漏字。
6. 產出乾淨、結構化之抽取中繼結果，交付 F029。

## Alternative Flows
- 非標準模板（缺必要表單／欄位配置不同）：標記該文件抽取失敗並記錄具體原因，不產生殘缺/錯誤內容進入索引；於 F031 呈現失敗階段 `extract`。

## Edge Cases
- 「作業內容」欄位跨多列合併：正確接合為單一完整段落。
- 抽取結果仍含殘留雜訊：以標準模板固定頁首列規則為準清除；模板變體導致誤抽為已知風險（OQ-E09-04）。
- 附件內容（使用表單 excel、OJT 圖片）：本輪**不納入**抽取範圍（僅 ICSOP 主文件內文，OQ-E09-05）。

## Postconditions
- 產出忠實還原作業內容、無雜訊、可直接供切 chunk 之抽取中繼結果；或明確標記抽取失敗與原因。

## Acceptance Criteria
- Given 一份標準格式 .xls, When 系統執行抽取, Then 依五表結構抽出目的/作業流程/流程圖說明/變更履歷等內容區塊。
- Given 抽取出的原始內容含頁首頁尾/簽核區/合併空白/流程圖繪製格, When 執行清洗, Then 上述雜訊被移除、不進入後續 chunk。
- Given 「作業內容」跨多列合併儲存格, When 執行抽取, Then 正確接合為單一完整段落，不斷句/重複/漏字。
- Given 上傳之 .xls 不符標準五表模板, When 系統嘗試抽取, Then 標記抽取失敗並記錄具體原因，不產生殘缺內容進入索引。

## Error Scenarios
- 抽取失敗/模板不符：見 [error-handling.md#rag-ingestion](../error-handling.md#rag-ingestion)（`EXTRACTION_FAILED`、`XLS_TEMPLATE_INVALID`）；失敗詳情供 F031 查詢。

## Related
- Diagram: [../diagrams/F028-rag-ingestion-pipeline.mmd](../diagrams/F028-rag-ingestion-pipeline.mmd)
- Data: [DOC_SOURCE_XLS](../data-model.md#docsourcexls-entity), [INDEX_RUN](../data-model.md#indexrun-entity)
- Depends on: [F027](F027-xls-source-presentation-pdf.md); Blocks: [F029](F029-chunking-metadata-index.md)
- OQ: OQ-E09-04（模板變體數量/涵蓋率）, OQ-E09-05（附件是否納入檢索）
