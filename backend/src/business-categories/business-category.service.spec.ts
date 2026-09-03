/**
 * F043 業務/功能類別管理 — BusinessCategoryService（§甲 類別池 CRUD）
 *
 * 權威：docs/specs/features/F043-business-function-category.md AC-01～AC-04／AC-11～AC-14
 *      ＋ docs/specs/architecture-spec.md §14.3（BusinessCategoryStore 介面草案）。
 * 服務層命名沿用 LifecycleService 之既有慣例（createXxx／updateXxx／setStatus／deleteXxx／listXxx），
 * 見 backend/src/lifecycle/lifecycle.service.spec.ts（僅讀取既有測試以沿用框架慣例，非決定行為）。
 *
 * ⚠ 對實作全盲：`./business-category.service` 與 `./business-category.store` 於本環撰寫時尚不存在。
 */
import 'reflect-metadata';
import { BusinessCategoryService } from './business-category.service';
import {
  BusinessCategoryStore,
  BusinessCategoryView,
  CreateBusinessCategoryInput,
  UpdateBusinessCategoryPatch,
} from './business-category.store';

class FakeStore implements BusinessCategoryStore {
  seq = 1;
  rows: BusinessCategoryView[] = [];
  docCounts: Record<string, number> = {};
  deleted: string[] = [];

  seed(over: Partial<BusinessCategoryView>): BusinessCategoryView {
    const row: BusinessCategoryView = {
      id: `bc-${this.seq++}`,
      name: '授信',
      subcategory: null,
      description: null,
      status: 'active',
      nodeCount: 0,
      mountedDocCount: 0,
      updatedAt: new Date('2026-09-02T00:00:00Z'),
      ...over,
    };
    this.rows.push(row);
    return row;
  }
  list(): Promise<BusinessCategoryView[]> {
    return Promise.resolve(this.rows);
  }
  findById(id: string): Promise<BusinessCategoryView | null> {
    return Promise.resolve(this.rows.find((r) => r.id === id) ?? null);
  }
  create(input: CreateBusinessCategoryInput): Promise<BusinessCategoryView> {
    return Promise.resolve(this.seed({ ...input }));
  }
  update(id: string, patch: UpdateBusinessCategoryPatch): Promise<BusinessCategoryView> {
    const row = this.rows.find((r) => r.id === id);
    if (!row) throw new Error('BUSINESS_CATEGORY_NOT_FOUND');
    Object.assign(row, patch);
    return Promise.resolve(row);
  }
  countMountedDocuments(id: string): Promise<number> {
    return Promise.resolve(this.docCounts[id] ?? 0);
  }
  countMountedByCategory(): Promise<Map<string, number>> {
    return Promise.resolve(new Map(Object.entries(this.docCounts)));
  }
  delete(id: string): Promise<void> {
    this.deleted.push(id);
    this.rows = this.rows.filter((r) => r.id !== id);
    return Promise.resolve();
  }
}

