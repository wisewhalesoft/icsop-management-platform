import { DocumentStatus } from '../documents/document-status';
import { ChunkStore } from './chunk-store';
import { VectorIndexWriter } from './chunking.types';
import { IndexRunStore } from './index-run';
import {
  DocumentChangedEvent,
  DocumentExistsPort,
  DocumentStatusReader,
  IndexBuilder,
  ReindexSource,
  ReindexTriggerPort,
} from './reindex-trigger.port';

/**
 * 未知文件觸發之防呆錯誤（精確碼未定案，OQ-F030-02 → 本輪採 REINDEX_DOCUMENT_NOT_FOUND，flag impl log）。
 */
export class ReindexError extends Error {
  constructor(
    public readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'ReindexError';
  }
}

export interface ReindexDeps {
  indexBuilder: IndexBuilder;
  chunkStore: ChunkStore;
  vectorStore: VectorIndexWriter;
  runStore: IndexRunStore;
  documents: DocumentExistsPort;
  statusReader?: DocumentStatusReader;
  logger?: { log: (msg: string) => void };
}

/**
 * F030 改版重抽與重建索引、舊版排除。
 *
 * 兩機制明確區分：
 *  1) **內容改版**（onContentRevised；xls_update/document_edit/manual）→ 重跑 F028/F029（new-then-swap），
 *     成功以新版取代舊版；失敗**保留舊版**繼續可用（不落入完全無索引），INDEX_RUN=failed（REINDEX_FAILED）。
 *  2) **純狀態切換**（onStatusChanged；有效↔失效↔作廢）→ 僅同步更新 chunk 之 status metadata（App MSSQL +
 *     向量庫 payload 跨庫同步），**不重抽內文**；narrowing（→失效/作廢）於呼叫返回前完成（同步/近同步）。
 *
 * onDocumentChanged 為對外埠（task 契約）：CONTENT→onContentRevised；STATUS→讀當前狀態→onStatusChanged；
 * META（DOC_USING_DEPT/F014）＝ F030 spec 範疇缺口（OQ-F030-04），本輪 TODO（記錄、不重抽）。
 */
export class ReindexService implements ReindexTriggerPort {
  constructor(private readonly deps: ReindexDeps) {}

  private async assertExists(documentId: string): Promise<void> {
    if (!(await this.deps.documents.exists(documentId))) {
      throw new ReindexError(
        'REINDEX_DOCUMENT_NOT_FOUND',
        `重抽觸發之文件不存在：${documentId}`,
      );
    }
  }

  /** 內容改版分支（AC1/AC2/AC4）。 */
  async onContentRevised(
    documentId: string,
    source: ReindexSource,
  ): Promise<void> {
    await this.assertExists(documentId);
    const run = await this.deps.runStore.create({
      documentId,
      triggerType: source,
      stage: 'extract',
    });
    const result = await this.deps.indexBuilder.rebuild(documentId);
    if (result.status === 'failed') {
      const stage = result.errorStage ?? 'extract';
      await this.deps.runStore.markFailed(run.id, {
        stage,
        errorStage: stage,
        errorMessage: 'REINDEX_FAILED: 重抽/重建索引失敗，保留舊版索引繼續可用',
      });
      return; // 保留舊版：不 swap
    }
    // new-then-swap：新版成功後取代舊版，舊版排除於有效檢索。
    await this.deps.chunkStore.swapToNewVersion(documentId, result.newIndexRunId);
    await this.deps.runStore.markSuccess(run.id, result.chunkCount ?? 0);
  }

  /** 狀態切換輕量分支（AC3/AC5）。 */
  async onStatusChanged(
    documentId: string,
    newStatus: DocumentStatus,
  ): Promise<void> {
    await this.assertExists(documentId);
    const run = await this.deps.runStore.create({
      documentId,
      triggerType: 'status_change',
      stage: 'chunk',
    });
    const chunks = await this.deps.chunkStore.findByDocumentId(documentId);
    // App MSSQL 端 metadata 更新（同步，narrowing 於返回前生效）。
    await this.deps.chunkStore.updateStatusMetadataOnly(documentId, newStatus);
    // 向量庫端 payload 跨庫同步（§4.7）。
    await this.deps.vectorStore.upsertMetadataOnly(
      chunks.map((c) => c.id),
      { status: newStatus },
    );
    await this.deps.runStore.markSuccess(run.id, chunks.length);
  }

  /** 對外埠：映射 task 之 DocumentChangedEvent 至內部分支。 */
  async onDocumentChanged(e: DocumentChangedEvent): Promise<void> {
    switch (e.changeType) {
      case 'CONTENT':
        await this.onContentRevised(e.documentId, 'document_edit');
        return;
      case 'STATUS': {
        const status = await this.deps.statusReader?.getStatus(e.documentId);
        if (status == null) {
          throw new ReindexError(
            'REINDEX_DOCUMENT_NOT_FOUND',
            `STATUS 事件無法解析當前狀態：${e.documentId}`,
          );
        }
        await this.onStatusChanged(e.documentId, status);
        return;
      }
      case 'META':
        // DOC_USING_DEPT（F014 使用部門變更）＝ F030 spec 範疇缺口（OQ-F030-04），本輪 TODO。
        this.deps.logger?.log(
          `[F030 TODO] META 變更尚未接線（DOC_USING_DEPT/F014）documentId=${e.documentId} fields=${(e.changedFields ?? []).join(',')}`,
        );
        return;
    }
  }
}
