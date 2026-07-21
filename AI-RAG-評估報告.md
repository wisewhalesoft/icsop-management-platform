# ICSOP 智慧問答（本地開源 LLM + RAG）導入評估報告

> 日期：2026-07-16 ｜ 對象：ICSOP 文件管理平台（前台使用者瀏覽 + 後台管理）
> 範圍：評估在前台瀏覽畫面導入本地端 LLM 的可行方案（RAG vs 微調），並定義文件 ingestion（權威原件 + chunk 提取）與硬體/分期落地。

---

## 一、結論與建議

- **採「本地端開源 LLM + RAG」，不建議以「微調本地 LLM」為主要手段。**
- 若日後要更進一步，正確架構是**混合式**：RAG 為主幹，用（輕量 LoRA 微調的）本地模型當「生成層」；多數情況一個好的繁中模型 + 好檢索就夠，微調可延後或省略。
- 2026 業界共識：內部 SOP/政策/知識庫問答，**準確性、時效性、可追溯性**三者用 RAG 比微調容易達成，RAG 幾乎是預設答案。

## 二、為什麼 RAG 貼合 ICSOP（逐項對應需求）

| ICSOP 需求 | RAG 為何勝出 |
|---|---|
| 文件會改版/狀態變動（有效↔失效↔作廢） | 更新知識庫即時反映，不需重訓；微調要不斷重訓才跟得上 |
| 稽核/合規、可追溯 | RAG 能引用來源（回答附 ICSOP 編號/章節）；微調把知識烘進權重，無法給引用、幻覺率也較高 |
| **前台僅顯示「有效」+ 使用部門過濾** | ⭐ 決定性因素：RAG 可在**檢索層**做權限過濾；微調模型「記住」全部文件，會把失效/他部門/受限內容洩漏給未授權者——屬合規/資安違規 |
| 內部 SOP、資料需落地 | 本地開源 LLM 全程 on-prem（貼合 MSSQL + Azure Blob + docker 封閉環境） |
| 維運成本 | RAG 維護遠低於反覆微調 |

## 三、為什麼不建議「單純微調本地 LLM」

- SOP 內容一改就要重訓 → 時效性差；無法引用來源；幻覺把錯誤事實寫進權重。
- **最致命**：微調無法落實「僅有效 + 使用部門」的存取控制，等於內建資料外洩風險。

## 四、模型與技術棧（2026 現況）

- **繁中在地化優先**（內容全繁中、含台灣法遵語境）：Llama-3-Taiwan（8B/70B）、Llama-Breeze2-8B（聯發科）、TAIDE 2.0（國科會）——在台灣文化/法律/語境有量化在地化優勢。
- **通用強、授權寬鬆**：Qwen3 家族（Apache 2.0，多語佳，工具生態成熟）；企業取向可看 Nemotron 3（NVIDIA 公開權重/資料/配方）。
- **關鍵**：RAG 成敗**檢索品質 > 模型大小**——好的 embedding + reranker（依繁中/領域/長度動態選型，如 bge-m3、multilingual-e5、bge-reranker 類）加中型 LLM，勝過大模型配爛檢索。
- **部署**：入門 `Ollama + Open WebUI`；正式改 vLLM。**向量庫＝pgvector（定案 2026-07-16）**：遠端 MSSQL 經確認為 **SQL Server 2022 Standard（16.x，CU23），無原生 VECTOR 型別/索引**（原生向量須 SQL Server 2025〔17.x〕或 Azure SQL Database）→ 排除 MSSQL 原生向量方案，採 **pgvector（docker-compose 加一 PostgreSQL 容器）**；`DOCUMENT_CHUNK` 內文/metadata 留 App MSSQL、`VECTOR_EMBEDDING` 落 pgvector，權限 metadata 過濾以 SQL `WHERE`。Qdrant 為備選、Milvus 過度。（見 spec OQ-E09-03、architecture §4.7）
- **選型方式**：以**自己的 ICSOP 問答集**做小型評測（在地模型 vs Qwen3），不只看公開榜單。

## 五、權限感知檢索（必備架構，非選配）

- 2026 共識：多數企業 RAG 失敗不是模型問題，而是**授權問題**。
- 存取控制必須做在**向量/檢索層**：chunk 於索引時標註存取政策（使用部門、狀態、角色可見性），查詢時**先過濾再增強**；不可只在生成後丟棄（會被 prompt injection 繞過）。
- 對 ICSOP：一般使用者只檢索到「**有效 + 其使用部門可見**」文件；經 AI 導引之檢視/下載仍走**浮水印 + 稽核**；AI 問答本身也記調閱軌跡。

## 六、文件 Ingestion：雙軌（權威原件 + 抽取內文）

實地檢視 `ICSOP-CIPS-102-1_系統需求與系統設計` .xls（Excel 撰寫的 SOP，5 表：封面/目錄&目的/.流程圖/作業流程(399 列,主體)/變更履歷）發現：**真正重要的內文**＝目的/適用範圍、逐節作業流程（執行者/時限/**作業內容**/檢查事項）、流程圖、使用表單、變更履歷；**大量雜訊**＝每頁重複頁首頁尾（文件編號/版次/頁次/制定日期/「企業內部文件－僅供內部使用」）、簽核區、合併儲存格空白、流程圖繪製格。**整份直接進向量庫會塞滿雜訊、檢索失準。**

