import { runIndexing } from './indexing';
import { FakeChunkStore } from './chunk-store';
import { FakeVectorStore } from './fake-vector-store';
import { FakeEmbedder, FailingEmbedder } from './fake-embedder';
import { FakeIndexRunStore } from './index-run';
import { ChunkFilterPayload, DocumentContext } from './chunking.types';
import { CleanedSection, ExtractionResult } from './extraction.types';

/**
 * F029 章/節 chunking、metadata 標註與向量索引建立 · 單元測試（TS-F029-001～022）。
 * fake embedder（維度不可知）＋ fake vector store ＋ F028 ExtractionResult fixture。
 * 真模型/真 pgvector/吞吐＝ [integration]（TS-F029-023～025）。
 */

const CONTEXT: DocumentContext = {
  documentNumber: 'ICSOP-SRC-101-1',
  lifecycleId: 'LC-01',
  usingDeptIds: ['DEPT-A', 'DEPT-B'],
  status: 'active',
  announcedDate: '2026-01-01',
  edition: "26'01",
};

function section(over: Partial<CleanedSection> = {}): CleanedSection {
  return {
    chapterSection: '第1章第1節',
    executor: '甲',
    timeLimit: 'T',
    content: '確認申請單完整性。',
    pageNumber: 1,
    ...over,
  };
}

function extractionOf(sections: CleanedSection[]): ExtractionResult {
  return {
    documentId: 'DOC-1',
    status: 'success',
    purpose: '目的。',
    scope: '範圍。',
    sections,
    changeLog: [],
  };
}

async function setup() {
  const chunkStore = new FakeChunkStore();
  const vectorStore = new FakeVectorStore();
  const runStore = new FakeIndexRunStore();
  const run = await runStore.create({
    documentId: 'DOC-1',
    triggerType: 'xls_update',
    stage: 'extract',
  });
  return { chunkStore, vectorStore, runStore, run };
}

describe('F029 依節切 chunk（AC1）', () => {
  it('TS-F029-001 多節 → 對應數量 chunk，chunkSeq 遞增，content 1:1', async () => {
    const s = await setup();
    const res = await runIndexing({
      documentId: 'DOC-1',
      indexRunId: s.run.id,
      extraction: extractionOf([
        section({ content: 'A。' }),
        section({ content: 'B。' }),
        section({ content: 'C。' }),
      ]),
      context: CONTEXT,
      embedder: new FakeEmbedder(),
      vectorStore: s.vectorStore,
      chunkStore: s.chunkStore,
      runStore: s.runStore,
    });
    expect(res.status).toBe('success');
    expect(res.chunks).toHaveLength(3);
    expect(res.chunks.map((c) => c.chunkSeq)).toEqual([1, 2, 3]);
    expect(res.chunks.map((c) => c.content)).toEqual(['A。', 'B。', 'C。']);
  });

  it('TS-F029-002 單節 → 1 chunk', async () => {
    const s = await setup();
    const res = await runIndexing({
      documentId: 'DOC-1', indexRunId: s.run.id,
      extraction: extractionOf([section()]),
      context: CONTEXT, embedder: new FakeEmbedder(),
      vectorStore: s.vectorStore, chunkStore: s.chunkStore, runStore: s.runStore,
    });
    expect(res.chunks).toHaveLength(1);
  });

  it('TS-F029-003 chunk 內容不混入不相關步驟', async () => {
    const s = await setup();
    const res = await runIndexing({
      documentId: 'DOC-1', indexRunId: s.run.id,
      extraction: extractionOf([section({ content: '步驟A獨有文字。' }), section({ content: '步驟B獨有文字。' })]),
      context: CONTEXT, embedder: new FakeEmbedder(),
      vectorStore: s.vectorStore, chunkStore: s.chunkStore, runStore: s.runStore,
    });
    expect(res.chunks[0].content).not.toContain('步驟B');
    expect(res.chunks[1].content).not.toContain('步驟A');
  });
});

