import { randomUUID } from 'crypto';
import { ExtractionResult } from './extraction.types';
import {
  ChunkFilterPayload,
  DocumentChunk,
  DocumentContext,
  EmbeddingClient,
  VectorEmbedding,
  VectorIndexWriter,
} from './chunking.types';
import { ChunkStore } from './chunk-store';
import { IndexRunStage, IndexRunStore } from './index-run';

/**
 * F029 chunking／metadata／向量索引建立管線。
 *
 * 步驟：切 chunk（依「節」1:1 映射 + 掛 8 項 metadata）→ embedding → 寫入（chunk + 向量）→ 成功記 chunkCount。
 * 「失敗不留半索引」（AC4，跨庫無單一交易，OQ-F029-02 → 採**先全數計算成功才落地** + 落地階段失敗補償刪除）：
 *  - CHUNKING_FAILED（stage=chunk）：切分階段例外，無任何寫入。
 *  - EMBEDDING_FAILED（stage=embed）：任一 chunk embedding 失敗，尚未落地 → 無殘留。
 *  - INDEX_BUILD_FAILED（stage=embed）：落地階段（向量 upsert）失敗 → 補償刪除本次 indexRunId 之 chunk + 已寫向量。
 * 最終結果只保證「不留殘留」，不對中間過程做斷言（OQ-F029-02 中立）。
 */

export class IndexingError extends Error {
  constructor(
    public readonly code: string,
    public readonly stage: IndexRunStage,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'IndexingError';
  }
}

export interface IndexingDeps {
  documentId: string;
  indexRunId: string;
  extraction: ExtractionResult; // status='success'
  context: DocumentContext;
  embedder: EmbeddingClient;
  vectorStore: VectorIndexWriter;
  chunkStore: ChunkStore;
  runStore: IndexRunStore;
  now?: () => Date;
  newId?: () => string;
}

export interface IndexingResult {
  status: 'success' | 'failed';
  chunkCount?: number;
  chunks: DocumentChunk[];
  embeddings: VectorEmbedding[];
  errorStage?: IndexRunStage;
  errorCode?: string;
}

function payloadOf(chunk: DocumentChunk): ChunkFilterPayload {
  return {
    documentId: chunk.documentId,
    status: chunk.status,
    usingDeptIds: [...chunk.usingDeptIds],
    announcedDate: chunk.announcedDate,
  };
}

/** 依「節」切 chunk 並掛 8 項 metadata（來源＝context，非 F028 頁首解析值）。 */
export function buildChunks(
  deps: Pick<IndexingDeps, 'documentId' | 'indexRunId' | 'extraction' | 'context'>,
  now: () => Date,
  newId: () => string,
): DocumentChunk[] {
  const { context } = deps;
  return deps.extraction.sections.map((section, idx) => {
    if (section.content == null || typeof section.content !== 'string') {
      throw new IndexingError(
        'CHUNKING_FAILED',
        'chunk',
        `章節 ${section.chapterSection} 內容結構異常（content 非字串）`,
      );
    }
    return {
      id: newId(),
      documentId: deps.documentId,
      indexRunId: deps.indexRunId,
      content: section.content,
      chunkSeq: idx + 1,
      documentNumber: context.documentNumber,
      lifecycleId: context.lifecycleId,
      chapterSection: section.chapterSection,
      usingDeptIds: [...context.usingDeptIds],
      status: context.status,
      announcedDate: context.announcedDate,
      edition: context.edition,
      pageNumber: section.pageNumber,
      createdAt: now(),
    };
  });
}

export async function runIndexing(deps: IndexingDeps): Promise<IndexingResult> {
  const now = deps.now ?? (() => new Date());
  const newId = deps.newId ?? (() => randomUUID());

  // 1) 切 chunk（stage=chunk）
  let chunks: DocumentChunk[];
  try {
    chunks = buildChunks(deps, now, newId);
  } catch (e) {
    const err = e as IndexingError;
    await deps.runStore.markFailed(deps.indexRunId, {
      stage: 'chunk',
      errorStage: 'chunk',
      errorMessage: err.message,
    });
    return { status: 'failed', chunks: [], embeddings: [], errorStage: 'chunk', errorCode: err.code };
  }
  await deps.runStore.markStage(deps.indexRunId, 'chunk');

  // 2) embedding（全數先於記憶體計算成功才落地；stage=embed）
  const embeddings: VectorEmbedding[] = [];
  try {
    for (const chunk of chunks) {
      const { vector } = await deps.embedder.embed(chunk.content);
      embeddings.push({
        id: newId(),
        chunkId: chunk.id,
        embeddingModel: deps.embedder.model,
        vector,
        dimension: vector.length, // 防呆：以實際陣列長度，不寫死常數
        createdAt: now(),
      });
    }
  } catch (e) {
    await deps.runStore.markFailed(deps.indexRunId, {
      stage: 'embed',
      errorStage: 'embed',
      errorMessage: (e as Error).message || 'EMBEDDING_FAILED',
    });
    return { status: 'failed', chunks: [], embeddings: [], errorStage: 'embed', errorCode: 'EMBEDDING_FAILED' };
  }
  await deps.runStore.markStage(deps.indexRunId, 'embed');

  // 3) 落地（chunk + 向量）；任一失敗 → 補償刪除本次 indexRunId 殘留
  try {
    await deps.chunkStore.insertBatch(chunks);
    for (let i = 0; i < chunks.length; i++) {
      await deps.vectorStore.upsert(chunks[i].id, embeddings[i].vector, payloadOf(chunks[i]));
    }
  } catch (e) {
    await deps.chunkStore.deleteByIndexRunId(deps.indexRunId);
    for (const chunk of chunks) {
      await deps.vectorStore.delete(chunk.id);
    }
    await deps.runStore.markFailed(deps.indexRunId, {
      stage: 'embed',
      errorStage: 'embed',
      errorMessage: (e as Error).message || 'INDEX_BUILD_FAILED',
    });
    return { status: 'failed', chunks: [], embeddings: [], errorStage: 'embed', errorCode: 'INDEX_BUILD_FAILED' };
  }

  // 4) 成功
  await deps.runStore.markSuccess(deps.indexRunId, chunks.length);
  return { status: 'success', chunkCount: chunks.length, chunks, embeddings };
}
