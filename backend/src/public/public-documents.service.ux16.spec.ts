/**
 * F019 UX16 delta — `AC-UX22`／`AC-UX23`（前台制定本部篩選之服務層富化接線，`UX16-05` 之
 * F019 側，補齊 F017 側 `documents.service.ux16.spec.ts` 之對稱缺口）。
 *
 * 權威：docs/specs/features/F019-public-list-browsing.md#ux16-delta `AC-UX22`／`AC-UX23`；
 * docs/specs/architecture-spec.md §16.2（`ARCH-UX2`：`OrgNameResolver` 新增
 * `listOrgUnitsByCompany(companyCode)`；`public-documents.service.ts#list()`／`filterOptions()`
 * 依 `companyCode` 分組、逐公司呼叫、以 `indexOrgUnitsByCompany`＋`divisionOf`＋
 * `orgUnitDisplayName` 組裝 `draftingDivisionId`／`draftingDivisionName`，供 `buildPublicList`／
 * `buildFilterOptions` 之既有純函式消費）。
 *
 * 🔴 **本檔存在之理由（lead 提報，本 repo 已踩過三次之形狀，非泛泛而談）**：
 * `/org-units`／`/persons`／`/companies` 三個端點過去各漏代理一次，每次都是「fetch 收到
 * index.html → JSON 解析失敗 → 被 `.catch` 收斂為空陣列 → 下拉永遠沒有選項、零錯誤訊息」——
 * 若本服務層沒把本部富化上去，`draftingDivisions` 就會是空陣列，症狀與前例逐字相同。⇒
 * **選項集合非空**本身是一條獨立斷言，不只是「有沒有解析出名稱」。
 *
 * 🔒 **鎖結果不鎖機制**：不斷言 `listOrgUnitsByCompany` 被呼叫過，只斷言 `list()`／
 * `filterOptions()` 之輸出確實帶有正確的本部值（語料含三層 parentCode 鏈，非寫死巧合值）。
 *
 * ⚠ 對實作全盲：`PublicDocItem.draftingDivisionId`／`OrgNameResolver.listOrgUnitsByCompany`
 * 尚不存在——以 cast 承載，紅燈落在斷言本身，非整檔編譯崩潰。
 *
 * 🔴 test-dispute 仲裁（`impl-front` 申訴，2026-09-22；已修正）：`draftingDivisionId` 之
 * value 形狀**逐字為 `` `${公司代碼}__{本部代碼}` ``**（`AC-UX22` 🔒／`AC-UX41` ④，權威＝
 * `prototypes/03-public-list.html:463`；分隔符為兩個半形底線），非裸代碼——與前端環既有
 * fixture（`PublicListPage.filterDelta.test.tsx:65` 之 `'AS__A0000'`）同形狀。本檔原兩處
 * 誤用裸代碼 `'D0000'`，已修正為 `'AS__D0000'`。其餘四個消費本 delta 之環檔
 * （`documents.service.ux16.spec.ts` 之 `draftingDivisionCode`——不同欄位，裸代碼、屬顯示
 * 用途；`document-list-query.ux16.spec.ts`／`public-list.ux16.spec.ts`／
 * `public-list-filter-options.ux16.spec.ts` 皆以不透明字串 `'DIV1'`／`'DIV2'` 驅動）**不受
 * 本次修正影響**——它們從未斷言過具體字面形狀。
 */
import { PublicDocumentsService, OrgNameResolver } from './public-documents.service';
import { PublicDocDetail, PublicDocumentStore } from './public-documents.store';
import { PublicDocItem } from './public-list';
import { ViewerScope, UsingDeptRef } from '../rbac/viewer-scope';

function depts(codes: string[], companyCode = 'AS'): UsingDeptRef[] {
  return codes.map((orgCode) => ({ companyCode, orgCode }));
}
function viewerOf(orgCode: string | null, companyCode = 'AS'): ViewerScope {
  return { roleCode: 'User', userSubtype: 'other', orgCode, companyCode };
}

