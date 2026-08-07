import { Module } from '@nestjs/common';
import { AppDataSource } from '../database/data-source';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { StorageModule } from '../storage/storage.module';
import { AuditModule } from '../audit/audit.module';
import { OrgDirectoryModule } from '../org-directory/org-directory.module';
import { NameResolutionService } from '../org-directory/name-resolution.service';
import { AppendicesController } from './appendices.controller';
import { AppendicesService } from './appendices.service';
import {
  APPENDIX_POOL_STORE,
  AUDIT_RECORDER,
  DOCUMENT_EXISTENCE_CHECKER,
  UPLOADER_DIRECTORY,
  UPLOADER_ORG_RESOLVER,
} from './appendices.store';
import { TypeOrmAppendixPoolStore } from './typeorm-appendices.store';
import { TypeOrmUploaderDirectory } from './typeorm-uploader-directory';
import { TypeOrmDocumentExistenceChecker } from './typeorm-document-existence.checker';
import { AuditWriterRecorder } from './audit-writer-recorder.adapter';

/**
 * F039 附錄管理模組（architecture-spec §3.2 AppendicesModule／§3.6）。
 * APPENDIX_POOL／DOC_APPENDIX 之唯一寫入路徑；與 AttachmentModule（F016/F018）刻意獨立，
 * 僅共用 StorageAbstraction／file-rules／document-asset-authz／RBAC 矩陣／稽核契約等跨切基礎設施。
 *
 * 反循環：documentId 存在性檢查與上傳者名冊皆以自建窄 adapter 直接讀實體，
 * 不匯入 DocumentsModule／AccountsModule。
 */
@Module({
  imports: [AuthModule, RbacModule, StorageModule, AuditModule, OrgDirectoryModule],
  controllers: [AppendicesController],
  providers: [
    {
      provide: APPENDIX_POOL_STORE,
      useFactory: () => new TypeOrmAppendixPoolStore(AppDataSource),
    },
    {
      provide: AUDIT_RECORDER,
      useClass: AuditWriterRecorder,
    },
    {
      provide: DOCUMENT_EXISTENCE_CHECKER,
      useFactory: () => new TypeOrmDocumentExistenceChecker(AppDataSource),
    },
    {
      provide: UPLOADER_DIRECTORY,
      useFactory: () => new TypeOrmUploaderDirectory(AppDataSource),
    },
    { provide: UPLOADER_ORG_RESOLVER, useExisting: NameResolutionService },
    AppendicesService,
  ],
  exports: [AppendicesService],
})
export class AppendicesModule {}
