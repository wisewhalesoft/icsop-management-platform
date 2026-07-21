import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { OrgSyncService } from './org-sync.service';

/**
 * 每日排程同步（OQ-E02-02：02:00 UTC+8）。
 *
 * 設計：
 *  - `@Cron('0 2 * * *', { timeZone: 'Asia/Taipei' })` 於每日 02:00（台北時區）觸發 `runScheduled`。
 *    ScheduleModule.forRoot()（AppModule）以 discovery 掃描本 provider 之 @Cron metadata；
 *    註冊本身不連線，僅排定下一次觸發時間 → app 啟動不因 DB/上游而崩潰。
 *  - `runScheduled` 呼叫 `OrgSyncService.run('scheduled', null)`（無觸發者）。
 *  - 全程 try/catch：排程失敗（含互斥 SYNC_IN_PROGRESS、hasRunningSyncRun 之 DB 例外）僅記 log，
 *    不讓未捕捉例外自 cron 回呼外拋而中斷程序（避免排程迴圈崩潰）。
 *
 * 測試策略：不測 @Cron decorator 之時間觸發（難以確定性驗證），改直接測 `runScheduled()` 方法
 * 之委派與吞例外行為（見 scheduled-org-sync.service.spec.ts）。
 */
@Injectable()
export class ScheduledOrgSyncService {
  private readonly logger = new Logger(ScheduledOrgSyncService.name);

  constructor(private readonly svc: OrgSyncService) {}

  @Cron('0 2 * * *', { name: 'org-sync-daily', timeZone: 'Asia/Taipei' })
  async runScheduled(): Promise<void> {
    try {
      const result = await this.svc.run('scheduled', null);
      this.logger.log(
        `排程同步完成 runId=${result.runId} status=${result.status} changeCount=${result.changeCount}`,
      );
    } catch (err) {
      // 排程失敗（含互斥 SYNC_IN_PROGRESS、hasRunningSyncRun 之 DB 例外）只記 log，
      // 不讓未捕捉例外自 cron 回呼外拋而中斷程序。
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`排程同步失敗：${message}`);
    }
  }
}
