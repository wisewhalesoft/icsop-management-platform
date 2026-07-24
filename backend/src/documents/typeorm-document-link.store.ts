import { DataSource, In } from 'typeorm';
import { randomUUID } from 'crypto';
import { chunkByParamBudget } from '../org-sync/param-batching';
import { DocumentLinkEntity } from '../database/entities/document-link.entity';
import { DocumentLink, DocumentLinkStore } from './document-link.store';

/** 連結點 store 之 TypeORM 實作（AppDataSource 單例、延遲初始化）。 */
export class TypeOrmDocumentLinkStore implements DocumentLinkStore {
  constructor(private readonly ds: DataSource) {}

  private async init(): Promise<DataSource> {
    if (!this.ds.isInitialized) await this.ds.initialize();
    return this.ds;
  }

  async findBySource(sourceId: string): Promise<DocumentLink[]> {
    const ds = await this.init();
    const rows = await ds
      .getRepository(DocumentLinkEntity)
      .find({ where: { sourceDocumentId: sourceId } });
    return rows.map((r) => ({
      id: r.id,
      sourceDocumentId: r.sourceDocumentId,
      targetDocumentId: r.targetDocumentId,
    }));
  }

  /** F017 清單富化：批次取多來源之連結點。⚠ MSSQL 2100 參數上限 → 單欄 IN 切批（每批 ≤1000）。 */
  async findBySources(sourceIds: string[]): Promise<DocumentLink[]> {
    const keys = [...new Set(sourceIds.filter(Boolean))];
    if (keys.length === 0) return [];
    const ds = await this.init();
    const repo = ds.getRepository(DocumentLinkEntity);
    const out: DocumentLink[] = [];
    for (const batch of chunkByParamBudget(keys, 1, 1000)) {
      const rows = await repo.find({ where: { sourceDocumentId: In(batch) } });
      out.push(
        ...rows.map((r) => ({
          id: r.id,
          sourceDocumentId: r.sourceDocumentId,
          targetDocumentId: r.targetDocumentId,
        })),
      );
    }
    return out;
  }

  async add(sourceId: string, targetId: string): Promise<DocumentLink> {
    const ds = await this.init();
    const repo = ds.getRepository(DocumentLinkEntity);
    const saved = await repo.save(
      repo.create({
        id: randomUUID(),
        sourceDocumentId: sourceId,
        targetDocumentId: targetId,
        createdAt: new Date(),
      }),
    );
    return {
      id: saved.id,
      sourceDocumentId: saved.sourceDocumentId,
      targetDocumentId: saved.targetDocumentId,
    };
  }

  async remove(sourceId: string, targetId: string): Promise<void> {
    const ds = await this.init();
    await ds
      .getRepository(DocumentLinkEntity)
      .delete({ sourceDocumentId: sourceId, targetDocumentId: targetId });
  }
}
