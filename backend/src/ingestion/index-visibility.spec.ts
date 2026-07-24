import {
  IndexVisibilityService,
  ManualReindexTrigger,
} from './index-visibility.service';
import { FakeChunkStore } from './chunk-store';
import { FakeIndexRunStore } from './index-run';
import { DocumentChunk } from './chunking.types';

/**
 * F031 管理端提取結果預覽與重新索引狀態 · 服務層單元測試（TS-F031-001～017）。
 * fake DOCUMENT_CHUNK/INDEX_RUN store；RBAC 於 controller spec 覆蓋（TS-018～022）。
 */

let seq = 0;
function chunk(over: Partial<DocumentChunk> = {}): DocumentChunk {
  seq += 1;
  return {
    id: `c${seq}`,
    documentId: 'DOC-1',
    indexRunId: 'RUN-1',
    content: `內容 ${seq}。`,
    chunkSeq: seq,
    documentNumber: 'ICSOP-SRC-101-1',
    lifecycleId: 'LC-01',
    chapterSection: '第1章第1節',
    usingDeptIds: ['DEPT-A', 'DEPT-B'],
    status: 'active',
    announcedDate: '2026-01-01',
    edition: "26'01",
    pageNumber: 1,
    createdAt: new Date(),
    ...over,
  };
}

const noopTrigger: ManualReindexTrigger = { trigger: () => Promise.resolve() };

function makeSvc(
  chunkStore = new FakeChunkStore(),
  runStore = new FakeIndexRunStore(),
  manualReindex: ManualReindexTrigger = noopTrigger,
) {
  return {
    svc: new IndexVisibilityService({ chunkStore, runStore, manualReindex }),
    chunkStore,
    runStore,
  };
}

describe('F031 chunk 預覽 + 8 項 metadata（AC1）', () => {
  it('TS-F031-001 已成功索引 → 完整 chunk 清單與 8 項 metadata', async () => {
    const chunkStore = new FakeChunkStore();
    await chunkStore.insertBatch([
      chunk({ id: 'c1', indexRunId: 'RUN-1', chunkSeq: 1 }),
      chunk({ id: 'c2', indexRunId: 'RUN-1', chunkSeq: 2 }),
      chunk({ id: 'c3', indexRunId: 'RUN-1', chunkSeq: 3 }),
    ]);
    const { svc } = makeSvc(chunkStore);
    const items = await svc.previewChunks('DOC-1');
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({
      documentNumber: 'ICSOP-SRC-101-1',
      lifecycleId: 'LC-01',
      chapterSection: '第1章第1節',
      usingDeptIds: ['DEPT-A', 'DEPT-B'],
      status: 'active',
      announcedDate: '2026-01-01',
      edition: "26'01",
      pageNumber: 1,
    });
    expect(items[0].content).toBeTruthy();
  });

  it('TS-F031-002 chunk 依 chunkSeq 遞增排序（非 store 原始序）', async () => {
    const chunkStore = new FakeChunkStore();
    await chunkStore.insertBatch([
      chunk({ id: 'c2', indexRunId: 'RUN-1', chunkSeq: 2 }),
      chunk({ id: 'c1', indexRunId: 'RUN-1', chunkSeq: 1 }),
      chunk({ id: 'c3', indexRunId: 'RUN-1', chunkSeq: 3 }),
    ]);
    const { svc } = makeSvc(chunkStore);
    const items = await svc.previewChunks('DOC-1');
    expect(items.map((i) => i.chunkSeq)).toEqual([1, 2, 3]);
  });

  it('G-ADM-034 chunk 預覽帶 chunkId + 循環名（lifecycleNames 解析；無 resolver→null）', async () => {
    const chunkStore = new FakeChunkStore();
    await chunkStore.insertBatch([chunk({ id: 'c9', indexRunId: 'RUN-1', chunkSeq: 1, lifecycleId: 'LC-01' })]);
    const svc = new IndexVisibilityService({
      chunkStore,
      runStore: new FakeIndexRunStore(),
      manualReindex: noopTrigger,
      lifecycleNames: (ids) => Promise.resolve(new Map(ids.map((id) => [id, '車貸循環']))),
    });
    const [item] = await svc.previewChunks('DOC-1');
    expect(item.chunkId).toBe('c9');
    expect(item.lifecycleName).toBe('車貸循環');

    // 無 resolver → lifecycleName null（chunkId 仍帶出）
    const { svc: bare } = makeSvc(chunkStore);
    const [b] = await bare.previewChunks('DOC-1');
    expect(b.chunkId).toBe('c9');
    expect(b.lifecycleName).toBeNull();
  });
});

