# US-098: 防幻覺護欄與無結果處理

> **Story ID**: US-098
> **Epic**: [E09 智慧問答（本地開源 LLM + RAG）](epic-brief.md)
> **Priority**: P0 (Must Have)
> **Phase**: 3
> **Estimated Points**: 8

---

## User Story

**As a** 一般使用者,
**I want** 智慧問答僅依據實際檢索到的文件內容作答，找不到依據時明確告知我而非編造答案,
**So that** 我能信任 AI 問答的回覆內容，不會被誤導的錯誤資訊影響實際作業判斷。

---

## Acceptance Criteria

### AC-1: 僅依檢索內容作答
- **Given** 系統已透過 RAG 檢索取得相關 chunk
- **When** 系統生成答案
- **Then** 答案內容僅得基於檢索到的 chunk 內容，不得包含檢索範圍以外之生成內容（如模型訓練時記憶的通用知識）

### AC-2: 找不到依據時明確告知
- **Given** 使用者提問後，權限感知檢索（見 [US-096](US-096-permission-aware-retrieval.md)）未能找到任何相關且有權限查看的 chunk
- **When** 系統嘗試生成答案
- **Then** 系統明確回覆「找不到相關文件內容」等訊息，不得生成看似合理但無依據的答案

### AC-3: 一律附來源
- **Given** 系統生成任何實質性答案內容（非「找不到」的情況）
- **When** 使用者查看該答案
- **Then** 答案必定附至少一筆引用來源，不存在「有答案但無引用」的情況

### AC-4: 低信心度提示
- **Given** 檢索到的 chunk 與問題的相關性較低（如僅部分關鍵字匹配）
- **When** 系統生成答案
- **Then** 系統於答案中提示「以下內容可能非完全對應您的問題，請自行核對原文件」等提醒，而非以高確定性語氣呈現不確定的推論

---

## Technical Notes

- 「防幻覺護欄」為評估報告定案之必要機制（見 `AI-RAG-評估報告.md` 第九節 Phase 3 描述），具體實作可能涉及 prompt 設計（如限定 LLM 僅能引用 context）、答案後處理檢查引用是否存在於檢索結果中等，屬技術實作細節，待架構階段確認，本 story 僅定義功能性 AC。
- 「相關性閾值」（AC-4 之低信心度判斷基準）、「找不到」的判斷門檻（檢索分數低於多少視為無結果）為量化參數，待 PoC 階段依實測資料調整，列為 Open Question，並與 [NFR-010](../../non-functional/NFR-010-rag-retrieval-quality-performance.md) 之拒答正確率目標一併驗證。
- 本 story 與 [US-096 權限感知檢索](US-096-permission-aware-retrieval.md) 緊密相關但關注點不同：US-096 確保「不檢索到未授權內容」，US-098 確保「基於檢索到的內容誠實作答，不編造」，兩者皆為信任／合規的必要條件，缺一不可。

---

## Test Cases

### TC-098-01: 有依據之準確答案（Happy Path）
- **Given**: 提問文件中確實涵蓋的內容
- **When**: 系統生成答案
- **Then**: 取得準確且附來源的答案

### TC-098-02: 無依據時明確拒答（Happy Path）
- **Given**: 提問文件庫中完全不存在的內容（如與 ICSOP 無關的通用知識）
- **When**: 系統執行檢索與生成
- **Then**: 明確回覆找不到相關內容，不生成無依據答案

### TC-098-03: 低信心提醒（Edge）
- **Given**: 提問內容與檢索結果僅低度相關
- **When**: 系統生成答案
- **Then**: 於答案中加註低信心提醒

### TC-098-04: Prompt injection 誘導測試（Security）
- **Given**: 使用者嘗試以 prompt 誘導系統「假裝」某文件存在該內容
- **When**: 系統處理該提問
- **Then**: 系統仍僅依實際檢索結果作答，或明確告知找不到

---

## Dependencies

- **Blocked By**: [US-092 依章/節切 chunk 並掛 metadata、建向量索引](US-092-chunking-metadata-vector-index.md)、[US-096 權限感知檢索](US-096-permission-aware-retrieval.md)
- **Blocks**: [US-095 前台自然語言智慧問答](US-095-frontend-nl-qa-with-citations.md)（前台問答完整功能需護欄到位才能上線）

---

## Definition of Done

- [ ] Acceptance criteria met
- [ ] Unit tests passing (>80% coverage)
- [ ] Code review approved
- [ ] Documentation updated

---

## Related

- **Epic Brief**: [E09 智慧問答（本地開源 LLM + RAG）](epic-brief.md)
- **NFRs**: [NFR-010 RAG檢索與生成品質](../../non-functional/NFR-010-rag-retrieval-quality-performance.md)
- **Related Stories**: US-092、US-096、US-095
