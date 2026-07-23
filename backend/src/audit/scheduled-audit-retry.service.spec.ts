import { Logger } from '@nestjs/common';
import { ScheduledAuditRetryService } from './scheduled-audit-retry.service';
import { AuditWriterService } from './audit-writer.service';

/**
 * Outbox 補償重試之排程包裝（AC4）。比照 scheduled-org-sync：不測 @Cron 時間觸發，
 * 改直接測 runScheduledRetry() 之委派與吞例外（排程失敗只記 log、不中斷程序）。
 */
describe('ScheduledAuditRetryService.runScheduledRetry', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('委派 AuditWriter.processOutboxRetry 一次', async () => {
    const processOutboxRetry = jest.fn().mockResolvedValue(undefined);
    const svc = { processOutboxRetry } as unknown as AuditWriterService;
    const scheduled = new ScheduledAuditRetryService(svc);

    await scheduled.runScheduledRetry();

    expect(processOutboxRetry).toHaveBeenCalledTimes(1);
  });

  it('processOutboxRetry 拋例外 → 被吞掉、不外拋', async () => {
    const processOutboxRetry = jest.fn().mockRejectedValue(new Error('boom'));
    const svc = { processOutboxRetry } as unknown as AuditWriterService;
    const scheduled = new ScheduledAuditRetryService(svc);

    await expect(scheduled.runScheduledRetry()).resolves.toBeUndefined();
  });
});
