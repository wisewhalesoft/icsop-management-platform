# Epic E09: 智慧問答（本地開源 LLM + RAG）

> **Epic ID**: E09
> **Priority**: P0 (Must Have)
> **Phase**: 1/3
> **Status**: Draft
> **Stories**: 9 個

## Epic Goal

為 ICSOP 文件管理平台導入「本地端開源 LLM + RAG（Retrieval-Augmented Generation）」智慧問答能力，讓公司同仁能以自然語言提問取代人工翻閱文件，同時確保答案可追溯來源、不外洩未授權內容、全程 on-prem（不送外部 API）。本 Epic 之技術路線（RAG 為主、不採微調本地模型）與分期策略，依據專案根目錄 `AI-RAG-評估報告.md` 定案，主要理由：(1) ICSOP 文件會改版／狀態變動（有效／失效／作廢），RAG 更新知識庫即可反映，不需重訓；(2) 稽核合規要求答案可追溯來源；(3) **前台僅顯示「已公告」（有效且公告日期已過）且使用者所屬使用部門可見之文件**——此存取控制只能在 RAG 的檢索層做，若採微調則模型會把全部文件內容「記住」，無法排除失效／他部門／受限內容，構成合規／資安違規風險，此為決定性因素。

本 Epic 依交付順序分兩期（非功能取捨，兩期皆為本輪已定案範疇）：

- **Phase 1（先行．管理端 ingestion）**：ICSOP 管理員上傳／保存 ICSOP 文件的 .xls 原始檔（authoring source，RAG 內容抽取來源）；呈現用 PDF 則經既有 E04 US-036 管道由管理員獨立手動上傳，兩者為各自獨立、互不觸發之上傳管道，一致性由 ICSOP 管理員自行維護（**2026-07-17 OQ-E09-10 定案：取消 .xls→PDF 自動轉檔**）；建立「模板感知抽取器」管線，將 .xls 標準格式內容抽取、清洗（丟棄頁首頁尾／簽核區／合併儲存格空白／流程圖繪製格）、依章／節切 chunk、掛 metadata（ICSOP 編號、循環、章節、使用部門、狀態、公告日期、版次、頁次）、建立向量索引；文件改版時重新抽取並重建索引，舊版以「狀態」metadata 排除於有效索引之外；管理端提供 chunk 提取結果預覽與重新索引狀態（成功／失敗／進行中）之可視性。Phase 1 不含任何前台使用者可見的問答功能，純粹為 Phase 3 準備「乾淨、有 metadata 的知識庫」。
- **Phase 3（智慧化．前台）**：一般使用者於前台瀏覽頁以自然語言提問，系統以 RAG 檢索（**權限感知，僅檢索「已公告＋使用者所屬使用部門可見」之文件，過濾發生在檢索層，而非生成後才丟棄**）並生成答案，答案一律附引用來源（ICSOP 編號＋章節，可跳轉回原文件）；找不到依據時明確告知，不得憑空生成（防幻覺護欄）；AI 問答本身計入調閱稽核，經 AI 導引之檢視／下載仍套用既有的浮水印＋稽核機制（見 [E07](../E07-audit-trail/epic-brief.md)）。

**本 Epic 不含**：模型訓練／微調（已於評估報告排除，理由見 `AI-RAG-評估報告.md` 第三節；混合式微調列為未來延伸方向，非本輪範疇）；.xls 以外格式（如純 PDF 掃描檔）之抽取管線（僅涵蓋「ICSOP 標準格式 .xls」，格式變異情形見 Open Questions）；既有 ICSOP PDF 檢視／下載／浮水印機制本身（沿用 [E06](../E06-public-browsing/epic-brief.md)／[E07](../E07-audit-trail/epic-brief.md)，本 Epic 僅新增「經 AI 問答導引」之進入路徑）。

## User Stories

