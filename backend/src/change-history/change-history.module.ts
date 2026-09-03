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
import { LIFECYCLE_DISPLAY_NAMES, LifecycleDisplayNames } from './lifecycle-display-names';
import { TypeOrmLifecycleDisplayNames } from './typeorm-lifecycle-display-names';
import {
  BUSINESS_CATEGORY_CHANGE_LOG_STORE,
  BusinessCategoryChangeLogStore,
} from './business-category-change-log.store';
import { TypeOrmBusinessCategoryChangeLogStore } from './typeorm-business-category-change-log.store';
import {
  BUSINESS_CATEGORY_SNAPSHOT_STORE,
  BusinessCategorySnapshotStore,
} from './business-category-snapshot.store';
import { TypeOrmBusinessCategorySnapshotStore } from './typeorm-business-category-snapshot.store';
import { BusinessCategoryChangeLogPublisher } from './business-category-change-log-publisher';
import { BusinessCategoryChangeHistoryService } from './business-category-change-history.service';
import {
  BUSINESS_CATEGORY_DISPLAY_NAMES,
  BusinessCategoryDisplayNames,
} from './business-category-display-names';
import { TypeOrmBusinessCategoryDisplayNames } from './typeorm-business-category-display-names';

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
      // F038 匯出之「循環別」欄需當前顯示名稱；以獨立 token 自建 adapter，維持與 LifecycleModule 之單向依賴。
      provide: LIFECYCLE_DISPLAY_NAMES,
      useFactory: (): LifecycleDisplayNames => new TypeOrmLifecycleDisplayNames(AppDataSource),
    },
    {
      provide: LifecycleChangeHistoryService,
      useFactory: (
        store: LifecycleChangeLogStore,
        audit: AuditWriterService,
        names: LifecycleDisplayNames,
      ): LifecycleChangeHistoryService =>
        new LifecycleChangeHistoryService(store, audit, () => new Date(), names),
      inject: [LIFECYCLE_CHANGE_LOG_STORE, AuditWriterService, LIFECYCLE_DISPLAY_NAMES],
    },
    // ── F043 第三組資源：業務/功能類別結構變更歷程（決策 E1 之兩張平行表）──────────
    {
      provide: BUSINESS_CATEGORY_CHANGE_LOG_STORE,
      useFactory: (): BusinessCategoryChangeLogStore =>
        new TypeOrmBusinessCategoryChangeLogStore(AppDataSource),
    },
    {
      provide: BUSINESS_CATEGORY_SNAPSHOT_STORE,
      useFactory: (): BusinessCategorySnapshotStore =>
        new TypeOrmBusinessCategorySnapshotStore(AppDataSource),
    },
    BusinessCategoryChangeLogPublisher,
    {
      // `AC-42` 匯出之「業務/功能類別」欄需當前顯示名稱；以獨立 token 自建唯讀 adapter，
      // 維持與 `BusinessCategoriesModule` 之**單向依賴**（反循環，理由逐字同 LIFECYCLE 側）。
      provide: BUSINESS_CATEGORY_DISPLAY_NAMES,
      useFactory: (): BusinessCategoryDisplayNames =>
        new TypeOrmBusinessCategoryDisplayNames(AppDataSource),
    },
    {
      provide: BusinessCategoryChangeHistoryService,
      useFactory: (
        store: BusinessCategoryChangeLogStore,
        audit: AuditWriterService,
        names: BusinessCategoryDisplayNames,
      ): BusinessCategoryChangeHistoryService =>
        new BusinessCategoryChangeHistoryService(store, audit, () => new Date(), names),
      inject: [
        BUSINESS_CATEGORY_CHANGE_LOG_STORE,
        AuditWriterService,
        BUSINESS_CATEGORY_DISPLAY_NAMES,
      ],
    },
  ],
  // F038 新舊對照：LifecycleModule 之 LifecycleChangeDiffService 注入下列兩 store（單向依賴，避免循環）。
  exports: [
    DocumentChangeLogPublisher,
    LifecycleChangeLogPublisher,
    LIFECYCLE_CHANGE_LOG_STORE,
    LIFECYCLE_SNAPSHOT_STORE,
    // F043 新舊對照：`BusinessCategoriesModule` 之 `BusinessCategoryChangeDiffService` 注入
    // 下列兩 store，且以 `useExisting` 覆寫其 publisher seam（**單向依賴**，避免循環）。
    BusinessCategoryChangeLogPublisher,
    BUSINESS_CATEGORY_CHANGE_LOG_STORE,
    BUSINESS_CATEGORY_SNAPSHOT_STORE,
  ],
})
export class ChangeHistoryModule {}
