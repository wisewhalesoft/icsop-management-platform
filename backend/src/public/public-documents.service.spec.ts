import { PublicDocumentsService, OrgNameResolver } from './public-documents.service';
import { PublicDocDetail, PublicDocumentStore } from './public-documents.store';
import { PublicDocItem } from './public-list';
import { ViewerScope } from '../rbac/viewer-scope';

/** F041 簽章遷移 shim（架構 §3.7 決策一）：list() 第一參數由 userOrgCode 字串改為 ViewerScope。
 * 既有案例與業務子分類無關，一律以「其他」子分類包裝（不受限，行為與遷移前相同）。 */
function viewerOf(orgCode: string | null): ViewerScope {
  return { roleCode: 'User', userSubtype: 'other', orgCode };
}

class FakeStore implements PublicDocumentStore {
  constructor(private readonly items: PublicDocItem[]) {}
  listCandidates(): Promise<PublicDocItem[]> {
    return Promise.resolve(this.items);
  }
  findDetailById(): Promise<PublicDocDetail | null> {
    return Promise.resolve(null);
  }
}

/** 假名稱解析器：以 Map 提供，未命中回 null（服務端 fallback 為代碼）。 */
function fakeResolver(map: Record<string, string> = {}): OrgNameResolver {
  return {
    resolveOrgUnitName: (code) => Promise.resolve(map[code] ?? null),
  };
}

function item(over: Partial<PublicDocItem>): PublicDocItem {
  return {
    id: over.id ?? 'd',
    status: over.status ?? 'active',
    documentNumber: over.documentNumber ?? 'N-1',
    documentName: over.documentName ?? '文件',
    lifecycleId: over.lifecycleId ?? 'lc1',
    lifecycleName: over.lifecycleName ?? null,
    usingDeptIds: over.usingDeptIds ?? [],
    draftingDeptId: over.draftingDeptId ?? null,
    announcedDate: over.announcedDate ?? '2026-01-01',
    contentSummary: over.contentSummary ?? null,
  };
}

const TODAY = new Date('2026-07-17T00:00:00Z');
const clock = () => TODAY;

describe('PublicDocumentsService（F019）', () => {
  it('TS-F019-020 僅回傳已公告文件（服務層強制基底條件）', async () => {
    const store = new FakeStore([
      item({ id: 'ann', status: 'active', announcedDate: '2026-01-01' }),
      item({ id: 'ip', status: 'active', announcedDate: '2026-12-31' }),
      item({ id: 'ina', status: 'inactive' }),
      item({ id: 'void', status: 'void' }),
    ]);
    const svc = new PublicDocumentsService(store, fakeResolver(), clock);
    const page = await svc.list(viewerOf(null), {}, 1, 50);
    expect(page.items.map((d) => d.id)).toEqual(['ann']);
  });

  it('TS-F019-021 呼叫端夾帶 status 企圖繞過 → 仍僅已公告', async () => {
    const store = new FakeStore([item({ id: 'ina', status: 'inactive' })]);
    const svc = new PublicDocumentsService(store, fakeResolver(), clock);
    const page = await svc.list(viewerOf(null), { status: 'inactive' }, 1, 50);
    expect(page.items).toHaveLength(0);
  });

  it('TS-F019-001 使用者部門相符 → pinned 旗標、置頂在前', async () => {
    const store = new FakeStore([
      item({ id: 'D1', usingDeptIds: ['JAC00'], documentNumber: 'A001' }),
      item({ id: 'D2', usingDeptIds: ['ZZ000'], documentNumber: 'A009' }),
    ]);
    const svc = new PublicDocumentsService(store, fakeResolver(), clock);
    const page = await svc.list(viewerOf('JAC00'), {}, 1, 50);
    expect(page.items[0].id).toBe('D1');
    expect(page.items[0].pinned).toBe(true);
    expect(page.items[1].pinned).toBe(false);
  });

  it('TS-F019-030 組織名稱解析：命中→名稱、未命中→fallback 代碼（不顯示 undefined/null）', async () => {
    const store = new FakeStore([
      item({ id: 'd', draftingDeptId: 'JA000', usingDeptIds: ['JAC00', 'ZZ999'] }),
    ]);
    const svc = new PublicDocumentsService(
      store,
      fakeResolver({ JA000: '營運管理部', JAC00: '審查室' }),
      clock,
    );
    const page = await svc.list(viewerOf(null), {}, 1, 50);
    const dto = page.items[0];
    expect(dto.draftingDeptName).toBe('營運管理部');
    expect(dto.usingDeptNames).toEqual(['審查室', 'ZZ999']); // 未命中 fallback 為代碼
    expect(dto.draftingDeptName).not.toBeNull();
  });

  it('displayStatus 衍生為 announced（前台恆已公告）', async () => {
    const store = new FakeStore([item({ id: 'd', status: 'active', announcedDate: '2026-01-01' })]);
    const svc = new PublicDocumentsService(store, fakeResolver(), clock);
    const page = await svc.list(viewerOf(null), {}, 1, 50);
    expect(page.items[0].displayStatus).toBe('announced');
  });

  it('TS-F019-025 分頁中繼：105 筆、每頁 50 → 第 3 頁 5 筆、hasNext=false', async () => {
    const items = Array.from({ length: 105 }, (_, i) =>
      item({ id: `d${i}`, documentNumber: `N-${String(i).padStart(3, '0')}`, usingDeptIds: ['ZZ000'] }),
    );
    const svc = new PublicDocumentsService(new FakeStore(items), fakeResolver(), clock);
    const p3 = await svc.list(viewerOf(null), {}, 3, 50);
    expect(p3.items).toHaveLength(5);
    expect(p3.total).toBe(105);
    expect(p3.hasNext).toBe(false);
  });
});

/** F041 AC-14 pass-through：list() 將 viewer 完整交給 buildPublicList，業務子分類之過濾於服務層可觀測。 */
describe('PublicDocumentsService（F041 AC-14 viewer pass-through）', () => {
  it('業務子分類 viewer → 服務層輸出已排除不相符文件（非僅純函式層）', async () => {
    const store = new FakeStore([
      item({ id: 'match', usingDeptIds: ['JA000'] }),
      item({ id: 'no-match', usingDeptIds: ['JAD00'] }),
    ]);
    const svc = new PublicDocumentsService(store, fakeResolver(), clock);
    const page = await svc.list({ roleCode: 'User', userSubtype: 'business', orgCode: 'JAC00' }, {}, 1, 50);
    expect(page.items.map((d) => d.id)).toEqual(['match']);
    expect(page.total).toBe(1);
  });
});
