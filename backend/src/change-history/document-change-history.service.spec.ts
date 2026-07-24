import { AuditAccessEvent, AuditWriter } from '../audit/audit.types';
import { AuditWriterService } from '../audit/audit-writer.service';
import { DocumentChangeHistoryService } from './document-change-history.service';
import {
  DocumentChangeLogRow,
  DocumentChangeLogStore,
} from './document-change-log.store';
import { DocumentNameLookup } from './document-name-lookup';

class FakeStore implements DocumentChangeLogStore {
  constructor(public rows: DocumentChangeLogRow[] = []) {}
  async append(rows: DocumentChangeLogRow[]): Promise<void> {
    this.rows.push(...rows);
  }
  async listAll(): Promise<DocumentChangeLogRow[]> {
    return this.rows;
  }
  async listByDocument(documentId: string): Promise<DocumentChangeLogRow[]> {
    return this.rows.filter((r) => r.documentId === documentId);
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

function row(p: Partial<DocumentChangeLogRow>): DocumentChangeLogRow {
  return {
    id: Math.random().toString(36).slice(2),
    documentId: 'doc-1',
    documentNumber: 'ICSOP-SRC-101-1-01',
    changeType: 'CONTENT',
    field: 'documentName',
    oldValue: 'a',
    newValue: 'b',
    actorId: 'acc-1',
    actorName: '李慧玲',
    actorEmployeeNo: '20233',
    reason: null,
    occurredAt: new Date('2026-07-16T10:00:00Z'),
    ...p,
  };
}

describe('DocumentChangeHistoryService.queryChanges (F037)', () => {
  it('依編號/欄位/操作人/時間篩選並排序（新→舊）', async () => {
    const store = new FakeStore([
      row({ documentNumber: 'ICSOP-SRC-101-1-01', field: 'status', occurredAt: new Date('2026-07-14T10:00:00Z') }),
      row({ documentNumber: 'ICSOP-PPC-999', field: 'documentName', occurredAt: new Date('2026-07-16T10:00:00Z') }),
      row({ documentNumber: 'ICSOP-SRC-101-1-01', field: 'documentName', occurredAt: new Date('2026-07-15T10:00:00Z') }),
    ]);
    const svc = new DocumentChangeHistoryService(store);

    const all = await svc.queryChanges({});
    expect(all.total).toBe(3);
    // 新→舊
    expect(all.items.map((r) => r.occurredAt.toISOString())).toEqual([
      '2026-07-16T10:00:00.000Z',
      '2026-07-15T10:00:00.000Z',
      '2026-07-14T10:00:00.000Z',
    ]);

    const byDoc = await svc.queryChanges({ doc: 'SRC-101' });
    expect(byDoc.total).toBe(2);

    const byField = await svc.queryChanges({ field: 'status' });
    expect(byField.items).toHaveLength(1);
    expect(byField.items[0].field).toBe('status');
  });

  it('queryChanges 不寫稽核（清單為篩選操作）', async () => {
    const audit = new FakeAudit();
    const svc = new DocumentChangeHistoryService(new FakeStore([row({})]), audit as unknown as AuditWriterService);
    await svc.queryChanges({});
    expect(audit.events).toHaveLength(0);
  });

  it('G-LC-023 併入現行書名 documentName（依 documentId 批次解析；無 lookup→null）', async () => {
    const names: DocumentNameLookup = {
      findNamesByIds: (ids) =>
        Promise.resolve(new Map(ids.filter((id) => id === 'doc-1').map((id) => [id, '車輛分期進件作業']))),
    };
    const store = new FakeStore([row({ documentId: 'doc-1' }), row({ documentId: 'doc-x' })]);
    const svc = new DocumentChangeHistoryService(store, undefined, undefined, names);
    const res = await svc.queryChanges({});
    const d1 = res.items.find((r) => r.documentId === 'doc-1')!;
    const dx = res.items.find((r) => r.documentId === 'doc-x')!;
    expect(d1.documentName).toBe('車輛分期進件作業');
    expect(dx.documentName).toBeNull(); // 未命中→null

    // 無 lookup（既有 2-arg 建構）→ documentName 恆 null
    const bare = new DocumentChangeHistoryService(store);
    const bres = await bare.queryChanges({});
    expect(bres.items.every((r) => r.documentName === null)).toBe(true);
  });
});

describe('DocumentChangeHistoryService.viewDocument (F037 展開 + 稽核)', () => {
  it('回單一文件之列（新→舊）並記一筆 CHANGE_LOG_VIEW（targetId=documentId）', async () => {
    const audit = new FakeAudit();
    const store = new FakeStore([
      row({ documentId: 'doc-1', occurredAt: new Date('2026-07-15T10:00:00Z') }),
      row({ documentId: 'doc-2' }),
      row({ documentId: 'doc-1', occurredAt: new Date('2026-07-16T10:00:00Z') }),
    ]);
    const svc = new DocumentChangeHistoryService(store, audit as unknown as AuditWriterService);

    const res = await svc.viewDocument('doc-1', {
      accountId: 'acc-9',
      name: '黃俊傑',
      employeeNo: '10001',
      roleCode: 'SysAdmin',
    });
    expect(res.items).toHaveLength(2);
    expect(res.items[0].occurredAt.toISOString()).toBe('2026-07-16T10:00:00.000Z');

    expect(audit.events).toHaveLength(1);
    expect(audit.events[0]).toMatchObject({
      targetType: 'DOCUMENT_CHANGE_LOG',
      actionType: 'CHANGE_LOG_VIEW',
      actorId: 'acc-9',
      targetId: 'doc-1',
      targetNumber: 'ICSOP-SRC-101-1-01',
      // OQ-AQ-04：targetName 亦填入（供 F024「對象名稱」欄；變更-kind 唯一可用之描述性文字＝文件編號快照）。
      targetName: 'ICSOP-SRC-101-1-01',
    });
  });

  it('無 actor（未帶身分）→ 不寫稽核但仍回列', async () => {
    const audit = new FakeAudit();
    const svc = new DocumentChangeHistoryService(new FakeStore([row({ documentId: 'doc-1' })]), audit as unknown as AuditWriterService);
    const res = await svc.viewDocument('doc-1');
    expect(res.items).toHaveLength(1);
    expect(audit.events).toHaveLength(0);
  });
});
