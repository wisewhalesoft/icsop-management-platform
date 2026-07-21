# US-095: 前台自然語言智慧問答（附引用來源）

> **Story ID**: US-095
> **Epic**: [E09 智慧問答（本地開源 LLM + RAG）](epic-brief.md)
> **Priority**: P0 (Must Have)
> **Phase**: 3
> **Estimated Points**: 13

---

## User Story

**As a** 一般使用者,
**I want** 於前台瀏覽頁以自然語言提問關於 ICSOP 文件內容的問題，並取得附引用來源（ICSOP 編號＋章節）的答案,
**So that** 我不需自行翻閱／搜尋整份文件即可快速取得可信賴且可查證的作業指引。

---

## Acceptance Criteria

### AC-1: 自然語言提問
- **Given** 我登入並進入前台瀏覽頁
- **When** 我於智慧問答輸入框輸入自然語言問題並送出
- **Then** 系統以 RAG 檢索相關 chunk 並生成答案回覆給我

### AC-2: 答案附引用來源
- **Given** 系統已生成答案
- **When** 我查看回覆內容
- **Then** 每個答案皆附上其依據的 ICSOP 文件編號與章節（節次）引用，且引用可點擊跳轉至對應文件的檢視位置

### AC-3: 多來源引用
- **Given** 我的問題涉及多份文件或多個章節的內容
- **When** 系統生成答案
- **Then** 答案可同時附上多筆引用來源，每筆引用皆可分別跳轉

### AC-4: 問答歷程呈現
- **Given** 我在同一次瀏覽中多次提問
- **When** 我查看問答介面
- **Then** 我可看到本次瀏覽階段內的問答歷程（問題與對應答案＋引用），便於回顧

---

## Technical Notes

- 本 story 為 Phase 3 前台入口功能，依賴 [US-096 權限感知檢索](US-096-permission-aware-retrieval.md)、[US-098 防幻覺護欄](US-098-hallucination-guardrail-no-result-handling.md) 提供之檢索／生成邏輯，本 story 聚焦於「提問－顯示答案－顯示可跳轉引用」之前台互動流程。
- 引用跳轉的目標為既有 [E06 前台文件檢視器](../E06-public-browsing/US-053-viewer-watermark-overlay.md)，沿用其浮水印機制，不另建新的檢視路徑。
- LLM／生成模型選型（繁中在地化模型如 Llama-3-Taiwan／Breeze2／TAIDE 或 Qwen3）、部署方式（vLLM 張量平行於 L40S×4）為技術棧待選型項目，見 Epic Open Questions，不影響本 story 之功能性 AC。
- 問答互動介面之 UI／UX 細節（如輸入框位置、對話框樣式）不在本 story 規範範圍，由 UI/UX Designer 後續設計。

---

## Test Cases

### TC-095-01: 基本問答（Happy Path）
- **Given**: 使用者提問「XX 作業的檢查事項是什麼」
- **When**: 系統生成答案
- **Then**: 取得附正確 ICSOP 編號＋章節引用之答案

### TC-095-02: 引用跳轉（Happy Path）
- **Given**: 答案已附引用連結
- **When**: 使用者點擊該連結
- **Then**: 成功跳轉至對應文件之對應章節位置

### TC-095-03: 多來源引用（Happy Path）
- **Given**: 問題涉及 2 份不同文件內容
- **When**: 系統生成答案
- **Then**: 答案附上 2 筆不同來源引用

### TC-095-04: 問答歷程保留（Edge）
- **Given**: 使用者連續提問 3 次
- **When**: 查看問答介面
- **Then**: 問答歷程正確保留並依序顯示

---

## Dependencies

- **Blocked By**: [US-092 依章/節切 chunk 並掛 metadata、建向量索引](US-092-chunking-metadata-vector-index.md)、[US-096 權限感知檢索](US-096-permission-aware-retrieval.md)、[US-098 防幻覺護欄與無結果處理](US-098-hallucination-guardrail-no-result-handling.md)
- **Blocks**: [US-097 問答稽核與經 AI 導引之浮水印/稽核](US-097-qa-audit-and-ai-guided-watermark.md)（問答需先發生才有稽核事件）

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
- **Related Stories**: US-096、US-097、US-098、[E06 US-053](../E06-public-browsing/US-053-viewer-watermark-overlay.md)