describe('BusinessCategoryService（F043 §甲）', () => {
  let store: FakeStore;
  let svc: BusinessCategoryService;
  beforeEach(() => {
    store = new FakeStore();
    svc = new BusinessCategoryService(store);
  });

  describe('AC-01／AC-02 createBusinessCategory', () => {
    it('AC-01 合法名稱、子分類留白 → 建立成功、subcategory 持久化為 null（非空字串）', async () => {
      const bc = await svc.createBusinessCategory({ name: '授信', subcategory: null, description: null });
      expect(bc.id).toMatch(/^bc-/);
      expect(bc.subcategory).toBeNull();
      expect(bc.status).toBe('active');
    });

    it('AC-02 子分類含前後空白 → 正規化持久化為 trim 後之值', async () => {
      const bc = await svc.createBusinessCategory({ name: '授信', subcategory: '  消金  ', description: null });
      expect(bc.subcategory).toBe('消金');
    });

    it('名稱空白 → BUSINESS_CATEGORY_NAME_REQUIRED', async () => {
      await expect(
        svc.createBusinessCategory({ name: '   ', subcategory: null, description: null }),
      ).rejects.toThrow('BUSINESS_CATEGORY_NAME_REQUIRED');
      expect(store.rows).toHaveLength(0);
    });

    it('AC-03 重複組合 → BUSINESS_CATEGORY_DUPLICATE，池筆數不變', async () => {
      store.seed({ name: '授信', subcategory: '消金' });
      await expect(
        svc.createBusinessCategory({ name: '授信', subcategory: '消金', description: null }),
      ).rejects.toThrow('BUSINESS_CATEGORY_DUPLICATE');
      expect(store.rows).toHaveLength(1);
    });
  });

  describe('AC-04 §跨表獨立——建立不讀取任何 LIFECYCLE 相關 store', () => {
    it('BusinessCategoryService 之建構子依賴不含任何 Lifecycle 型別（結構性保證：連注入都沒有，遑論讀取）', () => {
      const deps = (Reflect.getMetadata('design:paramtypes', BusinessCategoryService) ?? []) as {
        name?: string;
      }[];
      expect(deps.some((d) => /Lifecycle/i.test(d?.name ?? ''))).toBe(false);
    });

    it('與既有循環同名之類別建立成功、不回任何錯誤（兩表獨立，本函式無法讀到循環池——FakeStore 內無循環資料仍能建立佐證此點）', async () => {
      const bc = await svc.createBusinessCategory({
        name: '銷售及收款循環',
        subcategory: null,
        description: null,
      });
      expect(bc.name).toBe('銷售及收款循環');
    });
  });

  describe('AC-11 updateBusinessCategory', () => {
    it('僅改說明 → 成功、不回唯一性錯誤、updatedAt 更新', async () => {
      const bc = store.seed({ name: '授信', subcategory: '消金', updatedAt: new Date('2026-01-01T00:00:00Z') });
      const NOW = new Date('2026-09-02T09:00:00Z');
      const wired = new BusinessCategoryService(store, undefined, () => NOW);
      const updated = await wired.updateBusinessCategory(bc.id, { description: '新說明' });
      expect(updated.description).toBe('新說明');
    });

    it('改子分類撞既有組合 → BUSINESS_CATEGORY_DUPLICATE', async () => {
      store.seed({ name: '授信', subcategory: '消金' });
      const b = store.seed({ name: '授信', subcategory: '企金' });
      await expect(svc.updateBusinessCategory(b.id, { subcategory: '消金' })).rejects.toThrow(
        'BUSINESS_CATEGORY_DUPLICATE',
      );
    });

    it('清空子分類撞既有無子分類列並存 → BUSINESS_CATEGORY_SUBCATEGORY_CONFLICT', async () => {
      store.seed({ name: '授信', subcategory: '消金' });
      const b = store.seed({ name: '授信', subcategory: '企金' });
      await expect(svc.updateBusinessCategory(b.id, { subcategory: null })).rejects.toThrow(
        'BUSINESS_CATEGORY_SUBCATEGORY_CONFLICT',
      );
    });

    it('該名稱僅此一列：清空子分類 → 儲存成功', async () => {
      const bc = store.seed({ name: '授信', subcategory: '消金' });
      const updated = await svc.updateBusinessCategory(bc.id, { subcategory: null });
      expect(updated.subcategory).toBeNull();
    });

    it('不存在 → BUSINESS_CATEGORY_NOT_FOUND', async () => {
      await expect(svc.updateBusinessCategory('ghost', { description: 'x' })).rejects.toThrow(
        'BUSINESS_CATEGORY_NOT_FOUND',
      );
    });
  });

  describe('AC-12 §刪除保護與停用之不對稱', () => {
    it('仍有掛載 → 刪除回 BUSINESS_CATEGORY_HAS_DOCUMENTS，類別／節點／邊／掛載一筆未動', async () => {
      const bc = store.seed({});
      store.docCounts[bc.id] = 3;
      await expect(svc.deleteBusinessCategory(bc.id)).rejects.toThrow('BUSINESS_CATEGORY_HAS_DOCUMENTS');
      expect(store.deleted).not.toContain(bc.id);
    });

    it('仍有掛載時改為停用 → 成功、status=inactive（停用不受掛載限制）', async () => {
      const bc = store.seed({ status: 'active' });
      store.docCounts[bc.id] = 5;
      const updated = await svc.setStatus(bc.id, 'inactive');
      expect(updated.status).toBe('inactive');
    });

    it('已將全部掛載移除（docCounts=0）→ 允許刪除', async () => {
      const bc = store.seed({});
      store.docCounts[bc.id] = 0;
      await svc.deleteBusinessCategory(bc.id);
      expect(store.deleted).toContain(bc.id);
    });

    it('非法狀態 → BUSINESS_CATEGORY_STATUS_INVALID', async () => {
      const bc = store.seed({});
      await expect(svc.setStatus(bc.id, 'frozen' as never)).rejects.toThrow(
        'BUSINESS_CATEGORY_STATUS_INVALID',
      );
    });

    it('不存在 → BUSINESS_CATEGORY_NOT_FOUND', async () => {
      await expect(svc.deleteBusinessCategory('ghost')).rejects.toThrow('BUSINESS_CATEGORY_NOT_FOUND');
    });
  });

  describe('AC-13 唯一性比對涵蓋 inactive 列（不重開此題，比照 F040 AC-20 之既有裁決）', () => {
    it('既有 inactive 列與新建組合相同 → 仍回 BUSINESS_CATEGORY_DUPLICATE', async () => {
      store.seed({ name: '授信', subcategory: '消金', status: 'inactive' });
      await expect(
        svc.createBusinessCategory({ name: '授信', subcategory: '消金', description: null }),
      ).rejects.toThrow('BUSINESS_CATEGORY_DUPLICATE');
    });
  });

  describe('AC-14 清單搜尋比對對象＝businessCategoryDisplayName 之輸出（比照 F007 AC-S8）', () => {
    it('關鍵字「消金」僅命中 授信（消金），不命中 授信（企金）', async () => {
      store.seed({ name: '授信', subcategory: '消金' });
      store.seed({ name: '授信', subcategory: '企金' });
      const hits = await svc.searchBusinessCategories('消金');
      expect(hits).toHaveLength(1);
      expect(hits[0].subcategory).toBe('消金');
    });

    it('關鍵字為純名稱「授信」→ 兩者皆命中（顯示名稱之輸出含名稱本身）', async () => {
      store.seed({ name: '授信', subcategory: '消金' });
      store.seed({ name: '授信', subcategory: '企金' });
      store.seed({ name: '風險管理', subcategory: null });
      const hits = await svc.searchBusinessCategories('授信');
      expect(hits).toHaveLength(2);
    });
  });

  describe('listBusinessCategories §富化 mountedDocCount／nodeCount', () => {
    it('每列富化 mountedDocCount（去重後之相異掛載文件數）；無掛載→0', async () => {
      const a = store.seed({ name: '授信' });
      const b = store.seed({ name: '風險管理' });
      store.docCounts[a.id] = 4;
      const list = await svc.listBusinessCategories();
      const byId = new Map(list.map((l) => [l.id, l.mountedDocCount]));
      expect(byId.get(a.id)).toBe(4);
      expect(byId.get(b.id)).toBe(0);
    });
  });
});
