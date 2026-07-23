---
type: test-design-feature
feature_id: F029
feature_name: 章/節 chunking、metadata 標註與向量索引建立
priority: P0-MVP
related_spec: docs/specs/features/F029-chunking-metadata-index.md
last_updated: 2026-07-23
status: draft
---

# F029 — chunking／metadata／向量索引建立 · Test Design
> source: docs/specs/features/F029-chunking-metadata-index.md · worktree: rag (F028-F031) · 2026-07-23

## 測試策略（unit 用 fake embedder＋fake vector store＋F028 `ExtractionResult` fixture；真模型/真 pgvector＝[integration]）

F029 的輸入是 F028 交付之 `ExtractionResult`（見 `F028-test.md`），其 `sections: CleanedSection[]` **已經是「依節切分」完成的最小單位**——依 `icsop-template-analysis.md` §3.4 之確認，「節」邊界即為 `作業流程` 工作表原生之 `第X節` 標記，非本 feature 需另行猜測的自由邊界。因此 F029 的「切 chunk」步驟本質上是**逐一映射** `CleanedSection → DOCUMENT_CHUNK`（1:1），核心工程重心在於 **metadata 掛載正確性**與**向量索引落地**，而非分段演算法本身。

### 測試替身契約

```
FakeEmbedder implements EmbeddingClient {
  embed(text: string): Promise<{ vector: number[]; dimension: number }>
  // 固定回傳 deterministic 向量（如依文字雜湊產生固定長度陣列），dimension 為測試參數化常數（不預設任何真實模型，見 OQ-F029-01）
}

FakeVectorStore implements VectorIndexWriter {
  upsert(chunkId: string, vector: number[], payload: ChunkFilterPayload): Promise<void>
  queryByFilter(filter: Partial<ChunkFilterPayload>): Promise<string[]>  // 回傳符合過濾條件之 chunkId 清單
  delete(chunkId: string): Promise<void>
  // 記憶體 Map 實作，供斷言「upsert 呼叫次數」「過濾查詢正確性」「delete 後不再可查詢」
}

ChunkFilterPayload {
  documentId: string
  status: 'active' | 'inactive' | 'void'   // 沿用 backend/src/documents/document-status.ts 之內部碼，非中文顯示標籤（見測試策略備註）
  usingDeptIds: string[]
  announcedDate: string | null
}

FakeDocumentContextProvider {
  // 模擬查詢 ICSOP_DOCUMENT + DOC_USING_DEPT 取得 metadata 來源（權威資料，非 F028 頁首解析值，見 F028-test.md OQ-F028-05）
  getContext(documentId): { documentNumber, lifecycleId, usingDeptIds, status, announcedDate, edition }
}

FakeChunkStore {
  // 記憶體維護 DOCUMENT_CHUNK；支援依 indexRunId 分組查詢，供「新版建置期間舊版不受影響」「失敗時新版殘留清除」等場景斷言
  insertBatch(chunks): Promise<void>
  deleteByIndexRunId(indexRunId): Promise<void>
  findByDocumentId(documentId): Promise<DocumentChunk[]>
}
```

**⚠ 內部狀態碼一致性提醒**：`document-status.ts` 定義 `DocumentStatus = 'active' | 'inactive' | 'void'`（英文內部碼，UI 顯示才轉中文標籤）。`DOCUMENT_CHUNK.status` metadata 必須快照**同一組英文內部碼**，而非中文顯示值（`'有效'`/`'失效'`/`'作廢'`），以確保 F033 檢索層 `WHERE status='active'` 之過濾查詢可與 `ICSOP_DOCUMENT.status` 直接比對，不需額外轉換層。本測試設計全數以英文內部碼撰寫，過去若有測試草稿誤用中文標籤字面值，應視為需訂正之缺陷。

### 跨庫（App MSSQL／pgvector）之「失敗不留半索引」測試邊界

依 architecture-spec.md §4.7／§5.7，`DOCUMENT_CHUNK` 落 App MSSQL、`VECTOR_EMBEDDING` 落 pgvector（兩個獨立資料庫），**無法以單一 DB 交易同時回滾兩者**。「不留部分/不完整索引殘留」（AC4）因此**不能**以資料庫交易保證達成，只能以應用層「新版建置期間不動舊版、失敗時主動清理本次新建之殘留列」的補償邏輯達成——見開放設計問題 OQ-F029-02。本測試設計之失敗情境（TS-F029-016～019）皆針對此應用層清理邏輯設計斷言，而非資料庫層 rollback 行為。

