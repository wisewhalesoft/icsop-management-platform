import { DataSource, In } from 'typeorm';
import { IcsopDocument } from '../database/entities/icsop-document.entity';
import { chunkByParamBudget } from '../org-sync/param-batching';
import { DocumentNameLookup } from './document-name-lookup';

/**
 * DocumentNameLookup 之 TypeORM 實作：批次讀 ICSOP_DOCUMENT.documentName（AppDataSource 單例、延遲初始化）。
 * ⚠ MSSQL 2100 參數上限 → 單欄 IN 切批（每批 ≤1000）。ICSOP_DOCUMENT 未建（E04 未落地）→ try/catch 回空 Map。
 */
export class TypeOrmDocumentNameLookup implements DocumentNameLookup {
  constructor(private readonly ds: DataSource) {}

  private async init(): Promise<DataSource> {
    if (!this.ds.isInitialized) await this.ds.initialize();
    return this.ds;
  }

  async findNamesByIds(documentIds: string[]): Promise<Map<string, string>> {
    const keys = [...new Set(documentIds.filter(Boolean))];
    if (keys.length === 0) return new Map();
    try {
      const ds = await this.init();
      const repo = ds.getRepository(IcsopDocument);
      const out = new Map<string, string>();
      for (const batch of chunkByParamBudget(keys, 1, 1000)) {
        const rows = await repo.find({
          where: { id: In(batch) },
          select: { id: true, documentName: true },
        });
        for (const r of rows) out.set(r.id, r.documentName);
      }
      return out;
    } catch {
      return new Map();
    }
  }
}