describe('F029 8 項 metadata 掛載（AC2）', () => {
  it('TS-F029-004 完整 8 項 metadata 值正確', async () => {
    const s = await setup();
    const res = await runIndexing({
      documentId: 'DOC-1', indexRunId: s.run.id,
      extraction: extractionOf([section({ chapterSection: '第2章第3節', pageNumber: 5 })]),
      context: CONTEXT, embedder: new FakeEmbedder(),
      vectorStore: s.vectorStore, chunkStore: s.chunkStore, runStore: s.runStore,
    });
    expect(res.chunks[0]).toMatchObject({
      documentNumber: 'ICSOP-SRC-101-1',
      lifecycleId: 'LC-01',
      chapterSection: '第2章第3節',
      usingDeptIds: ['DEPT-A', 'DEPT-B'],
      status: 'active',
      announcedDate: '2026-01-01',
      edition: "26'01",
      pageNumber: 5,
    });
  });

  it('TS-F029-005 usingDeptIds 多值完整反映', async () => {
    const s = await setup();
    const res = await runIndexing({
      documentId: 'DOC-1', indexRunId: s.run.id,
      extraction: extractionOf([section()]),
      context: { ...CONTEXT, usingDeptIds: ['DEPT-A', 'DEPT-B', 'DEPT-C'] },
      embedder: new FakeEmbedder(), vectorStore: s.vectorStore,
      chunkStore: s.chunkStore, runStore: s.runStore,
    });
    expect(res.chunks[0].usingDeptIds).toEqual(['DEPT-A', 'DEPT-B', 'DEPT-C']);
  });

  it('TS-F029-006 usingDeptIds 單一部門 → 單元素陣列（非純量）', async () => {
    const s = await setup();
    const res = await runIndexing({
      documentId: 'DOC-1', indexRunId: s.run.id,
      extraction: extractionOf([section()]),
      context: { ...CONTEXT, usingDeptIds: ['DEPT-A'] },
      embedder: new FakeEmbedder(), vectorStore: s.vectorStore,
      chunkStore: s.chunkStore, runStore: s.runStore,
    });
    expect(Array.isArray(res.chunks[0].usingDeptIds)).toBe(true);
    expect(res.chunks[0].usingDeptIds).toEqual(['DEPT-A']);
  });

  it('TS-F029-007 全部 chunk 共享一致文件層級 metadata，僅章節/頁次相異', async () => {
    const s = await setup();
    const res = await runIndexing({
      documentId: 'DOC-1', indexRunId: s.run.id,
      extraction: extractionOf([
        section({ chapterSection: '第1章第1節', pageNumber: 1 }),
        section({ chapterSection: '第1章第2節', pageNumber: 2 }),
        section({ chapterSection: '第2章第1節', pageNumber: 3 }),
      ]),
      context: CONTEXT, embedder: new FakeEmbedder(),
      vectorStore: s.vectorStore, chunkStore: s.chunkStore, runStore: s.runStore,
    });
    const docLevel = res.chunks.map((c) =>
      [c.documentNumber, c.lifecycleId, c.usingDeptIds.join(','), c.status, c.announcedDate, c.edition].join('|'),
    );
    expect(new Set(docLevel).size).toBe(1); // 文件層級一致
    expect(res.chunks.map((c) => c.chapterSection)).toEqual(['第1章第1節', '第1章第2節', '第2章第1節']);
    expect(res.chunks.map((c) => c.pageNumber)).toEqual([1, 2, 3]);
  });

  it('TS-F029-008 metadata 採 DB context 而非 F028 頁首解析值', async () => {
    const s = await setup();
    // extraction fixture 之 purpose 內含一個「頁首解析出的假編號」，chunk 不應採用它。
    const res = await runIndexing({
      documentId: 'DOC-1', indexRunId: s.run.id,
      extraction: { ...extractionOf([section()]), purpose: 'ICSOP-HEADER-PARSED-999' },
      context: { ...CONTEXT, documentNumber: 'ICSOP-DB-AUTHORITATIVE-1' },
      embedder: new FakeEmbedder(), vectorStore: s.vectorStore,
      chunkStore: s.chunkStore, runStore: s.runStore,
    });
    expect(res.chunks[0].documentNumber).toBe('ICSOP-DB-AUTHORITATIVE-1');
  });
});