### [integration] 邊界
真實 embedding 模型呼叫（含向量維度、OQ-E09-01/02 選型）、真實 pgvector 容器讀寫、跨庫真實網路延遲下之補償清理時序、NFR-010 AC5 索引建置吞吐（≈600 份/≈1 萬 chunk ＜24 小時）。

## Test Scenarios

### 依節切 chunk（AC1）

#### TS-F029-001 多節文件切為對應數量 chunk [unit]
- Given：`ExtractionResult.sections` 含 3 個 `CleanedSection`
- When：執行切分
- Then：產出 3 個 `DOCUMENT_CHUNK`，`chunkSeq` 依原節序遞增（1,2,3），每個 chunk 之 `content` 恰對應一個 `CleanedSection.content`（無合併、無拆分）
- 對應 AC / 錯誤碼：AC1

#### TS-F029-002 單節文件切為 1 個 chunk [unit]
- Given：`sections.length === 1`
- Then：`DOCUMENT_CHUNK.length === 1`
- 對應 AC / 錯誤碼：AC1（Edge Case「一份多節文件」之邊界對照）

#### TS-F029-003 chunk 內容不混入不相關步驟 [unit]
- Given：section A 之 `content` 與 section B 之 `content` 為不同作業步驟文字
- When：切分
- Then：chunk A 之 `content` 不含 section B 文字片段，反之亦然（回歸驗證 Main Flow「不將多個不相關步驟混入同一 chunk」）
- 對應 AC / 錯誤碼：AC1

### 8 項 metadata 掛載正確性（AC2，headline scenario）

#### TS-F029-004 chunk 掛載完整 8 項 metadata 且值正確 [unit]
- Given：`FakeDocumentContextProvider` 回傳 `documentNumber='ICSOP-SRC-101-1'`、`lifecycleId='LC-01'`、`usingDeptIds=['DEPT-A','DEPT-B']`、`status='active'`、`announcedDate='2026-01-01'`、`edition="26'01"`；`CleanedSection.chapterSection='第2章第3節'`、`pageNumber=5`
- When：掛載 metadata
- Then：每個 chunk 之 8 個欄位（`documentNumber`/`lifecycleId`/`chapterSection`/`usingDeptIds`/`status`/`announcedDate`/`edition`/`pageNumber`）逐一與來源值完全相符
- 對應 AC / 錯誤碼：AC2

#### TS-F029-005 `usingDeptIds` 為多值時完整反映全部使用部門 [unit]
- Given：`usingDeptIds=['DEPT-A','DEPT-B','DEPT-C']`（3 個使用部門）
- When：掛載 metadata
- Then：每個 chunk 之 `usingDeptIds` 陣列長度為 3，內容完全一致（非僅取第一筆或截斷）
- 對應 AC / 錯誤碼：AC2

#### TS-F029-006 `usingDeptIds` 恰為單一部門（下界） [unit]
- Given：`usingDeptIds=['DEPT-A']`（`ICSOP_DOCUMENT.usingDeptIds` 基數下界 1..*，見 data-model）
- Then：正確掛載單一元素陣列，非退化為純量字串
- 對應 AC / 錯誤碼：AC2（邊界值）

#### TS-F029-007 同一文件之全部 chunk 共享一致的文件層級 metadata [unit]
- Given：文件切出 3 個 chunk
- When：掛載 metadata
- Then：`documentNumber`/`lifecycleId`/`usingDeptIds`/`status`/`announcedDate`/`edition` 於 3 個 chunk 間完全相同，僅 `chapterSection`/`pageNumber` 逐 chunk 相異
- 對應 AC / 錯誤碼：AC2（一致性防呆）

#### TS-F029-008 metadata 來源為 `ICSOP_DOCUMENT` DB 記錄而非 F028 頁首解析值 [unit]
- Given：`FakeDocumentContextProvider` 之 `documentNumber` 與 F028 fixture 頁首解析出的字串刻意設為不同值
- When：掛載 metadata
- Then：chunk 之 `documentNumber` 採 `FakeDocumentContextProvider`（DB 記錄）之值，忽略 F028 頁首解析值（回應 OQ-F028-05 之權威來源假設）
- 對應 AC / 錯誤碼：AC2（權威來源防呆，見 F028-test.md OQ-F028-05）

### Embedding 產生與 VECTOR_EMBEDDING（AC3 前段）

