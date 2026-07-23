import { Injectable } from '@nestjs/common';
import { AuditWriterService } from '../audit/audit-writer.service';
import { AuditRecorder, UsageFormAuditEvent } from './usage-forms.store';

/**
 * 使用表單調閱稽核 → 真實 AuditWriter 之轉接器（取代佔位 LoggingAuditRecorder）。
 *
 * 將 F018 之 UsageFormAuditEvent 對映為 F023 共用契約 AuditAccessEvent（USAGE_FORM 變體）：
 *   - targetType：'USAGE_FORM'
 *   - actionType：'DOWNLOAD'（前台下載表單）
 *   - targetId ：formId（AuditWriter 內部依 targetType 落至 AUDIT_LOG.formId）
 *   - actorId  ：accountId（操作者）
 *   - occurredAt：伺服器時間戳（此 seam 未持有更豐富之身分/對象快照，其餘欄留空由 AuditWriter 補 null）
 *
 * recordAccess 內部經 Outbox 非阻斷入列，故下載主流程不因稽核 IO 失敗而中斷（NFR-003）。
 * 呼叫端（UsageFormsService）已於下載成功後才呼叫本 record，權限/歸屬把關在前。
 */
@Injectable()
export class AuditWriterRecorder implements AuditRecorder {
  constructor(private readonly writer: AuditWriterService) {}

  async record(event: UsageFormAuditEvent): Promise<void> {
    await this.writer.recordAccess({
      targetType: 'USAGE_FORM',
      actionType: event.actionType,
      targetId: event.formId,
      actorId: event.accountId,
      occurredAt: new Date(),
    });
  }
}
