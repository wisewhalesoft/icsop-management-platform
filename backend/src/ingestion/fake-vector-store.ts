import {
  ChunkFilterPayload,
  VectorIndexWriter,
} from './chunking.types';

interface VectorRow {
  chunkId: string;
  vector: number[];
  payload: ChunkFilterPayload;
}

/**
 * 測試用向量庫（記憶體 Map；模擬 pgvector 之 metadata 過濾語意）。
 * `queryByFilter` 之 usingDeptIds＝交集非空、status＝相等、多條件＝AND（TS-F029-012～014）。
 * 真實 pgvector 讀寫與過濾＝ [integration]（TS-F029-024）。
 */
export class FakeVectorStore implements VectorIndexWriter {
  private readonly rows = new Map<string, VectorRow>();

  upsert(
    chunkId: string,
    vector: number[],
    payload: ChunkFilterPayload,
  ): Promise<void> {
    this.rows.set(chunkId, {
      chunkId,
      vector: [...vector],
      payload: { ...payload, usingDeptIds: [...payload.usingDeptIds] },
    });
    return Promise.resolve();
  }

  queryByFilter(filter: Partial<ChunkFilterPayload>): Promise<string[]> {
    const ids: string[] = [];
    for (const row of this.rows.values()) {
      if (filter.documentId != null && row.payload.documentId !== filter.documentId) continue;
      if (filter.status != null && row.payload.status !== filter.status) continue;
      if (filter.announcedDate !== undefined && row.payload.announcedDate !== filter.announcedDate) continue;
      if (filter.usingDeptIds != null && filter.usingDeptIds.length > 0) {
        const intersects = filter.usingDeptIds.some((d) =>
          row.payload.usingDeptIds.includes(d),
        );
        if (!intersects) continue;
      }
      ids.push(row.chunkId);
    }
    return Promise.resolve(ids);
  }

  delete(chunkId: string): Promise<void> {
    this.rows.delete(chunkId);
    return Promise.resolve();
  }

  upsertMetadataOnly(
    chunkIds: string[],
    payloadPatch: Partial<ChunkFilterPayload>,
  ): Promise<void> {
    for (const id of chunkIds) {
      const row = this.rows.get(id);
      if (row) {
        row.payload = { ...row.payload, ...payloadPatch };
      }
    }
    return Promise.resolve();
  }

  /** 測試輔助。 */
  get size(): number {
    return this.rows.size;
  }
  getPayload(chunkId: string): ChunkFilterPayload | undefined {
    return this.rows.get(chunkId)?.payload;
  }
  allChunkIds(): string[] {
    return [...this.rows.keys()];
  }
}
