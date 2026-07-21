import { DataSource } from 'typeorm';
import { TypeOrmOrgSyncStore } from './typeorm-org-sync.store';
import { SyncPlan } from './org-sync.types';
import { MSSQL_MAX_PARAMS } from './param-batching';

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
