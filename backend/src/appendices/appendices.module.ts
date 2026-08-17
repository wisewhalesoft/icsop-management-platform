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
import { AppendicesController } from './appendices.controller';
import { AppendicesService, FRONT_BURNER } from './appendices.service';
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
  /**
   * 🔴 `PublicModule` 提供前台協作點 `WatermarkService`（燒錄＋F041 可見性判定）。
   * 反循環無虞：`PublicModule` 之 imports 為 Auth／Rbac／OrgDirectory／Attachments／Storage／Audit，
   * **不含**本模組（唯一 import 本模組者為 `AppModule`）。
   */
  imports: [AuthModule, RbacModule, StorageModule, AuditModule, OrgDirectoryModule, PublicModule],
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
    /**
     * 🔴 F020 `AC-D1`／F039 `AC-D1`：前台附錄下載之**燒錄與可見性判定**協作點。
     * 此前本 token **從未被任何模組提供** ⇒ `frontBurner` 恆為 `undefined` ⇒ 前台附錄一律回
     * 未燒錄之原始位元組、`watermarkSnapshot` 恆為 `null`。單元測試以位置參數自建 fake burner，
     * 故該缺口在測試層完全不可見（`@Optional()` 的代價）。
     */
    { provide: FRONT_BURNER, useExisting: WatermarkService },
    AppendicesService,
  ],
  exports: [AppendicesService],
})
export class AppendicesModule {}
