import { Module } from '@nestjs/common';
import { AppDataSource } from '../database/data-source';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { AuditModule } from '../audit/audit.module';
import { AuditWriterService } from '../audit/audit-writer.service';
import { ChangeHistoryController } from './change-history.controller';
import {
  DOCUMENT_CHANGE_LOG_STORE,
  DocumentChangeLogStore,
} from './document-change-log.store';
import { TypeOrmDocumentChangeLogStore } from './typeorm-document-change-log.store';
import {
  LIFECYCLE_CHANGE_LOG_STORE,
  LifecycleChangeLogStore,
} from './lifecycle-change-log.store';
import { TypeOrmLifecycleChangeLogStore } from './typeorm-lifecycle-change-log.store';
import {
  LIFECYCLE_SNAPSHOT_STORE,
  LifecycleSnapshotStore,
} from './lifecycle-snapshot.store';
import { TypeOrmLifecycleSnapshotStore } from './typeorm-lifecycle-snapshot.store';
import { DocumentChangeLogPublisher } from './document-change-log-publisher';
import { LifecycleChangeLogPublisher } from './lifecycle-change-log-publisher';
import { DocumentChangeHistoryService } from './document-change-history.service';
import { LifecycleChangeHistoryService } from './lifecycle-change-history.service';
import { DOCUMENT_NAME_LOOKUP, DocumentNameLookup } from './document-name-lookup';
import { TypeOrmDocumentNameLookup } from './typeorm-document-name-lookup';

/**
 * F037/F038 文件變更歷程模組（獨立後台功能，共用 prototype 23-change-history）。
 *  - 擁有 DOCUMENT_CHANGE_LOG / LIFECYCLE_CHANGE_LOG 之 store。
 *  - 匯出真實 publisher（DocumentChangeLogPublisher / LifecycleChangeLogPublisher）供 documents/lifecycle
 *    模組以 useExisting 覆寫其 *_CHANGE_PUBLISHER seam（決策 B）。
 *  - 查詢服務注入 AuditWriterService（AuditModule 匯出）記 CHANGE_LOG_VIEW / LIFECYCLE_CHANGELOG_VIEW。
 *  - store 以 useFactory 走 AppDataSource 單例（延遲連線）。
 */
@Module({
  imports: [AuthModule, RbacModule, AuditModule],
  controllers: [ChangeHistoryController],
  providers: [
    {
      provide: DOCUMENT_CHANGE_LOG_STORE,
      useFactory: (): DocumentChangeLogStore =>
        new TypeOrmDocumentChangeLogStore(AppDataSource),
    },
    {
      provide: LIFECYCLE_CHANGE_LOG_STORE,
      useFactory: (): LifecycleChangeLogStore =>
        new TypeOrmLifecycleChangeLogStore(AppDataSource),
    },
    {
      provide: LIFECYCLE_SNAPSHOT_STORE,
      useFactory: (): LifecycleSnapshotStore =>
        new TypeOrmLifecycleSnapshotStore(AppDataSource),
    },
    DocumentChangeLogPublisher,
    LifecycleChangeLogPublisher,
    {
      provide: DOCUMENT_NAME_LOOKUP,
      useFactory: (): DocumentNameLookup =>
        new TypeOrmDocumentNameLookup(AppDataSource),
    },
    {
      provide: DocumentChangeHistoryService,
      useFactory: (
        store: DocumentChangeLogStore,
        audit: AuditWriterService,
        docNames: DocumentNameLookup,
      ): DocumentChangeHistoryService =>
        new DocumentChangeHistoryService(store, audit, () => new Date(), docNames),
      inject: [DOCUMENT_CHANGE_LOG_STORE, AuditWriterService, DOCUMENT_NAME_LOOKUP],
    },
    {
      provide: LifecycleChangeHistoryService,
      useFactory: (
        store: LifecycleChangeLogStore,
        audit: AuditWriterService,
      ): LifecycleChangeHistoryService =>
        new LifecycleChangeHistoryService(store, audit, () => new Date()),
      inject: [LIFECYCLE_CHANGE_LOG_STORE, AuditWriterService],
    },
  ],
  // F038 新舊對照：LifecycleModule 之 LifecycleChangeDiffService 注入下列兩 store（單向依賴，避免循環）。
  exports: [
    DocumentChangeLogPublisher,
    LifecycleChangeLogPublisher,
    LIFECYCLE_CHANGE_LOG_STORE,
    LIFECYCLE_SNAPSHOT_STORE,
  ],
})
export class ChangeHistoryModule {}
