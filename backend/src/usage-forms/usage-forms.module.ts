import { Module } from '@nestjs/common';
import { AppDataSource } from '../database/data-source';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { StorageModule } from '../storage/storage.module';
import { AuditModule } from '../audit/audit.module';
import { OrgDirectoryModule } from '../org-directory/org-directory.module';
import { NameResolutionService } from '../org-directory/name-resolution.service';
import { PublicModule } from '../public/public.module';
import { WatermarkService } from '../public/watermark.service';
import { FRONT_BURNER } from '../appendices/appendices.service';
import { UsageFormsController } from './usage-forms.controller';
import { UsageFormsService } from './usage-forms.service';
import {
  AUDIT_RECORDER,
  FORM_POOL_STORE,
  UPLOADER_DIRECTORY,
  UPLOADER_ORG_RESOLVER,
} from './usage-forms.store';
import { TypeOrmFormPoolStore } from './typeorm-usage-forms.store';
import { TypeOrmUploaderDirectory } from './typeorm-uploader-directory';
import { AuditWriterRecorder } from './audit-writer-recorder.adapter';

/**
 * F018 使用表單模組。匯入 AuthModule / RbacModule / StorageModule / AuditModule。
 * 調閱稽核收集器＝AuditWriterRecorder（轉接真實 AuditWriterService，落地 AUDIT_LOG，經 Outbox 非阻斷）。
 */
@Module({
  /** `PublicModule` 提供前台協作點 `WatermarkService`（理由與反循環說明同 `AppendicesModule`）。 */
  imports: [AuthModule, RbacModule, StorageModule, AuditModule, OrgDirectoryModule, PublicModule],
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
    // G-ADM-024 上傳者名冊（accountId→姓名/orgCode）＋部門名解析（reuse NameResolutionService）。
    {
      provide: UPLOADER_DIRECTORY,
      useFactory: () => new TypeOrmUploaderDirectory(AppDataSource),
    },
    { provide: UPLOADER_ORG_RESOLVER, useExisting: NameResolutionService },
    /** F018 `AC-D11`／`AC-D22` ③：前台使用表單之燒錄與可見性判定（同一 token，說明見附錄模組）。 */
    { provide: FRONT_BURNER, useExisting: WatermarkService },
    UsageFormsService,
  ],
})
export class UsageFormsModule {}
