import { DataSource, EntityManager, In } from 'typeorm';
import { BusinessCategory } from '../database/entities/business-category.entity';
import { BusinessCategoryNode } from '../database/entities/business-category-node.entity';
import { BusinessCategoryDoc } from '../database/entities/business-category-doc.entity';
import { IcsopDocument } from '../database/entities/icsop-document.entity';
import { Lifecycle } from '../database/entities/lifecycle.entity';
import { lifecycleDisplayName } from '../lifecycle/lifecycle-subcategory';
import { chunkByParamBudget } from '../org-sync/param-batching';
import {
  DocumentBusinessCategoryRow,
  groupBusinessCategoriesByDocument,
} from '../documents/business-category-grouping';
import { businessCategoryDisplayName } from './business-category-subcategory';
import {
  BusinessCategoryDocsStore,
  BusinessCategoryNodeInfo,
  CandidateDocRef,
  CandidateOtherMount,
  CategoryMountedDoc,
  DocumentBusinessCategoryRef,
} from './business-category-docs.store';
import { BusinessCategoryDocsStructuralTx } from './business-category-structural-change';
import { recordBusinessCategoryStructuralChange } from './business-category-structural-recorder';

/** ISO 日期字串（`YYYY-MM-DD`）；null/undefined 原樣。 */
function toIsoDate(v: Date | string | null | undefined): string | null {
  if (!v) return null;
  if (typeof v === 'string') return v.slice(0, 10);
  const y = v.getUTCFullYear();
  const m = String(v.getUTCMonth() + 1).padStart(2, '0');
  const d = String(v.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * §丙 M:N 掛載 store 之 TypeORM 實作。
 *
 * 🔴 `AC-20`：`listCandidateDocs` 之查詢**不含任何循環條件**——SQL 上沒有 `lifecycleId`，
 * 介面上也沒有可傳入的鍵。
 * 🔴 INV-B4：本 store **從不寫入 `ICSOP_DOCUMENT`**（`nodeId`／`lifecycleId` 皆不觸碰）。
 */
export class TypeOrmBusinessCategoryDocsStore implements BusinessCategoryDocsStore {
  constructor(private readonly ds: DataSource) {}

  private async init(): Promise<DataSource> {
    if (!this.ds.isInitialized) await this.ds.initialize();
    return this.ds;
  }

  private async getNodeWith(
    m: EntityManager,
    businessCategoryId: string,
    nodeId: string,
  ): Promise<BusinessCategoryNodeInfo | null> {
    const n = await m
      .getRepository(BusinessCategoryNode)
      .findOne({ where: { id: nodeId, businessCategoryId } });
    return n ? { id: n.id, businessCategoryId: n.businessCategoryId, name: n.name } : null;
  }

  async getNode(
    businessCategoryId: string,
    nodeId: string,
  ): Promise<BusinessCategoryNodeInfo | null> {
    const ds = await this.init();
    return this.getNodeWith(ds.manager, businessCategoryId, nodeId);
  }

  /** `AC-20`／`AC-28`：候選＝**全部** ICSOP 文件（關鍵字比對編號 ∪ 書名；分頁）。 */
  async listCandidateDocs(query: {
    keyword?: string;
    page: number;
    pageSize: number;
  }): Promise<{ items: CandidateDocRef[]; total: number }> {
    const ds = await this.init();
    const qb = ds
      .getRepository(IcsopDocument)
      .createQueryBuilder('d')
      // ⚠ `d.lifecycleId` 只是**被讀出來當作純資訊回傳**（`AC-20`）——
      // 🔴 底下**沒有、也不得有**任何以它為條件之 `where`。
      .select(['d.id', 'd.documentNumber', 'd.documentName', 'd.lifecycleId'])
      .orderBy('d.documentNumber', 'ASC');
    const kw = query.keyword?.trim();
    if (kw) {
      qb.andWhere('(d.documentNumber LIKE :kw OR d.documentName LIKE :kw)', { kw: `%${kw}%` });
    }
    const [rows, total] = await qb
      .skip((Math.max(query.page, 1) - 1) * query.pageSize)
      .take(query.pageSize)
      .getManyAndCount();

    // 🔴 兩段**純資訊**富化（`AC-20`：不參與過濾，只是讓抽屜能顯示「這份文件目前在哪裡」）。
    // 兩者皆為**固定次數之批次查詢**（往返數與候選筆數無關），非 N+1。
    const ids = rows.map((d) => d.id);
    const [lifecycleNames, otherMounts] = await Promise.all([
      this.lifecycleNamesByDocument(ds, rows),
      this.otherMountsByDocument(ds, ids),
    ]);
    return {
      items: rows.map((d) => ({
        id: d.id,
        documentNumber: d.documentNumber,
        documentName: d.documentName,
        lifecycleId: d.lifecycleId ?? null,
        lifecycleName: lifecycleNames.get(d.id) ?? null,
        otherMounts: otherMounts.get(d.id) ?? [],
      })),
      total,
    };
  }

  /** 候選之循環顯示名稱（**純資訊**）。單次 IN 查詢；查詢失敗 → 空 Map（不使抽屜整批失敗）。 */
  private async lifecycleNamesByDocument(
    ds: DataSource,
    docs: { id: string; lifecycleId?: string | null }[],
  ): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const lifecycleIds = [...new Set(docs.map((d) => d.lifecycleId).filter(Boolean))] as string[];
    if (lifecycleIds.length === 0) return out;
    try {
      const nameById = new Map<string, string>();
      for (const batch of chunkByParamBudget(lifecycleIds, 1, 1000)) {
        const rows = await ds.getRepository(Lifecycle).find({
          where: { id: In(batch) },
          select: { id: true, name: true, subcategory: true },
        });
        for (const l of rows) nameById.set(l.id, lifecycleDisplayName(l));
      }
      for (const d of docs) {
        const name = d.lifecycleId ? nameById.get(d.lifecycleId) : undefined;
        if (name !== undefined) out.set(d.id, name);
      }
    } catch {
      return new Map();
    }
    return out;
  }

  /**
   * 候選文件**已掛在哪些類別／節點**（**純資訊**，`AC-21`～`AC-23`：多重歸屬是正常狀態，
   * 🔴 **不觸發任何警示或二次確認**——那是循環側之改派語意，本功能明文不存在）。
   */
  private async otherMountsByDocument(
    ds: DataSource,
    documentIds: string[],
  ): Promise<Map<string, CandidateOtherMount[]>> {
    const out = new Map<string, CandidateOtherMount[]>();
    const keys = [...new Set(documentIds.filter(Boolean))];
    if (keys.length === 0) return out;
    try {
      for (const batch of chunkByParamBudget(keys, 1, 1000)) {
        const rows = await ds
          .getRepository(BusinessCategoryDoc)
          .createQueryBuilder('m')
          .innerJoin(BusinessCategoryNode, 'n', 'n.id = m.nodeId')
          .innerJoin(BusinessCategory, 'c', 'c.id = n.businessCategoryId')
          .select('m.documentId', 'documentId')
          .addSelect('n.name', 'nodeName')
          .addSelect('c.name', 'name')
          .addSelect('c.subcategory', 'subcategory')
          .where('m.documentId IN (:...ids)', { ids: batch })
          .getRawMany<{
            documentId: string;
            nodeName: string | null;
            name: string;
            subcategory: string | null;
          }>();
        for (const r of rows) {
          const bucket = out.get(r.documentId) ?? out.set(r.documentId, []).get(r.documentId)!;
          bucket.push({
            businessCategoryDisplayName: businessCategoryDisplayName({
              name: r.name,
              subcategory: r.subcategory,
            }),
            nodeName: r.nodeName,
          });
        }
      }
    } catch {
      return new Map();
    }
    return out;
  }

  private async mountWith(
    m: EntityManager,
    nodeId: string,
    documentId: string,
    mountedByAccountId: string,
    mountedAt: Date,
  ): Promise<void> {
    // 🔴 白名單逐欄對帳（§14.4）：`nodeId`／`documentId`／`mountedByAccountId`／`mountedAt`
    // 四欄皆 NOT NULL，漏列任一即「值人間蒸發」→ 掛載時必 500。
    await m.getRepository(BusinessCategoryDoc).insert({
      nodeId,
      documentId,
      mountedByAccountId,
      mountedAt,
    });
  }

  async mount(
    nodeId: string,
    documentId: string,
    mountedByAccountId: string,
    mountedAt: Date,
  ): Promise<void> {
    const ds = await this.init();
    await this.mountWith(ds.manager, nodeId, documentId, mountedByAccountId, mountedAt);
  }

  private async unmountWith(
    m: EntityManager,
    nodeId: string,
    documentId: string,
  ): Promise<boolean> {
    const res = await m.getRepository(BusinessCategoryDoc).delete({ nodeId, documentId });
    return (res.affected ?? 0) > 0;
  }

  async unmount(nodeId: string, documentId: string): Promise<boolean> {
    const ds = await this.init();
    return this.unmountWith(ds.manager, nodeId, documentId);
  }

  async listNodeMountedDocs(
    businessCategoryId: string,
    nodeId: string,
  ): Promise<CategoryMountedDoc[]> {
    const map = await this.listNodesMountedDocs(businessCategoryId, [nodeId]);
    return map.get(nodeId) ?? [];
  }

  /**
   * `AC-35` 批次版：**單一 JOIN 查詢**取回子樹全節點之掛載明細（無 N+1）。
   * 空 `nodeIds` → 空 Map（不下推 `IN ()`）。
   */
  async listNodesMountedDocs(
    businessCategoryId: string,
    nodeIds: string[],
  ): Promise<Map<string, CategoryMountedDoc[]>> {
    const out = new Map<string, CategoryMountedDoc[]>();
    const keys = [...new Set(nodeIds.filter(Boolean))];
    if (keys.length === 0) return out;
    const ds = await this.init();
    // ⚠ MSSQL 2100 參數上限 → 單欄 IN 切批（比照既有批次查詢之慣例）。
    for (const batch of chunkByParamBudget(keys, 1, 1000)) {
      const rows = await ds
        .getRepository(BusinessCategoryDoc)
        .createQueryBuilder('m')
        .innerJoin(BusinessCategoryNode, 'n', 'n.id = m.nodeId')
        .innerJoin(IcsopDocument, 'd', 'd.id = m.documentId')
        .select('m.nodeId', 'nodeId')
        .addSelect('d.id', 'id')
        .addSelect('d.documentNumber', 'documentNumber')
        .addSelect('d.documentName', 'documentName')
        .addSelect('d.edition', 'edition')
        .addSelect('d.status', 'status')
        .addSelect('d.announcedDate', 'announcedDate')
        .where('n.businessCategoryId = :businessCategoryId', { businessCategoryId })
        .andWhere('m.nodeId IN (:...nodeIds)', { nodeIds: batch })
        .orderBy('d.documentNumber', 'ASC')
        .getRawMany<{
          nodeId: string;
          id: string;
          documentNumber: string;
          documentName: string;
          edition: string | null;
          status: string;
          announcedDate: Date | string | null;
        }>();
      for (const r of rows) {
        const bucket = out.get(r.nodeId) ?? out.set(r.nodeId, []).get(r.nodeId)!;
        bucket.push({
          id: r.id,
          documentNumber: r.documentNumber,
          documentName: r.documentName,
          edition: r.edition,
          status: r.status,
          announcedDate: toIsoDate(r.announcedDate),
        });
      }
    }
    return out;
  }

  /**
   * 決策 E5（§14.6.4）：F017 第 16 欄／CSV 第 15 欄之防 N+1 批次反查。
   * 單一查詢 `BUSINESS_CATEGORY_DOC ⋈ BUSINESS_CATEGORY_NODE ⋈ BUSINESS_CATEGORY`；
   * **去重與排序由呼叫端之純函式負責**（`groupBusinessCategoriesByDocument`），本方法只回扁平列。
   */
  async listCategoriesByDocumentIds(
    documentIds: string[],
  ): Promise<Map<string, DocumentBusinessCategoryRef[]>> {
    const flat: DocumentBusinessCategoryRow[] = [];
    const keys = [...new Set(documentIds.filter(Boolean))];
    if (keys.length === 0) return new Map();
    try {
      const ds = await this.init();
      for (const batch of chunkByParamBudget(keys, 1, 1000)) {
        const rows = await ds
          .getRepository(BusinessCategoryDoc)
          .createQueryBuilder('m')
          .innerJoin(BusinessCategoryNode, 'n', 'n.id = m.nodeId')
          .innerJoin(BusinessCategory, 'c', 'c.id = n.businessCategoryId')
          .select('m.documentId', 'documentId')
          .addSelect('m.nodeId', 'nodeId')
          .addSelect('n.businessCategoryId', 'businessCategoryId')
          .addSelect('c.name', 'name')
          .addSelect('c.subcategory', 'subcategory')
          .where('m.documentId IN (:...documentIds)', { documentIds: batch })
          .getRawMany<{
            documentId: string;
            nodeId: string;
            businessCategoryId: string;
            name: string;
            subcategory: string | null;
          }>();
        for (const r of rows) {
          flat.push({
            documentId: r.documentId,
            nodeId: r.nodeId,
            businessCategoryId: r.businessCategoryId,
            businessCategoryDisplayName: businessCategoryDisplayName({
              name: r.name,
              subcategory: r.subcategory,
            }),
          });
        }
      }
    } catch {
      // 來源表尚未建立 → 視為無掛載（清單不因此整批失敗）。
      return new Map();
    }
    // 🔴 `AC-B3` 去重（同一份文件掛在**同一類別之多個節點**只呈現一次）於此層完成，
    // 呼叫端拿到的即為「相異類別」之陣列——共用純函式，畫面與 CSV 因此不可能各算一套。
    return groupBusinessCategoriesByDocument(flat);
  }

  /** `AC-38` 交易一致性：掛載／移除 ＋ CHANGE_LOG ＋ SNAPSHOT 於同一交易內提交。 */
  async runStructuralChange<T>(
    work: (tx: BusinessCategoryDocsStructuralTx) => Promise<T>,
  ): Promise<T> {
    const ds = await this.init();
    return ds.transaction(async (m) => {
      const tx: BusinessCategoryDocsStructuralTx = {
        getNode: (bc, nodeId) => this.getNodeWith(m, bc, nodeId),
        mount: (nodeId, docId, by, at) => this.mountWith(m, nodeId, docId, by, at),
        unmount: (nodeId, docId) => this.unmountWith(m, nodeId, docId),
        recordStructuralChange: (event) => recordBusinessCategoryStructuralChange(m, event),
      };
      return work(tx);
    });
  }
}
