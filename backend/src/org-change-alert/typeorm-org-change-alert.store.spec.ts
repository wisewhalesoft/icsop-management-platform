import { DataSource } from 'typeorm';
import { TypeOrmOrgChangeAlertStore } from './typeorm-org-change-alert.store';
import { FieldKey } from '../rbac/field-matrix';

/**
 * 生產 store 之查詢契約（以 fake DataSource 攔截；真實 DB 行為見 test/int/org-change-alert.itest.ts）。
 * 聚焦兩個易錯點：
 *  1) KPI 加總對 migration 前之歷史列（三欄為 NULL）須視為 0，不得整筆變 NULL。
 *  2) 「當責待確認」計數之窄口徑＝僅當責室長-主要/次要（D7／OQ-F006-04）。
 */
describe('TypeOrmOrgChangeAlertStore — 查詢契約', () => {
  function fakeDs(raw: Record<string, unknown> | undefined, count = 0): {
    ds: DataSource;
    calls: () => Array<{ sql?: string; params?: unknown[]; where?: unknown }>;
  } {
    const calls: Array<{ sql?: string; params?: unknown[]; where?: unknown }> = [];
    const ds = {
      isInitialized: true,
      query: (sql: string, params?: unknown[]) => {
        calls.push({ sql, params });
        return Promise.resolve(raw ? [raw] : []);
      },
      getRepository: () => ({
        countBy: (where: unknown) => {
          calls.push({ where });
          return Promise.resolve(count);
        },
        count: (opts: unknown) => {
          calls.push({ where: opts });
          return Promise.resolve(count);
        },
      }),
    } as unknown as DataSource;
    return { ds, calls: () => calls };
  }

  it('monthlyAccountStats：以 COALESCE 將 NULL 視為 0，並下推 [from, to) 範圍', async () => {
    const { ds, calls } = fakeDs({ created: 8, updated: 31, disabled: 4 });
    const store = new TypeOrmOrgChangeAlertStore(ds);
    const from = new Date('2026-06-30T16:00:00.000Z');
    const to = new Date('2026-07-31T16:00:00.000Z');

    const res = await store.monthlyAccountStats(from, to);

    expect(res).toEqual({ created: 8, updated: 31, disabled: 4 });
    const sql = calls()[0].sql ?? '';
    expect(sql).toContain('COALESCE');
    expect(sql).toContain('SYNC_RUN');
    expect(sql).toContain('startedAt');
    expect(calls()[0].params).toEqual([from, to]);
  });

  it('monthlyAccountStats：查無任何本月 SYNC_RUN → 全 0（非 NaN/NULL）', async () => {
    const { ds } = fakeDs(undefined);
    const store = new TypeOrmOrgChangeAlertStore(ds);

    const res = await store.monthlyAccountStats(new Date(), new Date());

    expect(res).toEqual({ created: 0, updated: 0, disabled: 0 });
  });

  it('monthlyAccountStats：驅動程式回傳字串數字 → 轉為數字', async () => {
    const { ds } = fakeDs({ created: '8', updated: '31', disabled: null });
    const store = new TypeOrmOrgChangeAlertStore(ds);

    const res = await store.monthlyAccountStats(new Date(), new Date());

    expect(res).toEqual({ created: 8, updated: 31, disabled: 0 });
  });

  it('pendingChiefAlertCount：僅計 pending 之當責室長-主要/次要', async () => {
    const { ds, calls } = fakeDs(undefined, 2);
    const store = new TypeOrmOrgChangeAlertStore(ds);

    const n = await store.pendingChiefAlertCount();

    expect(n).toBe(2);
    const where = JSON.stringify(calls()[0].where);
    expect(where).toContain(FieldKey.CHIEF_PRIMARY);
    expect(where).toContain(FieldKey.CHIEF_SECONDARY);
    expect(where).toContain('pending');
    expect(where).not.toContain(FieldKey.ESTABLISH_DEPT);
  });

  it('結構上不提供任何提示刪除/整列覆寫路徑（僅 insert 與 resolve 之狀態轉移）', () => {
    const proto = TypeOrmOrgChangeAlertStore.prototype as unknown as Record<string, unknown>;
    for (const forbidden of ['delete', 'remove', 'save', 'upsert', 'clear']) {
      expect(proto[forbidden]).toBeUndefined();
    }
  });
});
