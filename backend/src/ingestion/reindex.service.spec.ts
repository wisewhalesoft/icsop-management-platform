import { ReindexService, ReindexError } from './reindex.service';
import { FakeChunkStore } from './chunk-store';
import { FakeVectorStore } from './fake-vector-store';
import { FakeIndexRunStore } from './index-run';
import { DocumentChunk } from './chunking.types';
import {
  DocumentExistsPort,
  IndexBuilder,
  RebuildResult,
} from './reindex-trigger.port';
import { DocumentStatus } from '../documents/document-status';

/**
 * F030 改版重抽與重建索引、舊版排除 · 單元測試（TS-F030-001～018）。
 * fake caller 直接呼叫 ReindexTriggerPort；F028/F029 以 FakeIndexBuilder 黑箱替身。
 * 真實 F011/F012 接線／真實跨庫 new-then-swap／sp_getapplock＝ [integration]（TS-019/020，OQ-F030-01 待接線）。
 */

let seq = 0;
function chunk(
  indexRunId: string,
  over: Partial<DocumentChunk> = {},
): DocumentChunk {
  seq += 1;
  return {
    id: `chunk-${indexRunId}-${seq}`,
    documentId: 'DOC-1',
    indexRunId,
    content: '內容。',
    chunkSeq: 1,
    documentNumber: 'ICSOP-1',
    lifecycleId: 'LC-1',
    chapterSection: '第1章第1節',
    usingDeptIds: ['DEPT-A'],
    status: 'active',
    announcedDate: '2026-01-01',
    edition: "26'01",
    pageNumber: 1,
    createdAt: new Date(),
    ...over,
  };
}

const existsAll: DocumentExistsPort = { exists: () => Promise.resolve(true) };

class FakeIndexBuilder implements IndexBuilder {
  public calls: string[] = [];
  constructor(
    private readonly chunkStore: FakeChunkStore,
    private readonly outcome: RebuildResult,
    private readonly newChunks: DocumentChunk[] = [],
  ) {}
  async rebuild(documentId: string): Promise<RebuildResult> {
    this.calls.push(documentId);
    if (this.outcome.status === 'success' && this.newChunks.length > 0) {
      // 模擬 F029 寫入新版 chunk（非有效版本，待 swap 才生效）。
      await this.chunkStore.insertBatch(this.newChunks);
    }
    return this.outcome;
  }
}

async function seedOld(chunkStore: FakeChunkStore, count = 3): Promise<void> {
  await chunkStore.insertBatch(
    Array.from({ length: count }, (_, i) => chunk('OLD', { chunkSeq: i + 1 })),
  );
}

function makeService(over: Partial<ConstructorParameters<typeof ReindexService>[0]> = {}) {
  const chunkStore = new FakeChunkStore();
  const vectorStore = new FakeVectorStore();
  const runStore = new FakeIndexRunStore();
  const svc = new ReindexService({
    indexBuilder: over.indexBuilder ?? new FakeIndexBuilder(chunkStore, { status: 'success', newIndexRunId: 'NEW' }),
    chunkStore,
    vectorStore,
    runStore,
    documents: over.documents ?? existsAll,
    statusReader: over.statusReader,
    logger: over.logger,
  });
  return { svc, chunkStore, vectorStore, runStore };
}

