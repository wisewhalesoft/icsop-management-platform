import {
  DEFAULT_PAGE_SIZE,
  likeContains,
  localDayEndExclusive,
  localDayStart,
  resolveAuditQuery,
  resolveAuditQuerySpec,
} from './access-history-filter';
import { AuditWriterService } from './audit-writer.service';
import {
  AuditOutboxRecord,
  AuditOutboxStore,
  AuditQueryFilters,
  AuditQueryScope,
  AuditRow,
  AuditStore,
  Page,
} from './audit.types';

/**
 * OQ-AQ-01 之 WHERE 下推重構單元覆蓋：
 *  - resolveAuditQuerySpec（純函式，將 filters 正規化為下推查詢規格：kind→targetType、
 *    近 30 天預設、分頁預設、appliedDefaultRange）——SQL 下推（TypeOrmAuditStore.queryPage）
 *    與記憶體版（resolveAuditQuery）共用此正規化，確保兩路徑結果一致。
 *  - likeContains / localDayStart / localDayEndExclusive：SQL WHERE 之 LIKE 轉義與本地日界計算
 *    （純函式；SQL 產生本身之正確性由 access-history.itest.ts 對真實 MSSQL 驗證）。
 *  - AuditWriterService.queryHistory 委派 store.queryPage（下推路徑，非全表載回）。
 */

const SCOPE: AuditQueryScope = { company: 'ALL' };

describe('resolveAuditQuerySpec — filters 正規化（下推規格）', () => {
  it('空條件 → appliedDefaultRange=true、from 為近 30 天前、targetTypes=null、預設分頁', () => {
    const now = new Date('2026-07-23T10:00:00');
    const spec = resolveAuditQuerySpec({}, now);
    expect(spec.appliedDefaultRange).toBe(true);
    expect(spec.from).toBe('2026-06-23'); // now - 30 天（本地日）
    expect(spec.to).toBeUndefined();
    expect(spec.targetTypes).toBeNull();
    expect(spec.page).toBe(1);
    expect(spec.pageSize).toBe(DEFAULT_PAGE_SIZE);
  });

  it('kind=循環 → targetTypes=[LIFECYCLE]，非空條件不套預設', () => {
    const spec = resolveAuditQuerySpec({ kind: '循環' });
    expect(spec.targetTypes).toEqual(['LIFECYCLE']);
    expect(spec.appliedDefaultRange).toBe(false);
    expect(spec.from).toBeUndefined();
  });

  /**
   * 🔴 2026-09-02 F043 決策 E3（收斂修正，比照 access-history-filter.spec.ts 同日處置）：
   * 「變更」kind 之 targetTypes 由 2 值擴為 3 值（additive 併入 BUSINESS_CATEGORY_CHANGE_LOG）——
   * `resolveAuditQuerySpec` 與 `resolveAuditQuery`／`kindToTargetTypes` 共用同一正規化規則，
   * 兩檔須同步收斂，否則 SQL 下推路徑與記憶體路徑對「變更」kind 之查詢結果會不一致。
   */
  it('kind=變更 → targetTypes=三種 CHANGE_LOG（F043 起，additive 併入 BUSINESS_CATEGORY_CHANGE_LOG）', () => {
    expect(resolveAuditQuerySpec({ kind: '變更' }).targetTypes).toEqual([
      'DOCUMENT_CHANGE_LOG',
      'LIFECYCLE_CHANGE_LOG',
      'BUSINESS_CATEGORY_CHANGE_LOG',
    ]);
  });

  it('person/target 去空白＋轉小寫；page/pageSize 帶入', () => {
    const spec = resolveAuditQuerySpec({
      person: '  Wang ',
      target: '  ICSOP-A ',
      page: 3,
      pageSize: 20,
    });
    expect(spec.person).toBe('wang');
    expect(spec.target).toBe('icsop-a');
    expect(spec.page).toBe(3);
    expect(spec.pageSize).toBe(20);
    expect(spec.appliedDefaultRange).toBe(false);
  });

  it('page/pageSize ≤ 0 或缺 → 回退預設（page=1、pageSize=50）', () => {
    const spec = resolveAuditQuerySpec({ kind: '文件', page: 0, pageSize: -5 });
    expect(spec.page).toBe(1);
    expect(spec.pageSize).toBe(DEFAULT_PAGE_SIZE);
  });
});

