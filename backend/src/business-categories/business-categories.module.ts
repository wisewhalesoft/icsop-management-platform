import { Module } from '@nestjs/common';
import { AppDataSource } from '../database/data-source';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { AuditModule } from '../audit/audit.module';
import { AuditWriterService } from '../audit/audit-writer.service';
import { AuditIdentityService } from '../audit/audit-identity.service';
import { PublicModule } from '../public/public.module';
import { WatermarkService } from '../public/watermark.service';
import { PDF_BURNER, PdfBurner, PdfLibBurner } from '../public/pdf-burner';
import { LifecycleWatermarkBuilder } from '../lifecycle/lifecycle-watermark';
import { LifecycleTreePdfRenderer, PdfLibTreeRenderer } from '../lifecycle/lifecycle-tree-pdf';
import {
  LifecycleChangeHistoryPdfRenderer,
  PdfLibChangeHistoryTreeRenderer,
} from '../lifecycle/lifecycle-change-history-pdf';
import { ChangeHistoryModule } from '../change-history/change-history.module';
import { BusinessCategoryChangeLogPublisher } from '../change-history/business-category-change-log-publisher';
import {
  BUSINESS_CATEGORY_CHANGE_LOG_STORE,
  BusinessCategoryChangeLogStore,
} from '../change-history/business-category-change-log.store';
import {
  BUSINESS_CATEGORY_SNAPSHOT_STORE,
  BusinessCategorySnapshotStore,
} from '../change-history/business-category-snapshot.store';
import { BusinessCategoryController } from './business-category.controller';
import { BusinessCategoryService } from './business-category.service';
import { BUSINESS_CATEGORY_STORE, BusinessCategoryStore } from './business-category.store';
import { TypeOrmBusinessCategoryStore } from './typeorm-business-category.store';
import { BusinessCategoryDagController } from './business-category-dag.controller';
import { BusinessCategoryDagService } from './business-category-dag.service';
import {
  BUSINESS_CATEGORY_DAG_STORE,
  BusinessCategoryDagStore,
} from './business-category-dag.store';
import { TypeOrmBusinessCategoryDagStore } from './typeorm-business-category-dag.store';
import { BusinessCategoryDocsController } from './business-category-docs.controller';
import { BusinessCategoryDocsService } from './business-category-docs.service';
import {
  BUSINESS_CATEGORY_DOCS_STORE,
  BusinessCategoryDocsStore,
} from './business-category-docs.store';
import { TypeOrmBusinessCategoryDocsStore } from './typeorm-business-category-docs.store';
import {
  BUSINESS_CATEGORY_CHANGE_PUBLISHER,
  BusinessCategoryChangePublisher,
} from './business-category-change-event';
import { BusinessCategoryPreviewController } from './business-category-preview.controller';
import {
  BUSINESS_CATEGORY_TREE_PDF_RENDERER,
  BUSINESS_CATEGORY_WATERMARK_BUILDER,
  BusinessCategoryTreePreviewService,
} from './business-category-preview.service';
import { BusinessCategoryChangeDiffController } from './business-category-change-diff.controller';
import {
  BUSINESS_CATEGORY_CHANGE_HISTORY_PDF_RENDERER,
  BusinessCategoryChangeDiffService,
} from './business-category-change-diff.service';
import { PublicBusinessCategoryController } from './public-business-category.controller';
import { PublicBusinessCategoryService } from './public-business-category.service';
import {
  PUBLIC_BUSINESS_CATEGORY_STORE,
  PublicBusinessCategoryStore,
} from './public-business-category.store';
import { TypeOrmPublicBusinessCategoryStore } from './typeorm-public-business-category.store';