**雙軌 ingestion（定案作法）：**

| 軌道 | 內容 | 用途 |
|---|---|---|
| A. 權威原件 | 上傳的 .xls 原始檔（editable source）＋ 由 .xls 產出的呈現用 PDF（＝16 欄位的 ICSOP PDF） | 使用者檢視/下載/列印、被引用連回的「正本」，套浮水印+稽核 |
| B. 檢索內文（衍生） | 模板感知抽取器抽取 → 清洗頁首頁尾/簽核/空白 → 依章/節切 chunk → 掛 metadata → 存向量庫 | 僅供 RAG 檢索，不對使用者顯示；改版重抽重建索引 |

**抽取（好消息）**：ICSOP 皆為**「標準格式」固定模板**（五表、固定頁首列）→ 可寫**模板感知 parser**（不必靠 LLM 逐份猜版面），品質高又穩定：逐表抽 → 丟棄重複頁首頁尾/簽核/空白 → **接合合併儲存格**（如「作業內容」跨多列拼回段落）→ **依「節」切 chunk**（每 chunk＝一個完整作業步驟）→ 掛 metadata（ICSOP 編號/循環/章節/使用部門/狀態/版本/頁次）。

## 七、Chunk 概念與規模估算

- **chunk＝文件切成的小片段**（不是文件數）；RAG 檢索的是最相關的幾個 chunk，非整份文件。
- 規模：約 **600 本文件**，依每本平均長度估 **~3,000–20,000 chunk（約 1 萬上下）**。
- 意義：此量級對向量庫（可處理數百萬筆）**屬「小」**，檢索毫秒級；**運算不是瓶頸，工程重心在抽取品質 + 檢索選型 + 權限過濾**。

## 八、硬體：L40S × 4

- 4×48GB = **192GB VRAM**：可用 vLLM 張量平行跑**高品質 70B 級繁中模型**（Llama-3-Taiwan-70B / Qwen3 70B 級）於良好精度，並同機並存 embedding + reranker + 生成模型、支撐多人並發。
- ~1 萬 chunk 規模下**算力綽綽有餘**；可放心選在地化大模型追求答案品質。
- 提醒：L40S 走 PCIe（無 NVLink），4 卡張量平行有互連開銷，但推論 70B 完全夠用。

## 九、分期落地

- **Phase 1（先行·管理端 ingestion）**：
  1. 上傳權威文件：ICSOP 文件保存 .xls 原始檔 + 由其產出的 PDF。
  2. **Chunk 提取管線**：模板感知抽取 → 清洗 → 依章/節切 chunk → 掛 metadata → 建向量索引；改版重抽重建；管理端可檢視提取結果/重新索引狀態。
- **Phase 3（智慧化·前台）**：
  - 前台使用者瀏覽頁新增「**智慧問答/搜尋**」：自然語言問答 → RAG 檢索（權限感知，僅「有效+使用部門」）→ 生成附**引用來源**（ICSOP 編號/章節）→ 防幻覺護欄 → 檢視/下載仍走浮水印+稽核；問答計入稽核。

## 十、待釐清（PoC 前）

- GPU 已確認 **L40S×4**；向量庫已定案 **pgvector**（因遠端 MSSQL＝2022 Standard 無原生向量，見 §四）。
- 繁中模型選型需以自建 ICSOP 問答集評測；embedding/reranker 組合。
- .xls 模板變體數量（不同循環是否共用同一標準格式）；附件（使用表單 excel、OJT 圖片）是否納入檢索（需 OCR）。
- 檔案大小/格式上限（OQ-E04-06/E05-02）；使用表單/表單下載是否需浮水印（OQ-E05-03）。

---

## 參考來源（2026）

- RAG vs Fine-Tuning：https://www.sculptsoft.com/rag-vs-fine-tuning/ ｜ https://deventities.com/blog/rag-vs-fine-tuning-internal-knowledge-base/ ｜ https://contextual.ai/blog/rag-vs-fine-tuning-which-approach-is-right-for-enterprise-ai
- 本地開源 LLM：https://huggingface.co/blog/daya-shankar/open-source-llm-models-to-run-locally ｜ https://acecloud.ai/blog/best-open-source-llms/ ｜ https://pinggy.io/blog/top_5_local_llm_tools_and_models/
- 繁中/台灣 LLM：https://cloudinsight.cc/en/blog/taiwan-llm ｜ https://github.com/MiuLab/Taiwan-LLM ｜ https://blog.twman.org/2025/07/TW-LLM-Benchmark.html ｜ https://deep-learning-101.github.io/RAG
- 權限感知檢索：https://tianpan.co/blog/2026-05-04-permission-aware-retrieval-enterprise-rag-access-control ｜ https://truto.one/blog/how-to-maintain-document-level-rbac-in-enterprise-rag-pipelines/ ｜ https://learn.microsoft.com/en-us/azure/search/search-document-level-access-overview
