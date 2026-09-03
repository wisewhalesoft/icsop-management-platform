import { DataSource } from 'typeorm';
import { BusinessCategory } from '../database/entities/business-category.entity';
import { BusinessCategoryNode } from '../database/entities/business-category-node.entity';
import { BusinessCategoryEdge } from '../database/entities/business-category-edge.entity';
import { BusinessCategoryDoc } from '../database/entities/business-category-doc.entity';
import { IcsopDocument } from '../database/entities/icsop-document.entity';
import { DocUsingDept } from '../database/entities/doc-using-dept.entity';
import { chunkByParamBudget } from '../org-sync/param-batching';
import { deriveDisplayStatus } from '../documents/display-status';
import { DocumentStatus } from '../documents/document-status';
import { UsingDeptRef } from '../rbac/viewer-scope';
import {
  BusinessCategoryOption,
  CategoryMountVisibilityRow,
  PublicBusinessCategoryStore,
  PublicCategoryEdgeInfo,
  PublicCategoryNodeInfo,
  PublicMountedDoc,
} from './public-business-category.store';

/** ISO 日期字串（`YYYY-MM-DD`）。 */
function toIsoDate(v: Date | string | null | undefined): string | null {
  if (!v) return null;
  if (typeof v === 'string') return v.slice(0, 10);
  const y = v.getUTCFullYear();
  const m = String(v.getUTCMonth() + 1).padStart(2, '0');
  const d = String(v.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * §己 前台 store 之 TypeORM 實作（決策 E4，architecture-spec §14.6.3）。
 *
 * 🔴 **不得 N+1**：`listCategoryMountsForVisibility()` 為**固定 2 次查詢**
 * （主 JOIN ＋ `DOC_USING_DEPT` 之批次反查），**與節點數無關**。
 * 🔴 `announced` 於本層算出，**逐字重用既有 `deriveDisplayStatus()`**（與前台清單、後台清單
 * 同一份判定）——另建一份「已公告」條件會使兩種瀏覽模式對同一份文件給出不同答案（`AC-B23`）。
 */
export class TypeOrmPublicBusinessCategoryStore implements PublicBusinessCategoryStore {
  constructor(
    private readonly ds: DataSource,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private async init(): Promise<DataSource> {
    if (!this.ds.isInitialized) await this.ds.initialize();
    return this.ds;
  }

  async listActiveCategories(): Promise<BusinessCategoryOption[]> {
    const ds = await this.init();
    const rows = await ds
      .getRepository(BusinessCategory)
      .find({ where: { status: 'active' }, order: { name: 'ASC' } });
    return rows.map((c) => ({
      id: c.id,
      name: c.name,
      subcategory: c.subcategory ?? null,
      status: c.status,
    }));
  }

  async categoryExists(id: string): Promise<boolean> {
    const ds = await this.init();
    return (await ds.getRepository(BusinessCategory).count({ where: { id } })) > 0;
  }

  async listNodes(businessCategoryId: string): Promise<PublicCategoryNodeInfo[]> {
    const ds = await this.init();
    const rows = await ds
      .getRepository(BusinessCategoryNode)
      .find({ where: { businessCategoryId } });
    return rows.map((n) => ({
      id: n.id,
      name: n.name,
      positionX: n.positionX,
      positionY: n.positionY,
    }));
  }

  async listEdges(businessCategoryId: string): Promise<PublicCategoryEdgeInfo[]> {
    const ds = await this.init();
    const rows = await ds
      .getRepository(BusinessCategoryEdge)
      .find({ where: { businessCategoryId } });
    return rows.map((e) => ({
      id: e.id,
      sourceNodeId: e.sourceNodeId,
      targetNodeId: e.targetNodeId,
    }));
  }

  /** 決策 E4：單一類別之全量掛載明細（主 JOIN ＋ 批次 usingDepts；固定 2 次查詢）。 */
  async listCategoryMountsForVisibility(
    businessCategoryId: string,
  ): Promise<CategoryMountVisibilityRow[]> {
    const ds = await this.init();
    const raw = await ds
      .getRepository(BusinessCategoryDoc)
      .createQueryBuilder('m')
      .innerJoin(BusinessCategoryNode, 'n', 'n.id = m.nodeId')
      .innerJoin(IcsopDocument, 'd', 'd.id = m.documentId')
      .select('m.nodeId', 'nodeId')
      .addSelect('m.documentId', 'documentId')
      .addSelect('d.status', 'status')
      .addSelect('d.announcedDate', 'announcedDate')
      .where('n.businessCategoryId = :businessCategoryId', { businessCategoryId })
      .getRawMany<{
        nodeId: string;
        documentId: string;
        status: string;
        announcedDate: Date | string | null;
      }>();
    if (raw.length === 0) return [];

    const deptsByDoc = await this.usingDeptsByDocument(
      ds,
      raw.map((r) => r.documentId),
    );
    const today = this.clock();
    return raw.map((r) => ({
      nodeId: r.nodeId,
      documentId: r.documentId,
      announced:
        deriveDisplayStatus(r.status as DocumentStatus, toIsoDate(r.announcedDate), today) ===
        'announced',
      usingDepts: deptsByDoc.get(r.documentId) ?? [],
    }));
  }

  /** `DOC_USING_DEPT` 之批次反查（單欄 IN 切批；MSSQL 2100 參數上限）。 */
  private async usingDeptsByDocument(
    ds: DataSource,
    documentIds: string[],
  ): Promise<Map<string, UsingDeptRef[]>> {
    const out = new Map<string, UsingDeptRef[]>();
    const keys = [...new Set(documentIds.filter(Boolean))];
    if (keys.length === 0) return out;
    for (const batch of chunkByParamBudget(keys, 1, 1000)) {
      const rows = await ds
        .getRepository(DocUsingDept)
        .createQueryBuilder('u')
        .select(['u.documentId', 'u.companyCode', 'u.orgCode'])
        .where('u.documentId IN (:...ids)', { ids: batch })
        .getMany();
      for (const r of rows) {
        const bucket = out.get(r.documentId) ?? out.set(r.documentId, []).get(r.documentId)!;
        bucket.push({ companyCode: r.companyCode, orgCode: r.orgCode });
      }
    }
    return out;
  }

  async getMountedDoc(documentId: string): Promise<PublicMountedDoc | null> {
    const ds = await this.init();
    const d = await ds.getRepository(IcsopDocument).findOne({ where: { id: documentId } });
    if (!d) return null;
    return {
      id: d.id,
      documentNumber: d.documentNumber,
      documentName: d.documentName,
      edition: d.edition ?? null,
      announcedDate: toIsoDate(d.announcedDate),
    };
  }
}
