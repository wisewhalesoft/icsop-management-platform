import { Logger } from '@nestjs/common';
import { AuditRecorder, UsageFormAuditEvent } from './usage-forms.store';

/**
 * 調閱稽核佔位收集器：僅記錄，不落地 AUDIT_LOG（F023 未建，屬未來 worktree）。
 * 整合階段以真實 AUDIT_LOG 寫入 + outbox 補償佇列取代（介面不變）。
 */
export class LoggingAuditRecorder implements AuditRecorder {
  private readonly logger = new Logger('AuditRecorder');
  record(event: UsageFormAuditEvent): void {
    this.logger.log(
      `AUDIT ${event.actionType} ${event.targetType} form=${event.formId} doc=${event.documentId} by=${event.accountId}`,
    );
  }
}
