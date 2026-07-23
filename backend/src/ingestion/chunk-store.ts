import { DocumentStatus } from '../documents/document-status';
import { DocumentChunk } from './chunking.types';

/**
 * DOCUMENT_CHUNK 資料存取邊界。
 *
 * 「版本」語意（F030 new-then-swap）：每批 chunk 帶 indexRunId；每文件有一「當前有效版本」
 * （activeVersion）。初建時第一批自動成為有效版本；改版重抽先寫入新版（非有效），成功後 swap 使其
 * 取代舊版並回收舊版列（非永久保留，E04 不留歷史版本）。
 *
 * `findActiveByDocumentId` 之「有效」＝**當前版本 ∧ status='active'**（同時受版本切換與狀態 metadata 影響）。
 */
export interface ChunkStore {
  insertBatch(chunks: DocumentChunk[]): Promise<void>;
  deleteByIndexRunId(indexRunId: string): Promise<void>;
  /** 該文件全部 chunk（任一版本），供殘留檢查/計數。 */
  findByDocumentId(documentId: string): Promise<DocumentChunk[]>;
  /** 當前有效版本 ∧ status='active' 之 chunk（供驗證舊版/失效已排除）。 */
  findActiveByDocumentId(documentId: string): Promise<DocumentChunk[]>;
  /** 當前版本之全部 chunk（不論 status，供 F031 預覽）。 */
  listCurrentVersionByDocument(documentId: string): Promise<DocumentChunk[]>;
  /** new-then-swap：以新版取代舊版（回收舊版列）。 */
  swapToNewVersion(documentId: string, newIndexRunId: string): Promise<void>;
  /** 輕量分支：僅更新當前版本 chunk 之 status metadata（不動 content/indexRunId）。 */
  updateStatusMetadataOnly(
    documentId: string,
    newStatus: DocumentStatus,
  ): Promise<void>;
}

export const CHUNK_STORE = Symbol('CHUNK_STORE');

/** 記憶體實作（unit）。生產以 TypeOrmChunkStore 取代（migration 已撰寫未執行）。 */
export class FakeChunkStore implements ChunkStore {
  private chunks: DocumentChunk[] = [];
  private readonly activeVersion = new Map<string, string>();

  insertBatch(chunks: DocumentChunk[]): Promise<void> {
    for (const c of chunks) {
      this.chunks.push({ ...c, usingDeptIds: [...c.usingDeptIds] });
      // 初建：該文件尚無有效版本 → 本批自動成為有效版本。
      if (!this.activeVersion.has(c.documentId)) {
        this.activeVersion.set(c.documentId, c.indexRunId);
      }
    }
    return Promise.resolve();
  }

  deleteByIndexRunId(indexRunId: string): Promise<void> {
    this.chunks = this.chunks.filter((c) => c.indexRunId !== indexRunId);
    for (const [doc, ver] of this.activeVersion) {
      if (ver === indexRunId) this.activeVersion.delete(doc);
    }
    return Promise.resolve();
  }

  findByDocumentId(documentId: string): Promise<DocumentChunk[]> {
    return Promise.resolve(
      this.chunks.filter((c) => c.documentId === documentId).map((c) => ({ ...c })),
    );
  }

  findActiveByDocumentId(documentId: string): Promise<DocumentChunk[]> {
    const ver = this.activeVersion.get(documentId);
    if (!ver) return Promise.resolve([]);
    return Promise.resolve(
      this.chunks
        .filter(
          (c) =>
            c.documentId === documentId &&
            c.indexRunId === ver &&
            c.status === 'active',
        )
        .map((c) => ({ ...c })),
    );
  }

  listCurrentVersionByDocument(documentId: string): Promise<DocumentChunk[]> {
    const ver = this.activeVersion.get(documentId);
    if (!ver) return Promise.resolve([]);
    return Promise.resolve(
      this.chunks
        .filter((c) => c.documentId === documentId && c.indexRunId === ver)
        .map((c) => ({ ...c })),
    );
  }

  swapToNewVersion(documentId: string, newIndexRunId: string): Promise<void> {
    // 回收舊版列（非永久保留）。
    const old = this.activeVersion.get(documentId);
    if (old && old !== newIndexRunId) {
      this.chunks = this.chunks.filter(
        (c) => !(c.documentId === documentId && c.indexRunId === old),
      );
    }
    this.activeVersion.set(documentId, newIndexRunId);
    return Promise.resolve();
  }

  updateStatusMetadataOnly(
    documentId: string,
    newStatus: DocumentStatus,
  ): Promise<void> {
    const ver = this.activeVersion.get(documentId);
    this.chunks = this.chunks.map((c) =>
      c.documentId === documentId && (!ver || c.indexRunId === ver)
        ? { ...c, status: newStatus }
        : c,
    );
    return Promise.resolve();
  }

  /** 測試輔助：目前列數。 */
  get size(): number {
    return this.chunks.length;
  }
}
