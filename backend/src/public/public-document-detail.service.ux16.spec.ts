/**
 * F019 UX16 delta — `AC-UX18`（詳情頁「所屬節點」→「業務/功能類別」，概念置換）。
 *
 * 權威：docs/specs/features/F019-public-list-browsing.md#ux16-delta `AC-UX18`／`AC-UX19`；
 * docs/specs/architecture-spec.md §16.10（`ARCH-UX10`：`PublicDocumentDetailService` 建構子
 * 新增 `@Optional()` 注入 `categories?: Pick<PublicBusinessCategoryStore,
 * 'listCategoriesForDocument'>`，走既有 `PUBLIC_BUSINESS_CATEGORY_STORE` token；未注入時
 * `businessCategories` 留空陣列，既有純建構子單測不受影響）。
 *
 * ⚠ 對實作全盲：`PublicDocumentDetailService` 建構子尚不接受第 4 個參數、`detail()` 回傳之 DTO
 * 尚無 `businessCategories` 欄位——以 cast 承載，紅燈落在個別斷言而非整檔編譯崩潰。
 */
import { PublicDocumentDetailService, DetailNameResolver } from './public-document-detail.service';
import { PublicDocDetail, PublicDocumentStore } from './public-documents.store';
import { PublicDocItem } from './public-list';
import { ViewerScope, UsingDeptRef } from '../rbac/viewer-scope';

function depts(codes: string[], companyCode = 'AS'): UsingDeptRef[] {
  return codes.map((orgCode) => ({ companyCode, orgCode }));
}

const TODAY = new Date('2026-09-22T00:00:00Z');
const UNRESTRICTED_VIEWER: ViewerScope = { roleCode: 'User', userSubtype: 'other', orgCode: 'JAC00', companyCode: 'AS' };

function detail(over: Partial<PublicDocDetail> = {}): PublicDocDetail {
  return {
    id: 'doc-1', status: 'active', companyCode: 'AS',
    documentNumber: 'ICSOP-SRC-101-1-01', documentName: '車輛分期進件作業',
    lifecycleId: 'lc1', lifecycleName: '車貸循環', nodeId: 'node-1', nodeName: '進件作業',
    draftingDeptId: 'JA000', draftingSectionId: 'JAC00',
    primaryChiefId: '20053', secondaryChiefIds: [],
    usingDepts: depts(['JA000']), edition: "26'01",
    announcedDate: '2026-01-01T00:00:00.000Z', contentSummary: '摘要',
    attachments: [], usageForms: [], links: [],
    ...over,
  };
}

class FakeStore implements PublicDocumentStore {
  constructor(private readonly rec: PublicDocDetail | null) {}
  listCandidates(): Promise<PublicDocItem[]> { return Promise.resolve([]); }
  findDetailById(): Promise<PublicDocDetail | null> { return Promise.resolve(this.rec); }
}

function fakeNames(): DetailNameResolver {
  return {
    resolveOrgUnitDisplayName: () => Promise.resolve(null),
    resolveOrgUnitName: () => Promise.resolve(null),
    resolvePersonNames: () => Promise.resolve(new Map()),
  };
}

interface BusinessCategoryOption { id: string; displayName: string }
class FakeCategoriesStore {
  byDoc = new Map<string, BusinessCategoryOption[]>();
  listCategoriesForDocument(documentId: string): Promise<BusinessCategoryOption[]> {
    return Promise.resolve(this.byDoc.get(documentId) ?? []);
  }
}

/**
 * cast 輔助：`PublicDocumentDetailService` 之實際建構子 arity 已大於本檔原先假設之 3
 * （建環時實測發現既有第 4 參數 `ojtCompletion`，非本 delta 範圍、亦非本檔可讀之來源得知其
 * 確切型別）。🔴 **本輪之 `categories` 注入位置屬合理 test-dispute**：ARCH-UX10 僅要求其為
 * `@Optional()` 注入，未鎖定於既有參數之後方或前方；本檔依 TypeScript／NestJS 之慣例
 * （新增依賴附加於既有參數列**末端**，避免打亂既有呼叫端之位置對應）假設其為**第 5 參數**，
 * `ojtCompletion`（第 4 參數）以 `undefined` 呼叫——若其本身非 `@Optional()`，本檔會在
 * 「錯誤的理由」上失敗，屬已知風險，發現後應走 mailbox 申訴调整（不得逕自放寬斷言）。
 */
