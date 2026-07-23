import { Module } from '@nestjs/common';
import { AppDataSource } from '../database/data-source';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { AccessHistoryController } from './access-history.controller';
import { AuditWriterService } from './audit-writer.service';
import { ScheduledAuditRetryService } from './scheduled-audit-retry.service';
import { TypeOrmAuditStore } from './typeorm-audit.store';
import { TypeOrmAuditOutboxStore } from './typeorm-audit-outbox.store';
import {
  AUDIT_OUTBOX_STORE,
  AUDIT_STORE,
  AuditOutboxStore,
  AuditStore,
} from './audit.types';

/**
 * 稽核模組（E07 / F023 寫入 · F024 查詢）。
 *  - store/outbox 以 useFactory 建構（延遲連線）。
 *  - AuditWriterService＝共用寫入器（D 契約），匯出供下游 worktree（F020/F034/F037/F038…）注入。
 *  - 匯入 AuthModule（SessionGuard）、RbacModule（RolePermissionGuard）供 F024 查詢端點守門。
 *  - ScheduledAuditRetryService 提供 Outbox 補償重試（@Cron 由 AppModule ScheduleModule 掃描）。
 */
@Module({
  imports: [AuthModule, RbacModule],
  controllers: [AccessHistoryController],
  providers: [
    {
      provide: AUDIT_STORE,
      useFactory: (): AuditStore => new TypeOrmAuditStore(AppDataSource),
    },
    {
      provide: AUDIT_OUTBOX_STORE,
      useFactory: (): AuditOutboxStore => new TypeOrmAuditOutboxStore(AppDataSource),
    },
    {
      provide: AuditWriterService,
      useFactory: (outbox: AuditOutboxStore, store: AuditStore): AuditWriterService =>
        new AuditWriterService(outbox, store),
      inject: [AUDIT_OUTBOX_STORE, AUDIT_STORE],
    },
    ScheduledAuditRetryService,
  ],
  exports: [AuditWriterService],
})
export class AuditModule {}