const ITEM_DEFAULTS: PublicDocItem = {
  id: 'd', status: 'active', documentNumber: 'N-1', documentName: '文件',
  lifecycleId: 'lc1', lifecycleName: null, usingDepts: depts([]), companyCode: 'AS',
  draftingDeptId: null, draftingSectionId: null, primaryChiefId: null,
  secondaryChiefIds: [], edition: null, announcedDate: '2026-01-01', contentSummary: null,
};
function item(over: Partial<PublicDocItem> & Record<string, unknown>): PublicDocItem {
  return { ...ITEM_DEFAULTS, ...over } as PublicDocItem;
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

interface OrgUnitRecordLike {
  companyCode: string; orgCode: string; codePrefix: string; parentCode: string | null;
  tier: 'ROOT' | 'DIVISION' | 'DEPARTMENT' | 'SECTION' | 'SUBSECTION';
  name: string; descFull: string | null; managerEmpNo: string | null; isActive: boolean;
}
function unit(over: Partial<OrgUnitRecordLike>): OrgUnitRecordLike {
  return {
    companyCode: 'AS', orgCode: '00000', codePrefix: '', parentCode: null,
    tier: 'DEPARTMENT', name: '', descFull: null, managerEmpNo: null, isActive: true,
    ...over,
  };
}

/** `OrgNameResolver` 替身，additive 新增 `listOrgUnitsByCompany`（`ARCH-UX2`）。 */
class FakeResolverUx16 {
  orgUnitsByCompany = new Map<string, OrgUnitRecordLike[]>();
  resolveOrgUnitDisplayName(): Promise<string | null> {
    return Promise.resolve(null);
  }
  resolvePersonNames(): Promise<Map<string, string>> {
    return Promise.resolve(new Map());
  }
  listOrgUnitsByCompany(companyCode: string): Promise<OrgUnitRecordLike[]> {
    return Promise.resolve(this.orgUnitsByCompany.get(companyCode) ?? []);
  }
}

function makeService(resolver: FakeResolverUx16, items: PublicDocItem[]): PublicDocumentsService {
  return new PublicDocumentsService(
    new FakeStore(items),
    resolver as unknown as OrgNameResolver,
    () => new Date('2026-09-22T00:00:00Z'),
  );
}

/** 三層鏈：D0000（DIVISION）─ DA000（DEPARTMENT）─ DAA00（SECTION）。 */
function seedThreeLevel(resolver: FakeResolverUx16, companyCode: string, divisionName: string): void {
  resolver.orgUnitsByCompany.set(companyCode, [
    unit({ companyCode, orgCode: 'D0000', tier: 'DIVISION', name: divisionName, descFull: divisionName }),
    unit({ companyCode, orgCode: 'DA000', tier: 'DEPARTMENT', name: '部', descFull: '部全名', parentCode: 'D0000' }),
    unit({ companyCode, orgCode: 'DAA00', tier: 'SECTION', name: '部/室', descFull: '部全名室', parentCode: 'DA000' }),
  ]);
}

describe('PublicDocumentsService#list — UX16 delta AC-UX22（本部富化接線，F019 側）', () => {
  it('🔴 富化後之列帶有 draftingDivisionId／draftingDivisionName，值來自組織索引之真實上溯（非寫死）', async () => {
    const items = [item({ id: 'd1', companyCode: 'AS', usingDepts: depts(['DAA00']), draftingDeptId: 'DAA00' })];
    const resolver = new FakeResolverUx16();
    seedThreeLevel(resolver, 'AS', '財會本部');
    const svc = makeService(resolver, items);
    const page = await svc.list(viewerOf(null), {}, 1, 50);
    const out = page.items.find((i) => i.id === 'd1') as unknown as {
      draftingDivisionId?: string | null;
      draftingDivisionName?: string | null;
    };
    expect(out).toBeDefined();
    // AC-UX22 🔒／AC-UX41 ④ 仲裁（impl-front 申訴，2026-09-22）：value 形狀逐字為
    // `${公司代碼}__{本部代碼}`（prototypes/03-public-list.html:463 為權威），非裸代碼——
    // 與前端環既有 fixture（PublicListPage.filterDelta.test.tsx:65 之 'AS__A0000'）同形狀。
    expect(out.draftingDivisionId).toBe('AS__D0000');
    expect(out.draftingDivisionName).toBe('財會本部');
  });

  it('🔴 跨公司同碼防誤取（ORG_UNIT 唯一鍵為 (companyCode, orgCode)，dev 實測四家間有 42 個重複 orgCode）：AS 與 AJ 各自的 DAA00 須解析出各自公司之本部', async () => {
    const items = [
      item({ id: 'd-as', companyCode: 'AS', usingDepts: depts(['DAA00'], 'AS'), draftingDeptId: 'DAA00' }),
      item({ id: 'd-aj', companyCode: 'AJ', usingDepts: depts(['DAA00'], 'AJ'), draftingDeptId: 'DAA00' }),
    ];
    const resolver = new FakeResolverUx16();
    seedThreeLevel(resolver, 'AS', '財會本部');
    seedThreeLevel(resolver, 'AJ', '商用本部');
    const svc = makeService(resolver, items);
    const page = await svc.list(viewerOf(null), {}, 1, 50);
    const asItem = page.items.find((i) => i.id === 'd-as') as unknown as { draftingDivisionName?: string | null };
    const ajItem = page.items.find((i) => i.id === 'd-aj') as unknown as { draftingDivisionName?: string | null };
    expect(asItem.draftingDivisionName).toBe('財會本部');
    expect(ajItem.draftingDivisionName).toBe('商用本部');
    expect(asItem.draftingDivisionName).not.toBe(ajItem.draftingDivisionName);
  });

  it('🔒 查無本部祖先 → draftingDivisionId／draftingDivisionName 皆為 null（既有三級顯示欄不受影響，不得拋錯）', async () => {
    const items = [item({ id: 'd1', companyCode: 'AS', usingDepts: depts(['ZZ000']), draftingDeptId: 'ZZ000' })];
    const resolver = new FakeResolverUx16();
    resolver.orgUnitsByCompany.set('AS', [
      unit({ companyCode: 'AS', orgCode: 'ZZ000', tier: 'DEPARTMENT', name: '孤立部', descFull: '孤立部', parentCode: null }),
    ]);
    const svc = makeService(resolver, items);
    const page = await svc.list(viewerOf(null), {}, 1, 50);
    const out = page.items.find((i) => i.id === 'd1') as unknown as { draftingDivisionId?: string | null };
    expect(out.draftingDivisionId ?? null).toBeNull();
  });

  it('🔒 draftingDeptId 為 null（既有規則）→ 本部欄亦為 null，不因新增邏輯而拋錯', async () => {
    const items = [item({ id: 'd1', companyCode: 'AS' })];
    const resolver = new FakeResolverUx16();
    const svc = makeService(resolver, items);
    const page = await svc.list(viewerOf(null), {}, 1, 50);
    const out = page.items.find((i) => i.id === 'd1') as unknown as { draftingDivisionId?: string | null };
    expect(out.draftingDivisionId ?? null).toBeNull();
  });
});

describe('PublicDocumentsService#filterOptions — UX16 delta AC-UX23（draftingDivisions 選項集合，防「下拉永遠沒有選項」）', () => {
  /**
   * 🔴 本 repo 三次事故之直接對策：語料裡有可見文件、其制定部門可上溯到本部 ⇒
   * `draftingDivisions` 不得為空陣列。只斷言「有沒有解析出名稱」不足以擋下這個症狀——
   * 服務層若忘記把富化後的列傳給 `buildFilterOptions`，即使 `list()` 富化正確，
   * `filterOptions()` 仍可能回傳空陣列而無任何錯誤訊息。
   */
  it('🔴 語料含一份可見文件、制定部門可上溯到本部 → draftingDivisions 不得為空陣列', async () => {
    const items = [item({ id: 'd1', companyCode: 'AS', usingDepts: depts(['DAA00']), draftingDeptId: 'DAA00' })];
    const resolver = new FakeResolverUx16();
    seedThreeLevel(resolver, 'AS', '財會本部');
    const svc = makeService(resolver, items);
    const opts = await svc.filterOptions(viewerOf('DAA00'));
    const divisions = (opts as unknown as { draftingDivisions: { value: string; label: string }[] }).draftingDivisions;
    expect(divisions).toBeDefined();
    expect(divisions.length).toBeGreaterThan(0);
    // AC-UX22 🔒／AC-UX41 ④ 仲裁（impl-front 申訴，2026-09-22）：選項 value 形狀逐字為
    // `${公司代碼}__{本部代碼}`，非裸代碼——見上一案之同一裁決說明。
    expect(divisions).toEqual([{ value: 'AS__D0000', label: '財會本部' }]);
  });

  it('未提供 listOrgUnitsByCompany 之語料（推導不出本部）→ draftingDivisions 為空陣列（AC-UX24：不加 sentinel，非錯誤）', async () => {
    const items = [item({ id: 'd1', companyCode: 'AS', usingDepts: depts(['ZZ000']), draftingDeptId: 'ZZ000' })];
    const resolver = new FakeResolverUx16();
    resolver.orgUnitsByCompany.set('AS', [
      unit({ companyCode: 'AS', orgCode: 'ZZ000', tier: 'DEPARTMENT', name: '孤立部', descFull: '孤立部', parentCode: null }),
    ]);
    const svc = makeService(resolver, items);
    const opts = await svc.filterOptions(viewerOf('ZZ000'));
    const divisions = (opts as unknown as { draftingDivisions: { value: string; label: string }[] }).draftingDivisions;
    expect(divisions).toEqual([]);
  });
});
