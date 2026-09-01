import { Module } from '@nestjs/common';
import { AppDataSource } from '../database/data-source';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { OrgDirectoryModule } from '../org-directory/org-directory.module';
import {
  ORG_UNIT_READ_STORE,
  OrgUnitReadStore,
} from '../org-directory/org-unit-read';
import { AccessHistoryController } from './access-history.controller';
import { AuditIdentityService } from './audit-identity.service';
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
 *  - AuditIdentityService＝`AUDIT_LOG` 身分快照六欄之**單一組裝點**（2026-09-01 delta），
 *    匯出供各稽核寫入端（change-history／ojt-progress／accounts／org-change-alert／lifecycle）
 *    注入；五個消費模組本就 import 本模組，故不需任何新的模組相依。
 *
 * ⚠ 本模組自 2026-09-01 起 import `OrgDirectoryModule`（`ORG_UNIT_READ_STORE`）——身分快照之
 *   部門／處室欄須查 ORG_UNIT。`OrgDirectoryModule` 只 import Auth／Rbac，不 import 本模組，
 *   故不構成模組循環（dep-cruiser `no-circular` 為 error 級 gate）。
 */
@Module({
  imports: [AuthModule, RbacModule, OrgDirectoryModule],
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
    {
      provide: AuditIdentityService,
      useFactory: (orgs: OrgUnitReadStore): AuditIdentityService =>
        new AuditIdentityService(orgs),
      inject: [ORG_UNIT_READ_STORE],
    },
    ScheduledAuditRetryService,
  ],
  exports: [AuditWriterService, AuditIdentityService],
})
export class AuditModule {}
