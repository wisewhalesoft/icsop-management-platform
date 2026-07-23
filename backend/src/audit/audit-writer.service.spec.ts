import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditWriterService } from './audit-writer.service';
import { TypeOrmAuditStore } from './typeorm-audit.store';
import {
  AuditAccessEvent,
  AuditOutboxRecord,
  AuditOutboxStore,
  AuditRow,
  AuditStore,
} from './audit.types';

/**
 * F023 AuditWriter 服務。涵蓋 TS-006（不節流不去重）、007/008（非阻斷）、009/010/011（補償重試）、
 * 012（不可竄改·App 層結構性防禦）。比照 scheduled-org-sync 慣例：靜音 log、不驗 log 內容。
 */

const OCCURRED = new Date('2026-07-16T14:32:08.000Z');
const baseEvent: AuditAccessEvent = {
  targetType: 'DOCUMENT',
  actionType: 'VIEW',
  actorId: 'acc-1',
  actorName: '王小明',
  employeeNo: '22345',
  targetId: 'doc-1',
  targetNumber: 'ICSOP-SRC-101-1-01',
  watermarkSnapshot: 'wm',
  occurredAt: OCCURRED,
};

/** 假 Outbox：暫存 pending 事件，markDone 移除。可切換 enqueue/append 拋錯。 */
class FakeAuditOutboxStore implements AuditOutboxStore {
  records: AuditOutboxRecord[] = [];
  enqueueError: Error | null = null;

  enqueue(row: AuditRow): Promise<void> {
    if (this.enqueueError) return Promise.reject(this.enqueueError);
    this.records.push({ id: row.id, row, status: 'pending', attempts: 0 });
    return Promise.resolve();
  }
  listPending(): Promise<AuditOutboxRecord[]> {
    return Promise.resolve(this.records.filter((r) => r.status === 'pending'));
  }
  markDone(id: string): Promise<void> {
    this.records = this.records.filter((r) => r.id !== id);
    return Promise.resolve();
  }
}

/** 假最終 store：以 id 為鍵冪等 append（重複 id 不重寫）。 */
class FakeAuditStore implements AuditStore {
  rows = new Map<string, AuditRow>();
  appendCalls = 0;
  failIds = new Set<string>();

  append(row: AuditRow): Promise<void> {
    this.appendCalls++;
    if (this.failIds.has(row.id)) return Promise.reject(new Error('DB down'));
    if (!this.rows.has(row.id)) this.rows.set(row.id, row); // 冪等
    return Promise.resolve();
  }
  findById(id: string): Promise<AuditRow | null> {
    return Promise.resolve(this.rows.get(id) ?? null);
  }
  listAll(): Promise<AuditRow[]> {
    return Promise.resolve([...this.rows.values()]);
  }
}

describe('AuditWriterService.recordAccess', () => {
  let outbox: FakeAuditOutboxStore;
  let store: FakeAuditStore;
  let writer: AuditWriterService;
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    outbox = new FakeAuditOutboxStore();
    store = new FakeAuditStore();
    writer = new AuditWriterService(outbox, store);
  });
  afterEach(() => jest.restoreAllMocks());

  it('TS-001/002 寫入 → outbox 恰 1 筆待補寫', async () => {
    await writer.recordAccess(baseEvent);
    expect(outbox.records).toHaveLength(1);
    expect(outbox.records[0].row.documentNumber).toBe('ICSOP-SRC-101-1-01');
  });

  it('TS-006 短時間重複開啟同文件 3 次 → 3 筆各自獨立、不去重、id 各異', async () => {
    await writer.recordAccess(baseEvent);
    await writer.recordAccess(baseEvent);
    await writer.recordAccess(baseEvent);
    expect(outbox.records).toHaveLength(3);
    const ids = new Set(outbox.records.map((r) => r.id));
    expect(ids.size).toBe(3);
  });

  it('TS-005 targetId 缺漏 → 拒絕（AUDIT_TARGET_REF_REQUIRED），不入 outbox', async () => {
    await expect(
      writer.recordAccess({ ...baseEvent, targetId: '' }),
    ).rejects.toThrow('AUDIT_TARGET_REF_REQUIRED');
    expect(outbox.records).toHaveLength(0);
  });

  it('TS-007 outbox 暫時失敗 → recordAccess 仍 resolve（不阻斷瀏覽）', async () => {
    outbox.enqueueError = new Error('DB temporarily unavailable');
    await expect(writer.recordAccess(baseEvent)).resolves.toBeUndefined();
  });

  it('TS-008 outbox 持續失敗（極端）→ 仍不外拋，不中斷主流程', async () => {
    outbox.enqueueError = new Error('App DB down');
    await expect(writer.recordAccess(baseEvent)).resolves.toBeUndefined();
    await expect(writer.recordAccess(baseEvent)).resolves.toBeUndefined();
  });
});

