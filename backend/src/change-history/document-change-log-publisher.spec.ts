import { DocumentChangedEvent } from '../documents/document-change-event';
import {
  buildDocumentChangeLogRows,
  DocumentChangeLogPublisher,
} from './document-change-log-publisher';
import {
  DocumentChangeLogRow,
  DocumentChangeLogStore,
} from './document-change-log.store';

class FakeStore implements DocumentChangeLogStore {
  rows: DocumentChangeLogRow[] = [];
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

const at = new Date('2026-07-16T14:30:05Z');

function contentEvent(): DocumentChangedEvent {
  return {
    documentId: 'doc-1',
    changeType: 'CONTENT',
    documentNumber: 'ICSOP-SRC-101-1-01',
    actorId: 'acc-1',
    actorName: '李慧玲',
    actorEmployeeNo: '20233',
    changes: [
      { field: 'draftingDeptId', oldValue: '企劃部', newValue: '消費分期營業部' },
      { field: 'documentName', oldValue: '舊書名', newValue: '新書名' },
    ],
    occurredAt: at,
  };
}

describe('buildDocumentChangeLogRows (F037 pure diff → 落地列)', () => {
  it('逐欄位 delta 各產生一列，帶操作者/文件編號快照', () => {
    const rows = buildDocumentChangeLogRows(contentEvent());
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      documentId: 'doc-1',
      documentNumber: 'ICSOP-SRC-101-1-01',
      changeType: 'CONTENT',
      field: 'draftingDeptId',
      oldValue: '企劃部',
      newValue: '消費分期營業部',
      actorId: 'acc-1',
      actorName: '李慧玲',
      actorEmployeeNo: '20233',
      occurredAt: at,
    });
    expect(rows[1].field).toBe('documentName');
    // 每列各自唯一 id
    expect(rows[0].id).not.toBe(rows[1].id);
  });

  it('STATUS 事件之狀態 old/new 落地', () => {
    const rows = buildDocumentChangeLogRows({
      documentId: 'doc-2',
      changeType: 'STATUS',
      documentNumber: 'ICSOP-LWC-101-1-02',
      actorId: 'acc-1',
      changes: [{ field: 'status', oldValue: 'active', newValue: 'void' }],
      occurredAt: at,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ changeType: 'STATUS', field: 'status', oldValue: 'active', newValue: 'void' });
  });

  it('無實際欄位變更（changes 空/未提供）→ 不產生任何列', () => {
    expect(buildDocumentChangeLogRows({ documentId: 'd', changeType: 'CONTENT', occurredAt: at })).toEqual([]);
    expect(
      buildDocumentChangeLogRows({ documentId: 'd', changeType: 'CONTENT', changes: [], occurredAt: at }),
    ).toEqual([]);
  });

  it('缺操作者/編號快照 → 對應欄位落 null（不擋落地）', () => {
    const rows = buildDocumentChangeLogRows({
      documentId: 'd',
      changeType: 'CONTENT',
      changes: [{ field: 'documentName', oldValue: 'a', newValue: 'b' }],
      occurredAt: at,
    });
    expect(rows[0]).toMatchObject({ actorId: null, actorName: null, actorEmployeeNo: null, documentNumber: null });
  });
});

describe('DocumentChangeLogPublisher (真實綁定，決策 B)', () => {
  it('publish 將事件 diff append 至 store（append-only）', async () => {
    const store = new FakeStore();
    const pub = new DocumentChangeLogPublisher(store);
    await pub.publish(contentEvent());
    expect(store.rows).toHaveLength(2);
    expect(store.rows.map((r) => r.field)).toEqual(['draftingDeptId', 'documentName']);
  });

  it('無欄位變更事件 → 不呼叫 append（無日誌）', async () => {
    const store = new FakeStore();
    const spy = jest.spyOn(store, 'append');
    const pub = new DocumentChangeLogPublisher(store);
    await pub.publish({ documentId: 'd', changeType: 'CONTENT', changes: [], occurredAt: at });
    expect(spy).not.toHaveBeenCalled();
    expect(store.rows).toEqual([]);
  });
});
