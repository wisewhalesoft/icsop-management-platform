import { DataSource } from 'typeorm';
import { BusinessCategory } from '../database/entities/business-category.entity';
import { BusinessCategoryNode } from '../database/entities/business-category-node.entity';
import {
  BusinessCategoryStore,
  BusinessCategoryStatus,
  BusinessCategoryView,
  CreateBusinessCategoryInput,
  UpdateBusinessCategoryPatch,
} from './business-category.store';

/** 業務/功能類別 store 之 TypeORM 實作（AppDataSource 單例、延遲初始化）。 */
export class TypeOrmBusinessCategoryStore implements BusinessCategoryStore {
  constructor(private readonly ds: DataSource) {}

  private async init(): Promise<DataSource> {
    if (!this.ds.isInitialized) await this.ds.initialize();
    return this.ds;
  }

  private static toView(
    c: BusinessCategory,
    nodeCount: number,
    mountedDocCount = 0,
  ): BusinessCategoryView {
    return {
      id: c.id,
      name: c.name,
      // INV-B3 之讀取端保險：空字串／undefined 一律收斂為 null。
      subcategory: c.subcategory ?? null,
      description: c.description,
      status: c.status as BusinessCategoryStatus,
      nodeCount,
      mountedDocCount,
      updatedAt: c.updatedAt,
    };
  }

  private async nodeCounts(ds: DataSource): Promise<Map<string, number>> {
    const raw = await ds
      .getRepository(BusinessCategoryNode)
      .createQueryBuilder('n')
      .select('n.businessCategoryId', 'businessCategoryId')
      .addSelect('COUNT(*)', 'cnt')
      .groupBy('n.businessCategoryId')
      .getRawMany<{ businessCategoryId: string; cnt: string | number }>();
    return new Map(raw.map((r) => [r.businessCategoryId, Number(r.cnt)]));
  }

  async list(): Promise<BusinessCategoryView[]> {
    const ds = await this.init();
    const rows = await ds.getRepository(BusinessCategory).find({ order: { updatedAt: 'DESC' } });
    const [counts, mounted] = await Promise.all([
      this.nodeCounts(ds),
      this.countMountedByCategory(),
    ]);
    return rows.map((c) =>
      TypeOrmBusinessCategoryStore.toView(c, counts.get(c.id) ?? 0, mounted.get(c.id) ?? 0),
    );
  }

  async findById(id: string): Promise<BusinessCategoryView | null> {
    const ds = await this.init();
    const c = await ds.getRepository(BusinessCategory).findOne({ where: { id } });
    if (!c) return null;
    const cnt = await ds
      .getRepository(BusinessCategoryNode)
      .count({ where: { businessCategoryId: id } });
    return TypeOrmBusinessCategoryStore.toView(c, cnt, await this.countMountedDocuments(id));
  }

  async create(input: CreateBusinessCategoryInput): Promise<BusinessCategoryView> {
    const ds = await this.init();
    const repo = ds.getRepository(BusinessCategory);
    const now = new Date();
    // 🔴 白名單逐欄對帳（architecture-spec §14.4）：`name`／`subcategory`／`description`／
    // `status`／`createdAt`／`updatedAt` 六欄缺一不可——`repo.create()` 會靜默丟掉非 entity
    // property 名之鍵，NOT NULL 欄漏列即「值人間蒸發」→ 建立時必 500。
    const saved = await repo.save(
      repo.create({
        name: input.name,
        subcategory: input.subcategory ?? null,
        description: input.description,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      }),
    );
    return TypeOrmBusinessCategoryStore.toView(saved, 0, 0);
  }

  async update(id: string, patch: UpdateBusinessCategoryPatch): Promise<BusinessCategoryView> {
    const ds = await this.init();
    await ds.getRepository(BusinessCategory).update({ id }, { ...patch, updatedAt: new Date() });
    const view = await this.findById(id);
    return view!;
  }

  /**
   * `AC-12` 刪除保護：該類別仍掛載之**相異文件數**。
   * 🔴 `COUNT(DISTINCT documentId)` 下推——同一份文件可掛在同一類別之**多個節點**（`AC-21`），
   * 數列數會得到比實際文件數大的值，使一個已清空的類別看起來仍不可刪。
   */
  async countMountedDocuments(id: string): Promise<number> {
    const ds = await this.init();
    try {
      const rows = await ds.query(
        `SELECT COUNT(DISTINCT d.[documentId]) AS cnt
           FROM [BUSINESS_CATEGORY_DOC] d
           JOIN [BUSINESS_CATEGORY_NODE] n ON n.[id] = d.[nodeId]
          WHERE n.[businessCategoryId] = @0`,
        [id],
      );
      return Number(rows?.[0]?.cnt ?? 0);
    } catch {
      // 來源表尚未建立 → 視為無掛載（比照既有 store 之容錯）。
      return 0;
    }
  }

  /** 清單富化：**單次** GROUP BY 取全類別之相異掛載文件數（無 N+1）。 */
  async countMountedByCategory(): Promise<Map<string, number>> {
    const ds = await this.init();
    try {
      const rows = await ds.query(
        `SELECT n.[businessCategoryId] AS businessCategoryId,
                COUNT(DISTINCT d.[documentId]) AS cnt
           FROM [BUSINESS_CATEGORY_DOC] d
           JOIN [BUSINESS_CATEGORY_NODE] n ON n.[id] = d.[nodeId]
          GROUP BY n.[businessCategoryId]`,
      );
      return new Map(
        (rows ?? []).map((r: { businessCategoryId: string; cnt: string | number }) => [
          r.businessCategoryId,
          Number(r.cnt),
        ]),
      );
    } catch {
      return new Map();
    }
  }

  /**
   * 刪除類別（含其節點／邊）。
   * 🔴 `BUSINESS_CATEGORY_NODE`／`_EDGE` 之 `businessCategoryId` **無 DB FK**（比照既有
   * LIFECYCLE 家族之一貫寫法）⇒ 連動刪除必須由應用層於**同一交易**內顯式完成，
   * 否則會留下永遠看不見、也永遠刪不掉的孤兒節點與邊。
   * 掛載列已由呼叫端事前檢查為 0（`AC-12`），此處不需再處理。
   */
  async delete(id: string): Promise<void> {
    const ds = await this.init();
    await ds.transaction(async (m) => {
      await m.query(`DELETE FROM [BUSINESS_CATEGORY_EDGE] WHERE [businessCategoryId] = @0`, [id]);
      await m.query(`DELETE FROM [BUSINESS_CATEGORY_NODE] WHERE [businessCategoryId] = @0`, [id]);
      await m.getRepository(BusinessCategory).delete({ id });
    });
  }
}
