import { Module } from '@nestjs/common';
import { AppDataSource } from '../database/data-source';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { OrgSyncController } from './org-sync.controller';
import { OrgSyncService } from './org-sync.service';
import { OrgSyncCoordinator } from './org-sync-coordinator';
import { ScheduledOrgSyncService } from './scheduled-org-sync.service';
import { MssqlUpstreamOrgReader } from './mssql-upstream-reader';
import { TypeOrmOrgSyncStore } from './typeorm-org-sync.store';
import { UpstreamOrgReader, OrgSyncStore } from './org-sync.types';
import {
  loadUpstreamConfig,
  SYNC_COMPIDS,
  loadDisappearedThresholdOverride,
} from './org-sync.config';
import { OrgChangeAlertModule } from '../org-change-alert/org-change-alert.module';
import { OrgChangeAlertService } from '../org-change-alert/org-change-alert.service';

export const UPSTREAM_READER = Symbol('UPSTREAM_READER');
export const ORG_SYNC_STORE = Symbol('ORG_SYNC_STORE');

/**
 * 組織同步模組。
 *  - reader/store 以 useFactory 建構（延遲連線：不於 app 啟動即連 DB/上游）。
 *  - 匯入 AuthModule 取得 SessionGuard（認證）、RbacModule 取得 RolePermissionGuard（F025 授權）。
 *  - ScheduledOrgSyncService 提供每日排程觸發（02:00 UTC+8）；其 @Cron metadata 由 AppModule
 *    之 ScheduleModule.forRoot() 以 discovery 掃描（註冊本身不連線，app 啟動不因 DB/上游崩潰）。
 *  - 前端頁（prototype 09 移植）為下一增量。
 */
@Module({
  imports: [AuthModule, RbacModule, OrgChangeAlertModule],
  controllers: [OrgSyncController],
  providers: [
    {
      provide: UPSTREAM_READER,
      useFactory: (): UpstreamOrgReader =>
        new MssqlUpstreamOrgReader(loadUpstreamConfig()),
    },
    {
      provide: ORG_SYNC_STORE,
      useFactory: (): OrgSyncStore => new TypeOrmOrgSyncStore(AppDataSource),
    },
    {
      // B 階段（多公司）：一家公司一個 OrgSyncService 實例（各自綁定固定 compid，內部流程
      // 完全不變）；OrgSyncCoordinator 為薄薄一層外部迴圈，見該檔案 JSDoc。
      provide: OrgSyncCoordinator,
      useFactory: (
        reader: UpstreamOrgReader,
        store: OrgSyncStore,
        alerts: OrgChangeAlertService,
      ): OrgSyncCoordinator => {
        const disappearedThreshold = loadDisappearedThresholdOverride();
        const services = SYNC_COMPIDS.map(
          (compid) =>
            new OrgSyncService(
              reader,
              store,
              // undefined → 服務層沿用 DEFAULT_DISAPPEARED_THRESHOLD（10%，2026-08-31 校準）。
              // ⚠ 此處**刻意不接** roleChangeThreshold：角色變更閾值之覆寫僅供 CLI
              //   （sync:once）之一次性全量套用，不開放給畫面按鈕與每日排程，
              //   避免「一次性放寬」變成長期生效而讓角色被靜默大量改寫。
              { compid, disappearedThreshold },
              alerts,
            ),
        );
        return new OrgSyncCoordinator(services, store);
      },
      inject: [UPSTREAM_READER, ORG_SYNC_STORE, OrgChangeAlertService],
    },
    // 每日排程觸發（02:00 UTC+8）。@Cron metadata 由 AppModule 之 ScheduleModule.forRoot() 掃描。
    ScheduledOrgSyncService,
  ],
})
export class OrgSyncModule {}