describe('F029 Embedding 與 VECTOR_EMBEDDING（AC3 前段）', () => {
  it('TS-F029-009 每 chunk 產生對應 embedding（呼叫次數/1:1/model 記錄）', async () => {
    const s = await setup();
    const embedder = new FakeEmbedder(8);
    const spy = jest.spyOn(embedder, 'embed');
    const res = await runIndexing({
      documentId: 'DOC-1', indexRunId: s.run.id,
      extraction: extractionOf([section({ content: 'A。' }), section({ content: 'B。' }), section({ content: 'C。' })]),
      context: CONTEXT, embedder, vectorStore: s.vectorStore,
      chunkStore: s.chunkStore, runStore: s.runStore,
    });
    expect(spy).toHaveBeenCalledTimes(3);
    expect(res.embeddings).toHaveLength(3);
    expect(res.embeddings.map((e) => e.chunkId)).toEqual(res.chunks.map((c) => c.id));
    expect(res.embeddings.every((e) => e.embeddingModel === 'fake-embedder@test')).toBe(true);
  });

  it('TS-F029-010 dimension 與實際向量長度一致（不寫死常數）', async () => {
    const s = await setup();
    const res = await runIndexing({
      documentId: 'DOC-1', indexRunId: s.run.id,
      extraction: extractionOf([section()]),
      context: CONTEXT, embedder: new FakeEmbedder(8),
      vectorStore: s.vectorStore, chunkStore: s.chunkStore, runStore: s.runStore,
    });
    expect(res.embeddings[0].dimension).toBe(8);
    expect(res.embeddings[0].dimension).toBe(res.embeddings[0].vector.length);
  });
});

describe('F029 向量寫入＋metadata 過濾查詢（AC3 後段）', () => {
  it('TS-F029-011 向量成功寫入（chunkId/vector/payload 正確）', async () => {
    const s = await setup();
    const res = await runIndexing({
      documentId: 'DOC-1', indexRunId: s.run.id,
      extraction: extractionOf([section(), section({ chapterSection: '第1章第2節' }), section({ chapterSection: '第1章第3節' })]),
      context: CONTEXT, embedder: new FakeEmbedder(),
      vectorStore: s.vectorStore, chunkStore: s.chunkStore, runStore: s.runStore,
    });
    expect(s.vectorStore.size).toBe(3);
    const first = res.chunks[0];
    expect(s.vectorStore.getPayload(first.id)).toMatchObject({
      documentId: 'DOC-1', status: 'active', usingDeptIds: ['DEPT-A', 'DEPT-B'],
    });
  });

  it('TS-F029-012 依 status 篩選查詢', async () => {
    const store = new FakeVectorStore();
    await store.upsert('c1', [0], { documentId: 'D', status: 'active', usingDeptIds: [], announcedDate: null });
    await store.upsert('c2', [0], { documentId: 'D', status: 'active', usingDeptIds: [], announcedDate: null });
    await store.upsert('c3', [0], { documentId: 'D', status: 'inactive', usingDeptIds: [], announcedDate: null });
    const ids = await store.queryByFilter({ status: 'active' });
    expect(ids.sort()).toEqual(['c1', 'c2']);
  });

  it('TS-F029-013 依 usingDeptIds 交集篩選', async () => {
    const store = new FakeVectorStore();
    await store.upsert('cA', [0], { documentId: 'D', status: 'active', usingDeptIds: ['DEPT-A'], announcedDate: null });
    await store.upsert('cB', [0], { documentId: 'D', status: 'active', usingDeptIds: ['DEPT-B'], announcedDate: null });
    await store.upsert('cC', [0], { documentId: 'D', status: 'active', usingDeptIds: ['DEPT-A', 'DEPT-B'], announcedDate: null });
    const ids = await store.queryByFilter({ usingDeptIds: ['DEPT-A'] });
    expect(ids.sort()).toEqual(['cA', 'cC']);
  });

  it('TS-F029-014 複合條件 AND（status AND usingDeptIds）', async () => {
    const store = new FakeVectorStore();
    await store.upsert('c1', [0], { documentId: 'D', status: 'active', usingDeptIds: ['DEPT-A'], announcedDate: null });
    await store.upsert('c2', [0], { documentId: 'D', status: 'inactive', usingDeptIds: ['DEPT-A'], announcedDate: null });
    await store.upsert('c3', [0], { documentId: 'D', status: 'active', usingDeptIds: ['DEPT-B'], announcedDate: null });
    const ids = await store.queryByFilter({ status: 'active', usingDeptIds: ['DEPT-A'] });
    expect(ids).toEqual(['c1']);
  });
});

