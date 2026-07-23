import { Module } from '@nestjs/common';
import { AppDataSource } from '../database/data-source';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { DOCUMENT_STORE, DocumentStore } from './documents.store';
import { TypeOrmDocumentStore } from './typeorm-documents.store';
import {
  DOCUMENT_CHANGE_PUBLISHER,
  NoopDocumentChangePublisher,
} from './document-change-event';

/**
 * ICSOP 文件模組（E04）。匯入 AuthModule（SessionGuard）、RbacModule（RolePermissionGuard）。
 * store 以 useFactory 走 AppDataSource 單例（延遲連線）。
 * 本增量：建立 F010／清單 F017／狀態 F012。當責室長 F014、連結 F015、附件 F016、編輯 F011 為後續增量。
 */
@Module({
  imports: [AuthModule, RbacModule],
  controllers: [DocumentsController],
  providers: [
    {
      provide: DOCUMENT_STORE,
      useFactory: (): DocumentStore => new TypeOrmDocumentStore(AppDataSource),
    },
    // 決策 A：預設 no-op 綁定；rag/F037 併回後可覆寫為真實變更事件消費者。
    { provide: DOCUMENT_CHANGE_PUBLISHER, useClass: NoopDocumentChangePublisher },
    DocumentsService,
  ],
})
export class DocumentsModule {}
