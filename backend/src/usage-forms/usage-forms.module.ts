import { Module } from '@nestjs/common';
import { AppDataSource } from '../database/data-source';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { StorageModule } from '../storage/storage.module';
import { UsageFormsController } from './usage-forms.controller';
import { UsageFormsService } from './usage-forms.service';
import { AUDIT_RECORDER, FORM_POOL_STORE } from './usage-forms.store';
import { TypeOrmFormPoolStore } from './typeorm-usage-forms.store';
import { LoggingAuditRecorder } from './logging-audit-recorder';

/**
 * F018 使用表單模組。匯入 AuthModule / RbacModule / StorageModule。
 * 稽核收集器目前為 LoggingAuditRecorder 佔位（AUDIT_LOG / F023 未接線）。
 */
@Module({
  imports: [AuthModule, RbacModule, StorageModule],
  controllers: [UsageFormsController],
  providers: [
    {
      provide: FORM_POOL_STORE,
      useFactory: () => new TypeOrmFormPoolStore(AppDataSource),
    },
    {
      provide: AUDIT_RECORDER,
      useClass: LoggingAuditRecorder,
    },
    UsageFormsService,
  ],
})
export class UsageFormsModule {}
