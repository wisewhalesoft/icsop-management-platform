/**
 * F043 業務/功能類別管理 — PublicBusinessCategoryService（§己 前台瀏覽，決策 E4：可見性過濾於查詢層）
 *
 * 權威：docs/specs/features/F019-public-list-browsing.md#business-category-browse-delta
 *      （AC-B17／AC-B18／AC-B20／AC-B21／AC-B22／AC-B23）
 *      ＋ docs/specs/architecture-spec.md §14.6.3（決策 E4：`listCategoryMountsForVisibility()`
 *        單一 JOIN 查詢＋服務層一次性套用既有 `isDocVisibleToViewer()`，不得 N+1）
 *      ＋ §14.7（deny-by-default 唯一施加點：查詢層）。
 * 僅讀取既有 `rbac/viewer-scope.spec.ts` 以沿用 `isDocVisibleToViewer(usingDepts, viewer)` 之
 * 既有簽章與 `ViewerScope`／`UsingDeptRef` 形狀，非決定本功能行為（該純函式本身零修改）。
 *
 * ⚠ 對實作全盲：`./public-business-category.service` 尚不存在。
 */
import { isDocVisibleToViewer, UsingDeptRef, ViewerScope } from '../rbac/viewer-scope';
import { PublicBusinessCategoryService } from './public-business-category.service';
import {
  PublicBusinessCategoryStore,
  BusinessCategoryOption,
  CategoryMountVisibilityRow,
  PublicCategoryNodeInfo,
  PublicMountedDoc,
} from './public-business-category.store';

function viewer(over: Partial<ViewerScope>): ViewerScope {
  return { roleCode: 'User', userSubtype: 'business', orgCode: 'JAC00', companyCode: 'AS', ...over };
}
function depts(codes: string[], companyCode = 'AS'): UsingDeptRef[] {
  return codes.map((orgCode) => ({ companyCode, orgCode }));
}

class FakeStore implements PublicBusinessCategoryStore {
  categories: BusinessCategoryOption[] = [];
  nodesByCategory = new Map<string, PublicCategoryNodeInfo[]>();
  mountsByCategory = new Map<string, CategoryMountVisibilityRow[]>();
  docsById = new Map<string, PublicMountedDoc>();

  listActiveCategories(): Promise<BusinessCategoryOption[]> {
    return Promise.resolve(this.categories.filter((c) => c.status === 'active'));
  }
  categoryExists(id: string): Promise<boolean> {
    return Promise.resolve(this.categories.some((c) => c.id === id));
  }
  listNodes(businessCategoryId: string): Promise<PublicCategoryNodeInfo[]> {
    return Promise.resolve(this.nodesByCategory.get(businessCategoryId) ?? []);
  }
  listCategoryMountsForVisibility(businessCategoryId: string): Promise<CategoryMountVisibilityRow[]> {
    return Promise.resolve(this.mountsByCategory.get(businessCategoryId) ?? []);
  }
  getMountedDoc(documentId: string): Promise<PublicMountedDoc | null> {
    return Promise.resolve(this.docsById.get(documentId) ?? null);
  }
}

