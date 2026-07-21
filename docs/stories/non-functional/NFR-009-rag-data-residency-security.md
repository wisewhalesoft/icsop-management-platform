# NFR-009: RAG 資料落地與存取安全 (On-Prem Data Residency & Access Security)

> **NFR ID**: NFR-009
> **Category**: Security
> **Priority**: P0
> **Status**: Draft

## Requirement

智慧問答功能（見 [E09](../epics/E09-rag-qa/epic-brief.md)）涉及 ICSOP 管制文件內容之檢索與生成，須確保全程於公司內部環境（on-prem）運作、不將文件內容或使用者提問傳送至外部第三方服務，並防範透過自然語言介面繞過既有存取控制（權限感知檢索、prompt injection）之風險。

## Acceptance Criteria

- **AC1（on-prem 部署）**：LLM 生成模型、embedding／reranker 模型、向量資料庫皆須部署於公司內部環境（本地開源 LLM，經 vLLM 等框架於自有硬體 L40S×4 運行），不得呼叫外部雲端 LLM API，或將文件內容／使用者提問傳輸至公司網路以外。
- **AC2（檢索層過濾強制性）**：權限過濾（已公告性＝有效且公告日期≤今日，＋使用部門，見 [E09 US-096](../epics/E09-rag-qa/US-096-permission-aware-retrieval.md)）必須實作於向量檢索查詢條件層，不得僅依賴生成階段之 prompt 指示或生成後之內容審查作為唯一防線。
- **AC3（prompt injection 防護）**：系統須具備防範使用者透過提問內容誘導模型繞過權限限制、揭露系統 prompt、或執行非預期指令之防護機制，並於上線前納入安全測試範疇。
- **AC4（問答稽核資料存取控管）**：問答稽核紀錄（見 [E09 US-097](../epics/E09-rag-qa/US-097-qa-audit-and-ai-guided-watermark.md)）之存取權限比照既有稽核紀錄規範（見 [NFR-002](NFR-002-security.md)、[NFR-003](NFR-003-audit-retention.md)），僅限授權角色查詢。

## Impacted Stories

- [E09 US-090～US-098（全部）](../epics/E09-rag-qa/epic-brief.md)，尤其：
- [E09 US-096 權限感知檢索](../epics/E09-rag-qa/US-096-permission-aware-retrieval.md)
- [E09 US-097 問答稽核與經AI導引之浮水印/稽核](../epics/E09-rag-qa/US-097-qa-audit-and-ai-guided-watermark.md)
- [E09 US-098 防幻覺護欄與無結果處理](../epics/E09-rag-qa/US-098-hallucination-guardrail-no-result-handling.md)

## Validation Method

- 上線前安全審查納入 prompt injection 測試情境（至少涵蓋：誘導繞過部門／狀態過濾、誘導揭露系統 prompt、誘導產生未授權文件內容摘要三類）。
- 部署架構審查確認無外部 API 呼叫路徑，驗證所有模型與向量庫皆位於內部網路。
- 稽核紀錄存取權限以整合測試驗證：未授權角色無法查詢問答稽核紀錄。

## Open Questions

- [ ] Prompt injection 防護的具體技術方案（如輸入／輸出過濾規則、guardrail 模型）未定案。
- [ ] 是否需要對 LLM 生成的答案內容做額外的合規性審查（如是否可能洩漏個資），原始需求未提及。
- [ ] On-prem 環境的網路隔離規格（是否完全斷網、或允許特定白名單對外連線用於模型版本更新）未定案。