/**
 * F043 業務/功能類別管理模組（E12 / US-106～108）。
 *
 * 🔴 **本 feature 自成一個 bounded context**（architecture-spec §14.2）：與循環管理**結構同構、
 * 業務獨立**之第二套骨架，故新增獨立模組而非塞進 `LifecycleModule`（後者會製造「循環管理模組裡
 * 混著非循環的東西」之認知負擔，且違反 `AC-48`／`AC-49` 之「淨新增、零漣漪」精神）。
 *
 * 🔴 **不 `imports: [LifecycleModule]`**：對 lifecycle 之重用一律為**純函式／純類別之路徑 import**
 * （`dag-cycle`／`lifecycle-tree-layout`／`lifecycle-subcategory`／PDF renderer），
 * NestJS 之模組相依圖只看 `@Module` metadata，不看 TS 檔案層的 import ⇒ 結構上不可能產生循環相依。
 *
 * 依賴方向：`BusinessCategoriesModule → ChangeHistoryModule`（單向；後者以獨立 token 自建
 * 唯讀 display-name adapter，不反向 import 本模組）。
 */
@Module({
  imports: [AuthModule, RbacModule, AuditModule, PublicModule, ChangeHistoryModule],
  controllers: [
    BusinessCategoryController,
    BusinessCategoryDagController,
    BusinessCategoryDocsController,
    BusinessCategoryPreviewController,
    BusinessCategoryChangeDiffController,
    PublicBusinessCategoryController,
  ],
  providers: [
    // ── §甲 類別池 CRUD ──
    {
      provide: BUSINESS_CATEGORY_STORE,
      useFactory: (): BusinessCategoryStore => new TypeOrmBusinessCategoryStore(AppDataSource),
    },
    {
      provide: BusinessCategoryService,
      useFactory: (
        store: BusinessCategoryStore,
        audit: AuditWriterService,
        identity: AuditIdentityService,
      ): BusinessCategoryService =>
        new BusinessCategoryService(store, audit, () => new Date(), identity),
      inject: [BUSINESS_CATEGORY_STORE, AuditWriterService, AuditIdentityService],
    },
    // ── §乙 DAG 節點／邊 ──
    {
      provide: BUSINESS_CATEGORY_DAG_STORE,
      useFactory: (): BusinessCategoryDagStore =>
        new TypeOrmBusinessCategoryDagStore(AppDataSource),
    },
    // §戊：注入真實 publisher（`ChangeHistoryModule` 匯出）→ 結構事件落地為 append-only 列。
    {
      provide: BUSINESS_CATEGORY_CHANGE_PUBLISHER,
      useExisting: BusinessCategoryChangeLogPublisher,
    },
    {
      provide: BusinessCategoryDagService,
      useFactory: (
        store: BusinessCategoryDagStore,
        pub: BusinessCategoryChangePublisher,
      ): BusinessCategoryDagService => new BusinessCategoryDagService(store, pub, () => new Date()),
      inject: [BUSINESS_CATEGORY_DAG_STORE, BUSINESS_CATEGORY_CHANGE_PUBLISHER],
    },
    // ── §丙 M:N 掛載 ──
    {
      provide: BUSINESS_CATEGORY_DOCS_STORE,
      useFactory: (): BusinessCategoryDocsStore =>
        new TypeOrmBusinessCategoryDocsStore(AppDataSource),
    },
    {
      provide: BusinessCategoryDocsService,
      useFactory: (
        store: BusinessCategoryDocsStore,
        audit: AuditWriterService,
        pub: BusinessCategoryChangePublisher,
        identity: AuditIdentityService,
        dag: BusinessCategoryDagStore,
      ): BusinessCategoryDocsService =>
        new BusinessCategoryDocsService(store, audit, pub, () => new Date(), identity, dag),
      inject: [
        BUSINESS_CATEGORY_DOCS_STORE,
        AuditWriterService,
        BUSINESS_CATEGORY_CHANGE_PUBLISHER,
        AuditIdentityService,
        BUSINESS_CATEGORY_DAG_STORE,
      ],
    },
    // ── §丁 樹狀圖預覽／下載／列印 ──
    // 🔴 浮水印**逐字重用 F020 之 `WatermarkService`**（伺服器端唯一來源），不自組字。
    { provide: BUSINESS_CATEGORY_WATERMARK_BUILDER, useExisting: WatermarkService },
    { provide: PDF_BURNER, useFactory: (): PdfBurner => new PdfLibBurner() },
    {
      provide: BUSINESS_CATEGORY_TREE_PDF_RENDERER,
      useFactory: (): LifecycleTreePdfRenderer => new PdfLibTreeRenderer(),
    },
    {
      provide: BusinessCategoryTreePreviewService,
      useFactory: (
        dag: BusinessCategoryDagStore,
        categories: BusinessCategoryStore,
        watermark: LifecycleWatermarkBuilder,
        renderer: LifecycleTreePdfRenderer,
        burner: PdfBurner,
        audit: AuditWriterService,
      ): BusinessCategoryTreePreviewService =>
        new BusinessCategoryTreePreviewService(
          dag,
          categories,
          watermark,
          renderer,
          burner,
          audit,
          () => new Date(),
        ),
      inject: [
        BUSINESS_CATEGORY_DAG_STORE,
        BUSINESS_CATEGORY_STORE,
        BUSINESS_CATEGORY_WATERMARK_BUILDER,
        BUSINESS_CATEGORY_TREE_PDF_RENDERER,
        PDF_BURNER,
        AuditWriterService,
      ],
    },
    // ── §戊 新舊對照（重建 ＋ 雙頁下載燒錄）──
    {
      provide: BUSINESS_CATEGORY_CHANGE_HISTORY_PDF_RENDERER,
      useFactory: (): LifecycleChangeHistoryPdfRenderer => new PdfLibChangeHistoryTreeRenderer(),
    },
    {
      provide: BusinessCategoryChangeDiffService,
      useFactory: (
        logStore: BusinessCategoryChangeLogStore,
        snapStore: BusinessCategorySnapshotStore,
        categories: BusinessCategoryStore,
        watermark: LifecycleWatermarkBuilder,
        renderer: LifecycleChangeHistoryPdfRenderer,
        burner: PdfBurner,
        audit: AuditWriterService,
      ): BusinessCategoryChangeDiffService =>
        new BusinessCategoryChangeDiffService(
          logStore,
          snapStore,
          categories,
          watermark,
          renderer,
          burner,
          audit,
          () => new Date(),
        ),
      inject: [
        BUSINESS_CATEGORY_CHANGE_LOG_STORE,
        BUSINESS_CATEGORY_SNAPSHOT_STORE,
        BUSINESS_CATEGORY_STORE,
        BUSINESS_CATEGORY_WATERMARK_BUILDER,
        BUSINESS_CATEGORY_CHANGE_HISTORY_PDF_RENDERER,
        PDF_BURNER,
        AuditWriterService,
      ],
    },
    // ── §己 前台瀏覽（3 端點；deny-by-default 於查詢層）──
    {
      provide: PUBLIC_BUSINESS_CATEGORY_STORE,
      useFactory: (): PublicBusinessCategoryStore =>
        new TypeOrmPublicBusinessCategoryStore(AppDataSource, () => new Date()),
    },
    {
      provide: PublicBusinessCategoryService,
      useFactory: (store: PublicBusinessCategoryStore): PublicBusinessCategoryService =>
        new PublicBusinessCategoryService(store),
      inject: [PUBLIC_BUSINESS_CATEGORY_STORE],
    },
  ],
  /**
   * 🔴 **刻意不 export 任何東西**：F017 第 16 欄（決策 E5）之取值由 `DocumentsModule`
   * **自建**同一個 store 實例（同 AppDataSource 單例）取得——比照本 repo 既有之
   * `ATTACHMENT_STORE`／`NODE_NAME_STORE`／`LIFECYCLE_STORE`／`OJT_COMPLETION_READER` 慣例。
   * 兩邊皆不互相 import ⇒ 循環相依在結構上不可能。
   */
})
export class BusinessCategoriesModule {}