describe('F031 doc-index 補強（G-ADM-028/030/031）', () => {
  it('G-ADM-030/031 失敗 → 錯誤碼落地並於單文件狀態 + 總覽列顯示', async () => {
    const runStore = new FakeIndexRunStore();
    const run = await runStore.create({ documentId: 'DOC-1', triggerType: 'xls_update', stage: 'chunk' });
    await runStore.markFailed(run.id, {
      stage: 'chunk',
      errorStage: 'chunk',
      errorMessage: '切 chunk 失敗',
      errorCode: 'CHUNKING_FAILED',
    });
    const { svc } = makeSvc(new FakeChunkStore(), runStore);
    const status = await svc.getIndexStatus('DOC-1');
    expect(status.errorCode).toBe('CHUNKING_FAILED');
    const overview = await svc.getOverview({});
    expect(overview.items[0].errorCode).toBe('CHUNKING_FAILED');
  });

  it('G-ADM-030 非失敗（成功/進行中）→ errorCode 恆 null', async () => {
    const runStore = new FakeIndexRunStore();
    const run = await runStore.create({ documentId: 'DOC-1', triggerType: 'xls_update', stage: 'extract' });
    await runStore.markSuccess(run.id, 2);
    const { svc } = makeSvc(new FakeChunkStore(), runStore);
    expect((await svc.getIndexStatus('DOC-1')).errorCode).toBeNull();
    expect((await svc.getOverview({})).items[0].errorCode).toBeNull();
  });

  it('G-ADM-028 notBuiltCount＝有文件但無任何 INDEX_RUN 者；not_built 篩選回合成列', async () => {
    const runStore = new FakeIndexRunStore();
    const r = await runStore.create({ documentId: 'DOC-built', triggerType: 'xls_update', stage: 'extract' });
    await runStore.markSuccess(r.id, 1);
    const svc = new IndexVisibilityService({
      chunkStore: new FakeChunkStore(),
      runStore,
      manualReindex: noopTrigger,
      documentIds: () => Promise.resolve(['DOC-built', 'DOC-new-1', 'DOC-new-2']),
    });
    const overview = await svc.getOverview({});
    expect(overview.notBuiltCount).toBe(2);
    expect(overview.successCount).toBe(1);
    const notBuilt = await svc.getOverview({ state: 'not_built' });
    expect(notBuilt.items.map((i) => i.documentId).sort()).toEqual(['DOC-new-1', 'DOC-new-2']);
    expect(notBuilt.items.every((i) => i.state === 'not_built')).toBe(true);
  });

  it('G-ADM-028 無 documentIds 來源（graceful）→ notBuiltCount 0、無 not_built 列', async () => {
    const runStore = new FakeIndexRunStore();
    const r = await runStore.create({ documentId: 'DOC-1', triggerType: 'xls_update', stage: 'extract' });
    await runStore.markSuccess(r.id, 1);
    const { svc } = makeSvc(new FakeChunkStore(), runStore);
    const overview = await svc.getOverview({});
    expect(overview.notBuiltCount).toBe(0);
    expect(overview.items).toHaveLength(1);
  });
});