describe('F030 內容改版分支：換 .xls（AC1/AC2）', () => {
  it('TS-F030-001 換 .xls 觸發重抽 → 建立 INDEX_RUN(xls_update, running)，rebuild 呼叫一次', async () => {
    const chunkStore = new FakeChunkStore();
    await seedOld(chunkStore);
    const builder = new FakeIndexBuilder(chunkStore, { status: 'success', newIndexRunId: 'NEW', chunkCount: 4 }, [
      chunk('NEW'), chunk('NEW'), chunk('NEW'), chunk('NEW'),
    ]);
    const runStore = new FakeIndexRunStore();
    const svc = new ReindexService({
      indexBuilder: builder, chunkStore, vectorStore: new FakeVectorStore(),
      runStore, documents: existsAll,
    });
    await svc.onContentRevised('DOC-1', 'xls_update');
    expect(builder.calls).toEqual(['DOC-1']);
    const run = await runStore.getLatestByDocument('DOC-1');
    expect(run?.triggerType).toBe('xls_update');
  });

  it('TS-F030-002 重抽成功 → swap 新版取代舊版（有效查詢僅含新版）', async () => {
    const chunkStore = new FakeChunkStore();
    await seedOld(chunkStore, 3);
    const newChunks = [chunk('NEW'), chunk('NEW'), chunk('NEW'), chunk('NEW')];
    const builder = new FakeIndexBuilder(chunkStore, { status: 'success', newIndexRunId: 'NEW', chunkCount: 4 }, newChunks);
    const svc = new ReindexService({
      indexBuilder: builder, chunkStore, vectorStore: new FakeVectorStore(),
      runStore: new FakeIndexRunStore(), documents: existsAll,
    });
    await svc.onContentRevised('DOC-1', 'xls_update');
    const active = await chunkStore.findActiveByDocumentId('DOC-1');
    expect(active).toHaveLength(4);
    expect(active.every((c) => c.indexRunId === 'NEW')).toBe(true);
  });

  it('TS-F030-003 建置期間（尚未 swap）舊版仍可服務檢索（store 語意）', async () => {
    const chunkStore = new FakeChunkStore();
    await seedOld(chunkStore, 3); // OLD 自動成為有效版本
    // 模擬 rebuild 已寫入新版（尚未 swap）
    await chunkStore.insertBatch([chunk('NEW'), chunk('NEW'), chunk('NEW'), chunk('NEW')]);
    const beforeSwap = await chunkStore.findActiveByDocumentId('DOC-1');
    expect(beforeSwap).toHaveLength(3);
    expect(beforeSwap.every((c) => c.indexRunId === 'OLD')).toBe(true);
    // swap 後才切到新版
    await chunkStore.swapToNewVersion('DOC-1', 'NEW');
    expect(await chunkStore.findActiveByDocumentId('DOC-1')).toHaveLength(4);
  });
});

describe('F030 內容改版分支：編輯內容（AC1）', () => {
  it('TS-F030-004 編輯觸發 → triggerType=document_edit（同 rebuild 邏輯）', async () => {
    const chunkStore = new FakeChunkStore();
    await seedOld(chunkStore);
    const builder = new FakeIndexBuilder(chunkStore, { status: 'success', newIndexRunId: 'NEW', chunkCount: 3 }, [chunk('NEW'), chunk('NEW'), chunk('NEW')]);
    const runStore = new FakeIndexRunStore();
    const svc = new ReindexService({ indexBuilder: builder, chunkStore, vectorStore: new FakeVectorStore(), runStore, documents: existsAll });
    await svc.onContentRevised('DOC-1', 'document_edit');
    expect((await runStore.getLatestByDocument('DOC-1'))?.triggerType).toBe('document_edit');
  });
});

