import { CompositeDocumentChangePublisher } from './composite-document-change-publisher';
import {
  DocumentChangePublisher,
  DocumentChangedEvent,
} from './document-change-event';

/**
 * `DOCUMENT_CHANGE_PUBLISHER` 由單一綁定改為 fan-out：
 * F037 變更日誌（DocumentChangeLogPublisher）與 F006 提示自動解除訂閱者需並存。
 * 任一訂閱者失敗不得影響其他訂閱者，亦不得阻斷來源之文件儲存。
 */

const EVENT: DocumentChangedEvent = {
  documentId: 'D1',
  changeType: 'CONTENT',
  changes: [{ field: 'primaryChiefId', oldValue: 'E001', newValue: 'E002' }],
  occurredAt: new Date('2026-07-24T05:00:00.000Z'),
};

class Recorder implements DocumentChangePublisher {
  events: DocumentChangedEvent[] = [];
  constructor(private readonly failing = false) {}
  async publish(event: DocumentChangedEvent): Promise<void> {
    if (this.failing) throw new Error('SUBSCRIBER_IO');
    this.events.push(event);
  }
}

describe('CompositeDocumentChangePublisher', () => {
  it('同一事件廣播至全部訂閱者（原樣、不變形）', async () => {
    const a = new Recorder();
    const b = new Recorder();

    await new CompositeDocumentChangePublisher([a, b]).publish(EVENT);

    expect(a.events).toEqual([EVENT]);
    expect(b.events).toEqual([EVENT]);
  });

  it('前者失敗不影響後者（逐一 try/catch，非阻斷）', async () => {
    const failing = new Recorder(true);
    const ok = new Recorder();

    await expect(
      new CompositeDocumentChangePublisher([failing, ok]).publish(EVENT),
    ).resolves.toBeUndefined();

    expect(ok.events).toEqual([EVENT]);
  });

  it('全部失敗亦不上拋（文件儲存不因下游訂閱者失敗而失敗）', async () => {
    await expect(
      new CompositeDocumentChangePublisher([
        new Recorder(true),
        new Recorder(true),
      ]).publish(EVENT),
    ).resolves.toBeUndefined();
  });

  it('無訂閱者 → no-op', async () => {
    await expect(
      new CompositeDocumentChangePublisher([]).publish(EVENT),
    ).resolves.toBeUndefined();
  });
});