describe('F031 三態顯示（AC2/AC3）', () => {
  it('TS-F031-004 進行中 → running，無最後索引時間', async () => {
    const runStore = new FakeIndexRunStore();
    await runStore.create({ documentId: 'DOC-1', triggerType: 'xls_update', stage: 'extract' });
    const { svc } = makeSvc(new FakeChunkStore(), runStore);
    const view = await svc.getIndexStatus('DOC-1');
    expect(view.state).toBe('running');
    expect(view.lastIndexedAt).toBeNull();
  });

  it('TS-F031-005 成功 → success，含最後索引時間（endedAt）', async () => {
    const runStore = new FakeIndexRunStore(() => new Date('2026-07-20T10:00:00Z'));
    const run = await runStore.create({ documentId: 'DOC-1', triggerType: 'xls_update', stage: 'extract' });
    await runStore.markSuccess(run.id, 3);
    const { svc } = makeSvc(new FakeChunkStore(), runStore);
    const view = await svc.getIndexStatus('DOC-1');
    expect(view.state).toBe('success');
    expect(view.lastIndexedAt).toBe('2026-07-20T10:00:00.000Z');
  });

  it('TS-F031-006 失敗 → failed，含失敗原因摘要', async () => {
    const runStore = new FakeIndexRunStore();
    const run = await runStore.create({ documentId: 'DOC-1', triggerType: 'xls_update', stage: 'extract' });
    await runStore.markFailed(run.id, { stage: 'extract', errorStage: 'extract', errorMessage: '作業流程無可辨識章節結構' });
    const { svc } = makeSvc(new FakeChunkStore(), runStore);
    const view = await svc.getIndexStatus('DOC-1');
    expect(view.state).toBe('failed');
    expect(view.errorMessage).toContain('作業流程');
  });

  it('TS-F031-007 失敗詳情 → 具體失敗階段 embed + 完整訊息', async () => {
    const runStore = new FakeIndexRunStore();
    const run = await runStore.create({ documentId: 'DOC-1', triggerType: 'xls_update', stage: 'embed' });
    await runStore.markFailed(run.id, { stage: 'embed', errorStage: 'embed', errorMessage: 'embedding 服務逾時' });
    const { svc } = makeSvc(new FakeChunkStore(), runStore);
    const view = await svc.getIndexStatus('DOC-1');
    expect(view.errorStage).toBe('embed');
    expect(view.stageLabel).toBe('向量化失敗');
    expect(view.errorMessage).toBe('embedding 服務逾時');
  });

  it('TS-F031-008 三種失敗階段各自對應正確中文字樣', async () => {
    const cases: { stage: 'extract' | 'chunk' | 'embed'; label: string }[] = [
      { stage: 'extract', label: '抽取失敗' },
      { stage: 'chunk', label: '切 chunk 失敗' },
      { stage: 'embed', label: '向量化失敗' },
    ];
    for (const c of cases) {
      const runStore = new FakeIndexRunStore();
      const run = await runStore.create({ documentId: 'DOC-X', triggerType: 'xls_update', stage: c.stage });
      await runStore.markFailed(run.id, { stage: c.stage, errorStage: c.stage, errorMessage: 'e' });
      const { svc } = makeSvc(new FakeChunkStore(), runStore);
      const view = await svc.getIndexStatus('DOC-X');
      expect(view.stageLabel).toBe(c.label);
    }
  });
});