/** 落地階段（向量 upsert）於第 N 筆失敗之向量庫（TS-F029-017）。 */
class FailingUpsertVectorStore extends FakeVectorStore {
  private count = 0;
  constructor(private readonly failOn: number) {
    super();
  }
  override upsert(chunkId: string, vector: number[], payload: ChunkFilterPayload): Promise<void> {
    this.count += 1;
    if (this.count === this.failOn) return Promise.reject(new Error('INDEX_BUILD_FAILED: 向量寫入失敗'));
    return super.upsert(chunkId, vector, payload);
  }
}

describe('F029 索引失敗不留部分索引（AC4）', () => {
  it('TS-F029-015 切分階段例外 → CHUNKING_FAILED，無殘留', async () => {
    const s = await setup();
    const res = await runIndexing({
      documentId: 'DOC-1', indexRunId: s.run.id,
      extraction: extractionOf([section({ content: null as unknown as string })]),
      context: CONTEXT, embedder: new FakeEmbedder(),
      vectorStore: s.vectorStore, chunkStore: s.chunkStore, runStore: s.runStore,
    });
    expect(res.status).toBe('failed');
    expect(res.errorCode).toBe('CHUNKING_FAILED');
    const run = await s.runStore.findById(s.run.id);
    expect(run?.stage).toBe('chunk');
    expect(await s.chunkStore.findByDocumentId('DOC-1')).toHaveLength(0);
    expect(s.vectorStore.size).toBe(0);
  });

  it('TS-F029-016 embedding 第 3/5 失敗 → 不留部分向量，run failed stage=embed', async () => {
    const s = await setup();
    const res = await runIndexing({
      documentId: 'DOC-1', indexRunId: s.run.id,
      extraction: extractionOf([section(), section(), section(), section(), section()]),
      context: CONTEXT, embedder: new FailingEmbedder(3),
      vectorStore: s.vectorStore, chunkStore: s.chunkStore, runStore: s.runStore,
    });
    expect(res.status).toBe('failed');
    expect(s.vectorStore.size).toBe(0);
    expect(await s.chunkStore.findByDocumentId('DOC-1')).toHaveLength(0);
    const run = await s.runStore.findById(s.run.id);
    expect(run).toMatchObject({ status: 'failed', stage: 'embed', errorStage: 'embed' });
  });

  it('TS-F029-017 向量寫入第 4 筆失敗 → 補償清理兩庫，run failed stage=embed', async () => {
    const s = await setup();
    const vectorStore = new FailingUpsertVectorStore(4);
    const res = await runIndexing({
      documentId: 'DOC-1', indexRunId: s.run.id,
      extraction: extractionOf([section(), section(), section(), section(), section()]),
      context: CONTEXT, embedder: new FakeEmbedder(),
      vectorStore, chunkStore: s.chunkStore, runStore: s.runStore,
    });
    expect(res.status).toBe('failed');
    expect(res.errorCode).toBe('INDEX_BUILD_FAILED');
    expect(vectorStore.size).toBe(0); // 已寫入之前 3 筆被補償刪除
    expect(await s.chunkStore.findByDocumentId('DOC-1')).toHaveLength(0);
    const run = await s.runStore.findById(s.run.id);
    expect(run).toMatchObject({ status: 'failed', stage: 'embed', errorStage: 'embed' });
  });

  it('TS-F029-018 首次建置失敗 → 完全無索引（非部分）', async () => {
    const s = await setup();
    await runIndexing({
      documentId: 'DOC-1', indexRunId: s.run.id,
      extraction: extractionOf([section(), section(), section()]),
      context: CONTEXT, embedder: new FailingEmbedder(2),
      vectorStore: s.vectorStore, chunkStore: s.chunkStore, runStore: s.runStore,
    });
    expect(await s.chunkStore.findByDocumentId('DOC-1')).toEqual([]);
    expect(await s.chunkStore.findActiveByDocumentId('DOC-1')).toEqual([]);
  });

  it('TS-F029-019 失敗訊息與失敗階段保留供 F031', async () => {
    const s = await setup();
    await runIndexing({
      documentId: 'DOC-1', indexRunId: s.run.id,
      extraction: extractionOf([section(), section(), section()]),
      context: CONTEXT, embedder: new FailingEmbedder(2),
      vectorStore: s.vectorStore, chunkStore: s.chunkStore, runStore: s.runStore,
    });
    const run = await s.runStore.findById(s.run.id);
    expect(run?.errorMessage).toBeTruthy();
    expect(run?.errorStage).toBe('embed');
  });
});

