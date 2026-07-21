# US-092: 依章/節切 chunk 並掛 metadata、建向量索引

> **Story ID**: US-092
> **Epic**: [E09 智慧問答（本地開源 LLM + RAG）](epic-brief.md)
> **Priority**: P0 (Must Have)
> **Phase**: 1
> **Estimated Points**: 8

---

## User Story

**As a** ICSOP 管理員,
**I want** 系統將抽取清洗後的內文依章／節切分為 chunk 並掛上結構化 metadata，再建立向量索引,
**So that** 前台問答（Phase 3）未來可精準檢索到相關段落，並附上可追溯的來源資訊。

---

## Acceptance Criteria

### AC-1: 依章/節切 chunk
- **Given** 一份已完成抽取清洗的文件內容
- **When** 系統執行 chunk 切分
- **Then** 內容依「節」（每節＝一個完整作業步驟，含執行者／時限／作業內容／檢查事項）切分為個別 chunk，不將多個不相關步驟混入同一 chunk

### AC-2: 掛 metadata
- **Given** 切分完成的 chunk
- **When** 系統寫入向量索引前
- **Then** 每個 chunk 皆掛上 metadata：ICSOP 文件編號、所屬循環、章節（節次）、使用部門、文件狀態、公告日期、版次、原始頁次

### AC-3: 建立向量索引
- **Given** 已掛 metadata 的 chunk
- **When** 系統執行索引建立
- **Then** chunk 之向量表示成功寫入向量資料庫，且可透過 metadata 篩選查詢（如僅查詢特定狀態／使用部門的 chunk）

### AC-4: 索引建立失敗處理
- **Given** chunk 切分或 embedding 產生過程發生錯誤
- **When** 系統執行索引建立
- **Then** 該文件之索引狀態標記為「失敗」，不產生部分／不完整索引殘留，並保留錯誤訊息供 [US-094](US-094-admin-extraction-reindex-visibility.md) 查詢

---

## Technical Notes

- Chunk metadata 欄位對應 [E04 文件欄位](../E04-icsop-document/epic-brief.md)：ICSOP 文件編號、所屬循環（見 [E03](../E03-lifecycle-dag/epic-brief.md)）、文件狀態、公告日期、版次、文件使用部門；「章節」與「頁次」為抽取過程新產生的結構性 metadata，非 E04 既有欄位。
- Embedding 模型與向量資料庫選型未定案（pgvector／Qdrant／Milvus／MSSQL 2025 向量能力），見 Epic Open Questions；本 story 之 AC 不預設特定技術，僅定義功能行為。
- 規模參考：約 600 份文件，估計約 1 萬 chunk 上下（見 `AI-RAG-評估報告.md` 第七節），此量級對向量庫屬小規模，非本 story 效能瓶頸來源。
- metadata 中的「使用部門」「文件狀態」「公告日期」為 Phase 3 權限感知檢索（[US-096](US-096-permission-aware-retrieval.md)）的過濾依據（可見基底＝已公告：有效且公告日期≤今日，＋使用部門），務必於索引時即正確寫入，不可於檢索後才過濾（見 [NFR-009](../../non-functional/NFR-009-rag-data-residency-security.md)）。

---

## Test Cases

### TC-092-01: 依節切分（Happy Path）
- **Given**: 一份多節文件
- **When**: 系統執行切分
- **Then**: 切分為對應數量的 chunk，每個 chunk 恰好對應一個作業步驟

### TC-092-02: metadata 完整性（Happy Path）
- **Given**: 切分完成的 chunk
- **When**: 檢視其 metadata
- **Then**: 完整包含 8 項欄位且值正確

### TC-092-03: metadata 篩選查詢（Happy Path）
- **Given**: 已建立索引的 chunk
- **When**: 依 metadata（如使用部門＝特定部門）篩選查詢
- **Then**: 正確篩選出對應 chunk

### TC-092-04: embedding 失敗處理（Error）
- **Given**: embedding 產生過程逾時／失敗
- **When**: 系統執行索引建立
- **Then**: 索引狀態標記失敗，且不留下部分索引

---

## Dependencies

- **Blocked By**: [US-091 ICSOP .xls 模板感知內文抽取與清洗](US-091-template-aware-extraction-cleaning.md)
- **Blocks**: [US-093 文件改版重抽與重建索引、舊版排除](US-093-reversion-reextract-reindex.md)、[US-094 管理端檢視提取結果與重新索引狀態](US-094-admin-extraction-reindex-visibility.md)、[US-096 權限感知檢索](US-096-permission-aware-retrieval.md)

---

## Definition of Done

- [ ] Acceptance criteria met
- [ ] Unit tests passing (>80% coverage)
- [ ] Code review approved
- [ ] Documentation updated

---

## Related

- **Epic Brief**: [E09 智慧問答（本地開源 LLM + RAG）](epic-brief.md)
- **NFRs**: [NFR-009 RAG資料落地與存取安全](../../non-functional/NFR-009-rag-data-residency-security.md)、[NFR-010 RAG檢索與生成品質](../../non-functional/NFR-010-rag-retrieval-quality-performance.md)
- **Related Stories**: US-091、US-093、US-094、US-096
