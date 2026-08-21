import { Module } from '@nestjs/common';
import { AppDataSource } from '../database/data-source';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { OrgDirectoryModule } from '../org-directory/org-directory.module';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { DOCUMENT_STORE, DocumentStore } from './documents.store';
import { TypeOrmDocumentStore } from './typeorm-documents.store';
import { NODE_NAME_STORE, NodeNameStore } from './node-name.store';
import { TypeOrmNodeNameStore } from './typeorm-node-name.store';
import { LIFECYCLE_STORE, LifecycleStore } from '../lifecycle/lifecycle.store';
import { TypeOrmLifecycleStore } from '../lifecycle/typeorm-lifecycle.store';
import { DAG_STORE, DagStore } from '../lifecycle/dag.store';
import { TypeOrmDagStore } from '../lifecycle/typeorm-dag.store';
import { DOCUMENT_LINK_STORE, DocumentLinkStore } from './document-link.store';
import { TypeOrmDocumentLinkStore } from './typeorm-document-link.store';
import { DOCUMENT_CHANGE_PUBLISHER, DocumentChangePublisher } from './document-change-event';
import { CompositeDocumentChangePublisher } from './composite-document-change-publisher';
import { ChangeHistoryModule } from '../change-history/change-history.module';
import { DocumentChangeLogPublisher } from '../change-history/document-change-log-publisher';
import { ATTACHMENT_STORE, AttachmentStore } from '../attachments/attachments.store';
import { TypeOrmAttachmentStore } from '../attachments/typeorm-attachments.store';
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
    // F017 清單「檔案」欄之富化來源。以 store-token 於本模組自行建立（同 AppDataSource 單例），
    // 不匯入 AttachmentsModule，避免與附件列表（AttachmentsModule 需 DOCUMENT_STORE）形成循環相依。
    {
      provide: ATTACHMENT_STORE,
      useFactory: (): AttachmentStore => new TypeOrmAttachmentStore(AppDataSource),
    },
    // G-DOC-205/301 單筆檢視之節點名解析。反循環：於本模組自建 TypeOrm adapter（讀 LIFECYCLE_NODE），
    // 不匯入 LifecycleModule。
    {
      provide: NODE_NAME_STORE,
      useFactory: (): NodeNameStore => new TypeOrmNodeNameStore(AppDataSource),
    },
    // F017 AC-T40／AC-T45 子樹篩選（架構決策 C3）之唯讀查詢來源。反循環：於本模組自建
    // store 實例（同 AppDataSource 單例），**不匯入 LifecycleModule**——比照上方 ATTACHMENT_STORE／
    // NODE_NAME_STORE 之既有慣例，不建立模組級 DI 邊界。
    {
      provide: LIFECYCLE_STORE,
      useFactory: (): LifecycleStore => new TypeOrmLifecycleStore(AppDataSource),
    },
    {
      provide: DAG_STORE,
      useFactory: (): DagStore => new TypeOrmDagStore(AppDataSource),
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
