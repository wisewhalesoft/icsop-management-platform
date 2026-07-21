# NFR-010: RAG 檢索與生成品質 (Retrieval & Generation Quality)

> **NFR ID**: NFR-010
> **Category**: Performance
> **Priority**: P0
> **Status**: Draft（全數量化目標為草案值，待 PoC 實測後校準）

## Requirement

智慧問答（見 [E09](../epics/E09-rag-qa/epic-brief.md)）之檢索與生成品質須可量測、可驗證，避免僅憑主觀感受判斷「好不好用」；同時回答延遲須在使用者可接受範圍內。因目前為評估階段，原始訪談未提供實際量化目標，本 NFR 之各項數值皆為**草案值**，待建立自建 ICSOP 問答評測集並完成 PoC 實測後校準。

## Acceptance Criteria

- **AC1（檢索命中率）**：以自建 ICSOP 問答評測集（待建立，見 Open Questions）量測，正確相關 chunk 須被檢索進入 top-K 候選之命中率，草案目標 ≥ 85%。
- **AC2（引用正確率）**：生成答案中所附之引用來源（ICSOP 編號＋章節）須確實對應答案內容之依據 chunk，引用正確率草案目標 ≥ 95%。
- **AC3（回答延遲）**：使用者提問至取得完整答案之回應時間，P95 草案目標 < 10 秒，待以實際硬體（L40S×4＋vLLM 張量平行）量測後校準。
- **AC4（拒答正確率）**：對於文件庫中不存在依據的提問，系統應正確回覆「找不到相關內容」而非編造答案（見 [E09 US-098](../epics/E09-rag-qa/US-098-hallucination-guardrail-no-result-handling.md)），此類情境之拒答正確率草案目標 ≥ 90%。
- **AC5（索引建置吞吐）**：Phase 1 之 chunk 提取與索引建置管線，須能於合理時間內完成約 600 份文件／約 1 萬 chunk 之全量建置，草案假設 < 24 小時完成全量批次建置。

## Impacted Stories

- [E09 US-092 依章/節切chunk並掛metadata、建向量索引](../epics/E09-rag-qa/US-092-chunking-metadata-vector-index.md)
- [E09 US-093 文件改版重抽與重建索引、舊版排除](../epics/E09-rag-qa/US-093-reversion-reextract-reindex.md)
- [E09 US-095 前台自然語言智慧問答](../epics/E09-rag-qa/US-095-frontend-nl-qa-with-citations.md)
- [E09 US-096 權限感知檢索](../epics/E09-rag-qa/US-096-permission-aware-retrieval.md)
- [E09 US-098 防幻覺護欄與無結果處理](../epics/E09-rag-qa/US-098-hallucination-guardrail-no-result-handling.md)

## Validation Method

- 建立自建 ICSOP 問答評測集（涵蓋各循環代表性問題與標準答案／來源），於 PoC 與上線前以此評測集量測命中率／引用正確率／拒答正確率。
- 回答延遲以實際硬體環境（L40S×4）進行負載測試，量測 P95／P99 回應時間。
- 索引建置吞吐以全量批次建置實測（約 600 份文件）驗證是否達成草案時間目標。

## Open Questions

- [ ] 自建 ICSOP 問答評測集尚未建立，需業務單位協助提供具代表性的問題與標準答案／來源。
- [ ] 全部量化目標（AC1～AC5 數值）均為草案值，需 PoC 實測後與利害關係人確認正式目標。
- [ ] 模型／embedding／reranker／向量資料庫選型未定案（見 [E09 Epic Open Questions](../epics/E09-rag-qa/epic-brief.md)），將直接影響本 NFR 各項指標之可達成範圍。
- [ ] 硬體 L40S×4（192GB VRAM，PCIe 無 NVLink）於 4 卡張量平行下的實際互連開銷是否影響延遲目標，待 PoC 量測。
