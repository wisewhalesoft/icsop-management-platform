import { Module } from '@nestjs/common';
import { AppDataSource } from '../database/data-source';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { AuditModule } from '../audit/audit.module';
import { AuditWriterService } from '../audit/audit-writer.service';
import { OrgChangeAlertController } from './org-change-alert.controller';
import { OrgChangeAlertService } from './org-change-alert.service';
import { OrgChangeAlertAutoResolveSubscriber } from './document-change-subscriber';
import { TypeOrmOrgChangeAlertStore } from './typeorm-org-change-alert.store';
import { OrgChangeAlertStore, ORG_CHANGE_ALERT_STORE } from './org-change-alert.types';

/**
 * F006 組織異動待確認提示模組。
 *  - store 以 useFactory 走 AppDataSource 單例（延遲連線，比照既有模組）。
 *  - 匯出 `OrgChangeAlertService` 供 OrgSyncModule（提示產生整合點＋KPI 端點）使用。
 *  - 匯出 `OrgChangeAlertAutoResolveSubscriber` 供 DocumentsModule 掛入
 *    `DOCUMENT_CHANGE_PUBLISHER` 之 fan-out（Route A 自動解除）。
 *  - 相依方向單向：本模組 → org-sync 型別（seam 契約定義於 org-sync.types），無反向 import。
 */
@Module({
  imports: [AuthModule, RbacModule, AuditModule],
  controllers: [OrgChangeAlertController],
  providers: [
    {
      provide: ORG_CHANGE_ALERT_STORE,
      useFactory: (): OrgChangeAlertStore => new TypeOrmOrgChangeAlertStore(AppDataSource),
    },
    {
      provide: OrgChangeAlertService,
      useFactory: (
        store: OrgChangeAlertStore,
        audit: AuditWriterService,
      ): OrgChangeAlertService => new OrgChangeAlertService(store, audit, () => new Date()),
      inject: [ORG_CHANGE_ALERT_STORE, AuditWriterService],
    },
    OrgChangeAlertAutoResolveSubscriber,
  ],
  exports: [OrgChangeAlertService, OrgChangeAlertAutoResolveSubscriber],
})
export class OrgChangeAlertModule {}
