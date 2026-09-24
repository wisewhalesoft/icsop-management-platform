/**
 * F019 `AC-OC7`（2026-09-24 組織篩選連動）：`filterOptions()` 回應之 additive `draftingOrgUnits`。
 *
 * 權威：docs/specs/features/F019-public-list-browsing.md#org-cascade-delta。
 * 🔴 語料刻意含「兩家公司同碼異名之部門」（ORG_UNIT 唯一鍵為 (companyCode, orgCode)，
 *    dev 實測四家間有 42 個重複 orgCode）——只用單一公司時「以配對解析、不經 collapseByCode」恆真。
 */
import { PublicDocumentsService, OrgNameResolver } from './public-documents.service';
import { PublicDocDetail, PublicDocumentStore } from './public-documents.store';
import { PublicDocItem, PublicOrgUnitOption } from './public-list';
import { ViewerScope, UsingDeptRef } from '../rbac/viewer-scope';

function depts(codes: string[], companyCode = 'AS'): UsingDeptRef[] {
  return codes.map((orgCode) => ({ companyCode, orgCode }));
}

const ITEM_DEFAULTS: PublicDocItem = {
  id: 'd', status: 'active', documentNumber: 'N-1', documentName: '文件',
  lifecycleId: 'lc1', lifecycleName: null, usingDepts: depts([]), companyCode: 'AS',
  draftingDeptId: null, draftingSectionId: null, primaryChiefId: null,
  secondaryChiefIds: [], edition: null, announcedDate: '2026-01-01', contentSummary: null,
};
const item = (over: Partial<PublicDocItem>): PublicDocItem => ({ ...ITEM_DEFAULTS, ...over });

class FakeStore implements PublicDocumentStore {
  constructor(private readonly items: PublicDocItem[]) {}
  listCandidates(): Promise<PublicDocItem[]> {
    return Promise.resolve(this.items);
  }
  findDetailById(): Promise<PublicDocDetail | null> {
    return Promise.resolve(null);
  }
}

/** (公司, 代碼) → 名稱；同碼於兩家公司名稱不同。 */
const NAMES: Record<string, string> = {
  'AS/JA000': '資訊部', 'AS/JAC00': '系統室',
  'AJ/JA000': '業務部', 'AJ/JAC00': '業務一室',
};
const resolver = {
  resolveOrgUnitDisplayName: (companyCode: string, code: string) =>
    Promise.resolve(NAMES[`${companyCode}/${code}`] ?? null),
  resolvePersonNames: () => Promise.resolve(new Map<string, string>()),
} as unknown as OrgNameResolver;

const svcOf = (items: PublicDocItem[]) =>
  new PublicDocumentsService(new FakeStore(items), resolver, () => new Date('2026-09-24T00:00:00Z'));

const ALL: ViewerScope = { roleCode: 'User', userSubtype: 'other', orgCode: 'JAC00', companyCode: 'AS' };

const sortUnits = (u: PublicOrgUnitOption[]) =>
  [...u].sort((a, b) => `${a.companyCode}${a.deptId}`.localeCompare(`${b.companyCode}${b.deptId}`));

describe('PublicDocumentsService#filterOptions — AC-OC7 draftingOrgUnits', () => {
  it('🔴 同碼異名：兩家公司之 JA000 各自帶正確名稱（不經 collapseByCode）', async () => {
    const res = await svcOf([
      item({ id: 'a', companyCode: 'AS', draftingDeptId: 'JA000', draftingSectionId: 'JAC00' }),
      item({ id: 'b', companyCode: 'AJ', draftingDeptId: 'JA000', draftingSectionId: 'JAC00' }),
    ]).filterOptions(ALL);
    expect(sortUnits(res.draftingOrgUnits)).toEqual([
      { companyCode: 'AJ', divisionId: null, divisionName: null, deptId: 'JA000', deptName: '業務部', sectionId: 'JAC00', sectionName: '業務一室' },
      { companyCode: 'AS', divisionId: null, divisionName: null, deptId: 'JA000', deptName: '資訊部', sectionId: 'JAC00', sectionName: '系統室' },
    ]);
    // 🔒 既有六組不變：跨公司同碼異名之部門仍收斂為一個選項、label fallback 為代碼（AC-OC7 明文不動）
    expect(res.draftingDepts).toEqual([{ value: 'JA000', label: 'JA000' }]);
  });

  it('相同組合只出現一次；未命中名稱 ⇒ 代碼', async () => {
    const res = await svcOf([
      item({ id: 'a', draftingDeptId: 'JA000', draftingSectionId: 'JAC00' }),
      item({ id: 'b', draftingDeptId: 'JA000', draftingSectionId: 'JAC00' }),
      item({ id: 'c', draftingDeptId: 'ZZ000', draftingSectionId: null }),
    ]).filterOptions(ALL);
    expect(sortUnits(res.draftingOrgUnits)).toEqual([
      { companyCode: 'AS', divisionId: null, divisionName: null, deptId: 'JA000', deptName: '資訊部', sectionId: 'JAC00', sectionName: '系統室' },
      { companyCode: 'AS', divisionId: null, divisionName: null, deptId: 'ZZ000', deptName: 'ZZ000', sectionId: null, sectionName: null },
    ]);
  });

  it('🔴 可見性：業務使用者看不到之文件，其單位不得出現（AC-D5 紀律延續）', async () => {
    const biz: ViewerScope = { roleCode: 'User', userSubtype: 'business', orgCode: 'JAC00', companyCode: 'AS' };
    const res = await svcOf([
      item({ id: 'seen', companyCode: 'AS', usingDepts: depts(['JAC00']), draftingDeptId: 'JA000' }),
      item({ id: 'hidden', companyCode: 'AJ', usingDepts: depts(['JAD00'], 'AJ'), draftingDeptId: 'JA000' }),
    ]).filterOptions(biz);
    // 正向半句：可見者確實在（否則「不含 AJ」恆真）
    expect(res.draftingOrgUnits.map((u) => u.companyCode)).toEqual(['AS']);
  });
});