describe('F030 狀態切換輕量分支（AC3）', () => {
  it('TS-F030-005 切失效 → 僅更新 status metadata，不 rebuild，建立輕量 INDEX_RUN(status_change, chunk)', async () => {
    const chunkStore = new FakeChunkStore();
    await seedOld(chunkStore, 3);
    const builder = new FakeIndexBuilder(chunkStore, { status: 'success', newIndexRunId: 'X' });
    const runStore = new FakeIndexRunStore();
    const svc = new ReindexService({ indexBuilder: builder, chunkStore, vectorStore: new FakeVectorStore(), runStore, documents: existsAll });
    await svc.onStatusChanged('DOC-1', 'inactive');
    expect(builder.calls).toHaveLength(0); // 不重抽
    const run = await runStore.getLatestByDocument('DOC-1');
    expect(run).toMatchObject({ triggerType: 'status_change', stage: 'chunk' });
  });

  it('TS-F030-006 切作廢 → chunk 立即排除於有效查詢', async () => {
    const { svc, chunkStore } = makeService();
    await seedOld(chunkStore, 3);
    await svc.onStatusChanged('DOC-1', 'void');
    expect(await chunkStore.findActiveByDocumentId('DOC-1')).toHaveLength(0);
  });

  it('TS-F030-007 narrowing 同步：呼叫返回當下已反映新狀態', async () => {
    const { svc, chunkStore } = makeService();
    await seedOld(chunkStore, 3);
    await svc.onStatusChanged('DOC-1', 'inactive');
    // 返回後立即（非之後某非同步 job）查詢已生效
    expect(await chunkStore.findActiveByDocumentId('DOC-1')).toHaveLength(0);
  });

  it('TS-F030-008 跨庫：向量庫 payload 同步更新（upsertMetadataOnly）', async () => {
    const chunkStore = new FakeChunkStore();
    await seedOld(chunkStore, 2);
    const vectorStore = new FakeVectorStore();
    const spy = jest.spyOn(vectorStore, 'upsertMetadataOnly');
    const svc = new ReindexService({
      indexBuilder: new FakeIndexBuilder(chunkStore, { status: 'success', newIndexRunId: 'X' }),
      chunkStore, vectorStore, runStore: new FakeIndexRunStore(), documents: existsAll,
    });
    await svc.onStatusChanged('DOC-1', 'inactive');
    expect(spy).toHaveBeenCalledWith(expect.any(Array), { status: 'inactive' });
  });
});

describe('F030 狀態還原（widening，AC5）', () => {
  it('TS-F030-009 失效切回有效 → 重新納入有效檢索（不 rebuild）', async () => {
    const chunkStore = new FakeChunkStore();
    await seedOld(chunkStore, 3);
    await chunkStore.updateStatusMetadataOnly('DOC-1', 'inactive'); // 先置失效
    const builder = new FakeIndexBuilder(chunkStore, { status: 'success', newIndexRunId: 'X' });
    const svc = new ReindexService({ indexBuilder: builder, chunkStore, vectorStore: new FakeVectorStore(), runStore: new FakeIndexRunStore(), documents: existsAll });
    await svc.onStatusChanged('DOC-1', 'active');
    expect(await chunkStore.findActiveByDocumentId('DOC-1')).toHaveLength(3);
    expect(builder.calls).toHaveLength(0);
  });

  it('TS-F030-010 widening 僅斷言最終一致（不施加同步限制）', async () => {
    const { svc, chunkStore } = makeService();
    await seedOld(chunkStore, 2);
    await chunkStore.updateStatusMetadataOnly('DOC-1', 'inactive');
    await svc.onStatusChanged('DOC-1', 'active');
    // 呼叫完成後某可觀察時點已生效（此實作為同步，天然滿足）
    expect(await chunkStore.findActiveByDocumentId('DOC-1')).toHaveLength(2);
  });
});

