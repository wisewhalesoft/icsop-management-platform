import { AuditWriterRecorder } from './audit-writer-recorder.adapter';
import { AuditAccessEvent } from '../audit/audit.types';
import { AuditWriterService } from '../audit/audit-writer.service';

/**
 * F039 附錄稽核 → 真實 AuditWriter 轉接（architecture-spec.md §3.6 決策三）。
 *
 * ⚠ 高風險點 #2（architect 點名）：既有 usage-forms/audit-writer-recorder.adapter.ts 之
 * USAGE_FORM 分支**未轉送 documentId**（既有落差，`AUDIT_LOG.documentId` 對 USAGE_FORM 列恆
 * null——見 usage-forms 模組已知缺口，非本次任務範圍）。AC-27 明確要求附錄稽核列同時落地
 * `appendixId` **與** `documentId`；決策三要求 appendices/ 的轉接器（獨立複製，非共用
 * usage-forms 內部檔案）**正確轉送兩者**——此為本檔存在的核心理由，不得沿用 USAGE_FORM
 * 分支之「單一 targetId」轉送模式。
 */

class FakeAuditWriter {
  calls: AuditAccessEvent[] = [];
  recordAccess(event: AuditAccessEvent): Promise<void> {
    this.calls.push(event);
    return Promise.resolve();
  }
}

describe('AuditWriterRecorder（附錄稽核 → 真實 AuditWriter 轉接，F039）', () => {
  let writer: FakeAuditWriter;
  let recorder: AuditWriterRecorder;
  beforeEach(() => {
    writer = new FakeAuditWriter();
    recorder = new AuditWriterRecorder(writer as unknown as AuditWriterService);
  });

  it('將 APPENDIX DOWNLOAD 事件對映為 AuditAccessEvent：targetId=appendixId 且 documentId 亦轉送（AC-27）', async () => {
    await recorder.record({
      targetType: 'APPENDIX',
      actionType: 'DOWNLOAD',
      appendixId: 'ax-42',
      documentId: 'doc-7',
      accountId: 'acct-9',
    });

    expect(writer.calls).toHaveLength(1);
    const ev = writer.calls[0] as AuditAccessEvent & { documentId?: string };
    expect(ev.targetType).toBe('APPENDIX');
    expect(ev.actionType).toBe('DOWNLOAD');
    expect(ev.targetId).toBe('ax-42');
    expect(ev.actorId).toBe('acct-9');
    // AC-27 之核心斷言：documentId 必須被轉送（不同於 usage-forms 既有落差）。
    expect(ev.documentId).toBe('doc-7');
    expect(ev.occurredAt).toBeInstanceOf(Date);
  });

  it('轉發 recordAccess 之 rejection（呼叫端 AppendicesService 決定是否吞例外，比照 Outbox 非阻斷語意）', async () => {
    writer.recordAccess = () => Promise.reject(new Error('outbox down'));
    await expect(
      recorder.record({
        targetType: 'APPENDIX',
        actionType: 'DOWNLOAD',
        appendixId: 'ax-1',
        documentId: 'doc-1',
        accountId: 'a1',
      }),
    ).rejects.toThrow('outbox down');
  });
});