#### TS-F029-009 每個 chunk 產生對應之 VECTOR_EMBEDDING [unit]
- Given：3 個 chunk
- When：呼叫 `FakeEmbedder.embed()`
- Then：呼叫 3 次（每 chunk 恰一次），each 產出之 `VECTOR_EMBEDDING.chunkId` 與對應 chunk 1:1；`embeddingModel` 欄位記錄固定測試識別字串（不預設真實模型名稱）
- 對應 AC / 錯誤碼：AC3

#### TS-F029-010 `VECTOR_EMBEDDING.dimension` 與實際向量長度一致 [unit]
- Given：`FakeEmbedder` 回傳 `vector.length=8`（測試用固定維度，非真實模型維度）
- Then：`VECTOR_EMBEDDING.dimension === 8`，與 `vector.length` 相符（防呆：不可寫死維度常數而不驗證實際陣列長度）
- 對應 AC / 錯誤碼：資料模型 `VECTOR_EMBEDDING.dimension`

### 向量寫入＋metadata 過濾查詢（AC3 後段）

#### TS-F029-011 向量成功寫入向量資料庫 [unit]
- Given：TS-F029-009 情境
- When：`VectorIndexWriter.upsert()` 執行
- Then：`FakeVectorStore` 內部記錄 3 筆，各自 `chunkId`/`vector`/`payload` 正確
- 對應 AC / 錯誤碼：AC3

#### TS-F029-012 依 `status` metadata 篩選查詢 [unit]
- Given：`FakeVectorStore` 已寫入 2 個 `status='active'` chunk 與 1 個 `status='inactive'` chunk
- When：`queryByFilter({status:'active'})`
- Then：僅回傳 2 個 active chunk 之 id，不含 inactive
- 對應 AC / 錯誤碼：AC3「可依 metadata（如使用部門/狀態）篩選查詢」

#### TS-F029-013 依 `usingDeptIds` 交集篩選查詢 [unit]
- Given：chunk A `usingDeptIds=['DEPT-A']`、chunk B `usingDeptIds=['DEPT-B']`、chunk C `usingDeptIds=['DEPT-A','DEPT-B']`
- When：`queryByFilter({usingDeptIds:['DEPT-A']})`（模擬 F033 之「使用者部門 ∩ chunk 使用部門 ≠ ∅」查詢條件）
- Then：回傳 chunk A 與 chunk C（交集非空者），不含 chunk B
- 對應 AC / 錯誤碼：AC3（為 F033 過濾查詢之基礎能力，供未來 worktree 對接）

#### TS-F029-014 複合條件篩選（status AND usingDeptIds） [unit]
- Given：多筆 chunk 混合不同 `status`／`usingDeptIds` 組合
- When：`queryByFilter({status:'active', usingDeptIds:['DEPT-A']})`
- Then：僅回傳同時符合兩條件之 chunk（AND 語意，非 OR）
- 對應 AC / 錯誤碼：AC3

### 索引失敗不留部分索引（AC4）

#### TS-F029-015 chunk 切分階段例外時標記 `CHUNKING_FAILED` [unit]
- Given：F028 交付之 `ExtractionResult` 結構異常（如 `sections` 含 `content=null`，非預期空值）
- When：執行切分
- Then：拋出/標記 `CHUNKING_FAILED`；`FakeChunkStore` 中不存在本次 `indexRunId` 之任何列（即便部分 chunk 已計算完成亦不落地）
- 對應 AC / 錯誤碼：AC4 / `CHUNKING_FAILED`

#### TS-F029-016 embedding 階段失敗（如第 3/5 個 chunk 呼叫失敗）時不留部分向量 [unit]
- Given：5 個 chunk，`FakeEmbedder` 於第 3 次呼叫拋出例外
- When：批次 embedding 執行
- Then：`FakeVectorStore` 中不存在本次 `indexRunId` 之任何列（含已成功之前 2 筆亦須被補償清理，或採「先全數 embed 成功再一次性 upsert」策略使前 2 筆從未進入 upsert 階段——兩種實作策略皆可通過本測試，只斷言**最終不留殘留**，不預設實作細節，見開放設計問題 OQ-F029-02）；`INDEX_RUN` 標記 `status='failed'`, `stage='embed'`, `errorStage='embed'`
- 對應 AC / 錯誤碼：AC4 / `EMBEDDING_FAILED`