describe('AuditWriterService.processOutboxRetry', () => {
  let outbox: FakeAuditOutboxStore;
  let store: FakeAuditStore;
  let writer: AuditWriterService;
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    outbox = new FakeAuditOutboxStore();
    store = new FakeAuditStore();
    writer = new AuditWriterService(outbox, store);
  });
  afterEach(() => jest.restoreAllMocks());

  it('TS-009 2 筆 pending → 各搬遷至 AuditStore 一次、outbox 清空', async () => {
    await writer.recordAccess(baseEvent);
    await writer.recordAccess({ ...baseEvent, actionType: 'DOWNLOAD' });
    expect(outbox.records).toHaveLength(2);

    await writer.processOutboxRetry();

    expect(store.rows.size).toBe(2);
    expect(outbox.records).toHaveLength(0);
  });

  it('TS-010 部分失敗 → 成功筆搬遷移除、失敗筆維持 pending，整批不外拋', async () => {
    await writer.recordAccess(baseEvent);
    await writer.recordAccess({ ...baseEvent, actionType: 'DOWNLOAD' });
    await writer.recordAccess({ ...baseEvent, actionType: 'PRINT' });
    const failing = outbox.records[1].id;
    store.failIds.add(failing);

    await expect(writer.processOutboxRetry()).resolves.toBeUndefined();

    expect(store.rows.size).toBe(2); // 2 成功
    expect(outbox.records).toHaveLength(1); // 1 失敗留存
    expect(outbox.records[0].id).toBe(failing);
  });

  it('TS-011 冪等：同一 outbox 紀錄被處理兩次 → AuditStore 僅 1 筆', async () => {
    await writer.recordAccess(baseEvent);
    // 模擬排程重疊：markDone 首次為 no-op（尚未移除），故第二次仍見同一 pending。
    const realMarkDone = outbox.markDone.bind(outbox);
    let first = true;
    jest.spyOn(outbox, 'markDone').mockImplementation((id: string) => {
      if (first) {
        first = false;
        return Promise.resolve(); // 重疊：本次未實際移除
      }
      return realMarkDone(id);
    });

    await writer.processOutboxRetry();
    await writer.processOutboxRetry();

    expect(store.rows.size).toBe(1); // 以 row.id 冪等，不重複寫兩筆
    expect(store.appendCalls).toBeGreaterThanOrEqual(2); // 確實嘗試了兩次
  });
});

describe('AuditStore 不可竄改（TS-012，App 層結構性防禦／decision E）', () => {
  it('TypeOrmAuditStore 介面只暴露 append/findById/listAll，無 update/delete/remove/save', () => {
    const store = new TypeOrmAuditStore({} as DataSource) as unknown as Record<
      string,
      unknown
    >;
    expect(typeof store.append).toBe('function');
    expect(typeof store.findById).toBe('function');
    expect(typeof store.listAll).toBe('function');
    for (const forbidden of ['update', 'delete', 'remove', 'save', 'upsert']) {
      expect(store[forbidden]).toBeUndefined();
    }
  });
});