| Story ID | Title | Priority | Phase | File |
|---|---|---|---|---|
| US-090 | 保存 .xls 原始檔並產出呈現用 PDF | P0 | 1 | [US-090-xls-source-and-presentation-pdf.md](US-090-xls-source-and-presentation-pdf.md) |
| US-091 | ICSOP .xls 模板感知內文抽取與清洗 | P0 | 1 | [US-091-template-aware-extraction-cleaning.md](US-091-template-aware-extraction-cleaning.md) |
| US-092 | 依章/節切 chunk 並掛 metadata、建向量索引 | P0 | 1 | [US-092-chunking-metadata-vector-index.md](US-092-chunking-metadata-vector-index.md) |
| US-093 | 文件改版重抽與重建索引、舊版排除 | P0 | 1 | [US-093-reversion-reextract-reindex.md](US-093-reversion-reextract-reindex.md) |
| US-094 | 管理端檢視提取結果與重新索引狀態 | P1 | 1 | [US-094-admin-extraction-reindex-visibility.md](US-094-admin-extraction-reindex-visibility.md) |
| US-095 | 前台自然語言智慧問答（附引用來源） | P0 | 3 | [US-095-frontend-nl-qa-with-citations.md](US-095-frontend-nl-qa-with-citations.md) |
| US-096 | 權限感知檢索（僅已公告＋使用部門） | P0 | 3 | [US-096-permission-aware-retrieval.md](US-096-permission-aware-retrieval.md) |
| US-097 | 問答稽核與經 AI 導引之浮水印/稽核 | P0 | 3 | [US-097-qa-audit-and-ai-guided-watermark.md](US-097-qa-audit-and-ai-guided-watermark.md) |
| US-098 | 防幻覺護欄與無結果處理 | P0 | 3 | [US-098-hallucination-guardrail-no-result-handling.md](US-098-hallucination-guardrail-no-result-handling.md) |

## Dependencies

**Depends On**：
- [E04 ICSOP 文件管理](../E04-icsop-document/epic-brief.md) — 文件本體（ICSOP 編號、所屬循環、使用部門、狀態、版本、PDF）為抽取與 metadata 標註之資料來源；[US-032 文件狀態切換](../E04-icsop-document/US-032-status-toggle.md)觸發索引有效性判斷；[US-031 編輯與版本對照](../E04-icsop-document/US-031-edit-with-comparison.md)觸發重抽（見 US-093）；[US-036 PDF與OJT附件上傳](../E04-icsop-document/US-036-pdf-ojt-attachment-upload.md)之「ICSOP PDF」欄位上傳流程維持獨立不變，不受本 Epic US-090（.xls 原始檔保存）影響，兩者為各自獨立、互不觸發之平行管道（2026-07-17 OQ-E09-10 定案）。
- [E03 循環池與 DAG 畫布維護](../E03-lifecycle-dag/epic-brief.md) — 「所屬循環」為 chunk metadata 之一。
- [E08 權限矩陣](../E08-permission-matrix/epic-brief.md) — 使用部門可見性規則為權限感知檢索（US-096）之授權依據。
- [E01 帳號與驗證](../E01-account-auth/epic-brief.md) / [E02 組織同步與異動管理](../E02-org-sync/epic-brief.md) — 前台使用者身分與所屬使用部門，為權限感知檢索之過濾條件來源。
- [E06 前台 RWD 瀏覽](../E06-public-browsing/epic-brief.md) — 智慧問答入口（US-095）掛載於前台瀏覽頁；經 AI 導引之檢視／下載沿用 [US-053](../E06-public-browsing/US-053-viewer-watermark-overlay.md)／[US-054](../E06-public-browsing/US-054-download-print-watermark-burn.md) 之浮水印機制。
- [E07 稽核與文件調閱歷程](../E07-audit-trail/epic-brief.md) — 問答稽核（US-097）延伸既有稽核紀錄模型與查詢後台。

**Blocks**：
- 無下游 Epic 直接依賴；本 Epic 為既有平台之智慧化擴充層，Phase 3 完成後不影響 E01～E08 既有功能運作。

**相關 NFR**：[NFR-009 RAG 資料落地與存取安全](../../non-functional/NFR-009-rag-data-residency-security.md)、[NFR-010 RAG 檢索與生成品質](../../non-functional/NFR-010-rag-retrieval-quality-performance.md)、[NFR-001 效能與可擴展性](../../non-functional/NFR-001-performance.md)、[NFR-002 資訊安全與身分驗證](../../non-functional/NFR-002-security.md)

## Success Criteria

- **Phase 1**：所有 ICSOP 標準格式 .xls 文件皆可成功保存原始檔（RAG 來源）；呈現用 PDF 經 E04 US-036 獨立上傳，兩者皆可正確關聯至文件記錄；抽取管線可產出乾淨（無頁首頁尾／簽核區／空白雜訊）、依章／節切分、掛滿必要 metadata 的 chunk，並成功建立向量索引；文件改版後索引可正確重建，舊版不出現在有效檢索範圍；管理員可於後台檢視任一文件的 chunk 預覽與重新索引狀態。
- **Phase 3**：一般使用者可於前台以自然語言提問並取得附引用來源（可跳轉）的答案；檢索結果 100% 符合「已公告（有效且公告日期已過）＋使用者所屬使用部門可見」過濾，任何情況下不得回傳未授權文件內容；找不到依據時系統明確告知而非編造答案；AI 問答與經其導引之檢視／下載皆正確計入稽核軌跡與浮水印機制。

