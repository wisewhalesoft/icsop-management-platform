/**
 * F043 業務/功能類別管理 — BusinessCategoryChangeHistoryService（§戊 結構變更歷程，第三個 tab 之查詢）
 *
 * 權威：docs/specs/features/F043-business-function-category.md AC-38～AC-40
 *      ＋ docs/specs/architecture-spec.md §14.1（落地檔案清單：
 *        business-category-change-log-publisher.ts／business-category-change-history.service.ts，
 *        比照既有 lifecycle-change-log-publisher.ts／lifecycle-change-history.service.ts）。
 * 僅讀取既有 lifecycle-change-history.service.spec.ts 以沿用其 FakeStore／event() 慣例，
 * 非決定本功能行為（各欄期望值取自 F043 AC，非取自循環側實作）。
 *
 * ⚠ 對實作全盲：本檔涉及之全部業務類別新模組於本環撰寫時尚不存在。
 */
import { AuditAccessEvent, AuditWriter } from '../audit/audit.types';
import { AuditWriterService } from '../audit/audit-writer.service';
import {
  buildBusinessCategoryChangeLogRow,
  BusinessCategoryChangeLogPublisher,
} from './business-category-change-log-publisher';
import { BusinessCategoryChangeHistoryService } from './business-category-change-history.service';
import {
  BusinessCategoryChangeLogRow,
  BusinessCategoryChangeLogStore,
} from './business-category-change-log.store';
import { BusinessCategoryChangedEvent } from '../business-categories/business-category-change-event';

class FakeStore implements BusinessCategoryChangeLogStore {
  rows: BusinessCategoryChangeLogRow[] = [];
  async append(row: BusinessCategoryChangeLogRow): Promise<void> {
    this.rows.push(row);
  }
  async listAll(): Promise<BusinessCategoryChangeLogRow[]> {
    return this.rows;
  }
  async listByBusinessCategory(id: string): Promise<BusinessCategoryChangeLogRow[]> {
    return this.rows.filter((r) => r.businessCategoryId === id);
  }
  async findById(id: string): Promise<BusinessCategoryChangeLogRow | null> {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async findPredecessor(businessCategoryId: string, before: Date): Promise<BusinessCategoryChangeLogRow | null> {
    return (
      this.rows
        .filter((r) => r.businessCategoryId === businessCategoryId && r.occurredAt.getTime() < before.getTime())
        .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())[0] ?? null
    );
  }
}

class FakeAudit implements AuditWriter {
  events: AuditAccessEvent[] = [];
  async recordAccess(e: AuditAccessEvent): Promise<void> {
    this.events.push(e);
  }
  queryHistory(): never {
    throw new Error('not used');
  }
  async processOutboxRetry(): Promise<void> {}
}

const AT = new Date('2026-09-02T06:00:00Z');

function event(p: Partial<BusinessCategoryChangedEvent> = {}): BusinessCategoryChangedEvent {
  return {
    businessCategoryId: 'bc-1',
    changeType: 'NODE_ADDED',
    summary: '新增節點『授信申請作業』',
    newValue: '授信申請作業',
    actorId: 'acc-1',
    actorName: '李慧玲',
    actorEmployeeNo: '20233',
    occurredAt: AT,
    ...p,
  };
}

