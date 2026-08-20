import { Module } from '@nestjs/common';
import { AppDataSource } from '../database/data-source';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { StorageModule } from '../storage/storage.module';
import { AuditModule } from '../audit/audit.module';
import { OrgDirectoryModule } from '../org-directory/org-directory.module';
import { NameResolutionService } from '../org-directory/name-resolution.service';
import { WatermarkBurnerModule } from '../public/watermark-burner.module';
import {
  WATERMARK_BURNER,
  WatermarkBurnerService,
} from '../public/watermark-burner.service';
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
  /**
   * 🔴 §11.5（v1.9）：燒錄協作點由 `PublicModule` 改為 **`WatermarkBurnerModule`**（零消費者相依
   * 之獨立模組）。反循環自本版起是**結構性**保證而非「查過 imports 清單」之紀律性保證——
   * `WatermarkBurnerModule` 只 import `OrgDirectoryModule`，不可能 import 回本模組。
   */
  imports: [
    AuthModule,
    RbacModule,
    StorageModule,
    AuditModule,
    OrgDirectoryModule,
    WatermarkBurnerModule,
  ],
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
    // 🔴 §11.5：由 `PublicModule` 之 `WatermarkService` 改為 `WatermarkBurnerModule` 之
    // `WatermarkBurnerService`——不再需要間接經過 `WatermarkService`（本模組從不使用其
    // `view`／`download` 等前台編排能力），且解除對 `PublicModule` 之整體相依。
    { provide: WATERMARK_BURNER, useExisting: WatermarkBurnerService },
    AppendicesService,
  ],
  exports: [AppendicesService],
})
export class AppendicesModule {}