## Open Questions

> 本 Epic 之 Open Questions **仍有 5 項為 [BLOCKING]**（皆需 PoC 實測或外部/業務單位盤點後才能定案；不阻擋本輪 spec 撰寫，但阻擋精確估點與實作），**5 項已定案**。完整決策紀錄見 [open-questions.md](../../../specs/open-questions.md)。

- [ ] **繁中在地化模型選型**（OQ-E09-01）**[BLOCKING]** — 未定案（Llama-3-Taiwan／Llama-Breeze2-8B／TAIDE 2.0／Qwen3），需以自建 ICSOP 問答集實測後選定，不僅看公開榜單。
- [ ] **Embedding／reranker 模型組合**（OQ-E09-02）**[BLOCKING]** — 未定案（bge-m3／multilingual-e5／bge-reranker 類），待 PoC 一併評測；檢索品質優先於模型大小。
- [x] **向量資料庫選型**（OQ-E09-03 ✅）— **定案**：遠端 MSSQL 為 2022 Standard（16.x，CU23），無原生 VECTOR 型別/索引（原生向量須 SQL Server 2025 或 Azure SQL）→ 採 **pgvector（Postgres 擴充）**為 RAG 向量庫（docker-compose 加一 Postgres 容器；權限 metadata 過濾以 SQL `WHERE`）。Qdrant 為備選、Milvus 過度。
- [ ] **ICSOP .xls 模板變體數量／涵蓋率**（OQ-E09-04）**[BLOCKING]** — 未定案，需先盤點是否全部循環／文件皆共用同一標準五表格式，或有歷史遺留版型，才能確認模板感知抽取器涵蓋率（見 US-091）。
- [x] **附件是否納入 RAG 檢索範圍**（OQ-E09-05 ✅）— **定案**：**不含**附件內容檢索，僅檢索 ICSOP 主文件內文（不需 OCR）。
- [ ] **品質/延遲量化目標**（命中率／引用正確率／延遲 P95／拒答正確率／索引吞吐）正式數值（OQ-E09-06）**[BLOCKING]** — 全為草案值，待 PoC 實測校準；含 L40S×4 PCIe 互連開銷是否影響延遲，見 [NFR-010](../../non-functional/NFR-010-rag-retrieval-quality-performance.md)。
- [ ] **Prompt injection 防護具體技術方案與驗收標準**（OQ-E09-07）**[BLOCKING]** — 待定；納入上線前 security review 三類負向情境，見 [NFR-009](../../non-functional/NFR-009-rag-data-residency-security.md)。
- [ ] **自建 ICSOP 問答評測集尚未建立**（OQ-E09-14）**[BLOCKING]** — 需業務單位提供代表性問題與標準答案／來源。**（2026-07-20 補列：本項存在於 open-questions.md 但從未列於本 epic-brief）** ⚠ **本項為 E09 的依賴根節點**：`OQ-E09-01`（LLM 選型）、`OQ-E09-02`（embedding/reranker）、`OQ-E09-06`（品質延遲目標）、`OQ-E09-08`（相關性閾值）皆須先有評測集才能實測定案，建議優先啟動收題。
- [x] **Phase 1 與 Phase 3 之間排程/優先序**（OQ-E09-13 ✅）— **定案**：依 **Phase 1 驗收＋PoC 進度**決定啟動時點（不預設固定日期）。
- [x] **混合式微調（RAG 主幹＋輕量 LoRA 生成層）未來延伸方向**（OQ-E09-15 ✅）— **定案**：**非本輪範疇**（不納入；未來是否評估另案處理）。
- [x] **（已定案 2026-07-17，OQ-E09-10）取消 .xls→PDF 自動轉檔**：.xls 原始檔（RAG 內容來源，US-090）與呈現用 PDF（E04 US-036）改為分開獨立手動上傳，兩者互不觸發，一致性由 ICSOP 管理員自行負責維護。原「是否保留手動上傳 PDF 備援路徑」問題因此消解——手動上傳已是唯一路徑，非備援。詳見 [US-090](US-090-xls-source-and-presentation-pdf.md)。
