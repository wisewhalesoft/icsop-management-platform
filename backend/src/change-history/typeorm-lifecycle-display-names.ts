import { DataSource, In } from 'typeorm';
import { Lifecycle } from '../database/entities/lifecycle.entity';
import { chunkByParamBudget } from '../org-sync/param-batching';
import { lifecycleDisplayName } from '../lifecycle/lifecycle-subcategory';
import { LifecycleDisplayNames } from './lifecycle-display-names';

/**
 * `LifecycleDisplayNames` 之 TypeORM 實作：批次讀 `LIFECYCLE` 之**當前** name／subcategory，
 * 並以與前後台一致之 `lifecycleDisplayName()` 組合（F038 `AC-D2` ④：取當前值、非日誌快照）。
 *
 * ⚠ MSSQL 2100 參數上限 → 單欄 IN 切批（每批 ≤1000，比照 `TypeOrmDocumentNameLookup`）。
 * 查詢失敗時回空 Map，由呼叫端 fallback 為 id——匯出不因名稱解析而整批失敗。
 */
export class TypeOrmLifecycleDisplayNames implements LifecycleDisplayNames {
  constructor(private readonly ds: DataSource) {}

  private async init(): Promise<DataSource> {
    if (!this.ds.isInitialized) await this.ds.initialize();
    return this.ds;
  }

  async findDisplayNamesByIds(lifecycleIds: string[]): Promise<Map<string, string>> {
    const keys = [...new Set(lifecycleIds.filter(Boolean))];
    if (keys.length === 0) return new Map();
    try {
      const ds = await this.init();
      const repo = ds.getRepository(Lifecycle);
      const out = new Map<string, string>();
      for (const batch of chunkByParamBudget(keys, 1, 1000)) {
        const rows = await repo.find({
          where: { id: In(batch) },
          select: { id: true, name: true, subcategory: true },
        });
        for (const r of rows) out.set(r.id, lifecycleDisplayName(r));
      }
      return out;
    } catch {
      return new Map();
    }
  }
}
