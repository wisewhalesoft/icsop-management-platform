import { Module } from '@nestjs/common';
import { AppDataSource } from '../database/data-source';
import { AuthModule } from '../auth/auth.module';
import { DashboardController } from './dashboard.controller';
import { DashboardSummaryService } from './dashboard-summary.service';
import { makeTypeOrmDashboardCounts } from './dashboard-counts';

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
  ],
})
export class DashboardModule {}