describe('likeContains — LIKE 子字串轉義（ESCAPE \\）', () => {
  it('一般字串 → 前後 % 包夾', () => {
    expect(likeContains('abc')).toBe('%abc%');
  });
  it('轉義 LIKE 萬用字元 %、_、[ 與轉義字元本身 \\', () => {
    expect(likeContains('a%b_c[d')).toBe('%a\\%b\\_c\\[d%');
    expect(likeContains('a\\b')).toBe('%a\\\\b%');
  });
});

describe('localDayStart / localDayEndExclusive — 本地日界（對齊記憶體版 ymd 語意）', () => {
  it('localDayStart 回當日本地 00:00:00', () => {
    expect(localDayStart('2026-07-16').getTime()).toBe(
      new Date(2026, 6, 16, 0, 0, 0, 0).getTime(),
    );
  });
  it('localDayEndExclusive 回隔日本地 00:00:00（含當日整天之上界，排他）', () => {
    expect(localDayEndExclusive('2026-07-16').getTime()).toBe(
      new Date(2026, 6, 17, 0, 0, 0, 0).getTime(),
    );
  });
  it('跨月/跨年進位（12-31 → 次年 01-01）', () => {
    expect(localDayEndExclusive('2026-12-31').getTime()).toBe(
      new Date(2027, 0, 1, 0, 0, 0, 0).getTime(),
    );
  });
});

// ---- queryHistory 委派 store.queryPage（下推路徑）----

class NoopOutbox implements AuditOutboxStore {
  enqueue(): Promise<void> {
    return Promise.resolve();
  }
  listPending(): Promise<AuditOutboxRecord[]> {
    return Promise.resolve([]);
  }
  markDone(): Promise<void> {
    return Promise.resolve();
  }
}

/** 假 store：queryPage 為主測目標（回 sentinel），其餘方法為佔位。 */
class QueryPageSpyStore implements AuditStore {
  queryPageArgs: { scope: AuditQueryScope; filters: AuditQueryFilters } | null = null;
  sentinel: Page<AuditRow> = {
    items: [],
    total: 7,
    page: 2,
    pageSize: 50,
    hasNext: false,
    appliedDefaultRange: false,
  };
  append(): Promise<void> {
    return Promise.resolve();
  }
  findById(): Promise<AuditRow | null> {
    return Promise.resolve(null);
  }
  listAll(): Promise<AuditRow[]> {
    // 若被呼叫即代表回退全表載回——本測試斷言「不」走此路徑。
    throw new Error('listAll 不應被 queryHistory 呼叫（應下推 queryPage）');
  }
  queryPage(scope: AuditQueryScope, filters: AuditQueryFilters): Promise<Page<AuditRow>> {
    this.queryPageArgs = { scope, filters };
    return Promise.resolve(this.sentinel);
  }
}

describe('AuditWriterService.queryHistory 委派 store.queryPage（WHERE 下推，非全表載回）', () => {
  it('以 (scope, filters) 呼叫 queryPage 並原樣回傳其分頁結果，且不呼叫 listAll', async () => {
    const store = new QueryPageSpyStore();
    const writer = new AuditWriterService(new NoopOutbox(), store);
    const filters: AuditQueryFilters = { kind: '文件', person: '王小明', page: 2 };

    const page = await writer.queryHistory(SCOPE, filters);

    expect(store.queryPageArgs).toEqual({ scope: SCOPE, filters });
    expect(page).toBe(store.sentinel);
  });

  it('與 resolveAuditQuery（記憶體版）共用正規化 → 兩路徑同 filters 產生一致的分頁 meta', () => {
    // 記憶體版對相同 filters 之 spec 與下推規格同源（resolveAuditQuerySpec），故 page/pageSize/
    // appliedDefaultRange 對齊；此處僅以純函式佐證同源，不重測 SQL（見 itest）。
    const now = new Date('2026-07-23T10:00:00');
    const filters: AuditQueryFilters = { page: 2, pageSize: 10 };
    const spec = resolveAuditQuerySpec(filters, now);
    const mem = resolveAuditQuery([], filters, SCOPE, now);
    expect(mem.page).toBe(spec.page);
    expect(mem.pageSize).toBe(spec.pageSize);
    expect(mem.appliedDefaultRange).toBe(spec.appliedDefaultRange);
  });
});