describe('F031 手動重新索引（AC3 後段/AC4）', () => {
  it('TS-F031-009 手動觸發 → ManualReindexTrigger.trigger 被呼叫一次', async () => {
    const trigger: ManualReindexTrigger = { trigger: jest.fn().mockResolvedValue(undefined) };
    const { svc } = makeSvc(new FakeChunkStore(), new FakeIndexRunStore(), trigger);
    await svc.manualReindex('DOC-1');
    expect(trigger.trigger).toHaveBeenCalledWith('DOC-1');
    expect(trigger.trigger).toHaveBeenCalledTimes(1);
  });

  it('TS-F031-011 對「成功」文件亦可手動重索引（非僅限失敗）', async () => {
    const runStore = new FakeIndexRunStore();
    const run = await runStore.create({ documentId: 'DOC-1', triggerType: 'xls_update', stage: 'extract' });
    await runStore.markSuccess(run.id, 3);
    const trigger: ManualReindexTrigger = { trigger: jest.fn().mockResolvedValue(undefined) };
    const { svc } = makeSvc(new FakeChunkStore(), runStore, trigger);
    await expect(svc.manualReindex('DOC-1')).resolves.toBeUndefined();
    expect(trigger.trigger).toHaveBeenCalled();
  });
});

describe('F031 總覽頁（AC4）', () => {
  async function seedOverview() {
    const runStore = new FakeIndexRunStore();
    const mk = async (doc: string, kind: 'success' | 'failed' | 'running') => {
      const run = await runStore.create({ documentId: doc, triggerType: 'xls_update', stage: 'extract' });
      if (kind === 'success') await runStore.markSuccess(run.id, 3);
      else if (kind === 'failed') await runStore.markFailed(run.id, { stage: 'embed', errorStage: 'embed', errorMessage: 'x' });
    };
    for (let i = 0; i < 6; i++) await mk(`S${i}`, 'success');
    for (let i = 0; i < 3; i++) await mk(`F${i}`, 'failed');
    await mk('R0', 'running');
    return runStore;
  }

  it('TS-F031-013 跨文件彙總計數（成功 6/失敗 3/進行中 1）', async () => {
    const { svc } = makeSvc(new FakeChunkStore(), await seedOverview());
    const res = await svc.getOverview();
    expect(res.successCount).toBe(6);
    expect(res.failedCount).toBe(3);
    expect(res.runningCount).toBe(1);
  });

  it('TS-F031-014 篩選僅顯示失敗項目', async () => {
    const { svc } = makeSvc(new FakeChunkStore(), await seedOverview());
    const res = await svc.getOverview({ state: 'failed' });
    expect(res.items).toHaveLength(3);
    expect(res.items.every((r) => r.state === 'failed')).toBe(true);
  });

  it('TS-F031-015 大量文件 → 分頁（pageSize 50），彙總計數為全量', async () => {
    const runStore = new FakeIndexRunStore();
    for (let i = 0; i < 600; i++) {
      const run = await runStore.create({ documentId: `D${i}`, triggerType: 'xls_update', stage: 'extract' });
      await runStore.markSuccess(run.id, 1);
    }
    const { svc } = makeSvc(new FakeChunkStore(), runStore);
    const res = await svc.getOverview();
    expect(res.pageSize).toBe(50);
    expect(res.items).toHaveLength(50); // 不逐筆全載
    expect(res.successCount).toBe(600); // 全量計算
    expect(res.total).toBe(600);
  });
});

describe('F031 尚未建立索引（AC5，區別於「失敗」）', () => {
  it('TS-F031-016 從無 INDEX_RUN → not_built（非 failed）', async () => {
    const { svc } = makeSvc(new FakeChunkStore(), new FakeIndexRunStore());
    const view = await svc.getIndexStatus('DOC-NONE');
    expect(view.state).toBe('not_built');
    expect(view.state).not.toBe('failed');
  });

  it('TS-F031-017 已上傳但管線尚未認領（無 INDEX_RUN）→ 同樣 not_built', async () => {
    // 純依「有無 INDEX_RUN 記錄」判定（OQ-F031-03：不區分「從未上傳」與「已上傳未認領」）。
    const { svc } = makeSvc(new FakeChunkStore(), new FakeIndexRunStore());
    expect((await svc.getIndexStatus('DOC-JUST-UPLOADED')).state).toBe('not_built');
  });
});
