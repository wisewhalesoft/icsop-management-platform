import { DocumentStatus } from '../documents/document-status';

/**
 * F029 chunking／metadata／向量索引之型別契約。
 *
 * ⚠ 內部狀態碼一致性：`DOCUMENT_CHUNK.status` metadata 快照 **英文內部碼**（active/inactive/void，
 * 同 backend/src/documents/document-status.ts），非中文顯示標籤（有效/失效/作廢），以確保 F033 檢索層
 * `WHERE status='active'` 可與 ICSOP_DOCUMENT.status 直接比對（見 F029-test.md 測試策略備註；
 * data-model.md line 448 以中文標籤描述 → 需回報 spec owner 對齊為英文內部碼，見 impl log）。
 */

/** DOCUMENT_CHUNK（data-model §documentchunk-entity）：依「節」切分之最小檢索單位 + 8 項 metadata。 */
export interface DocumentChunk {
  id: string;
  documentId: string;
  indexRunId: string;
  content: string;
  chunkSeq: number;
  // ---- 8 項 metadata（US-092 AC-2）----
  documentNumber: string;
  lifecycleId: string;
  chapterSection: string;
  usingDeptIds: string[];
  status: DocumentStatus;
  announcedDate: string | null;
  edition: string;
  pageNumber: number;
  // -------------------------------------
  createdAt: Date;
}

/** 向量庫 payload（權限/狀態過濾用；語意上必為「可於向量檢索查詢條件直接篩選」）。 */
export interface ChunkFilterPayload {
  documentId: string;
  status: DocumentStatus;
  usingDeptIds: string[];
  announcedDate: string | null;
}

/** VECTOR_EMBEDDING（data-model §vectorembedding-entity）：chunk 之向量表示（1:1）。 */
export interface VectorEmbedding {
  id: string;
  chunkId: string;
  embeddingModel: string;
  vector: number[];
  dimension: number;
  createdAt: Date;
}

export interface EmbeddingResult {
  vector: number[];
  dimension: number;
}

/**
 * Embedding 產生器（維度不可知）。真實模型選型（bge-m3/multilingual-e5…）＝ [integration]（OQ-E09-01/02）；
 * 本輪一律以 FakeEmbedder 參數化維度測試（TS-F029-023 為 [integration] 佔位）。
 */
export interface EmbeddingClient {
  readonly model: string;
  embed(text: string): Promise<EmbeddingResult>;
}

export const EMBEDDING_CLIENT = Symbol('EMBEDDING_CLIENT');

/** 向量索引寫入/查詢（pgvector 物理落地＝ [integration]；本輪 FakeVectorStore 記憶體實作）。 */
export interface VectorIndexWriter {
  upsert(
    chunkId: string,
    vector: number[],
    payload: ChunkFilterPayload,
  ): Promise<void>;
  queryByFilter(filter: Partial<ChunkFilterPayload>): Promise<string[]>;
  delete(chunkId: string): Promise<void>;
  /** F030 輕量分支：跨庫 metadata 幂等更新（payload 過濾欄位同步至向量庫）。 */
  upsertMetadataOnly(
    chunkIds: string[],
    payloadPatch: Partial<ChunkFilterPayload>,
  ): Promise<void>;
}

export const VECTOR_INDEX_WRITER = Symbol('VECTOR_INDEX_WRITER');

/** 文件層級 metadata 來源（權威＝ICSOP_DOCUMENT + DOC_USING_DEPT，非 F028 頁首解析值，見 OQ-F028-05）。 */
export interface DocumentContext {
  documentNumber: string;
  lifecycleId: string;
  usingDeptIds: string[];
  status: DocumentStatus;
  announcedDate: string | null;
  edition: string;
}

export interface DocumentContextProvider {
  getContext(documentId: string): Promise<DocumentContext>;
}

export const DOCUMENT_CONTEXT_PROVIDER = Symbol('DOCUMENT_CONTEXT_PROVIDER');