#### TS-F029-017 向量寫入階段失敗（`FakeVectorStore.upsert` 拋出例外）不留部分索引 [unit]
- Given：所有 chunk embedding 成功，但 `FakeVectorStore.upsert()` 於寫入第 4 筆時失敗
- When：寫入執行
- Then：`INDEX_RUN` 標記 `status='failed'`, `stage='embed'`, `errorStage='embed'`（`INDEX_BUILD_FAILED`）；`FakeChunkStore` 與 `FakeVectorStore` 皆不留本次 `indexRunId` 殘留列
- 對應 AC / 錯誤碼：AC4 / `INDEX_BUILD_FAILED`

#### TS-F029-018 首次建置失敗時（無前版本）文件回到「無索引」而非「部分索引」 [unit]
- Given：文件先前**從無**成功索引（無舊版 chunk）
- When：TS-F029-016 情境發生於首次建置
- Then：文件狀態為「完全無索引」（`FakeChunkStore.findByDocumentId()` 回傳空陣列），非「部分節有 chunk、部分節無」的中間態（F031 應呈現「失敗」而非誤判可用）
- 對應 AC / 錯誤碼：AC4（首次建置邊界情境，與 F030 AC4「重抽失敗保留舊版」之情境互斥、需明確區分——F029 無舊版可保留）

#### TS-F029-019 失敗訊息與失敗階段保留供 F031 查詢 [unit]
- Given：TS-F029-016 情境
- Then：`INDEX_RUN.errorMessage` 含可讀之失敗描述（非空字串），`errorStage='embed'` 可被 F031 讀取呈現
- 對應 AC / 錯誤碼：AC4「保留錯誤訊息供 F031 查詢」

### INDEX_RUN 狀態轉換 / chunkCount

#### TS-F029-020 全流程成功時 INDEX_RUN 更新為 success 並記錄 chunkCount [unit]
- Given：3 個 chunk 全數切分/embedding/寫入皆成功
- When：流程完成
- Then：`INDEX_RUN.status='success'`, `chunkCount=3`, `endedAt` 已填值
- 對應 AC / 錯誤碼：Main Flow 步驟 6

#### TS-F029-021 `chunkCount` 精確等於本次 indexRunId 產生之 chunk 數（非累計歷史總數） [unit]
- Given：文件先前已有一版 5 個 chunk 之舊索引（不同 `indexRunId`），本次新建置產生 4 個 chunk
- When：新版成功
- Then：本次 `INDEX_RUN.chunkCount=4`（非 9，不與舊版加總）
- 對應 AC / 錯誤碼：資料模型 `INDEX_RUN.chunkCount`「本次產生之 chunk 數」

### 規模 Edge Case（NFR-010 參考值，非本 feature 效能瓶頸驗證，見策略段落）

#### TS-F029-022 大量 chunk（如 50 個節）之切分與 metadata 掛載正確性不因數量增加而劣化 [unit]
- Given：`ExtractionResult.sections.length=50`
- When：切分＋掛 metadata
- Then：50 個 chunk 全數正確，`chunkSeq` 連續無跳號/重複（規模參考：單份文件不至於達此量級，屬壓力邊界防呆而非真實效能測試）
- 對應 AC / 錯誤碼：Edge Case「規模參考」防呆（非 NFR-010 AC5 之 [integration] 吞吐測試本身）

### [integration] 佔位場景（本 worktree 不執行，待模型選型/pgvector 部署定案）

#### TS-F029-023 真實 embedding 模型輸出維度與 `VECTOR_EMBEDDING.dimension`／pgvector 欄位型別一致 [integration]
- Given：OQ-E09-01/02 選型定案後之真實模型
- When：對樣本 chunk 執行真實 embedding
- Then：輸出向量維度與 `VECTOR_EMBEDDING.dimension` 及 pgvector `vector(N)` 欄位定義一致，無截斷/補零
- 對應 AC / 錯誤碼：AC3 / OQ-F029-01

#### TS-F029-024 真實 pgvector 容器之 upsert＋metadata 過濾查詢 [integration]
- Given：`docker-compose.yml` 之 pgvector 容器（`CREATE EXTENSION vector` 已就緒）
- When：寫入樣本向量並以 SQL `WHERE` 篩選 `status`/`usingDeptIds`
- Then：查詢結果與 TS-F029-012～014 之邏輯斷言一致，驗證 `FakeVectorStore` 之過濾語意未偏離真實 pgvector 行為
- 對應 AC / 錯誤碼：AC3

