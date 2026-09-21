import { Module } from '@nestjs/common';
import { AppDataSource } from '../database/data-source';
import { AuthModule } from '../auth/auth.module';
import { DashboardController } from './dashboard.controller';
import { DashboardSummaryService } from './dashboard-summary.service';
import { makeTypeOrmDashboardCounts } from './dashboard-counts';
import { DashboardActivityService } from './dashboard-activity.service';
import { makeTypeOrmDashboardActivity } from './dashboard-activity.sources';
import { DashboardAnalyticsService } from './dashboard-analytics.service';
import { makeTypeOrmDashboardAnalyticsSources } from './dashboard-analytics.sources';

/**
 * GAP-07-1 儀表板 KPI 模組。反循環：不匯入各功能模組，直接以 AppDataSource 自建唯讀 COUNT provider
 * （比照 IngestionModule／typeorm-index-meta 慣例），避免與 documents/audit/accounts/org-change-alert 形成環。
 * AuthModule 供 SessionGuard 之相依（SessionTokenService 等）。
 */
@Module({
  imports: [AuthModule],
  controllers: [DashboardController],
  providers: [
    {
      provide: DashboardSummaryService,
      useFactory: (): DashboardSummaryService =>
        new DashboardSummaryService(makeTypeOrmDashboardCounts(AppDataSource)),
    },
    {
      provide: DashboardActivityService,
      useFactory: (): DashboardActivityService =>
        new DashboardActivityService(makeTypeOrmDashboardActivity(AppDataSource)),
    },
    /**
     * F044 儀表板聚合（`ARCH-G3`）。🔒 **不新增任何模組、不新增任何模組間相依**——
     * 卡④ 走 OJT 自己的端點，故本模組**不需要** import `OjtProgressModule`。
     * 🔴 `AC-G73`：不注入任何快取層；`AC-G72`：不注入任何稽核 recorder（建構子恰兩個參數）。
     */
    {
      provide: DashboardAnalyticsService,
      useFactory: (): DashboardAnalyticsService =>
        new DashboardAnalyticsService(
          makeTypeOrmDashboardAnalyticsSources(AppDataSource),
          () => new Date(),
        ),
    },
  ],
})
export class DashboardModule {}
