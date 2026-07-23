import { Module } from '@nestjs/common';
import { AppDataSource } from '../database/data-source';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { StorageModule } from '../storage/storage.module';
import { AuditModule } from '../audit/audit.module';
import { UsageFormsController } from './usage-forms.controller';
import { UsageFormsService } from './usage-forms.service';
import { AUDIT_RECORDER, FORM_POOL_STORE } from './usage-forms.store';
import { TypeOrmFormPoolStore } from './typeorm-usage-forms.store';
import { AuditWriterRecorder } from './audit-writer-recorder.adapter';

/**
 * F018 使用表單模組。匯入 AuthModule / RbacModule / StorageModule / AuditModule。
 * 調閱稽核收集器＝AuditWriterRecorder（轉接真實 AuditWriterService，落地 AUDIT_LOG，經 Outbox 非阻斷）。
 */
@Module({
  imports: [AuthModule, RbacModule, StorageModule, AuditModule],
  controllers: [UsageFormsController],
  providers: [
    {
      provide: FORM_POOL_STORE,
      useFactory: () => new TypeOrmFormPoolStore(AppDataSource),
    },
    {
      provide: AUDIT_RECORDER,
      useClass: AuditWriterRecorder,
    },
    UsageFormsService,
  ],
})
export class UsageFormsModule {}
