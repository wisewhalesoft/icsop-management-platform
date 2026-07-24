import { AuditAccessEvent, AuditWriter } from '../audit/audit.types';
import { AuditWriterService } from '../audit/audit-writer.service';
import {
  buildLifecycleChangeLogRow,
  LifecycleChangeLogPublisher,
} from './lifecycle-change-log-publisher';
import { LifecycleChangeHistoryService } from './lifecycle-change-history.service';
import {
  LifecycleChangeLogRow,
  LifecycleChangeLogStore,
} from './lifecycle-change-log.store';
import { LifecycleChangedEvent } from '../lifecycle/lifecycle-change-event';

class FakeStore implements LifecycleChangeLogStore {
  rows: LifecycleChangeLogRow[] = [];
  async append(row: LifecycleChangeLogRow): Promise<void> {
    this.rows.push(row);
  }
  async listAll(): Promise<LifecycleChangeLogRow[]> {
    return this.rows;
  }
  async listByLifecycle(id: string): Promise<LifecycleChangeLogRow[]> {
    return this.rows.filter((r) => r.lifecycleId === id);
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

const at = new Date('2026-07-16T15:12:04Z');

function event(p: Partial<LifecycleChangedEvent> = {}): LifecycleChangedEvent {
  return {
    lifecycleId: 'lc-1',
    changeType: 'NODE_ADDED',
    summary: '新增節點『撥款核准作業』',
    newValue: '撥款核准作業',
    actorId: 'acc-1',
    actorName: '李慧玲',
    actorEmployeeNo: '20233',
    occurredAt: at,
    ...p,
  };
}

describe('buildLifecycleChangeLogRow / LifecycleChangeLogPublisher (F038)', () => {
  it('事件 → 落地列（帶操作者/摘要/新舊值快照）', () => {
    const row = buildLifecycleChangeLogRow(event());
    expect(row).toMatchObject({
      lifecycleId: 'lc-1',
      changeType: 'NODE_ADDED',
      summary: '新增節點『撥款核准作業』',
      newValue: '撥款核准作業',
      oldValue: null,
      actorId: 'acc-1',
      actorName: '李慧玲',
      actorEmployeeNo: '20233',
      occurredAt: at,
    });
    expect(typeof row.id).toBe('string');
  });

  it('publish append 至 store（append-only）', async () => {
    const store = new FakeStore();
    await new LifecycleChangeLogPublisher(store).publish(event());
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0].changeType).toBe('NODE_ADDED');
  });
});

describe('LifecycleChangeHistoryService.queryChanges (F038)', () => {
  const store = new FakeStore();
  beforeEach(() => {
    store.rows = [
      buildLifecycleChangeLogRow(event({ lifecycleId: 'SRC', changeType: 'NODE_ADDED', occurredAt: new Date('2026-07-16T00:00:00Z') })),
      buildLifecycleChangeLogRow(event({ lifecycleId: 'PUC', changeType: 'NODE_REMOVED', occurredAt: new Date('2026-07-12T00:00:00Z') })),
      buildLifecycleChangeLogRow(event({ lifecycleId: 'SRC', changeType: 'EDGE_ADDED', occurredAt: new Date('2026-07-15T00:00:00Z') })),
    ];
  });

  it('依循環/類型篩選並排序（新→舊）', async () => {
    const svc = new LifecycleChangeHistoryService(store);
    const all = await svc.queryChanges({});
    expect(all.total).toBe(3);
    expect(all.items[0].occurredAt.toISOString()).toBe('2026-07-16T00:00:00.000Z');

    const bySrc = await svc.queryChanges({ lifecycleId: 'SRC' });
    expect(bySrc.total).toBe(2);

    const byType = await svc.queryChanges({ changeType: 'NODE_REMOVED' });
    expect(byType.items).toHaveLength(1);
    expect(byType.items[0].lifecycleId).toBe('PUC');
  });
});

describe('LifecycleChangeHistoryService.viewLifecycle (F038 預覽 + 稽核)', () => {
  it('回某循環之列並記 LIFECYCLE_CHANGELOG_VIEW（targetId=lifecycleId）', async () => {
    const store = new FakeStore();
    store.rows = [
      buildLifecycleChangeLogRow(event({ lifecycleId: 'SRC' })),
      buildLifecycleChangeLogRow(event({ lifecycleId: 'PUC' })),
    ];
    const audit = new FakeAudit();
    const svc = new LifecycleChangeHistoryService(store, audit as unknown as AuditWriterService);

    const res = await svc.viewLifecycle('SRC', '銷售及收款循環', {
      accountId: 'acc-9',
      name: '黃俊傑',
      roleCode: 'SysAdmin',
    });
    expect(res.items).toHaveLength(1);
    expect(audit.events).toHaveLength(1);
    expect(audit.events[0]).toMatchObject({
      targetType: 'LIFECYCLE_CHANGE_LOG',
      actionType: 'LIFECYCLE_CHANGELOG_VIEW',
      actorId: 'acc-9',
      targetId: 'SRC',
      targetNumber: '銷售及收款循環',
      // OQ-AQ-04：targetName 亦填入（供 F024「對象名稱」欄；循環變更-kind 之描述性文字＝循環名稱）。
      targetName: '銷售及收款循環',
    });
  });
});
