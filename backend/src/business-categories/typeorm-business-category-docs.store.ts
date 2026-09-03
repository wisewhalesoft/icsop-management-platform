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

  /**
   * `AC-20`／`AC-28`：候選＝**全部** ICSOP 文件（關鍵字比對編號 ∪ 書名；分頁），
   * 排除 `excludeDocumentIds`（＝本節點已掛載者，見服務層）。
   *
   * 🔴 **`total`／`lifecycleCount` 必須是「全集」之統計、不是「當前頁」的**（2026-09-03 缺陷）。
   * 本方法以**單一往返**同時取回三者：`stats` CTE 對**過濾後、未分頁**之全集聚合，
   * `paged` CTE 才套 `OFFSET/FETCH`，兩者以 `LEFT JOIN` 相接。
   * ⚠ **為何不用 `COUNT(*) OVER ()` 之視窗函式**：視窗值只存在於**回傳的列**上，當該頁為空
   * （0 筆結果、或頁碼超出末頁）時一列都沒有 ⇒ 統計值一併消失，只能謊報 0。
   * `stats` 為無 `GROUP BY` 之聚合，**恆回一列**，`LEFT JOIN` 因此保證結果至少一列，
   * 空頁時該列之 `id` 為 `NULL`（下方據此判定為無 item），統計值依然正確。
   * ⚠ **也不用 `getManyAndCount()`**：它本身就是兩趟（SELECT ＋ COUNT），再加一趟 DISTINCT 就是三趟。
   */
  async listCandidateDocs(query: {
    keyword?: string;
    page: number;
    pageSize: number;
    excludeDocumentIds?: string[];
  }): Promise<{ items: CandidateDocRef[]; total: number; lifecycleCount: number }> {
    const ds = await this.init();
    const params: unknown[] = [];
    const conditions: string[] = [];

    const kw = query.keyword?.trim();
    if (kw) {
      const at = params.length;
      params.push(`%${kw}%`, `%${kw}%`);
      conditions.push(`(d.[documentNumber] LIKE @${at} OR d.[documentName] LIKE @${at + 1})`);
    }

    /**
     * 🔴 排除「已掛載於本節點」者（`AC-24`：列為候選＝提供一個必然 409 的死動作）。
     *
     * ⚠ **關於 MSSQL 2100 參數上限**：切批（`chunkByParamBudget`）在此**幫不上忙**——
     * 該上限是**每個 statement** 的，把一個 `NOT IN` 拆成多個 `AND` 相接之 `NOT IN` 仍在
     * 同一個 statement、參數總量不變。真正的界限來自語意：本清單是「**單一節點**已掛載之
     * 相異文件」，其上界為 `ICSOP_DOCUMENT` 之總筆數（今日 591），且 `(nodeId, documentId)`
     * 有唯一鍵故無重複列 ⇒ 今日結構上不可能逼近 2100。
     * 🔴 **若日後文件總數逼近 ~2000**，本處須改為以 `nodeId` 直接 `NOT EXISTS` 關聯
     * `BUSINESS_CATEGORY_DOC`（參數量恆為 1，與掛載數無關）——但那需要把 `nodeId` 加入本方法
     * 之簽章，屬契約變更，故本輪不做、於此明文標記觸發條件。
     * 🔒 空陣列 → **完全不加任何條件**（`NOT IN ()` 在 SQL 中非法，語意上也不該排除任何東西）。
     */
    const excluded = [...new Set((query.excludeDocumentIds ?? []).filter(Boolean))];
    if (excluded.length > 0) {
      const placeholders = excluded.map((id) => {
        params.push(id);
        return `@${params.length - 1}`;
      });
      conditions.push(`d.[id] NOT IN (${placeholders.join(',')})`);
    }

    const offsetAt = params.length;
    params.push((Math.max(query.page, 1) - 1) * query.pageSize, query.pageSize);
    // ⚠ `d.[lifecycleId]` 於下方僅被 **SELECT 出來**（純資訊回傳）與**聚合成統計**；
    // 🔴 `WHERE` 子句由上方 `conditions` 組成，其中**沒有、也不得有**任何以它為條件之項目（`AC-20`）。
    const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await ds.query(
      `WITH filtered AS (
         SELECT d.[id], d.[documentNumber], d.[documentName], d.[lifecycleId]
           FROM [ICSOP_DOCUMENT] d
           ${whereSql}
       ),
       stats AS (
         SELECT COUNT(*) AS [total], COUNT(DISTINCT [lifecycleId]) AS [lifecycleCount]
           FROM filtered
       ),
       paged AS (
         SELECT [id], [documentNumber], [documentName], [lifecycleId]
           FROM filtered
          ORDER BY [documentNumber] ASC
          OFFSET @${offsetAt} ROWS FETCH NEXT @${offsetAt + 1} ROWS ONLY
       )
       SELECT s.[total], s.[lifecycleCount],
              p.[id], p.[documentNumber], p.[documentName], p.[lifecycleId]
         FROM stats s
         LEFT JOIN paged p ON 1 = 1
        ORDER BY p.[documentNumber] ASC`,
      params,
    );

    type Raw = {
      total: number | string;
      lifecycleCount: number | string;
      id: string | null;
      documentNumber: string | null;
      documentName: string | null;
      lifecycleId: string | null;
    };
    const raw = (rows ?? []) as Raw[];
    // `stats` 恆回一列 ⇒ `raw[0]` 必存在；空頁時其 `id` 為 null（下方 filter 濾掉）。
    const total = Number(raw[0]?.total ?? 0);
    const lifecycleCount = Number(raw[0]?.lifecycleCount ?? 0);
    const page = raw.filter((r): r is Raw & { id: string } => r.id !== null);

    // 🔴 兩段**純資訊**富化（`AC-20`：不參與過濾，只是讓抽屜能顯示「這份文件目前在哪裡」）。
    // 兩者皆為**固定次數之批次查詢**（往返數與候選筆數無關），非 N+1。
    const [lifecycleNames, otherMounts] = await Promise.all([
      this.lifecycleNamesByDocument(
        ds,
        page.map((r) => ({ id: r.id, lifecycleId: r.lifecycleId })),
      ),
      this.otherMountsByDocument(
        ds,
        page.map((r) => r.id),
      ),
    ]);
    return {
      items: page.map((r) => ({
        id: r.id,
        documentNumber: r.documentNumber ?? '',
        documentName: r.documentName ?? '',
        lifecycleId: r.lifecycleId ?? null,
        lifecycleName: lifecycleNames.get(r.id) ?? null,
        otherMounts: otherMounts.get(r.id) ?? [],
      })),
      total,
      lifecycleCount,
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