describe('PublicBusinessCategoryService.getGraph（F043 AC-B16／AC-B21：可見性過濾後之掛載數）', () => {
  let store: FakeStore;
  let svc: PublicBusinessCategoryService;
  beforeEach(() => {
    store = new FakeStore();
    svc = new PublicBusinessCategoryService(store);
    store.categories.push({ id: 'bc1', name: '授信', subcategory: '消金', status: 'active' });
    store.nodesByCategory.set('bc1', [
      { id: 'n1', name: '授信申請作業' },
      { id: 'n2', name: '風險評估作業' },
    ]);
  });

  it('AC-B21 節點掛載 5 份，其中對該 viewer 僅 2 份可見 → data-visible-doc-count 對應之 N=2（非 5）', async () => {
    const v = viewer({ roleCode: 'User', userSubtype: 'business', orgCode: 'JAC00' });
    store.mountsByCategory.set('bc1', [
      { nodeId: 'n1', documentId: 'd1', announced: true, usingDepts: depts(['JAC00']) }, // 可見
      { nodeId: 'n1', documentId: 'd2', announced: true, usingDepts: depts(['JAC00']) }, // 可見
      { nodeId: 'n1', documentId: 'd3', announced: true, usingDepts: depts(['JBB00']) }, // 不可見（部門不符）
      { nodeId: 'n1', documentId: 'd4', announced: false, usingDepts: depts(['JAC00']) }, // 不可見（未公告）
      { nodeId: 'n1', documentId: 'd5', announced: true, usingDepts: depts(['JCC00']) }, // 不可見
    ]);
    const g = await svc.getGraph('bc1', v);
    const n1 = g.nodes.find((n) => n.id === 'n1')!;
    expect(n1.visibleDocCount).toBe(2);
  });

  it('AC-B21 §該節點掛載文件對該 viewer 全部不可見 → visibleDocCount=0（非「尚未掛載」之特殊值——語意上仍為 0）', async () => {
    const v = viewer({ orgCode: 'JAC00' });
    store.mountsByCategory.set('bc1', [{ nodeId: 'n1', documentId: 'd1', announced: true, usingDepts: depts(['JZZ00']) }]);
    const g = await svc.getGraph('bc1', v);
    expect(g.nodes.find((n) => n.id === 'n1')!.visibleDocCount).toBe(0);
  });

  it('🔴 決策 E4：本函式呼叫既有 isDocVisibleToViewer（不另建一份可見性判定）——以真實已知輸入輸出對照組驗證', async () => {
    const v = viewer({ roleCode: 'User', userSubtype: 'business', orgCode: 'JAC00' });
    const row: CategoryMountVisibilityRow = { nodeId: 'n1', documentId: 'd1', announced: true, usingDepts: depts(['JAC00']) };
    store.mountsByCategory.set('bc1', [row]);
    // 對照組：直接以既有純函式驗證同一筆資料之可見性判定，應與服務層算出的 count 一致。
    const directlyVisible = isDocVisibleToViewer(row.usingDepts, v) && row.announced;
    const g = await svc.getGraph('bc1', v);
    expect(g.nodes.find((n) => n.id === 'n1')!.visibleDocCount).toBe(directlyVisible ? 1 : 0);
  });

  it('AC-B34（多 parent/child、頁面框架）：節點集合與邊集合皆回傳（非本測試重點，僅結構存在性）', async () => {
    const g = await svc.getGraph('bc1', viewer({}));
    expect(g.nodes).toHaveLength(2);
  });

  it('類別不存在 → BUSINESS_CATEGORY_NOT_FOUND', async () => {
    await expect(svc.getGraph('ghost', viewer({}))).rejects.toThrow('BUSINESS_CATEGORY_NOT_FOUND');
  });
});

