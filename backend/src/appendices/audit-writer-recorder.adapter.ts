import { Injectable } from '@nestjs/common';
import { AuditWriterService } from '../audit/audit-writer.service';
import { AppendixAuditEvent, AuditRecorder } from './appendices.store';

/**
 * 附錄調閱稽核 → 真實 AuditWriter 之轉接器（architecture-spec §3.6 決策三）。
 *
 * 將 F039 之 AppendixAuditEvent 對映為 F023 共用契約 AuditAccessEvent（APPENDIX 變體）：
 *   - targetType ：'APPENDIX'
 *   - actionType ：'DOWNLOAD'（前台下載附錄；附錄無其他動作類型）
 *   - targetId   ：appendixId（buildAuditRow 之 APPENDIX 分支落至 AUDIT_LOG.appendixId）
 *   - documentId ：該附錄所屬下載來源文件 id
 *   - actorId    ：accountId（操作者）
 *   - occurredAt ：伺服器時間戳
 *
 * ⚠ **與 usage-forms 之同名轉接器的關鍵差異**：本轉接器**必須轉送 documentId**。
 * 既有 usage-forms/audit-writer-recorder.adapter.ts 未轉送，導致 USAGE_FORM 列之
 * AUDIT_LOG.documentId 恆為 null（既有落差，非本次修正範圍）；AC-27 明確要求附錄之稽核列
 * **同時**落地 appendixId 與 documentId，故不得沿用該「單一 targetId」轉送模式。
 *
 * recordAccess 內部經 Outbox 非阻斷入列（§5.5）；本 record 不吞例外，由呼叫端決定
 * （AppendicesService 於下載成功後才呼叫，權限/歸屬把關在前）。
 */
@Injectable()
export class AuditWriterRecorder implements AuditRecorder {
  constructor(private readonly writer: AuditWriterService) {}

  async record(event: AppendixAuditEvent): Promise<void> {
    await this.writer.recordAccess({
      targetType: 'APPENDIX',
      actionType: event.actionType,
      targetId: event.appendixId,
      documentId: event.documentId,
      actorId: event.accountId,
      occurredAt: new Date(),
    });
  }
}
