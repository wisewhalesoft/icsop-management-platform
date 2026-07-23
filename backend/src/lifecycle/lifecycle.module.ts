import { Module } from '@nestjs/common';
import { AppDataSource } from '../database/data-source';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { AuditModule } from '../audit/audit.module';
import { AuditWriterService } from '../audit/audit-writer.service';
import { PublicModule } from '../public/public.module';
import { WatermarkService } from '../public/watermark.service';
import { PDF_BURNER, PdfBurner, PdfLibBurner } from '../public/pdf-burner';
import { LifecycleController } from './lifecycle.controller';
import { LifecycleService } from './lifecycle.service';
import { LIFECYCLE_STORE, LifecycleStore } from './lifecycle.store';
import { TypeOrmLifecycleStore } from './typeorm-lifecycle.store';
import { DagController } from './dag.controller';
import { DagService } from './dag.service';
import { DAG_STORE, DagStore } from './dag.store';
import { TypeOrmDagStore } from './typeorm-dag.store';
import { NodeDocsController } from './node-docs.controller';
import { NodeDocsService } from './node-docs.service';
import { NODE_DOCS_STORE, NodeDocsStore } from './node-docs.store';
import { TypeOrmNodeDocsStore } from './typeorm-node-docs.store';
import { LifecyclePreviewController } from './lifecycle-preview.controller';
import { LifecycleTreePreviewService } from './lifecycle-preview.service';
import {
  LIFECYCLE_WATERMARK_BUILDER,
  LifecycleWatermarkBuilder,
} from './lifecycle-watermark';
import {
  LIFECYCLE_TREE_PDF_RENDERER,
  LifecycleTreePdfRenderer,
  PdfLibTreeRenderer,
} from './lifecycle-tree-pdf';
import {
  LIFECYCLE_CHANGE_PUBLISHER,
  LifecycleChangePublisher,
} from './lifecycle-change-event';
import { ChangeHistoryModule } from '../change-history/change-history.module';
import { LifecycleChangeLogPublisher } from '../change-history/lifecycle-change-log-publisher';

/**
 * 循環管理模組（E03 / F007 CRUD＋F008 DAG＋F009 節點抽屜＋F036 樹狀圖預覽）。
 *  - 匯入 AuthModule（SessionGuard）、RbacModule（RolePermissionGuard）。
 *  - F007 刪除稽核 / F036 檢視/下載/列印稽核 → 匯入 AuditModule 之 AuditWriterService。
 *  - F036 浮水印快照**逐字重用 F020 WatermarkService**（PublicModule 匯出）→ LIFECYCLE_WATERMARK_BUILDER。
 *  - 樹狀圖 PDF：自建 LifecycleTreePdfRenderer（基底圖）＋重用 PdfLibBurner（燒錄浮水印）。
 *  - store 以 useFactory 走 AppDataSource 單例（延遲連線）。
 */
@Module({
  imports: [AuthModule, RbacModule, AuditModule, PublicModule, ChangeHistoryModule],
  controllers: [
    LifecycleController,
    DagController,
    NodeDocsController,
    LifecyclePreviewController,
  ],
  providers: [
    {
      provide: LIFECYCLE_STORE,
      useFactory: (): LifecycleStore => new TypeOrmLifecycleStore(AppDataSource),
    },
    {
      provide: LifecycleService,
      useFactory: (store: LifecycleStore, audit: AuditWriterService): LifecycleService =>
        new LifecycleService(store, audit, () => new Date()),
      inject: [LIFECYCLE_STORE, AuditWriterService],
    },
    {
      provide: DAG_STORE,
      useFactory: (): DagStore => new TypeOrmDagStore(AppDataSource),
    },
    // F038：DagService 注入真實 LifecycleChangePublisher（ChangeHistoryModule 匯出）→ 結構事件落地。
    { provide: LIFECYCLE_CHANGE_PUBLISHER, useExisting: LifecycleChangeLogPublisher },
    {
      provide: DagService,
      useFactory: (store: DagStore, pub: LifecycleChangePublisher): DagService =>
        new DagService(store, pub, () => new Date()),
      inject: [DAG_STORE, LIFECYCLE_CHANGE_PUBLISHER],
    },
    {
      provide: NODE_DOCS_STORE,
      useFactory: (): NodeDocsStore => new TypeOrmNodeDocsStore(AppDataSource),
    },
    {
      provide: NodeDocsService,
      useFactory: (store: NodeDocsStore, pub: LifecycleChangePublisher): NodeDocsService =>
        new NodeDocsService(store, pub, () => new Date()),
      inject: [NODE_DOCS_STORE, LIFECYCLE_CHANGE_PUBLISHER],
    },
    // ── F036 樹狀圖預覽 ──
    { provide: LIFECYCLE_WATERMARK_BUILDER, useExisting: WatermarkService },
    { provide: PDF_BURNER, useFactory: (): PdfBurner => new PdfLibBurner() },
    {
      provide: LIFECYCLE_TREE_PDF_RENDERER,
      useFactory: (): LifecycleTreePdfRenderer => new PdfLibTreeRenderer(),
    },
    {
      provide: LifecycleTreePreviewService,
      useFactory: (
        dag: DagStore,
        lifecycles: LifecycleStore,
        watermark: LifecycleWatermarkBuilder,
        renderer: LifecycleTreePdfRenderer,
        burner: PdfBurner,
        audit: AuditWriterService,
      ): LifecycleTreePreviewService =>
        new LifecycleTreePreviewService(
          dag,
          lifecycles,
          watermark,
          renderer,
          burner,
          audit,
          () => new Date(),
        ),
      inject: [
        DAG_STORE,
        LIFECYCLE_STORE,
        LIFECYCLE_WATERMARK_BUILDER,
        LIFECYCLE_TREE_PDF_RENDERER,
        PDF_BURNER,
        AuditWriterService,
      ],
    },
  ],
})
export class LifecycleModule {}
