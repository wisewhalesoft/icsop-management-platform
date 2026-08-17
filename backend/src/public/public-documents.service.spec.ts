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

/** 🔴 2026-08-16 delta：`PublicDocItem` additive 新增五欄（architecture-spec §10.6）。 */
/**
 * 📝 **2026-08-16 fixture 硬化**（與 `public-list-dto.spec.ts` 之申訴 #3 同一形狀，一次處理完）：
 * 原以 `??` 逐欄套預設，會把**顯式傳入的 `null`** 當成「沒給」而還原為預設值
 * ⇒ 想測「該欄為 null」之案例永遠測不到。本檔目前之預設多為 `null`（故尚未被咬到），
 * 但形狀相同、隨時會被下一個案例踩中，故一併改為 `{ ...defaults, ...over }` 展開：
 * 顯式之 `null`／`''`／`0` 一律生效，未傳之鍵才落預設。
 * ✅ 已確認全檔無 `item({ key: undefined })` 之呼叫，且預設值逐欄未變 ⇒ **現有案例行為完全不變**。
 */
const ITEM_DEFAULTS: PublicDocItem = {
    id: 'd',
    status: 'active',
    documentNumber: 'N-1',
    documentName: '文件',
    lifecycleId: 'lc1',
    lifecycleName: null,
    usingDeptIds: [],
    draftingDeptId: null,
    draftingCompanyId: null,
    draftingSectionId: null,
    primaryChiefId: null,
    secondaryChiefIds: [],
    edition: null,
    announcedDate: '2026-01-01',
    contentSummary: null,
};

function item(over: Partial<PublicDocItem>): PublicDocItem {
  return { ...ITEM_DEFAULTS, ...over };
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

  /**
   * 🔴 2026-08-16 delta（F019 `AC-D12`／OQ-D18-09）：對外 DTO **移除** `usingDeptNames`／`usingDeptIds`。
   * 原斷言（供追溯）：OLD> `expect(dto.usingDeptNames).toEqual(['審查室', 'ZZ999']); // 未命中 fallback 為代碼`
   * 「未命中 fallback 為代碼」之語意**未被推翻**，其驗證載體改為制定三級之名稱解析
   * （見 `public-list-dto.spec.ts` `TS-F019-D12-005`）。
   */
  it('TS-F019-030 組織名稱解析：命中→名稱、未命中→fallback（不顯示 undefined/null）', async () => {
    const store = new FakeStore([
      item({ id: 'd', draftingDeptId: 'JA000', draftingSectionId: 'ZZ999', usingDeptIds: ['JAC00'] }),
    ]);
    const svc = new PublicDocumentsService(
      store,
      fakeResolver({ JA000: '營運管理部', JAC00: '審查室' }),
      clock,
    );
    const page = await svc.list(viewerOf(null), {}, 1, 50);
    const dto = page.items[0];
    expect(dto.draftingDeptName).toBe('營運管理部');
    // 未命中之呈現值：與詳情 DTO 之既有慣例一致（制定三級→null），逐字比對見
    // `public-list-dto.spec.ts` `TS-F019-D12-005`（跨 DTO 一致性）。此處鎖定其**不得**為
    // undefined、不得為字面 'null'／'undefined'（原案以 `usingDeptNames` 承載，該欄已移除）。
    expect(dto.draftingSectionName).not.toBeUndefined();
    expect(['null', 'undefined']).not.toContain(dto.draftingSectionName);
    expect(dto.draftingSectionName).toBeNull();
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
