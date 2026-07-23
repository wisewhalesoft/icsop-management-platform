import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AuditWriterService } from './audit-writer.service';

/**
 * Outbox 補償重試排程（F023 AC4）。每 5 分鐘搬遷 pending 稽核列 → AUDIT_LOG。
 * @Cron metadata 由 AppModule 之 ScheduleModule.forRoot() 掃描；processOutboxRetry 本身冪等且
 * 逐筆吞例外（見 AuditWriterService），此包裝再吞一層以確保排程崩潰不外溢（比照 ScheduledOrgSyncService）。
 */
@Injectable()
export class ScheduledAuditRetryService {
  private readonly logger = new Logger(ScheduledAuditRetryService.name);

  constructor(private readonly writer: AuditWriterService) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async runScheduledRetry(): Promise<void> {
    try {
      await this.writer.processOutboxRetry();
    } catch (err) {
      this.logger.error(`稽核 Outbox 補償排程失敗（已吞）: ${(err as Error)?.message}`);
    }
  }
}
