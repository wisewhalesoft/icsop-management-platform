import { DataSource, EntityManager, In, SelectQueryBuilder } from 'typeorm';
import { IcsopDocument } from '../database/entities/icsop-document.entity';
import { DocSecondaryChief } from '../database/entities/doc-secondary-chief.entity';
import { DocUsingDept } from '../database/entities/doc-using-dept.entity';
import { Lifecycle } from '../database/entities/lifecycle.entity';
import { chunkByParamBudget } from '../org-sync/param-batching';
import { normalizeIdList } from './document-org-fields';
import { NumberHolder } from './document-rules';
import { DocumentStatus, isValidStatus } from './document-status';
import { DEFAULT_PAGE_SIZE } from './document-list-query';
import {
  LifecycleIdentity,
  lifecycleDisplayName,
} from '../lifecycle/lifecycle-subcategory';
import {
  DocumentStore,
  CreateDocumentInput,
  DocumentPatch,
  DocumentView,
  DocumentListFilters,
  DocumentListItem,
  DocumentListPage,
  DocumentSummary,
  DocSecondaryChiefRef,
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
      companyCode: d.companyCode,
      draftingDeptId: d.draftingDeptId,
      draftingSectionId: d.draftingSectionId,
      primaryChiefId: d.primaryChiefId,
      secondaryChiefIds,
      usingDeptIds,
      edition: d.edition,
      // 🔴 F042 第五輪：編輯頁需要它才能判斷「改版是否已要求重訓」（唯讀呈現，不可寫）。
      ojtTrainingEdition: d.ojtTrainingEdition,
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
          // 🔴 B 階段（多公司）：NOT NULL 且無 default，漏帶 → SQL Server 直接擋下 INSERT。
          companyCode: input.companyCode,
          status: input.status,
          documentNumber: input.documentNumber,
          documentName: input.documentName,
          lifecycleId: input.lifecycleId,
          draftingDeptId: input.draftingDeptId ?? null,
          draftingSectionId: input.draftingSectionId ?? null,
          primaryChiefId: input.primaryChiefId ?? null,
          edition: input.edition ?? null,
          // 🔴 F042 第五輪：建立時之訓練基準版次（service 已解析為當下版次）。
          ojtTrainingEdition: input.ojtTrainingEdition ?? null,
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
        // 🔴 使用部門之 companyCode 恆等同其文件（doc-using-dept.entity 之不變式），且為 NOT NULL。
        await m.getRepository(DocUsingDept).save(
          usingDeptIds.map((orgCode) =>
            m
              .getRepository(DocUsingDept)
              .create({ documentId: doc.id, companyCode: input.companyCode, orgCode }),
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
    if (filters.companyCode) qb.andWhere('d.companyCode = :co', { co: filters.companyCode });
    if (filters.draftingDeptId) qb.andWhere('d.draftingDeptId = :dept', { dept: filters.draftingDeptId });
    if (filters.draftingSectionId) qb.andWhere('d.draftingSectionId = :sec', { sec: filters.draftingSectionId });
    if (filters.primaryChiefId) qb.andWhere('d.primaryChiefId = :chief', { chief: filters.primaryChiefId });
    // F017 AC-T40（架構決策 C3）：子樹篩選之單一 SQL IN 下推（節點 id 集合已由服務層展開）。
    // `AC-T40` ①「未指派節點者排除」由 `IN` 對 NULL 恆不匹配之語意自動滿足，不需額外 IS NOT NULL。
    if (filters.nodeIdIn?.length) {
      qb.andWhere('d.nodeId IN (:...nodeIds)', { nodeIds: filters.nodeIdIn });
    }
    if (filters.linkTargetId) {
      qb.andWhere(
        'EXISTS (SELECT 1 FROM DOCUMENT_LINK dl WHERE dl.sourceDocumentId = d.id AND dl.targetDocumentId = :lt)',
        { lt: filters.linkTargetId },
      );
    }
    /*
     * 🔴 F017 `AC-D6`（2026-08-16 delta）：附錄／使用表單「選具體一份」之篩選。
     * 逐字比照上方 `linkTargetId` 之既有 `EXISTS` 子查詢樣板（`AC-D6` 明文「比照 linkTargetId 之
     * 既有樣板」），僅換關聯表與欄名：
     *   · `DOC_APPENDIX(documentId, appendixId, sortOrder)`——data-model #doc-appendix ＋
     *     entity `database/entities/doc-appendix.entity.ts` ＋ migration `1723507200000-appendix.ts`
     *   · `DOC_USAGE_FORM(documentId, formId)`——data-model #doc-usage-form ＋
     *     entity `database/entities/doc-usage-form.entity.ts` ＋ migration `1722124800000-usage-form.ts`
     * 兩表之 `documentId` 皆直接參照 `ICSOP_DOCUMENT.id`（無中介表）；`appendixId`／`formId` 各有索引
     * （`IX_DOC_APPENDIX_appendixId`／`IX_DOC_USAGE_FORM_formId`）供本查詢使用。
     * ⚠ 刻意**不**於列上富化 `appendixIds[]`／`formIds[]`：2000 筆工作集每列各帶兩陣列會讓回應顯著
     * 膨脹，而 99% 的請求用不到這兩項篩選（architecture-spec §10.12）。
     */
    if (filters.appendixId) {
      qb.andWhere(
        'EXISTS (SELECT 1 FROM DOC_APPENDIX da WHERE da.documentId = d.id AND da.appendixId = :apx)',
        { apx: filters.appendixId },
      );
    }
    if (filters.formId) {
      qb.andWhere(
        'EXISTS (SELECT 1 FROM DOC_USAGE_FORM duf WHERE duf.documentId = d.id AND duf.formId = :uf)',
        { uf: filters.formId },
      );
    }
    /*
     * 🔴 F017 `AC-J14`（2026-08-28 E11 delta）：OJT 篩選之四值下推。
     *
     * 📝 被推翻之原語意逐字保留供追溯：OLD> 「存在／不存在 `DOCUMENT_ATTACHMENT.type='OJT_SIGNIN'`」。
     *
     * 🔒 兩個計數子查詢之口徑必須與 `TypeOrmOjtCompletionReader` 之 Q1／Q2 **逐字同源**——
     * 篩選與顯示若各算一套，會出現「選了『部分完成』卻篩出一列顯示為『已全部完成』」。
     *   · 分母：`DOC_USING_DEPT` 列數，**不套 `isActive` 過濾**（`AC-17` 之封閉界線）。
     *   · 分子：`INNER JOIN DOC_USING_DEPT` 之 DISTINCT orgCode——天然排除孤兒場次
     *     （orgCode 已不在當下集合）與待歸位列（orgCode IS NULL 恆不匹配）。
     * 🔒 三值之布林條件與純函式 `deriveOjtStatus()` 逐條對應（含空集合 ⇒ `none` 之覆寫）：
     *   none    ⇔ completed = 0（涵蓋 total = 0）
     *   all     ⇔ total > 0 AND completed >= total
     *   partial ⇔ completed > 0 AND completed < total
     */
    if (filters.ojtStatus) {
      const total = `(SELECT COUNT(*) FROM DOC_USING_DEPT ud WHERE ud.documentId = d.id)`;
      const completed =
        `(SELECT COUNT(DISTINCT s.orgCode) FROM OJT_SESSION s ` +
        `INNER JOIN DOC_USING_DEPT ud2 ON ud2.documentId = s.documentId AND ud2.orgCode = s.orgCode ` +
        `WHERE s.documentId = d.id)`;
      if (filters.ojtStatus === 'none') qb.andWhere(`${completed} = 0`);
      else if (filters.ojtStatus === 'all') {
        qb.andWhere(`${total} > 0 AND ${completed} >= ${total}`);
      } else if (filters.ojtStatus === 'partial') {
        qb.andWhere(`${completed} > 0 AND ${completed} < ${total}`);
      }
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

    // 循環名稱（單獨查詢並以 Map 併入，避免 N+1）。
    // F040 AC-S1／AC-30：顯示字串一律經 lifecycleDisplayName 組合（含子分類），前端不再自行串接。
    const lcIds = [...new Set(docs.map((d) => d.lifecycleId))];
    const lcs = lcIds.length
      ? await ds.getRepository(Lifecycle).find({
          where: { id: In(lcIds) },
          select: { id: true, name: true, subcategory: true },
        })
      : [];
    const nameMap = new Map(lcs.map((l) => [l.id, lifecycleDisplayName(l)]));

    const items: DocumentListItem[] = docs.map((d) => ({
      id: d.id,
      status: d.status as DocumentStatus,
      documentNumber: d.documentNumber,
      documentName: d.documentName,
      lifecycleId: d.lifecycleId,
      lifecycleName: nameMap.get(d.lifecycleId) ?? null,
      nodeId: d.nodeId,
      companyCode: d.companyCode,
      draftingDeptId: d.draftingDeptId,
      draftingSectionId: d.draftingSectionId,
      draftingCompanyName: null,
      draftingDeptName: null,
      draftingSectionName: null,
      primaryChiefId: d.primaryChiefId,
      primaryChiefName: null,
      secondaryChiefCount: 0,
      secondaryChiefNames: [],
      edition: d.edition,
      announcedDate: d.announcedDate ? d.announcedDate.toISOString() : null,
      contentSummary: d.contentSummary,
      // F017 富化欄之基線（無附件/無連結/無次要室長）；由 DocumentsService 以批次注入覆寫。
      icsopPdfBlobPath: null,
      icsopPdfFileName: null,
      links: [],
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

  /**
   * F040 循環選取有效性（INV-4）之池來源：全部 LIFECYCLE 列（**不分 status**，AC-20／AC-25）。
   * 僅取三欄（id/name/subcategory），列數為循環池規模（十數列），無分頁必要。
   */
  async listLifecycleIdentities(): Promise<LifecycleIdentity[]> {
    const ds = await this.init();
    const rows = await ds
      .getRepository(Lifecycle)
      .find({ select: { id: true, name: true, subcategory: true } });
    return rows.map((l) => ({ id: l.id, name: l.name, subcategory: l.subcategory ?? null }));
  }

  /** F017 清單富化：批次取連結目標之摘要。⚠ MSSQL 2100 參數上限 → 單欄 IN 切批（每批 ≤1000）。 */
  async findSummaries(ids: string[]): Promise<DocumentSummary[]> {
    const keys = [...new Set(ids.filter(Boolean))];
    if (keys.length === 0) return [];
    const ds = await this.init();
    const repo = ds.getRepository(IcsopDocument);
    const out: DocumentSummary[] = [];
    for (const batch of chunkByParamBudget(keys, 1, 1000)) {
      const rows = await repo.find({
        where: { id: In(batch) },
        select: { id: true, documentNumber: true, documentName: true, status: true },
      });
      out.push(
        ...rows.map((r) => ({
          id: r.id,
          documentNumber: r.documentNumber,
          documentName: r.documentName,
          status: r.status as DocumentStatus,
        })),
      );
    }
    return out;
  }

  /** G-DOC-001 清單富化：批次取多筆文件之次要室長參照。⚠ MSSQL 2100 參數上限 → 單欄 IN 切批（每批 ≤1000）。 */
  async findSecondaryChiefsByDocumentIds(
    documentIds: string[],
  ): Promise<DocSecondaryChiefRef[]> {
    const keys = [...new Set(documentIds.filter(Boolean))];
    if (keys.length === 0) return [];
    const ds = await this.init();
    const repo = ds.getRepository(DocSecondaryChief);
    const out: DocSecondaryChiefRef[] = [];
    for (const batch of chunkByParamBudget(keys, 1, 1000)) {
      const rows = await repo.find({
        where: { documentId: In(batch) },
        order: { id: 'ASC' },
      });
      out.push(...rows.map((r) => ({ documentId: r.documentId, employeeNo: r.employeeNo })));
    }
    return out;
  }

  async updateStatus(id: string, status: DocumentStatus): Promise<void> {
    const ds = await this.init();
    await ds
      .getRepository(IcsopDocument)
      .update({ id }, { status, updatedAt: new Date() });
  }

  async update(id: string, patch: DocumentPatch): Promise<DocumentView> {
    const ds = await this.init();
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
        // 🔴 2026-09-04 開放編輯（制定公司）：**必須列於本白名單**——漏列時使用者在編輯頁改的
        // 公司會在這一行靜默蒸發，畫面回舊值卻無任何錯誤（本 repo 之既有缺陷家族）。
        'companyCode',
        'draftingDeptId',
        'draftingSectionId',
        'primaryChiefId',
        'edition',
        // 🔴 F042 第五輪：**必須列於本白名單**——漏列時 service 算好的新基準版次會在
        // 這一行靜默蒸發（本 repo 之既有缺陷家族），改版要求重訓將完全沒有效果。
        'ojtTrainingEdition',
        'contentSummary',
      ] as (keyof DocumentPatch)[]
    ).forEach(assign);
    if ('announcedDate' in patch) set.announcedDate = coerceDate(patch.announcedDate);

    // 純量覆寫 ＋ F014 多值 replace-set 於同一交易（比照 create()），確保兩者同進退。
    return ds.transaction(async (m) => {
      const repo = m.getRepository(IcsopDocument);
      await repo.update({ id }, set);

      // 純量覆寫後之現況列。刻意提前到多值 replace-set **之前**取得：`DOC_USING_DEPT.companyCode`
      // 為 NOT NULL 且恆等同其文件（entity 不變式），需自本列取值——順道省去原本置於方法尾端的
      // 第二次 findOne（同一交易內、同一列，值相同）。
      const row = await repo.findOne({ where: { id } });
      if (!row) throw new Error('DOCUMENT_NOT_FOUND');

      // F014 編輯側多值持久化：帶鍵才動（未帶鍵＝不觸碰既有集合）。
      // 採 delete-then-insert 全量取代（非差集）：關聯列 id 為代理鍵、無下游 FK 參照，
      // 且前端隨 PATCH 整批送出，全量取代最單純、無邊界遺漏。
      if ('secondaryChiefIds' in patch) {
        const chiefRepo = m.getRepository(DocSecondaryChief);
        await chiefRepo.delete({ documentId: id });
        const chiefs = normalizeIdList(patch.secondaryChiefIds);
        if (chiefs.length > 0) {
          await chiefRepo.save(
            chiefs.map((employeeNo) => chiefRepo.create({ documentId: id, employeeNo })),
          );
        }
      }
      if ('usingDeptIds' in patch) {
        const deptRepo = m.getRepository(DocUsingDept);
        await deptRepo.delete({ documentId: id });
        const depts = normalizeIdList(patch.usingDeptIds);
        if (depts.length > 0) {
          await deptRepo.save(
            depts.map((orgCode) =>
              deptRepo.create({ documentId: id, companyCode: row.companyCode, orgCode }),
            ),
          );
        }
      }

      const mv = await TypeOrmDocumentStore.loadMultiValue(m, id);
      return TypeOrmDocumentStore.toView(row, mv.secondaryChiefIds, mv.usingDeptIds);
    });
  }
}
