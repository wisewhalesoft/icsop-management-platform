import { Module } from '@nestjs/common';
import { AppDataSource } from '../database/data-source';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { OrgDirectoryModule } from '../org-directory/org-directory.module';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { DOCUMENT_STORE, DocumentStore } from './documents.store';
import { TypeOrmDocumentStore } from './typeorm-documents.store';
import { DOCUMENT_LINK_STORE, DocumentLinkStore } from './document-link.store';
import { TypeOrmDocumentLinkStore } from './typeorm-document-link.store';
import { DOCUMENT_CHANGE_PUBLISHER } from './document-change-event';
import { ChangeHistoryModule } from '../change-history/change-history.module';
import { DocumentChangeLogPublisher } from '../change-history/document-change-log-publisher';

/**
 * ICSOP 文件模組（E04）。匯入 AuthModule（SessionGuard）、RbacModule（RolePermissionGuard）。
 * store 以 useFactory 走 AppDataSource 單例（延遲連線）。
 * 本增量：建立 F010／清單 F017／狀態 F012。當責室長 F014、連結 F015、附件 F016、編輯 F011 為後續增量。
 */
@Module({
  imports: [AuthModule, RbacModule, OrgDirectoryModule, ChangeHistoryModule],
  controllers: [DocumentsController],
  providers: [
    {
      provide: DOCUMENT_STORE,
      useFactory: (): DocumentStore => new TypeOrmDocumentStore(AppDataSource),
    },
    {
      provide: DOCUMENT_LINK_STORE,
      useFactory: (): DocumentLinkStore => new TypeOrmDocumentLinkStore(AppDataSource),
    },
    // 決策 B（F037）：以真實 publisher 覆寫 seam，將 DocumentChangedEvent 持久化為 DOCUMENT_CHANGE_LOG。
    { provide: DOCUMENT_CHANGE_PUBLISHER, useExisting: DocumentChangeLogPublisher },
    DocumentsService,
  ],
})
export class DocumentsModule {}
