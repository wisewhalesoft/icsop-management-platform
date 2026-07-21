# US-091: ICSOP .xls 模板感知內文抽取與清洗

> **Story ID**: US-091
> **Epic**: [E09 智慧問答（本地開源 LLM + RAG）](epic-brief.md)
> **Priority**: P0 (Must Have)
> **Phase**: 1
> **Estimated Points**: 8

---

## User Story

**As a** ICSOP 管理員,
**I want** 系統在文件建立／改版時自動對 .xls 原始檔執行「模板感知」抽取與清洗,
**So that** 抽取出的內文乾淨、忠實還原真正的作業內容，可直接用於後續切 chunk（US-092）與建立向量索引，不需人工整理。

---

## Acceptance Criteria

### AC-1: 依五表結構抽取
- **Given** 一份已保存的 .xls 原始檔（標準格式：封面／目錄&目的／流程圖／作業流程／變更履歷五表）
- **When** 系統執行抽取管線
- **Then** 系統依五表結構分別抽出目的／適用範圍、逐節作業流程（執行者／時限／作業內容／檢查事項）、流程圖說明文字、變更履歷等內容區塊

### AC-2: 清洗雜訊
- **Given** 抽取出的原始內容包含每頁重複頁首頁尾（文件編號／版次／頁次／制定日期／「企業內部文件－僅供內部使用」）、簽核區、合併儲存格空白、流程圖繪製格
- **When** 系統執行清洗步驟
- **Then** 上述雜訊內容被移除，不進入後續 chunk

### AC-3: 合併儲存格內容接合
- **Given** 「作業內容」等欄位因合併儲存格而跨多列呈現
- **When** 系統執行抽取
- **Then** 系統正確將跨列內容接合回完整段落，不產生斷句、重複或漏字

### AC-4: 非標準模板的處理
- **Given** 上傳的 .xls 不符合標準五表模板結構（如缺少必要表單、欄位配置不同）
- **When** 系統嘗試抽取
- **Then** 系統標記該文件抽取失敗並記錄具體原因，不產生殘缺／錯誤內容進入索引

---

## Technical Notes

- 「模板感知抽取器」為評估報告定案作法（見 `AI-RAG-評估報告.md` 第六節）——因 ICSOP 文件皆為固定五表標準模板，可採規則式／模板式 parser，不必仰賴 LLM 逐份猜版面，品質較穩定、成本較低。
- 抽取器的具體實作技術（如 openpyxl、pandas 等函式庫）、模板變體的實際涵蓋範圍待架構師／工程階段確認，見 Epic Open Questions「.xls 模板變體數量未知」。
- 抽取結果為中繼資料，不直接呈現給一般使用者，僅供 [US-092](US-092-chunking-metadata-vector-index.md) 切 chunk 與 [US-094](US-094-admin-extraction-reindex-visibility.md) 管理端預覽使用。
- 本 story 僅處理「抽取＋清洗」，不含依章／節切 chunk 與 metadata 標註（見 US-092）。

---

## Test Cases

### TC-091-01: 標準格式成功抽取（Happy Path）
- **Given**: 一份標準格式 .xls
- **When**: 系統執行抽取
- **Then**: 成功抽取出目的／作業流程／變更履歷等內容區塊

### TC-091-02: 抽取結果不含雜訊（Happy Path）
- **Given**: 抽取完成的內容
- **When**: 檢視抽取結果
- **Then**: 不含頁首頁尾／簽核區／空白儲存格等雜訊

### TC-091-03: 合併儲存格接合（Edge）
- **Given**: 「作業內容」欄位跨 5 列合併儲存格
- **When**: 系統執行抽取
- **Then**: 正確接合為單一完整段落

### TC-091-04: 非標準模板抽取失敗（Error）
- **Given**: 上傳不符合標準模板的 .xls
- **When**: 系統嘗試抽取
- **Then**: 系統標記抽取失敗並記錄原因，不產出索引內容

---

## Dependencies

- **Blocked By**: [US-090 保存 .xls 原始檔（RAG 內容來源）與呈現用 PDF ── 各自獨立上傳](US-090-xls-source-and-presentation-pdf.md)
- **Blocks**: [US-092 依章/節切 chunk 並掛 metadata、建向量索引](US-092-chunking-metadata-vector-index.md)

---

## Definition of Done

- [ ] Acceptance criteria met
- [ ] Unit tests passing (>80% coverage)
- [ ] Code review approved
- [ ] Documentation updated

---

## Related

- **Epic Brief**: [E09 智慧問答（本地開源 LLM + RAG）](epic-brief.md)
- **Related Stories**: US-090、[US-092](US-092-chunking-metadata-vector-index.md)、[US-094](US-094-admin-extraction-reindex-visibility.md)
