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
  PublicCategoryEdgeInfo,
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
  edgesByCategory = new Map<string, PublicCategoryEdgeInfo[]>();
  mountsByCategory = new Map<string, CategoryMountVisibilityRow[]>();
  docsById = new Map<string, PublicMountedDoc>();
  /** 每次 `getMountedDoc` 之呼叫序（用以斷言「不可見者連查都不查」）。 */
  fetchedDocIds: string[] = [];

  listEdges(businessCategoryId: string): Promise<PublicCategoryEdgeInfo[]> {
    return Promise.resolve(this.edgesByCategory.get(businessCategoryId) ?? []);
  }

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
    this.fetchedDocIds.push(documentId);
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

describe('PublicBusinessCategoryService.listSubtreeDocuments（F043 AC-B20／AC-B22：子樹 ＋ deny-by-default 於查詢層）', () => {
  let store: FakeStore;
  let svc: PublicBusinessCategoryService;
  const doc = (id: string, num: string, name: string): PublicMountedDoc => ({
    id,
    documentNumber: num,
    documentName: name,
    edition: "26'01",
    announcedDate: '2026-01-01',
  });
  beforeEach(() => {
    store = new FakeStore();
    svc = new PublicBusinessCategoryService(store);
    store.categories.push({ id: 'bc1', name: '授信', subcategory: null, status: 'active' });
    // n1 → n2 → n3（一條鏈）＋ 與子樹無關之 n9。
    store.nodesByCategory.set('bc1', [
      { id: 'n1', name: '授信申請作業' },
      { id: 'n2', name: '風險評估作業' },
      { id: 'n3', name: '撥款作業' },
      { id: 'n9', name: '不相干作業' },
    ]);
    store.edgesByCategory.set('bc1', [
      { id: 'e1', sourceNodeId: 'n1', targetNodeId: 'n2' },
      { id: 'e2', sourceNodeId: 'n2', targetNodeId: 'n3' },
    ]);
    store.docsById.set('d1', doc('d1', 'ICSOP-A', '授信申請作業程序'));
    store.docsById.set('d2', doc('d2', 'ICSOP-B', '風管審查程序'));
    store.docsById.set('d3', doc('d3', 'ICSOP-C', '撥款作業程序'));
    store.docsById.set('d9', doc('d9', 'ICSOP-Z', '不相干程序'));
  });

  it('🔵 2026-09-08 delta：抽屜列出**本節點與其全部下游**之文件（原僅本節點）', async () => {
    const v = viewer({ orgCode: 'JAC00' });
    store.mountsByCategory.set('bc1', [
      { nodeId: 'n1', documentId: 'd1', announced: true, usingDepts: depts(['JAC00']) },
      { nodeId: 'n2', documentId: 'd2', announced: true, usingDepts: depts(['JAC00']) },
      { nodeId: 'n3', documentId: 'd3', announced: true, usingDepts: depts(['JAC00']) },
      // 🔴 子樹外之節點：**不得**出現（否則等於整個類別全列出來，子樹一詞失去意義）。
      { nodeId: 'n9', documentId: 'd9', announced: true, usingDepts: depts(['JAC00']) },
    ]);
    const r = await svc.listSubtreeDocuments('bc1', 'n1', v);
    expect(r.groups.map((g) => g.nodeId)).toEqual(['n1', 'n2', 'n3']);
    expect(r.groups.flatMap((g) => g.documents.map((d) => d.id))).toEqual(['d1', 'd2', 'd3']);
    expect(JSON.stringify(r)).not.toContain('ICSOP-Z');
    expect(r.totalCount).toBe(3);
    expect(r.groupedCount).toBe(3);
  });

  it('🔒 本節點恆為 groups[0]，且 nodeName 於本節點 0 份時仍可取得（不得自 groups 反推）', async () => {
    const v = viewer({ orgCode: 'JAC00' });
    store.mountsByCategory.set('bc1', [
      { nodeId: 'n2', documentId: 'd2', announced: true, usingDepts: depts(['JAC00']) },
    ]);
    const r = await svc.listSubtreeDocuments('bc1', 'n1', v);
    // 本節點無可見文件 → 不產生分組（首組是 n2），但 nodeName 仍為本節點之名。
    expect(r.groups.map((g) => g.nodeId)).toEqual(['n2']);
    expect(r.nodeName).toBe('授信申請作業');
    expect(r.nodeId).toBe('n1');
  });

  it('🔴 M:N 跨組不去重：同一份文件掛在子樹內兩個節點 → 兩組各一列，但 totalCount 為去重後之 1', async () => {
    const v = viewer({ orgCode: 'JAC00' });
    store.mountsByCategory.set('bc1', [
      { nodeId: 'n1', documentId: 'd1', announced: true, usingDepts: depts(['JAC00']) },
      { nodeId: 'n2', documentId: 'd1', announced: true, usingDepts: depts(['JAC00']) },
    ]);
    const r = await svc.listSubtreeDocuments('bc1', 'n1', v);
    expect(r.groupedCount).toBe(2);
    expect(r.totalCount).toBe(1);
  });

  it('AC-B22 可見性過濾對**下游**節點同樣施加（不可見文件之任何欄位皆不外洩，且連查都不查）', async () => {
    const v = viewer({ orgCode: 'JAC00' });
    store.mountsByCategory.set('bc1', [
      { nodeId: 'n1', documentId: 'd1', announced: true, usingDepts: depts(['JAC00']) },
      { nodeId: 'n2', documentId: 'd2', announced: true, usingDepts: depts(['JZZ00']) }, // 部門不符
      { nodeId: 'n3', documentId: 'd3', announced: false, usingDepts: depts(['JAC00']) }, // 未公告
    ]);
    const r = await svc.listSubtreeDocuments('bc1', 'n1', v);
    expect(r.groups.flatMap((g) => g.documents.map((d) => d.id))).toEqual(['d1']);
    expect(JSON.stringify(r)).not.toContain('ICSOP-B');
    expect(JSON.stringify(r)).not.toContain('風管審查程序');
    expect(store.fetchedDocIds).toEqual(['d1']);
  });

  it('AC-B22 §deny-by-default 在查詢層：不存在之 businessCategoryId → BUSINESS_CATEGORY_NOT_FOUND（不先取全量再前端過濾）', async () => {
    await expect(svc.listSubtreeDocuments('ghost', 'n1', viewer({}))).rejects.toThrow(
      'BUSINESS_CATEGORY_NOT_FOUND',
    );
  });

  it('整個子樹無任何對該 viewer 可見之文件 → 空分組（非錯誤）', async () => {
    const v = viewer({ orgCode: 'JAC00' });
    store.mountsByCategory.set('bc1', [
      { nodeId: 'n1', documentId: 'd1', announced: true, usingDepts: depts(['JZZ00']) },
    ]);
    const r = await svc.listSubtreeDocuments('bc1', 'n1', v);
    expect(r.groups).toEqual([]);
    expect(r.totalCount).toBe(0);
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