describe('F029 INDEX_RUN 狀態轉換 / chunkCount', () => {
  it('TS-F029-020 全成功 → status=success, chunkCount, endedAt', async () => {
    const s = await setup();
    await runIndexing({
      documentId: 'DOC-1', indexRunId: s.run.id,
      extraction: extractionOf([section(), section(), section()]),
      context: CONTEXT, embedder: new FakeEmbedder(),
      vectorStore: s.vectorStore, chunkStore: s.chunkStore, runStore: s.runStore,
    });
    const run = await s.runStore.findById(s.run.id);
    expect(run?.status).toBe('success');
    expect(run?.chunkCount).toBe(3);
    expect(run?.endedAt).not.toBeNull();
  });

  it('TS-F029-021 chunkCount 為本次 run 之數（非與舊版加總）', async () => {
    const chunkStore = new FakeChunkStore();
    const vectorStore = new FakeVectorStore();
    const runStore = new FakeIndexRunStore();
    // 舊版 run（5 chunk）
    const old = await runStore.create({ documentId: 'DOC-1', triggerType: 'xls_update', stage: 'extract' });
    await runStore.markSuccess(old.id, 5);
    // 本次新建 4 chunk
    const cur = await runStore.create({ documentId: 'DOC-1', triggerType: 'document_edit', stage: 'extract' });
    await runIndexing({
      documentId: 'DOC-1', indexRunId: cur.id,
      extraction: extractionOf([section(), section(), section(), section()]),
      context: CONTEXT, embedder: new FakeEmbedder(),
      vectorStore, chunkStore, runStore,
    });
    const run = await runStore.findById(cur.id);
    expect(run?.chunkCount).toBe(4); // 非 9
  });
});

describe('F029 規模 Edge Case', () => {
  it('TS-F029-022 50 節 → 50 chunk，chunkSeq 連續無跳號/重複', async () => {
    const s = await setup();
    const sections = Array.from({ length: 50 }, (_, i) =>
      section({ chapterSection: `第${i + 1}節`, content: `內容${i + 1}。`, pageNumber: i + 1 }),
    );
    const res = await runIndexing({
      documentId: 'DOC-1', indexRunId: s.run.id,
      extraction: extractionOf(sections),
      context: CONTEXT, embedder: new FakeEmbedder(),
      vectorStore: s.vectorStore, chunkStore: s.chunkStore, runStore: s.runStore,
    });
    expect(res.chunks).toHaveLength(50);
    expect(res.chunks.map((c) => c.chunkSeq)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
  });
});