describe('F030 重抽失敗保留舊版（AC4）', () => {
  it('TS-F030-011 抽取失敗（extract）→ 不 swap，保留舊版，INDEX_RUN failed/extract', async () => {
    const chunkStore = new FakeChunkStore();
    await seedOld(chunkStore, 3);
    const builder = new FakeIndexBuilder(chunkStore, { status: 'failed', newIndexRunId: 'NEW', errorStage: 'extract' });
    const runStore = new FakeIndexRunStore();
    const svc = new ReindexService({ indexBuilder: builder, chunkStore, vectorStore: new FakeVectorStore(), runStore, documents: existsAll });
    await svc.onContentRevised('DOC-1', 'xls_update');
    const active = await chunkStore.findActiveByDocumentId('DOC-1');
    expect(active).toHaveLength(3);
    expect(active.every((c) => c.indexRunId === 'OLD')).toBe(true);
    expect(await runStore.getLatestByDocument('DOC-1')).toMatchObject({ status: 'failed', stage: 'extract', errorStage: 'extract' });
  });

  it('TS-F030-012 索引建立失敗（embed）→ 保留舊版，stage=embed', async () => {
    const chunkStore = new FakeChunkStore();
    await seedOld(chunkStore, 3);
    const builder = new FakeIndexBuilder(chunkStore, { status: 'failed', newIndexRunId: 'NEW', errorStage: 'embed' });
    const runStore = new FakeIndexRunStore();
    const svc = new ReindexService({ indexBuilder: builder, chunkStore, vectorStore: new FakeVectorStore(), runStore, documents: existsAll });
    await svc.onContentRevised('DOC-1', 'document_edit');
    expect(await runStore.getLatestByDocument('DOC-1')).toMatchObject({ status: 'failed', stage: 'embed' });
    expect(await chunkStore.findActiveByDocumentId('DOC-1')).toHaveLength(3);
  });

  it('TS-F030-013 重抽失敗後不落入完全無索引（findActive.length>0）', async () => {
    const chunkStore = new FakeChunkStore();
    await seedOld(chunkStore, 3);
    const builder = new FakeIndexBuilder(chunkStore, { status: 'failed', newIndexRunId: 'NEW', errorStage: 'extract' });
    const svc = new ReindexService({ indexBuilder: builder, chunkStore, vectorStore: new FakeVectorStore(), runStore: new FakeIndexRunStore(), documents: existsAll });
    await svc.onContentRevised('DOC-1', 'xls_update');
    expect((await chunkStore.findActiveByDocumentId('DOC-1')).length).toBeGreaterThan(0);
  });

  it('TS-F030-014 保留舊版為過渡緩衝：重抽成功後舊版立即被取代（非永久保留）', async () => {
    const chunkStore = new FakeChunkStore();
    await seedOld(chunkStore, 3);
    // 第一次失敗
    const failBuilder = new FakeIndexBuilder(chunkStore, { status: 'failed', newIndexRunId: 'NEW', errorStage: 'extract' });
    const runStore = new FakeIndexRunStore();
    let svc = new ReindexService({ indexBuilder: failBuilder, chunkStore, vectorStore: new FakeVectorStore(), runStore, documents: existsAll });
    await svc.onContentRevised('DOC-1', 'xls_update');
    // 第二次手動重抽成功
    const okBuilder = new FakeIndexBuilder(chunkStore, { status: 'success', newIndexRunId: 'NEW2', chunkCount: 2 }, [chunk('NEW2'), chunk('NEW2')]);
    svc = new ReindexService({ indexBuilder: okBuilder, chunkStore, vectorStore: new FakeVectorStore(), runStore, documents: existsAll });
    await svc.onContentRevised('DOC-1', 'manual');
    const active = await chunkStore.findActiveByDocumentId('DOC-1');
    expect(active.every((c) => c.indexRunId === 'NEW2')).toBe(true);
    expect(active.some((c) => c.indexRunId === 'OLD')).toBe(false);
  });
});

describe('F030 首次改版無前版本', () => {
  it('TS-F030-015 從未成功索引，首次改版＝初建（同一介面，無特殊分支）', async () => {
    const chunkStore = new FakeChunkStore(); // 無舊版
    const newChunks = [chunk('NEW'), chunk('NEW')];
    const builder = new FakeIndexBuilder(chunkStore, { status: 'success', newIndexRunId: 'NEW', chunkCount: 2 }, newChunks);
    const svc = new ReindexService({ indexBuilder: builder, chunkStore, vectorStore: new FakeVectorStore(), runStore: new FakeIndexRunStore(), documents: existsAll });
    await svc.onContentRevised('DOC-1', 'xls_update');
    expect(builder.calls).toHaveLength(1);
    expect(await chunkStore.findActiveByDocumentId('DOC-1')).toHaveLength(2);
  });
});

