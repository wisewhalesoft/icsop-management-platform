import { Module } from '@nestjs/common';
import { AppDataSource } from '../database/data-source';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { OrgDirectoryModule } from '../org-directory/org-directory.module';
import { NameResolutionService } from '../org-directory/name-resolution.service';
import { ORG_UNIT_READ_STORE } from '../org-directory/org-unit-read';
import { AttachmentsModule } from '../attachments/attachments.module';
import { AttachmentsService } from '../attachments/attachments.service';
import { StorageModule } from '../storage/storage.module';
import { BLOB_STORE, BlobStore } from '../storage/blob-store';
import { AuditModule } from '../audit/audit.module';
import { AuditWriterService } from '../audit/audit-writer.service';
import { PUBLIC_DOCUMENT_STORE, PublicDocumentStore } from './public-documents.store';
import { TypeOrmPublicDocumentStore } from './typeorm-public-documents.store';
import {
  ORG_NAME_RESOLVER,
  OrgNameResolver,
  PublicDocumentsService,
} from './public-documents.service';
import { PublicDocumentsController } from './public-documents.controller';
import {
  WATERMARK_DOC_META,
  WATERMARK_ORG_LOOKUP,
  WATERMARK_PDF_SOURCE,
  WatermarkDocMeta,
  WatermarkOrgLookup,
  WatermarkPdfSource,
  WatermarkService,
} from './watermark.service';
import { WatermarkController } from './watermark.controller';
import { PDF_BURNER, PdfBurner, PdfLibBurner } from './pdf-burner';
import { AttachmentPdfSource, TypeOrmDocMeta } from './typeorm-watermark.sources';

/**
 * 前台瀏覽模組（E06 / F019 清單、F020 浮水印）。
 *  - 讀取路徑獨立於 documents.service（避免撞 doc-edit worktree）；唯讀組合既有資料。
 *  - 名稱解析／組織查找重用 org-foundation（OrgDirectoryModule 匯出 NameResolutionService /
 *    ORG_UNIT_READ_STORE）；稽核重用 AuditModule（AuditWriterService）；原始 PDF 經 AttachmentsService
 *    seam + StorageModule（BLOB_STORE）代理讀取。
 *  - 守門：AuthModule（SessionGuard）+ RbacModule（RolePermissionGuard）。
 *  - store/來源以 useFactory 延遲連線（沿用 AppDataSource 單例）。
 */
@Module({
  imports: [
    AuthModule,
    RbacModule,
    OrgDirectoryModule,
    AttachmentsModule,
    StorageModule,
    AuditModule,
  ],
  controllers: [PublicDocumentsController, WatermarkController],
  providers: [
    // ── F019 清單 ──
    {
      provide: PUBLIC_DOCUMENT_STORE,
      useFactory: (): PublicDocumentStore => new TypeOrmPublicDocumentStore(AppDataSource),
    },
    { provide: ORG_NAME_RESOLVER, useExisting: NameResolutionService },
    {
      provide: PublicDocumentsService,
      useFactory: (store: PublicDocumentStore, names: OrgNameResolver) =>
        new PublicDocumentsService(store, names, () => new Date()),
      inject: [PUBLIC_DOCUMENT_STORE, ORG_NAME_RESOLVER],
    },
    // ── F020 浮水印 ──
    { provide: WATERMARK_ORG_LOOKUP, useExisting: ORG_UNIT_READ_STORE },
    { provide: PDF_BURNER, useFactory: (): PdfBurner => new PdfLibBurner() },
    {
      provide: WATERMARK_PDF_SOURCE,
      useFactory: (attachments: AttachmentsService, blob: BlobStore): WatermarkPdfSource =>
        new AttachmentPdfSource(attachments, blob),
      inject: [AttachmentsService, BLOB_STORE],
    },
    {
      provide: WATERMARK_DOC_META,
      useFactory: (): WatermarkDocMeta => new TypeOrmDocMeta(AppDataSource),
    },
    {
      provide: WatermarkService,
      useFactory: (
        org: WatermarkOrgLookup,
        pdf: WatermarkPdfSource,
        burner: PdfBurner,
        audit: AuditWriterService,
        docMeta: WatermarkDocMeta,
      ) => new WatermarkService(org, pdf, burner, audit, docMeta, () => new Date()),
      inject: [
        WATERMARK_ORG_LOOKUP,
        WATERMARK_PDF_SOURCE,
        PDF_BURNER,
        AuditWriterService,
        WATERMARK_DOC_META,
      ],
    },
  ],
})
export class PublicModule {}
