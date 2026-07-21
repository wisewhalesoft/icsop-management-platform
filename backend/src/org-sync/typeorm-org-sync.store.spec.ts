import { DataSource } from 'typeorm';
import { TypeOrmOrgSyncStore } from './typeorm-org-sync.store';
import { SyncPlan } from './org-sync.types';
import { MSSQL_MAX_PARAMS } from './param-batching';
import { SyncRun } from '../database/entities/sync-run.entity';

/**
 * 回歸測試（2026-07-21 實跑 bug）：applySync 之任何 INSERT 批次，其
 * (列數 × 欄位數) 不得超過 MSSQL 單一陳述式 2100 參數上限。
 * 原 bug：帳號 insert 物件實為 14 欄卻硬編 13 → 每批 153×14=2142 > 2100。
 * 以 fake manager 攔截 insert 批次、對真實 store 程式碼驗證不變式。
 */
describe('TypeOrmOrgSyncStore.applySync — INSERT 批次參數上限', () => {
  it('org(500)＋account(3000) 全量新建時，每批 列數×欄位數 ≤ 2100', async () => {
    const inserts: Array<{ count: number; cols: number }> = [];
    const fakeManager = {
      insert: (_e: unknown, batch: Array<Record<string, unknown>>) => {
        inserts.push({ count: batch.length, cols: Object.keys(batch[0]).length });
        return Promise.resolve();
      },
      update: () => Promise.resolve(),
    };
    const fakeDs = {
      isInitialized: true,
      transaction: (cb: (m: typeof fakeManager) => Promise<void>) => cb(fakeManager),
    } as unknown as DataSource;

    const store = new TypeOrmOrgSyncStore(fakeDs);

    const plan = {
      orgCreates: Array.from({ length: 500 }, (_, i) => ({
        companyCode: 'AS',
        orgCode: `X${i}`,
        codePrefix: `X${i}`,
        parentCode: null,
        tier: 'SECTION',
        name: `unit${i}`,
        managerEmpNo: null,
        isActive: true,
      })),
      orgUpdates: [],
      accountCreates: Array.from({ length: 3000 }, (_, i) => ({
        companyCode: 'AS',
        loginId: `u${i}`,
        employeeNo: `${i}`,
        name: `n${i}`,
        email: `u${i}@x`,
        orgCode: 'X0',
        managerEmpNo: null,
        resignDate: null,
        hireDate: null,
        upstreamModifiedAt: null,
      })),
      accountUpdates: [],
      accountDisables: [],
    } as unknown as SyncPlan;

    await store.applySync('AS', plan);

    expect(inserts.length).toBeGreaterThan(1); // 確有切批
    for (const ins of inserts) {
      expect(ins.count * ins.cols).toBeLessThanOrEqual(MSSQL_MAX_PARAMS);
    }
    const totalRows = inserts.reduce((s, x) => s + x.count, 0);
    expect(totalRows).toBe(3500); // org 500 + account 3000 兩路徑皆覆蓋
  });
});

/**
 * US-011 同步紀錄查詢：listRecentRuns 須以 startedAt 由新到舊、取 limit 筆下推 repo，
 * 並將 SYNC_RUN 實體投影為 SyncRunSummary（僅 8 個對外欄位；watermark/triggeredBy 不外洩）。
 */
describe('TypeOrmOrgSyncStore.listRecentRuns', () => {
  function makeStore(rows: Partial<SyncRun>[]): {
    store: TypeOrmOrgSyncStore;
    findArgs: () => Record<string, unknown>;
    findEntity: () => unknown;
  } {
    let capturedArgs: Record<string, unknown> = {};
    let capturedEntity: unknown;
    const fakeRepo = {
      find: (opts: Record<string, unknown>) => {
        capturedArgs = opts;
        return Promise.resolve(rows);
      },
    };
    const fakeDs = {
      isInitialized: true,
      getRepository: (entity: unknown) => {
        capturedEntity = entity;
        return fakeRepo;
      },
    } as unknown as DataSource;
    return {
      store: new TypeOrmOrgSyncStore(fakeDs),
      findArgs: () => capturedArgs,
      findEntity: () => capturedEntity,
    };
  }

  it('以 startedAt DESC + take=limit 查詢 SYNC_RUN', async () => {
    const { store, findArgs, findEntity } = makeStore([]);
    await store.listRecentRuns(20);
    expect(findEntity()).toBe(SyncRun);
    expect(findArgs()).toEqual({ order: { startedAt: 'DESC' }, take: 20 });
  });

  it('limit 忠實下推（不於 store 層裁切）', async () => {
    const { store, findArgs } = makeStore([]);
    await store.listRecentRuns(7);
    expect(findArgs()).toEqual({ order: { startedAt: 'DESC' }, take: 7 });
  });

  it('投影為 SyncRunSummary（8 欄；不含 watermark/triggeredBy）', async () => {
    const started = new Date('2026-07-21T02:00:00Z');
    const ended = new Date('2026-07-21T02:03:00Z');
    const { store } = makeStore([
      {
        id: 'run-9',
        triggerType: 'scheduled',
        status: 'success',
        startedAt: started,
        endedAt: ended,
        changeCount: 12,
        errorCode: null,
        errorMessage: null,
        watermark: new Date('2026-07-20T00:00:00Z'),
        triggeredBy: 'sysadmin1',
      },
    ]);
    const [summary] = await store.listRecentRuns(20);
    expect(summary).toEqual({
      id: 'run-9',
      triggerType: 'scheduled',
      status: 'success',
      startedAt: started,
      endedAt: ended,
      changeCount: 12,
      errorCode: null,
      errorMessage: null,
    });
    // 敏感/內部欄位不得外洩
    expect(summary).not.toHaveProperty('watermark');
    expect(summary).not.toHaveProperty('triggeredBy');
  });

  it('保留 failed 之 errorCode/errorMessage（前端據以區分「已中止」與一般失敗）', async () => {
    const { store } = makeStore([
      {
        id: 'run-8',
        triggerType: 'manual',
        status: 'failed',
        startedAt: new Date('2026-07-20T10:00:00Z'),
        endedAt: new Date('2026-07-20T10:00:05Z'),
        changeCount: 0,
        errorCode: 'DISAPPEARED_RATIO_EXCEEDED',
        errorMessage: '在職帳號消失 60/1000（6.0%）超過閾值 5.0%，已中止同步、未執行任何停用。',
      },
    ]);
    const [summary] = await store.listRecentRuns(20);
    expect(summary.errorCode).toBe('DISAPPEARED_RATIO_EXCEEDED');
    expect(summary.status).toBe('failed');
  });
});
