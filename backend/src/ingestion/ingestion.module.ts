import { Module } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { AppDataSource } from '../database/data-source';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { listAllDocumentIds, resolveLifecycleNames } from './typeorm-index-meta';
import { CHUNK_STORE, ChunkStore, FakeChunkStore } from './chunk-store';
import {
  INDEX_RUN_STORE,
  IndexRunStore,
  FakeIndexRunStore,
} from './index-run';
import {
  VECTOR_INDEX_WRITER,
  VectorIndexWriter,
} from './chunking.types';
import { FakeVectorStore } from './fake-vector-store';
import {
  IndexVisibilityService,
  MANUAL_REINDEX_TRIGGER,
  ManualReindexTrigger,
} from './index-visibility.service';
import { IndexVisibilityController } from './index-visibility.controller';
import { ReindexService } from './reindex.service';
import {
  DocumentExistsPort,
  IndexBuilder,
  RebuildResult,
} from './reindex-trigger.port';

/**
 * RAG ingestion 模組（F028–F031，rag worktree）。
 *
 * ⚠ 本輪為 unit-only：切 chunk/embedding/向量檢索之**純邏輯**已 TDD 完成（見各 *.spec.ts），
 * 但**生產落地為 [integration]**：TypeOrmChunkStore/TypeOrmIndexRunStore（App MSSQL）、pgvector
 * VectorStore、真實 embedding 模型（OQ-E09-02）、F028 真實 .xls 二進位解析、F030 對 F011/F012 之接線
 * （OQ-F030-01）皆未接。故此處以記憶體 Fake 佔位綁定，使 app 可啟動且 F031 端點/守門可用；
 * 一旦上述 [integration] 就位，替換 provider useFactory 綁定即可（介面不變）。
 */

/** 佔位：F028+F029 完整重跑黑箱（真實實作需 workbook 解析 + 真 embedder，[integration]）。 */
class PlaceholderIndexBuilder implements IndexBuilder {
  private readonly logger = new Logger('IndexBuilder');
  rebuild(documentId: string): Promise<RebuildResult> {
    this.logger.warn(
      `rebuild 佔位未接線（F028 真實解析/F029 真 embedder＝[integration]）documentId=${documentId}`,
    );
    return Promise.resolve({
      status: 'failed',
      newIndexRunId: '',
      errorStage: 'extract',
    });
  }
}

/** 佔位：文件存在性（真實應查 ICSOP_DOCUMENT；[integration] 接 DocumentsModule）。 */
class PlaceholderDocumentExists implements DocumentExistsPort {
  exists(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

@Module({
  imports: [AuthModule, RbacModule],
  controllers: [IndexVisibilityController],
  providers: [
    { provide: CHUNK_STORE, useFactory: (): ChunkStore => new FakeChunkStore() },
    { provide: INDEX_RUN_STORE, useFactory: (): IndexRunStore => new FakeIndexRunStore() },
    { provide: VECTOR_INDEX_WRITER, useFactory: (): VectorIndexWriter => new FakeVectorStore() },
    {
      provide: ReindexService,
      useFactory: (
        chunkStore: ChunkStore,
        runStore: IndexRunStore,
        vectorStore: VectorIndexWriter,
      ): ReindexService =>
        new ReindexService({
          indexBuilder: new PlaceholderIndexBuilder(),
          chunkStore,
          vectorStore,
          runStore,
          documents: new PlaceholderDocumentExists(),
          logger: new Logger('ReindexService'),
        }),
      inject: [CHUNK_STORE, INDEX_RUN_STORE, VECTOR_INDEX_WRITER],
    },
    {
      // 手動重新索引（F031 → F030 onContentRevised(id, 'manual')）。
      provide: MANUAL_REINDEX_TRIGGER,
      useFactory: (reindex: ReindexService): ManualReindexTrigger => ({
        trigger: (documentId: string) => reindex.onContentRevised(documentId, 'manual'),
      }),
      inject: [ReindexService],
    },
    {
      provide: IndexVisibilityService,
      useFactory: (
        chunkStore: ChunkStore,
        runStore: IndexRunStore,
        manualReindex: ManualReindexTrigger,
      ): IndexVisibilityService =>
        new IndexVisibilityService({
          chunkStore,
          runStore,
          manualReindex,
          // G-ADM-028/034 唯讀真實文件層讀取（未建表→try/catch 降級空集合）。
          documentIds: () => listAllDocumentIds(AppDataSource),
          lifecycleNames: (ids) => resolveLifecycleNames(AppDataSource, ids),
        }),
      inject: [CHUNK_STORE, INDEX_RUN_STORE, MANUAL_REINDEX_TRIGGER],
    },
  ],
  // ReindexService 匯出：F030 對外埠（onDocumentChanged）供 doc-edit 線於 merge 時接線（OQ-F030-01）。
  exports: [ReindexService],
})
export class IngestionModule {}
