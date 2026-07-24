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
import { DOCUMENT_CHANGE_PUBLISHER, DocumentChangePublisher } from './document-change-event';
import { CompositeDocumentChangePublisher } from './composite-document-change-publisher';
import { ChangeHistoryModule } from '../change-history/change-history.module';
import { DocumentChangeLogPublisher } from '../change-history/document-change-log-publisher';
import { OrgChangeAlertModule } from '../org-change-alert/org-change-alert.module';
import { OrgChangeAlertAutoResolveSubscriber } from '../org-change-alert/document-change-subscriber';

/**
 * ICSOP 文件模組（E04）。匯入 AuthModule（SessionGuard）、RbacModule（RolePermissionGuard）。
 * store 以 useFactory 走 AppDataSource 單例（延遲連線）。
 * 本增量：建立 F010／清單 F017／狀態 F012。當責室長 F014、連結 F015、附件 F016、編輯 F011 為後續增量。
 */
@Module({
  imports: [
    AuthModule,
    RbacModule,
    OrgDirectoryModule,
    ChangeHistoryModule,
    OrgChangeAlertModule,
  ],
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
    // 決策 B（F037）＋F006：seam 由單一綁定改為 fan-out（Composite）——
    //  1) DocumentChangeLogPublisher：持久化為 DOCUMENT_CHANGE_LOG（變更歷程）。
    //  2) OrgChangeAlertAutoResolveSubscriber：Route A 自動解除對應之組織異動待確認提示。
    // 任一訂閱者失敗不影響其他者，亦不阻斷文件儲存（見 CompositeDocumentChangePublisher）。
    {
      provide: DOCUMENT_CHANGE_PUBLISHER,
      useFactory: (
        changeLog: DocumentChangeLogPublisher,
        alerts: OrgChangeAlertAutoResolveSubscriber,
      ): DocumentChangePublisher =>
        new CompositeDocumentChangePublisher([changeLog, alerts]),
      inject: [DocumentChangeLogPublisher, OrgChangeAlertAutoResolveSubscriber],
    },
    DocumentsService,
  ],
})
export class DocumentsModule {}