describe('buildBusinessCategoryChangeLogRow / BusinessCategoryChangeLogPublisher（F043 AC-38）', () => {
  it('事件 → 落地列（帶操作者/摘要/新舊值快照）', () => {
    const row = buildBusinessCategoryChangeLogRow(event());
    expect(row).toMatchObject({
      businessCategoryId: 'bc-1',
      changeType: 'NODE_ADDED',
      summary: '新增節點『授信申請作業』',
      newValue: '授信申請作業',
      oldValue: null,
      actorId: 'acc-1',
      actorName: '李慧玲',
      actorEmployeeNo: '20233',
      occurredAt: AT,
    });
    expect(typeof row.id).toBe('string');
  });

  it('AC-38 publish → append 至 store（append-only）', async () => {
    const store = new FakeStore();
    await new BusinessCategoryChangeLogPublisher(store).publish(event());
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0].changeType).toBe('NODE_ADDED');
  });

  it('AC-30／AC-39：掛載／移除各自獨立發布，不合併為單一事件', async () => {
    const store = new FakeStore();
    const pub = new BusinessCategoryChangeLogPublisher(store);
    await pub.publish(event({ changeType: 'DOCUMENT_MOUNTED', summary: '新增掛載' }));
    await pub.publish(event({ changeType: 'DOCUMENT_UNMOUNTED', summary: '移除掛載' }));
    expect(store.rows).toHaveLength(2);
    expect(store.rows.map((r) => r.changeType)).toEqual(['DOCUMENT_MOUNTED', 'DOCUMENT_UNMOUNTED']);
  });
});

describe('BusinessCategoryChangeHistoryService.queryChanges（F043 AC-40：依類別／期間／變更類型查詢）', () => {
  const store = new FakeStore();
  beforeEach(() => {
    store.rows = [
      buildBusinessCategoryChangeLogRow(event({ businessCategoryId: 'bc-1', changeType: 'NODE_ADDED', occurredAt: new Date('2026-09-02T00:00:00Z') })),
      buildBusinessCategoryChangeLogRow(event({ businessCategoryId: 'bc-2', changeType: 'NODE_REMOVED', occurredAt: new Date('2026-08-30T00:00:00Z') })),
      buildBusinessCategoryChangeLogRow(event({ businessCategoryId: 'bc-1', changeType: 'DOCUMENT_MOUNTED', occurredAt: new Date('2026-09-01T00:00:00Z') })),
    ];
  });

  it('依類別／類型篩選並排序（新→舊）', async () => {
    const svc = new BusinessCategoryChangeHistoryService(store);
    const all = await svc.queryChanges({});
    expect(all.total).toBe(3);
    expect(all.items[0].occurredAt.toISOString()).toBe('2026-09-02T00:00:00.000Z');

    const byBc1 = await svc.queryChanges({ businessCategoryId: 'bc-1' });
    expect(byBc1.total).toBe(2);

    const byType = await svc.queryChanges({ changeType: 'NODE_REMOVED' });
    expect(byType.items).toHaveLength(1);
    expect(byType.items[0].businessCategoryId).toBe('bc-2');
  });

  it('依期間篩選', async () => {
    const svc = new BusinessCategoryChangeHistoryService(store);
    const page = await svc.queryChanges({ from: '2026-09-01', to: '2026-09-02' });
    expect(page.total).toBe(2);
  });
});

describe('BusinessCategoryChangeHistoryService.viewBusinessCategory（F043 AC-40 預覽 + 稽核；決策 E3）', () => {
  it('回某類別之列並記 BUSINESS_CATEGORY_CHANGELOG_VIEW（targetType=BUSINESS_CATEGORY_CHANGE_LOG、targetId=businessCategoryId）', async () => {
    const store = new FakeStore();
    store.rows = [
      buildBusinessCategoryChangeLogRow(event({ businessCategoryId: 'bc-1' })),
      buildBusinessCategoryChangeLogRow(event({ businessCategoryId: 'bc-2' })),
    ];
    const audit = new FakeAudit();
    const svc = new BusinessCategoryChangeHistoryService(store, audit as unknown as AuditWriterService);

    const res = await svc.viewBusinessCategory('bc-1', '授信（消金）', {
      accountId: 'acc-9',
      name: '黃俊傑',
      roleCode: 'SysAdmin',
    });
    expect(res.items).toHaveLength(1);
    expect(audit.events).toHaveLength(1);
    expect(audit.events[0]).toMatchObject({
      targetType: 'BUSINESS_CATEGORY_CHANGE_LOG',
      actionType: 'BUSINESS_CATEGORY_CHANGELOG_VIEW',
      actorId: 'acc-9',
      targetId: 'bc-1',
      targetNumber: '授信（消金）',
      targetName: '授信（消金）',
    });
  });
});
