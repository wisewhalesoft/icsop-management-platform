import { DataSource, In } from 'typeorm';
import { BusinessCategory } from '../database/entities/business-category.entity';
import { chunkByParamBudget } from '../org-sync/param-batching';
import { businessCategoryDisplayName } from '../business-categories/business-category-subcategory';
import { BusinessCategoryDisplayNames } from './business-category-display-names';

/**
 * `BusinessCategoryDisplayNames` 之 TypeORM 實作：批次讀 `BUSINESS_CATEGORY` 之**當前**
 * `name`／`subcategory`，並以與前後台一致之 `businessCategoryDisplayName()` 組合
 * （`AC-42`：取當前值、非日誌快照、非裸 id）。
 *
 * ⚠ MSSQL 2100 參數上限 → 單欄 IN 切批（每批 ≤1000，比照 `TypeOrmLifecycleDisplayNames`）。
 * 查詢失敗時回空 Map，由呼叫端 fallback 為 id——匯出不因名稱解析而整批失敗。
 *
 * 🔴 本檔僅 import 純函式（`businessCategoryDisplayName`），**不 import
 * `BusinessCategoriesModule`**——維持 `ChangeHistoryModule` 對其之單向依賴（反循環）。
 */
export class TypeOrmBusinessCategoryDisplayNames implements BusinessCategoryDisplayNames {
  constructor(private readonly ds: DataSource) {}

  private async init(): Promise<DataSource> {
    if (!this.ds.isInitialized) await this.ds.initialize();
    return this.ds;
  }

  async findDisplayNamesByIds(businessCategoryIds: string[]): Promise<Map<string, string>> {
    const keys = [...new Set(businessCategoryIds.filter(Boolean))];
    if (keys.length === 0) return new Map();
    try {
      const ds = await this.init();
      const repo = ds.getRepository(BusinessCategory);
      const out = new Map<string, string>();
      for (const batch of chunkByParamBudget(keys, 1, 1000)) {
        const rows = await repo.find({
          where: { id: In(batch) },
          select: { id: true, name: true, subcategory: true },
        });
        for (const r of rows) out.set(r.id, businessCategoryDisplayName(r));
      }
      return out;
    } catch {
      return new Map();
    }
  }
}