describe('PublicBusinessCategoryService.listNodeDocuments（F043 AC-B20／AC-B22：deny-by-default 於查詢層）', () => {
  let store: FakeStore;
  let svc: PublicBusinessCategoryService;
  beforeEach(() => {
    store = new FakeStore();
    svc = new PublicBusinessCategoryService(store);
    store.categories.push({ id: 'bc1', name: '授信', subcategory: null, status: 'active' });
    store.nodesByCategory.set('bc1', [{ id: 'n1', name: '授信申請作業' }]);
    store.docsById.set('d1', { id: 'd1', documentNumber: 'ICSOP-A', documentName: '授信申請作業程序', edition: '26\'01', announcedDate: '2026-01-01' });
    store.docsById.set('d2', { id: 'd2', documentNumber: 'ICSOP-B', documentName: '風管審查程序', edition: '26\'01', announcedDate: '2026-01-01' });
  });

  it('回應僅含對該 viewer 可見之文件（不可見文件之任何欄位皆不外洩）', async () => {
    const v = viewer({ orgCode: 'JAC00' });
    store.mountsByCategory.set('bc1', [
      { nodeId: 'n1', documentId: 'd1', announced: true, usingDepts: depts(['JAC00']) },
      { nodeId: 'n1', documentId: 'd2', announced: true, usingDepts: depts(['JZZ00']) }, // 不可見
    ]);
    const docs = await svc.listNodeDocuments('bc1', 'n1', v);
    expect(docs.map((d) => d.id)).toEqual(['d1']);
    expect(docs.some((d) => d.id === 'd2')).toBe(false);
    // 不可見文件之任何欄位（documentNumber/documentName）不得出現於回應之任一處。
    expect(JSON.stringify(docs)).not.toContain('ICSOP-B');
    expect(JSON.stringify(docs)).not.toContain('風管審查程序');
  });

  it('AC-B22 §deny-by-default 在查詢層：不存在之 businessCategoryId → BUSINESS_CATEGORY_NOT_FOUND（不先取全量再前端過濾）', async () => {
    await expect(svc.listNodeDocuments('ghost', 'n1', viewer({}))).rejects.toThrow('BUSINESS_CATEGORY_NOT_FOUND');
  });

  it('該節點無任何對該 viewer 可見之文件 → 空陣列（非錯誤）', async () => {
    const v = viewer({ orgCode: 'JAC00' });
    store.mountsByCategory.set('bc1', [{ nodeId: 'n1', documentId: 'd1', announced: true, usingDepts: depts(['JZZ00']) }]);
    const docs = await svc.listNodeDocuments('bc1', 'n1', v);
    expect(docs).toEqual([]);
  });
});

describe('PublicBusinessCategoryService.listCategories（F043 AC-B18：僅列 active 且對該 viewer 至少一份可見文件之類別）', () => {
  let store: FakeStore;
  let svc: PublicBusinessCategoryService;
  beforeEach(() => {
    store = new FakeStore();
    svc = new PublicBusinessCategoryService(store);
  });

  it('🔴 語料鑑別力：類別 A（active，有節點有掛載但對此 viewer 全不可見）不得入列；類別 B（active，至少一份可見）入列；類別 C（inactive）不得入列', async () => {
    const v = viewer({ orgCode: 'JAC00' });
    store.categories.push(
      { id: 'A', name: '帳務處理', subcategory: null, status: 'active' },
      { id: 'B', name: '授信', subcategory: null, status: 'active' },
      { id: 'C', name: '風險管理', subcategory: null, status: 'inactive' },
    );
    store.mountsByCategory.set('A', [{ nodeId: 'nA', documentId: 'dA', announced: true, usingDepts: depts(['JZZ00']) }]);
    store.mountsByCategory.set('B', [{ nodeId: 'nB', documentId: 'dB', announced: true, usingDepts: depts(['JAC00']) }]);
    store.mountsByCategory.set('C', [{ nodeId: 'nC', documentId: 'dC', announced: true, usingDepts: depts(['JAC00']) }]);

    const options = await svc.listCategories(v);
    expect(options.map((o) => o.id)).toEqual(['B']);
  });

  it('選項顯示字串＝businessCategoryDisplayName 之輸出；選項值＝businessCategoryId（非名稱）', async () => {
    const v = viewer({ orgCode: 'JAC00' });
    store.categories.push({ id: 'bc-x', name: '授信', subcategory: '消金', status: 'active' });
    store.mountsByCategory.set('bc-x', [{ nodeId: 'n1', documentId: 'd1', announced: true, usingDepts: depts(['JAC00']) }]);
    const options = await svc.listCategories(v);
    expect(options[0].id).toBe('bc-x');
    expect(options[0].displayName).toBe('授信（消金）');
  });

  it('對該 viewer 全無可用類別 → 空陣列（非錯誤，AC-B19 之空狀態由前端呈現）', async () => {
    const v = viewer({ orgCode: 'JAC00' });
    store.categories.push({ id: 'bc-x', name: '授信', subcategory: null, status: 'active' });
    store.mountsByCategory.set('bc-x', [{ nodeId: 'n1', documentId: 'd1', announced: true, usingDepts: depts(['JZZ00']) }]);
    await expect(svc.listCategories(v)).resolves.toEqual([]);
  });
});
