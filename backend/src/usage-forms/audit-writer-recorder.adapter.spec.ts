import { AuditWriterRecorder } from './audit-writer-recorder.adapter';
import { AuditAccessEvent } from '../audit/audit.types';
import { AuditWriterService } from '../audit/audit-writer.service';

/** 擷取 recordAccess 之參數的最小假 AuditWriter（不接觸 Outbox/Store）。 */
class FakeAuditWriter {
  calls: AuditAccessEvent[] = [];
  recordAccess(event: AuditAccessEvent): Promise<void> {
    this.calls.push(event);
    return Promise.resolve();
  }
}

describe('AuditWriterRecorder（使用表單稽核 → 真實 AuditWriter 轉接）', () => {
  let writer: FakeAuditWriter;
  let recorder: AuditWriterRecorder;
  beforeEach(() => {
    writer = new FakeAuditWriter();
    recorder = new AuditWriterRecorder(writer as unknown as AuditWriterService);
  });

  it('將 USAGE_FORM DOWNLOAD 事件對映為 AuditAccessEvent（targetId=formId、actorId=accountId）', async () => {
    await recorder.record({
      targetType: 'USAGE_FORM',
      actionType: 'DOWNLOAD',
      formId: 'form-42',
      documentId: 'doc-7',
      accountId: 'acct-9',
    });

    expect(writer.calls).toHaveLength(1);
    const ev = writer.calls[0];
    expect(ev.targetType).toBe('USAGE_FORM');
    expect(ev.actionType).toBe('DOWNLOAD');
    expect(ev.targetId).toBe('form-42');
    expect(ev.actorId).toBe('acct-9');
    expect(ev.occurredAt).toBeInstanceOf(Date);
  });

  it('轉發 recordAccess 之 rejection（呼叫端 UsageFormsService 決定是否吞例外）', async () => {
    writer.recordAccess = () => Promise.reject(new Error('outbox down'));
    await expect(
      recorder.record({
        targetType: 'USAGE_FORM',
        actionType: 'DOWNLOAD',
        formId: 'f1',
        documentId: 'd1',
        accountId: 'a1',
      }),
    ).rejects.toThrow('outbox down');
  });
});
