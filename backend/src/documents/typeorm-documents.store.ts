import { DataSource, In } from 'typeorm';
import { IcsopDocument } from '../database/entities/icsop-document.entity';
import { Lifecycle } from '../database/entities/lifecycle.entity';
import { NumberHolder } from './document-rules';
import { DocumentStatus } from './document-status';
import {
  DocumentStore,
  CreateDocumentInput,
  DocumentView,
  DocumentListFilters,
  DocumentListItem,
} from './documents.store';

/** JSON 傳入之日期可能為 ISO 字串 → 強制轉 Date（供 datetime2 寫入）。 */
function coerceDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  return v instanceof Date ? v : new Date(v);
}

/** 文件 store 之 TypeORM 實作（AppDataSource 單例、延遲初始化）。 */
export class TypeOrmDocumentStore implements DocumentStore {
  constructor(private readonly ds: DataSource) {}

  private async init(): Promise<DataSource> {
    if (!this.ds.isInitialized) await this.ds.initialize();
    return this.ds;
  }

  private static toView(d: IcsopDocument): DocumentView {
    return {
      id: d.id,
      status: d.status as DocumentStatus,
      documentNumber: d.documentNumber,
      documentName: d.documentName,
      lifecycleId: d.lifecycleId,
      nodeId: d.nodeId,
      draftingCompanyId: d.draftingCompanyId,
      draftingDeptId: d.draftingDeptId,
      draftingSectionId: d.draftingSectionId,
      primaryChiefId: d.primaryChiefId,
      edition: d.edition,
      announcedDate: d.announcedDate,
      contentSummary: d.contentSummary,
    };
  }

  async findNumberHolders(documentNumber: string): Promise<NumberHolder[]> {
    const ds = await this.init();
    const rows = await ds
      .getRepository(IcsopDocument)
      .find({ where: { documentNumber }, select: { id: true, documentNumber: true, status: true } });
    return rows.map((r) => ({
      id: r.id,
      documentNumber: r.documentNumber,
      status: r.status as DocumentStatus,
    }));
  }

  async create(input: CreateDocumentInput): Promise<DocumentView> {
    const ds = await this.init();
    const repo = ds.getRepository(IcsopDocument);
    const now = new Date();
    const saved = await repo.save(
      repo.create({
        status: input.status,
        documentNumber: input.documentNumber,
        documentName: input.documentName,
        lifecycleId: input.lifecycleId,
        draftingCompanyId: input.draftingCompanyId ?? null,
        draftingDeptId: input.draftingDeptId ?? null,
        draftingSectionId: input.draftingSectionId ?? null,
        primaryChiefId: input.primaryChiefId ?? null,
        edition: input.edition ?? null,
        announcedDate: coerceDate(input.announcedDate),
        contentSummary: input.contentSummary ?? null,
        nodeId: null,
        createdAt: now,
        updatedAt: now,
      }),
    );
    return TypeOrmDocumentStore.toView(saved);
  }

  async list(filters: DocumentListFilters): Promise<DocumentListItem[]> {
    const ds = await this.init();
    const qb = ds.getRepository(IcsopDocument).createQueryBuilder('d');
    if (filters.status) qb.andWhere('d.status = :status', { status: filters.status });
    if (filters.lifecycleId) qb.andWhere('d.lifecycleId = :lc', { lc: filters.lifecycleId });
    if (filters.keyword) {
      qb.andWhere('(d.documentNumber LIKE :kw OR d.documentName LIKE :kw)', {
        kw: `%${filters.keyword}%`,
      });
    }
    qb.orderBy('d.updatedAt', 'DESC').take(2000);
    const docs = await qb.getMany();

    // 循環名稱（單獨查詢並以 Map 併入，避免 N+1）
    const lcIds = [...new Set(docs.map((d) => d.lifecycleId))];
    const lcs = lcIds.length
      ? await ds.getRepository(Lifecycle).find({ where: { id: In(lcIds) }, select: { id: true, name: true } })
      : [];
    const nameMap = new Map(lcs.map((l) => [l.id, l.name]));

    return docs.map((d) => ({
      id: d.id,
      status: d.status as DocumentStatus,
      documentNumber: d.documentNumber,
      documentName: d.documentName,
      lifecycleId: d.lifecycleId,
      lifecycleName: nameMap.get(d.lifecycleId) ?? null,
      nodeId: d.nodeId,
      draftingCompanyId: d.draftingCompanyId,
      draftingDeptId: d.draftingDeptId,
      draftingSectionId: d.draftingSectionId,
      primaryChiefId: d.primaryChiefId,
      edition: d.edition,
      announcedDate: d.announcedDate ? d.announcedDate.toISOString() : null,
      contentSummary: d.contentSummary,
    }));
  }

  async findById(id: string): Promise<DocumentView | null> {
    const ds = await this.init();
    const d = await ds.getRepository(IcsopDocument).findOne({ where: { id } });
    return d ? TypeOrmDocumentStore.toView(d) : null;
  }

  async updateStatus(id: string, status: DocumentStatus): Promise<void> {
    const ds = await this.init();
    await ds
      .getRepository(IcsopDocument)
      .update({ id }, { status, updatedAt: new Date() });
  }
}
