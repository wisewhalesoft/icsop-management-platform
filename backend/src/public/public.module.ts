import { Module } from '@nestjs/common';
import { AppDataSource } from '../database/data-source';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { OrgDirectoryModule } from '../org-directory/org-directory.module';
import { NameResolutionService } from '../org-directory/name-resolution.service';
import { AttachmentsModule } from '../attachments/attachments.module';
import { AttachmentsService } from '../attachments/attachments.service';
import { StorageModule } from '../storage/storage.module';
import { BLOB_STORE, BlobStore } from '../storage/blob-store';
import { AuditModule } from '../audit/audit.module';
import { AuditWriterService } from '../audit/audit-writer.service';
import { TypeOrmOjtCompletionReader } from '../documents/typeorm-ojt-completion.reader';
import { PUBLIC_DOCUMENT_STORE, PublicDocumentStore } from './public-documents.store';
import { TypeOrmPublicDocumentStore } from './typeorm-public-documents.store';
import {
  ORG_NAME_RESOLVER,
  OrgNameResolver,
  PublicDocumentsService,
} from './public-documents.service';
import {
  DETAIL_NAME_RESOLVER,
  DetailNameResolver,
  PublicDocumentDetailService,
} from './public-document-detail.service';
import { PublicDocumentsController } from './public-documents.controller';
import {
  WATERMARK_PDF_SOURCE,
  WatermarkPdfSource,
  WatermarkService,
} from './watermark.service';
import {
  WATERMARK_BURNER,
  WATERMARK_ORG_LOOKUP,
  WatermarkBurnerService,
  WatermarkOrgLookup,
} from './watermark-burner.service';
import { WatermarkBurnerModule } from './watermark-burner.module';
import { WatermarkController } from './watermark.controller';
import { PdfBurner, PDF_BURNER } from './pdf-burner';
import { AttachmentPdfSource } from './typeorm-watermark.sources';

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
    // 🔴 §11.5：燒錄協作點改由獨立模組提供（WATERMARK_ORG_LOOKUP／PDF_BURNER／
    // WATERMARK_DOC_META 三個 provider 自本模組移出，改由 import 取得）。
    WatermarkBurnerModule,
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
    // ── G-PUB-020 前台文件詳情 ──（名稱解析重用 NameResolutionService：org + person）。
    { provide: DETAIL_NAME_RESOLVER, useExisting: NameResolutionService },
    {
      provide: PublicDocumentDetailService,
      /**
       * 🔴 F042 `AC-24`：第 4 個引數為 OJT 完成事實之唯讀窄 port。
       * **反循環**：本模組自建 `TypeOrmOjtCompletionReader`（同 `AppDataSource` 單例），
       * **不 import** `DocumentsModule`／`OjtProgressModule`——比照本模組既有之窄 adapter 慣例。
       * ⚠ **漏掉這個引數不會有任何測試轉紅**：service 對它是選填、缺之即降級為空清單，
       * 前台會永遠顯示「尚無任何使用單位完成 OJT」而不報錯（本 repo 已記錄之
       * 「宣告了欄位卻沒接線、值人間蒸發」同型缺陷）。
       */
      useFactory: (store: PublicDocumentStore, names: DetailNameResolver) =>
        new PublicDocumentDetailService(
          store,
          names,
          () => new Date(),
          new TypeOrmOjtCompletionReader(AppDataSource),
        ),
      inject: [PUBLIC_DOCUMENT_STORE, DETAIL_NAME_RESOLVER],
    },
    // ── F020 浮水印 ──
    {
      provide: WATERMARK_PDF_SOURCE,
      useFactory: (attachments: AttachmentsService, blob: BlobStore): WatermarkPdfSource =>
        new AttachmentPdfSource(attachments, blob),
      inject: [AttachmentsService, BLOB_STORE],
    },
    /**
     * 🔴 §11.5：改為**組合** —— `WatermarkService` 之 buildSnapshot／burnIfPdf／
     * assertDocumentVisible 一律委派給 `WATERMARK_BURNER`（模組單例），三者不再有第二份實作。
     *
     * 🔴 **啟動期 fail-fast**：`useFactory` 之 `inject` 陣列不含 `@Optional()` 語意——
     * `WATERMARK_BURNER` 若解析不到，Nest 於 `app.listen()` 之前即拋
     * `UnknownDependenciesException`（`useFactory` 之注入預設即為必要）。
     */
    {
      provide: WatermarkService,
      useFactory: (
        org: WatermarkOrgLookup,
        pdf: WatermarkPdfSource,
        burner: PdfBurner,
        audit: AuditWriterService,
        burnerSvc: WatermarkBurnerService,
      ) =>
        new WatermarkService(org, pdf, burner, audit, undefined, () => new Date(), burnerSvc),
      inject: [
        WATERMARK_ORG_LOOKUP,
        WATERMARK_PDF_SOURCE,
        PDF_BURNER,
        AuditWriterService,
        WATERMARK_BURNER,
      ],
    },
  ],
  // F036 循環樹狀圖預覽逐字重用浮水印快照組裝（LifecycleModule imports PublicModule）。
  exports: [WatermarkService],
})
export class PublicModule {}
