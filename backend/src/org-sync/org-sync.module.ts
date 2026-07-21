import { Module } from '@nestjs/common';
import { AppDataSource } from '../database/data-source';
import { AuthModule } from '../auth/auth.module';
import { OrgSyncController } from './org-sync.controller';
import { OrgSyncService } from './org-sync.service';
import { SysAdminGuard } from './sys-admin.guard';
import { MssqlUpstreamOrgReader } from './mssql-upstream-reader';
import { TypeOrmOrgSyncStore } from './typeorm-org-sync.store';
import { UpstreamOrgReader, OrgSyncStore } from './org-sync.types';
import { loadUpstreamConfig, SYNC_COMPID } from './org-sync.config';

export const UPSTREAM_READER = Symbol('UPSTREAM_READER');
export const ORG_SYNC_STORE = Symbol('ORG_SYNC_STORE');

/**
 * 組織同步模組。
 *  - reader/store 以 useFactory 建構（延遲連線：不於 app 啟動即連 DB/上游）。
 *  - 匯入 AuthModule 以取得 SessionGuard（需其匯出）。
 *  - 排程 cron 掛載（@nestjs/schedule）與前端頁為下一增量，本模組僅提供可被呼叫之引擎與手動 API。
 */
@Module({
  imports: [AuthModule],
  controllers: [OrgSyncController],
  providers: [
    SysAdminGuard,
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
      provide: OrgSyncService,
      useFactory: (reader: UpstreamOrgReader, store: OrgSyncStore): OrgSyncService =>
        new OrgSyncService(reader, store, { compid: SYNC_COMPID }),
      inject: [UPSTREAM_READER, ORG_SYNC_STORE],
    },
  ],
})
export class OrgSyncModule {}
