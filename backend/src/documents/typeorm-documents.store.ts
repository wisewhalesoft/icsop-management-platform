import { DataSource, EntityManager, In, SelectQueryBuilder } from 'typeorm';
import { IcsopDocument } from '../database/entities/icsop-document.entity';
import { DocSecondaryChief } from '../database/entities/doc-secondary-chief.entity';
import { DocUsingDept } from '../database/entities/doc-using-dept.entity';
import { Lifecycle } from '../database/entities/lifecycle.entity';
import { normalizeIdList } from './document-org-fields';
import { NumberHolder } from './document-rules';
import { DocumentStatus, isValidStatus } from './document-status';
import { DEFAULT_PAGE_SIZE } from './document-list-query';
import {
  DocumentStore,
  CreateDocumentInput,
  DocumentPatch,
  DocumentView,
  DocumentListFilters,
  DocumentListItem,
  DocumentListPage,
} from './documents.store';

/**
 * F017 狀態篩選之 SQL 下推：原始值直接比對；衍生顯示值（已公告/進度中）以 today 比較公告日期。
 * ⚠ today 比較與 tie-breaker 正確性屬 [integration]（未於 unit 驗證）。
 */
function applyStatusFilter(
  qb: SelectQueryBuilder<IcsopDocument>,
  status: string | undefined,
): void {
  if (!status) return;
  if (isValidStatus(status)) {
    qb.andWhere('d.status = :status', { status });
    return;
  }
  const today = new Date();
  switch (status) {
    case '已公告':
      qb.andWhere('d.status = :st AND d.announcedDate IS NOT NULL AND d.announcedDate <= :today', {
        st: 'active',
        today,
      });
      break;
    case '進度中':
      qb.andWhere('d.status = :st AND (d.announcedDate IS NULL OR d.announcedDate > :today)', {
        st: 'active',
        today,
      });
      break;
    case '失效':
      qb.andWhere('d.status = :st', { st: 'inactive' });
      break;
    case '作廢':
      qb.andWhere('d.status = :st', { st: 'void' });
      break;
    default:
      qb.andWhere('1 = 0'); // 未知狀態值 → 無結果（非錯誤）
  }
}

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

  private static toView(
    d: IcsopDocument,
    secondaryChiefIds: string[],
    usingDeptIds: string[],
  ): DocumentView {
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
      secondaryChiefIds,
      usingDeptIds,
      edition: d.edition,
      announcedDate: d.announcedDate,
      contentSummary: d.contentSummary,
    };
  }

  /** 載入某文件之多值集合（F014）；以插入序回傳（id 為 NEWSEQUENTIALID，近似插入序）。 */
  private static async loadMultiValue(
    m: DataSource | EntityManager,
    documentId: string,
  ): Promise<{ secondaryChiefIds: string[]; usingDeptIds: string[] }> {
    const chiefs = await m
      .getRepository(DocSecondaryChief)
      .find({ where: { documentId }, order: { id: 'ASC' } });
    const depts = await m
      .getRepository(DocUsingDept)
      .find({ where: { documentId }, order: { id: 'ASC' } });
    return {
      secondaryChiefIds: chiefs.map((c) => c.employeeNo),
      usingDeptIds: depts.map((d) => d.orgCode),
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
    const now = new Date();
    // F014 多值正規化（防禦性；service 已正規化，直呼此 store 亦安全）。
    const secondaryChiefIds = normalizeIdList(input.secondaryChiefIds);
    const usingDeptIds = normalizeIdList(input.usingDeptIds);

    // 文件本體 + 多值列於同一交易寫入（多值列數為個位數，無 2100 參數上限風險）。
    const saved = await ds.transaction(async (m) => {
      const repo = m.getRepository(IcsopDocument);
      const doc = await repo.save(
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
      if (secondaryChiefIds.length > 0) {
        await m.getRepository(DocSecondaryChief).save(
          secondaryChiefIds.map((employeeNo) =>
            m.getRepository(DocSecondaryChief).create({ documentId: doc.id, employeeNo }),
          ),
        );
      }
      if (usingDeptIds.length > 0) {
        await m.getRepository(DocUsingDept).save(
          usingDeptIds.map((orgCode) =>
            m.getRepository(DocUsingDept).create({ documentId: doc.id, orgCode }),
          ),
        );
      }
      return doc;
    });
    return TypeOrmDocumentStore.toView(saved, secondaryChiefIds, usingDeptIds);
  }

  /**
   * F017 清單：filter/sort/paginate 一律下推 SQL（real pagination，取代既有 take(2000)）。
   * 組織/當責室長之名稱解析由 DocumentsService（NameResolutionService）補上；此處僅 join 循環名稱。
   * ⚠ 衍生狀態（已公告/進度中）之 today 比較與分頁 tie-breaker 之正確性屬 [integration]（未於 unit 驗證）。
   */
  async list(filters: DocumentListFilters): Promise<DocumentListPage> {
    const ds = await this.init();
    const qb = ds.getRepository(IcsopDocument).createQueryBuilder('d');
    applyStatusFilter(qb, filters.status);
    if (filters.lifecycleId) qb.andWhere('d.lifecycleId = :lc', { lc: filters.lifecycleId });
    if (filters.documentNumber) qb.andWhere('d.documentNumber = :dn', { dn: filters.documentNumber });
    if (filters.documentName) qb.andWhere('d.documentName = :dname', { dname: filters.documentName });
    if (filters.draftingCompanyId) qb.andWhere('d.draftingCompanyId = :co', { co: filters.draftingCompanyId });
    if (filters.draftingDeptId) qb.andWhere('d.draftingDeptId = :dept', { dept: filters.draftingDeptId });
    if (filters.draftingSectionId) qb.andWhere('d.draftingSectionId = :sec', { sec: filters.draftingSectionId });
    if (filters.primaryChiefId) qb.andWhere('d.primaryChiefId = :chief', { chief: filters.primaryChiefId });
    if (filters.linkTargetId) {
      qb.andWhere(
        'EXISTS (SELECT 1 FROM DOCUMENT_LINK dl WHERE dl.sourceDocumentId = d.id AND dl.targetDocumentId = :lt)',
        { lt: filters.linkTargetId },
      );
    }
    if (filters.keyword) {
      qb.andWhere('(d.documentNumber LIKE :kw OR d.documentName LIKE :kw)', {
        kw: `%${filters.keyword}%`,
      });
    }

    // 排序：指定 documentNumber/announcedDate（NULLS 由 DB 預設處理），否則既有 updatedAt DESC。
    const dir: 'ASC' | 'DESC' = filters.sortDir === 'desc' ? 'DESC' : 'ASC';
    if (filters.sortBy === 'documentNumber') qb.orderBy('d.documentNumber', dir);
    else if (filters.sortBy === 'announcedDate') qb.orderBy('d.announcedDate', dir);
    else qb.orderBy('d.updatedAt', 'DESC');

    // 分頁（1-based；OFFSET-FETCH）。
    const pageSize = filters.pageSize && filters.pageSize > 0 ? filters.pageSize : DEFAULT_PAGE_SIZE;
    const page = filters.page && filters.page > 0 ? filters.page : 1;
    qb.skip((page - 1) * pageSize).take(pageSize);

    const [docs, total] = await qb.getManyAndCount();

    // 循環名稱（單獨查詢並以 Map 併入，避免 N+1）
    const lcIds = [...new Set(docs.map((d) => d.lifecycleId))];
    const lcs = lcIds.length
      ? await ds.getRepository(Lifecycle).find({ where: { id: In(lcIds) }, select: { id: true, name: true } })
      : [];
    const nameMap = new Map(lcs.map((l) => [l.id, l.name]));

    const items: DocumentListItem[] = docs.map((d) => ({
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
      draftingCompanyName: null,
      draftingDeptName: null,
      draftingSectionName: null,
      primaryChiefId: d.primaryChiefId,
      primaryChiefName: null,
      edition: d.edition,
      announcedDate: d.announcedDate ? d.announcedDate.toISOString() : null,
      contentSummary: d.contentSummary,
    }));

    const hasNext = (page - 1) * pageSize + items.length < total;
    return { items, total, page, pageSize, hasNext };
  }

  async findById(id: string): Promise<DocumentView | null> {
    const ds = await this.init();
    const d = await ds.getRepository(IcsopDocument).findOne({ where: { id } });
    if (!d) return null;
    const mv = await TypeOrmDocumentStore.loadMultiValue(ds, id);
    return TypeOrmDocumentStore.toView(d, mv.secondaryChiefIds, mv.usingDeptIds);
  }

  async updateStatus(id: string, status: DocumentStatus): Promise<void> {
    const ds = await this.init();
    await ds
      .getRepository(IcsopDocument)
      .update({ id }, { status, updatedAt: new Date() });
  }

  async update(id: string, patch: DocumentPatch): Promise<DocumentView> {
    const ds = await this.init();
    const repo = ds.getRepository(IcsopDocument);
    // 僅覆寫 patch 觸及之欄位（部分更新）；日期字串強制轉 Date；恆更新 updatedAt。
    const set: Record<string, unknown> = { updatedAt: new Date() };
    const assign = (k: keyof DocumentPatch) => {
      if (k in patch) set[k] = patch[k];
    };
    (
      [
        'lifecycleId',
        'status',
        'documentNumber',
        'documentName',
        'draftingCompanyId',
        'draftingDeptId',
        'draftingSectionId',
        'primaryChiefId',
        'edition',
        'contentSummary',
      ] as (keyof DocumentPatch)[]
    ).forEach(assign);
    if ('announcedDate' in patch) set.announcedDate = coerceDate(patch.announcedDate);
    await repo.update({ id }, set);
    const row = await repo.findOne({ where: { id } });
    if (!row) throw new Error('DOCUMENT_NOT_FOUND');
    // F014 多值於編輯路徑不變更（create-side only）；讀回現有集合以回傳完整檢視。
    const mv = await TypeOrmDocumentStore.loadMultiValue(ds, id);
    return TypeOrmDocumentStore.toView(row, mv.secondaryChiefIds, mv.usingDeptIds);
  }
}
