import { DataSource } from 'typeorm';
import { BusinessCategory } from '../database/entities/business-category.entity';
import { BusinessCategoryNode } from '../database/entities/business-category-node.entity';
import { sortByOrderThenName } from './business-category-sort';
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
      sortOrder: c.sortOrder,
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

  /**
   * `AC-UX32` ①：類別池清單改依 **`sortOrder` 昇冪、同值時 `name` 昇冪**
   * （📝 已作廢、⚠ 不得復原：`OLD>` `order: { updatedAt: 'DESC' }`）。
   *
   * 🔴 **SQL 只排 `sortOrder`，`name` 次鍵一律留給應用層**（`ARCH-UX5` 路線 (b)）：
   * `BUSINESS_CATEGORY.name` 無欄位級 `COLLATE` 覆寫 ⇒ SQL 之 `ORDER BY name` 走資料庫預設
   * `Chinese_Taiwan_Stroke_BIN`——`_BIN`（非 `_BIN2`）之第一字元採 locale 排序權重（本 locale
   * ＝**筆畫序**），**不是** `AC-UX31` ③ 要求之 UTF-16 碼位序。⚠ collation 名字裡的 `BIN`
   * 會誘使下一個人推論「那不就是碼位序嗎」而把應用層定序拿掉，故此處明文留檔。
   * 🔒 本頁與前台類別下拉、F017 第 14 項篩選下拉**共用同一支** `sortByOrderThenName()`。
   */
  async list(): Promise<BusinessCategoryView[]> {
    const ds = await this.init();
    const rows = sortByOrderThenName(
      await ds.getRepository(BusinessCategory).find({ order: { sortOrder: 'ASC' } }),
    );
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

  /**
   * `AC-UX31` ②：新增類別之預設排序值 ＝ `max(sortOrder) + 10` ⇒ 排在最後；表空時首筆為 `10`。
   * 🔴 `max()` **涵蓋全部列、不分 `status`**——停用者仍佔序位（`AC-UX31` ①），排除它會產生
   * 重複序位。`ISNULL(MAX(...), 0) + 10` 讓「表空」不需另寫特判分支。
   */
  private async nextSortOrder(ds: DataSource): Promise<number> {
    const rows = await ds.query(
      `SELECT ISNULL(MAX([sortOrder]), 0) + 10 AS nextValue FROM [BUSINESS_CATEGORY]`,
    );
    return Number(rows?.[0]?.nextValue ?? 10);
  }

  async create(input: CreateBusinessCategoryInput): Promise<BusinessCategoryView> {
    const ds = await this.init();
    const repo = ds.getRepository(BusinessCategory);
    const now = new Date();
    const sortOrder = await this.nextSortOrder(ds);
    // 🔴 白名單逐欄對帳（architecture-spec §14.4）：`name`／`subcategory`／`description`／
    // `status`／`sortOrder`／`createdAt`／`updatedAt` 七欄缺一不可——`repo.create()` 會靜默丟掉
    // 非 entity property 名之鍵，NOT NULL 欄漏列即「值人間蒸發」→ 建立時必 500。
    const saved = await repo.save(
      repo.create({
        name: input.name,
        subcategory: input.subcategory ?? null,
        description: input.description,
        status: 'active',
        sortOrder,
        createdAt: now,
        updatedAt: now,
      }),
    );
    return TypeOrmBusinessCategoryStore.toView(saved, 0, 0);
  }

  /**
   * 🔒 **純調序不動 `updatedAt`**（權威＝`prototypes/26-business-category-list.html` 之
   * `setSortOrder`／`bumpSortOrder`，兩者皆未觸及 `updated` 欄）：清單之「最後更新」欄回答的是
   * 「這個類別的內容什麼時候被改過」，調序既不進變更歷程、也不記稽核（`AC-UX39` ⑦），
   * 讓它把每一次按上下鈕都印成一次「更新」會使該欄失去原本的意義。
   */
  async update(id: string, patch: UpdateBusinessCategoryPatch): Promise<BusinessCategoryView> {
    const ds = await this.init();
    const touchesContent = Object.keys(patch).some((k) => k !== 'sortOrder');
    await ds
      .getRepository(BusinessCategory)
      .update({ id }, { ...patch, ...(touchesContent ? { updatedAt: new Date() } : {}) });
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
