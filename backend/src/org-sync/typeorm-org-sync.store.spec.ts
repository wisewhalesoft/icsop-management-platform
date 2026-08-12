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
 * F041 AC-34（F003 delta AC-U4）：F004 組織同步 upsert 之 insert/update payload 不得含 `userSubtype` 鍵
 * ——該欄非上游來源欄位（VW_HPMUSER 12 欄白名單不含），只要 applySync() 建構 payload 之物件字面量
 * 不主動新增一行 `userSubtype: a.userSubtype`，此鍵就不會出現，即使輸入之 accountCreates/accountUpdates
 * 物件意外夾帶該鍵（模擬呼叫端誤傳）。權威：docs/specs/architecture-spec.md §4.10。
 *
 * ⚠ 本測試在現行（F041 尚未實作）程式碼下即為綠燈（regression guard，非 RED 約束）——現行 applySync
 * 根本不認識 userSubtype 這個欄位，天然不會複製它；其綠燈本身即驗證「不主動新增此鍵」之現況是安全的，
 * 供未來任何人「順手」在 insert/update 物件字面量新增 userSubtype 一行時，充當回歸防線。
 */
describe('TypeOrmOrgSyncStore.applySync — F041 AC-34：userSubtype 不受組織同步 upsert 覆寫', () => {
  it('accountCreates／accountUpdates 縱使夾帶 userSubtype 鍵，insert/update payload 皆不得含該鍵', async () => {
    const insertCalls: Array<{ entity: unknown; batch: Array<Record<string, unknown>> }> = [];
    const updateCalls: unknown[][] = [];
    const fakeManager = {
      insert: (entity: unknown, batch: Array<Record<string, unknown>>) => {
        insertCalls.push({ entity, batch });
        return Promise.resolve();
      },
      update: (...args: unknown[]) => {
        updateCalls.push(args);
        return Promise.resolve();
      },
    };
    const fakeDs = {
      isInitialized: true,
      transaction: (cb: (m: typeof fakeManager) => Promise<void>) => cb(fakeManager),
    } as unknown as DataSource;

    const store = new TypeOrmOrgSyncStore(fakeDs);

    const plan = {
      orgCreates: [],
      orgUpdates: [],
      accountCreates: [
        {
          companyCode: 'AS',
          loginId: 'zzint-u1',
          employeeNo: '1',
          name: 'n1',
          email: 'u1@x',
          orgCode: 'X0',
          managerEmpNo: null,
          resignDate: null,
          hireDate: null,
          upstreamModifiedAt: null,
          userSubtype: 'business', // 模擬誤傳：非上游來源欄位，理應被忽略
        },
      ],
      accountUpdates: [
        {
          id: 'acc-1',
          employeeNo: '1',
          name: 'n1改',
          orgCode: 'X1',
          managerEmpNo: null,
          resignDate: null,
          hireDate: null,
          upstreamModifiedAt: null,
          userSubtype: 'business', // 同上：模擬誤傳
        },
      ],
      accountDisables: [],
    } as unknown as SyncPlan;

    await store.applySync('AS', plan);

    expect(insertCalls.length).toBeGreaterThan(0);
    for (const { batch } of insertCalls) {
      for (const row of batch) {
        expect(Object.keys(row)).not.toContain('userSubtype');
      }
    }
    expect(updateCalls.length).toBeGreaterThan(0);
    for (const args of updateCalls) {
      // manager.update(target, criteria, partialEntity) — partialEntity 為最後一個參數
      const partial = args[args.length - 1] as Record<string, unknown>;
      expect(Object.keys(partial)).not.toContain('userSubtype');
    }
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

/**
 * F006 D7：SYNC_RUN 新增帳號異動細分三欄（KPI「新增人員／更新／離職停用」之來源）。
 * 既有 changeCount 為組織＋帳號之混合總數，無法還原三張卡。
 */
describe('TypeOrmOrgSyncStore.finishSyncRun — 帳號異動細分落地', () => {
  function makeStore(): {
    store: TypeOrmOrgSyncStore;
    updates: () => Array<Record<string, unknown>>;
  } {
    const updates: Array<Record<string, unknown>> = [];
    const fakeRepo = {
      update: (_where: unknown, patch: Record<string, unknown>) => {
        updates.push(patch);
        return Promise.resolve();
      },
    };
    const fakeDs = {
      isInitialized: true,
      getRepository: () => fakeRepo,
    } as unknown as DataSource;
    return { store: new TypeOrmOrgSyncStore(fakeDs), updates: () => updates };
  }

  it('帶入三欄時一併寫入 SYNC_RUN', async () => {
    const { store, updates } = makeStore();
    await store.finishSyncRun('run-1', {
      status: 'success',
      changeCount: 9,
      endedAt: new Date('2026-07-21T02:03:00Z'),
      accountsCreated: 3,
      accountsUpdated: 5,
      accountsDisabled: 1,
    });
    expect(updates()[0]).toMatchObject({
      accountsCreated: 3,
      accountsUpdated: 5,
      accountsDisabled: 1,
    });
  });

  it('未帶三欄（失敗收尾）→ 以 0 落地，避免 KPI 讀到 NULL', async () => {
    const { store, updates } = makeStore();
    await store.finishSyncRun('run-2', {
      status: 'failed',
      changeCount: 0,
      endedAt: new Date('2026-07-21T02:03:00Z'),
      errorCode: 'SYNC_SOURCE_UNAVAILABLE',
    });
    expect(updates()[0]).toMatchObject({
      accountsCreated: 0,
      accountsUpdated: 0,
      accountsDisabled: 0,
    });
  });
});