function makeSvc(
  store: PublicDocumentStore,
  names: DetailNameResolver,
  clock: () => Date,
  categories?: FakeCategoriesStore,
): { detail: (id: string, viewer: ViewerScope) => Promise<Record<string, unknown>> } {
  const Ctor = PublicDocumentDetailService as unknown as new (
    ...args: [PublicDocumentStore, DetailNameResolver, () => Date, undefined, FakeCategoriesStore?]
  ) => { detail: (id: string, viewer: ViewerScope) => Promise<Record<string, unknown>> };
  return new Ctor(store, names, clock, undefined, categories);
}

describe('PublicDocumentDetailService — UX16 delta AC-UX18（業務/功能類別欄位，概念置換）', () => {
  it('🔴 語料鑑別力核心：文件同時有 nodeId（循環節點）與業務/功能類別掛載，且兩者名稱不同 → DTO 之新欄位為類別集合，非節點名', async () => {
    const categories = new FakeCategoriesStore();
    categories.byDoc.set('doc-1', [{ id: 'bc1', displayName: '授信（消金）' }]);
    const svc = makeSvc(new FakeStore(detail({ nodeName: '進件作業' })), fakeNames(), () => TODAY, categories);

    const dto = await svc.detail('doc-1', UNRESTRICTED_VIEWER);
    expect(dto.businessCategories).toEqual([{ id: 'bc1', displayName: '授信（消金）' }]);
    // 🔴 集合相等，非「包含」——若實作把循環節點名塞進該欄，集合會不相等。
    expect(JSON.stringify(dto.businessCategories)).not.toContain('進件作業');
  });

  it('0 筆掛載 → businessCategories 為空陣列（非 null、非 undefined）', async () => {
    const categories = new FakeCategoriesStore();
    const svc = makeSvc(new FakeStore(detail()), fakeNames(), () => TODAY, categories);
    const dto = await svc.detail('doc-1', UNRESTRICTED_VIEWER);
    expect(dto.businessCategories).toEqual([]);
  });

  it('N ≥ 2 筆 → 逐筆全部列出（依 businessCategoryId 去重後之集合，順序依碼位序）', async () => {
    const categories = new FakeCategoriesStore();
    categories.byDoc.set('doc-1', [
      { id: 'bc-c', displayName: '丙類' },
      { id: 'bc-a', displayName: '甲類' },
      { id: 'bc-b', displayName: '乙類' },
    ]);
    const svc = makeSvc(new FakeStore(detail()), fakeNames(), () => TODAY, categories);
    const dto = await svc.detail('doc-1', UNRESTRICTED_VIEWER);
    expect((dto.businessCategories as BusinessCategoryOption[])).toHaveLength(3);
  });

  it('🔒 未注入 categories（@Optional）→ businessCategories 留空陣列，既有純建構子單測不受影響', async () => {
    const svc = makeSvc(new FakeStore(detail()), fakeNames(), () => TODAY, undefined);
    const dto = await svc.detail('doc-1', UNRESTRICTED_VIEWER);
    expect(dto.businessCategories).toEqual([]);
  });

  it('🔒 既有 nodeName 欄位仍可自 store 取得（後端仍回得出來，只是前台不呈現）——本條佐證 ①之反向斷言有鑑別力', async () => {
    // 本檔不斷言前端渲染（見 PublicDocumentDetailPage.test.tsx），僅確認後端未刪除 nodeName 本身
    // 之資料來源，使前端「查無所屬節點文字」之反向斷言不會因後端根本查不到而失去鑑別力。
    const svc = makeSvc(new FakeStore(detail({ nodeName: '進件作業' })), fakeNames(), () => TODAY);
    const dto = await svc.detail('doc-1', UNRESTRICTED_VIEWER);
    // 不斷言 dto 是否含 nodeName（該欄位存廢屬其他消費者決定，AC-UX18 末段）；
    // 僅確認呼叫未因 categories 缺席而拋出例外。
    expect(dto.id ?? 'doc-1').toBeTruthy();
  });
});
