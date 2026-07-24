import { Module } from '@nestjs/common';
import { AppDataSource } from '../database/data-source';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { StorageModule } from '../storage/storage.module';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';
import { ATTACHMENT_STORE, AttachmentStore } from './attachments.store';
import { TypeOrmAttachmentStore } from './typeorm-attachments.store';
import { DOCUMENT_STORE, DocumentStore } from '../documents/documents.store';
import { TypeOrmDocumentStore } from '../documents/typeorm-documents.store';
import { DOCUMENT_CHANGE_PUBLISHER } from '../documents/document-change-event';
import { ChangeHistoryModule } from '../change-history/change-history.module';
import { DocumentChangeLogPublisher } from '../change-history/document-change-log-publisher';

/**
 * F016 附件模組。匯入 AuthModule（SessionGuard）、RbacModule（RolePermissionGuard）、
 * StorageModule（BLOB_STORE）。store 走 AppDataSource 單例（延遲連線）。
 *
 * DOCUMENT_STORE 於本模組自行以 useFactory 建立（同 AppDataSource 單例），供附件列表之
 * 資源存在性檢查；不匯入 DocumentsModule，避免與 F017 清單富化（DocumentsModule 需
 * ATTACHMENT_STORE）形成模組循環相依。
 */
@Module({
  imports: [AuthModule, RbacModule, StorageModule, ChangeHistoryModule],
  controllers: [AttachmentsController],
  providers: [
    {
      provide: ATTACHMENT_STORE,
      useFactory: (): AttachmentStore => new TypeOrmAttachmentStore(AppDataSource),
    },
    {
      provide: DOCUMENT_STORE,
      useFactory: (): DocumentStore => new TypeOrmDocumentStore(AppDataSource),
    },
    // F037 附件替換 → 發變更事件至 DOCUMENT_CHANGE_LOG（reuse ChangeHistoryModule 匯出之 publisher；
    // 不含 org-alert 訂閱者——附件替換非組織欄位異動）。ChangeHistoryModule 不 import 本模組，無循環。
    { provide: DOCUMENT_CHANGE_PUBLISHER, useExisting: DocumentChangeLogPublisher },
    AttachmentsService,
  ],
  // AttachmentsService 匯出：F020 浮水印模組經 getAttachmentRef seam 讀原始 ICSOP_PDF 來源。
  exports: [AttachmentsService],
})
export class AttachmentsModule {}