#### TS-F029-025 索引建置吞吐（NFR-010 AC5：≈600 份/≈1 萬 chunk ＜24 小時） [integration]
- Given：全量或具代表性樣本規模之文件
- When：執行全量批次建置
- Then：量測實際耗時，比對 NFR-010 AC5 草案門檻（待 OQ-E09-06 校準）
- 對應 AC / 錯誤碼：NFR-010 AC5

## AC → TS 覆蓋對照表

| AC/來源 | 內容摘要 | 對應 TS |
|---|---|---|
| AC1 | 依節切為個別 chunk，恰對應一完整作業步驟 | TS-001, TS-002, TS-003 |
| AC2 | 8 項 metadata 正確掛載 | TS-004～008 |
| AC3 | 向量成功寫入，可依 metadata 篩選查詢 | TS-009～014 |
| AC4 | 失敗標記失敗、不留部分索引、保留錯誤訊息 | TS-015～019 |
| Main Flow / 資料模型 | INDEX_RUN success/chunkCount | TS-020, TS-021 |
| Edge Case | 規模防呆 | TS-022 |

## 開放設計問題

- **OQ-F029-01（embedding 模型選型與維度，`[BLOCKING]`，OQ-E09-02）**：本測試設計刻意以參數化維度（`FakeEmbedder` 回傳任意固定長度向量，測試中以 8 維示意）設計，**不預設** bge-m3／multilingual-e5 等候選模型之實際維度（bge-m3 為 1024 維，multilingual-e5 系列依變體 384～1024 維不等）。一旦 OQ-E09-01/02 之 PoC 選型定案，`[integration]` 測試須補上「真實模型輸出維度與 `VECTOR_EMBEDDING.dimension` 一致」之驗證，並確認 pgvector 向量欄位型別（`vector(N)`）的 `N` 與選定模型維度相符——此為 schema migration 層須配合的具體技術動作，非本測試設計範圍但需及早排入下一階段 worktree 待辦。

- **OQ-F029-02（跨庫「失敗不留半索引」之實作策略未定案，中風險）**：`DOCUMENT_CHUNK`（App MSSQL）與 `VECTOR_EMBEDDING`（pgvector）分屬不同資料庫，無法以單一 DB 交易保證原子性。可能的實作策略至少有兩種，本測試設計刻意保持中立（TS-016/017 僅斷言「最終結果不留殘留」，不斷言中間過程）：
  1. **先全數計算成功才落地**：所有 chunk 先於記憶體完成 embedding，全數成功後才一次性寫入兩個資料庫（任一步驟失敗則兩邊皆未寫入任何一筆）——實作簡單，但犧牲「逐筆串流寫入」的記憶體效率，對 ~1 萬 chunk 規模應可接受。
  2. **邊算邊寫＋失敗時補償刪除**：逐筆寫入以降低記憶體峰值，失敗時主動呼叫 `DELETE WHERE indexRunId=X` 清理兩邊已寫入之部分列——實作較複雜，需確保補償刪除本身不會再次失敗（清理失敗時的降級策略、是否需要背景重試，未定案）。
  策略選擇直接影響 `[integration]` 測試需驗證的失敗注入時機（策略 1 只需測「全批次失敗」，策略 2 需額外測「補償刪除本身也失敗」的雙重失敗情境），建議與 architect 及早定案並記錄於 architecture-spec.md（目前 §5.7 序列圖僅示意「失敗 → `INDEX_RUN(failed)`，保留舊版」，未觸及新版建置失敗時「新版殘留物」之清理機制細節）。

- **OQ-F029-03（`FakeDocumentContextProvider` 之查詢時機與一致性未定案）**：TS-004 假設 metadata 掛載時「即時查詢」`ICSOP_DOCUMENT`/`DOC_USING_DEPT` 取得當下值。但若索引建置過程耗時（大量節之文件），建置期間文件狀態/使用部門若被併發修改（如 F012 狀態切換剛好在 F029 embedding 進行中發生），metadata 快照應以「索引開始時」或「索引完成寫入時」的值為準？此涉及與 F030 narrowing/widening 近同步機制的交互，若 F029 建置期間發生 narrowing 事件而 F029 快照仍用舊值，可能產生短暫的權限過濾落差（雖然視窗極短、風險與 architecture-spec §4.3 已識別之「narrowing 近同步」精神一致，但兩者交互的精確時序保證未逐字定案）。