describe('F030 觸發介面防呆與冪等', () => {
  it('TS-F030-016 未知文件 → 拋 REINDEX_DOCUMENT_NOT_FOUND，不建立孤兒 INDEX_RUN', async () => {
    const runStore = new FakeIndexRunStore();
    const svc = new ReindexService({
      indexBuilder: new FakeIndexBuilder(new FakeChunkStore(), { status: 'success', newIndexRunId: 'X' }),
      chunkStore: new FakeChunkStore(), vectorStore: new FakeVectorStore(), runStore,
      documents: { exists: () => Promise.resolve(false) },
    });
    await expect(svc.onContentRevised('UNKNOWN', 'xls_update')).rejects.toBeInstanceOf(ReindexError);
    expect(await runStore.listAll()).toHaveLength(0);
  });

  it('TS-F030-017 連續兩次內容改版皆完成（OQ-F030-03 序列化策略未定案，不斷言合併/拒絕）', async () => {
    const chunkStore = new FakeChunkStore();
    await seedOld(chunkStore, 3);
    const builder = new FakeIndexBuilder(chunkStore, { status: 'success', newIndexRunId: 'NEW', chunkCount: 1 }, [chunk('NEW')]);
    const svc = new ReindexService({ indexBuilder: builder, chunkStore, vectorStore: new FakeVectorStore(), runStore: new FakeIndexRunStore(), documents: existsAll });
    await expect(
      Promise.all([svc.onContentRevised('DOC-1', 'xls_update'), svc.onContentRevised('DOC-1', 'document_edit')]),
    ).resolves.toBeDefined();
  });

  it('TS-F030-018 onStatusChanged 收到相同狀態 → 冪等不報錯', async () => {
    const { svc, chunkStore } = makeService();
    await seedOld(chunkStore, 2); // 目前 active
    await expect(svc.onStatusChanged('DOC-1', 'active')).resolves.toBeUndefined();
    expect(await chunkStore.findActiveByDocumentId('DOC-1')).toHaveLength(2);
  });
});

describe('F030 對外埠 onDocumentChanged 映射（task 契約）', () => {
  it('CONTENT → onContentRevised（rebuild 被呼叫）', async () => {
    const chunkStore = new FakeChunkStore();
    await seedOld(chunkStore, 1);
    const builder = new FakeIndexBuilder(chunkStore, { status: 'success', newIndexRunId: 'NEW', chunkCount: 1 }, [chunk('NEW')]);
    const svc = new ReindexService({ indexBuilder: builder, chunkStore, vectorStore: new FakeVectorStore(), runStore: new FakeIndexRunStore(), documents: existsAll });
    await svc.onDocumentChanged({ documentId: 'DOC-1', changeType: 'CONTENT', occurredAt: new Date() });
    expect(builder.calls).toHaveLength(1);
  });

  it('STATUS → 讀當前狀態 → onStatusChanged（不 rebuild）', async () => {
    const chunkStore = new FakeChunkStore();
    await seedOld(chunkStore, 2);
    const builder = new FakeIndexBuilder(chunkStore, { status: 'success', newIndexRunId: 'X' });
    const statusReader = { getStatus: (): Promise<DocumentStatus | null> => Promise.resolve('inactive') };
    const svc = new ReindexService({ indexBuilder: builder, chunkStore, vectorStore: new FakeVectorStore(), runStore: new FakeIndexRunStore(), documents: existsAll, statusReader });
    await svc.onDocumentChanged({ documentId: 'DOC-1', changeType: 'STATUS', changedFields: ['status'], occurredAt: new Date() });
    expect(builder.calls).toHaveLength(0);
    expect(await chunkStore.findActiveByDocumentId('DOC-1')).toHaveLength(0); // 已置失效
  });

  it('META → TODO 記錄（DOC_USING_DEPT/F014 未接線），不 rebuild、不改 metadata', async () => {
    const chunkStore = new FakeChunkStore();
    await seedOld(chunkStore, 2);
    const builder = new FakeIndexBuilder(chunkStore, { status: 'success', newIndexRunId: 'X' });
    const logs: string[] = [];
    const svc = new ReindexService({ indexBuilder: builder, chunkStore, vectorStore: new FakeVectorStore(), runStore: new FakeIndexRunStore(), documents: existsAll, logger: { log: (m) => logs.push(m) } });
    await svc.onDocumentChanged({ documentId: 'DOC-1', changeType: 'META', changedFields: ['usingDeptIds'], occurredAt: new Date() });
    expect(builder.calls).toHaveLength(0);
    expect(logs.join('\n')).toContain('DOC_USING_DEPT');
    expect(await chunkStore.findActiveByDocumentId('DOC-1')).toHaveLength(2);
  });
});
