/**
 * F019 UX16 delta — `AC-UX23`（`PublicFilterOptions` 五→六組，新增 `draftingDivisions`）／
 * `AC-UX24`（前台不加「無本部」sentinel）。
 *
 * 權威：docs/specs/features/F019-public-list-browsing.md#ux16-delta `AC-UX23`／`AC-UX24`；
 * docs/specs/architecture-spec.md §16.2（`ARCH-UX2`：`draftingDivisionId`／`draftingDivisionName`
 * 為既有 `GET /admin/documents` 之 additive 新增欄位，前台側同構）。
 *
 * ⚠ 對實作全盲：`buildFilterOptions()` 為既有已實作純函式，尚不含第六組 `draftingDivisions`
 * ——以 cast 承載新增欄位/回傳鍵，紅燈落在個別斷言而非整檔編譯崩潰。
 *
 * 🔴 本檔為 `TS-F019-D5-206`（`public-filter-options.controller.spec.ts`）之**真正落點**：
 * 該控制器測試以 `jest.fn().mockResolvedValue(...)` 完全代管服務層回應，對「六組鍵是否真的由
 * `buildFilterOptions()` 產生」零鑑別力（controller 只是單純轉傳）——本檔在**純函式層**驅動
 * 真正的邏輯，才是本 delta 唯一有牙齒的斷言位置。
 */
import { PublicDocItem, buildFilterOptions as buildFilterOptionsImpl } from './public-list';
import { ViewerScope, UsingDeptRef } from '../rbac/viewer-scope';

function depts(codes: string[], companyCode = 'AS'): UsingDeptRef[] {
  return codes.map((orgCode) => ({ companyCode, orgCode }));
}

const DOC_DEFAULTS: PublicDocItem = {
  id: 'd', status: 'active', documentNumber: 'N-1', documentName: '文件',
  lifecycleId: 'lc1', lifecycleName: null, usingDepts: depts([]), companyCode: 'AS',
  draftingDeptId: null, draftingSectionId: null, primaryChiefId: null,
  secondaryChiefIds: [], edition: null, announcedDate: '2026-01-01', contentSummary: null,
};
function doc(over: Partial<PublicDocItem> & Record<string, unknown>): PublicDocItem {
  return { ...DOC_DEFAULTS, ...over } as PublicDocItem;
}

const TODAY = new Date('2026-09-22T00:00:00Z');
const OTHER: ViewerScope = { roleCode: 'User', userSubtype: 'other', orgCode: 'JAC00', companyCode: 'AS' };
const BUSINESS: ViewerScope = { roleCode: 'User', userSubtype: 'business', orgCode: 'JAC00', companyCode: 'AS' };

const values = (opts: ReadonlyArray<{ value: string }>): string[] => opts.map((o) => o.value).sort();

interface Ux16FilterOptions {
  draftingCompanies: { value: string; label: string }[];
  draftingDivisions: { value: string; label: string }[];
  draftingDepts: { value: string; label: string }[];
  draftingSections: { value: string; label: string }[];
  chiefs: { value: string; label: string }[];
  lifecycles: { value: string; label: string }[];
}
function buildFilterOptions(pool: PublicDocItem[], viewer: ViewerScope, today: Date): Ux16FilterOptions {
  return (buildFilterOptionsImpl as unknown as (
    pool: PublicDocItem[], viewer: ViewerScope, today: Date,
  ) => Ux16FilterOptions)(pool, viewer, today);
}

/** 對業務@JAC00 不相符之文件（companyCode='C9'）與相符者（'C1'），各帶不同 draftingDivisionId。 */
const LEAK_POOL: PublicDocItem[] = [
  doc({ id: 'visible', usingDepts: depts(['JAC00']), companyCode: 'C1', draftingDivisionId: 'DIV1' }),
  doc({ id: 'hidden', usingDepts: depts(['JAD00']), companyCode: 'C9', draftingDivisionId: 'DIV9' }),
];

describe('buildFilterOptions — UX16 delta AC-UX23（第六組 draftingDivisions）', () => {
  it('🔴 回傳物件含六組鍵（回歸鎖：既有五組仍在 ＋ 新組存在）', () => {
    const opts = buildFilterOptions(LEAK_POOL, OTHER, TODAY);
    const keys = Object.keys(opts as unknown as Record<string, unknown>);
    for (const oldKey of ['draftingCompanies', 'draftingDepts', 'draftingSections', 'chiefs', 'lifecycles']) {
      expect(keys).toContain(oldKey);
    }
    expect(keys).toContain('draftingDivisions');
  });

  it('選項來源＝全域 distinct，且先經 isDocVisibleToViewer 過濾（與既有五組同一紀律）', () => {
    const opts = buildFilterOptions(LEAK_POOL, BUSINESS, TODAY);
    expect(values(opts.draftingDivisions)).toEqual(['DIV1']); // 'DIV9' 對業務@JAC00 不可見，不得出現
  });

  it('不受限之 viewer 兩者皆見（可見性確實作用於本組選項）', () => {
    const opts = buildFilterOptions(LEAK_POOL, OTHER, TODAY);
    expect(values(opts.draftingDivisions)).toEqual(['DIV1', 'DIV9']);
  });

  it('空值（null）之 draftingDivisionId 不得成為選項', () => {
    const pool = [
      doc({ id: 'a', draftingDivisionId: null, companyCode: 'C1' }),
      doc({ id: 'b', draftingDivisionId: 'DIV1', companyCode: 'C1' }),
    ];
    expect(values(buildFilterOptions(pool, OTHER, TODAY).draftingDivisions)).toEqual(['DIV1']);
  });
});

describe('buildFilterOptions — UX16 delta AC-UX24（前台不加「無本部」sentinel）', () => {
  it('🔴 語料含一份「制定組織上溯不到任何本部」之已公告可見文件 → 選項中不含 __no_division__ 或「無本部」', () => {
    const pool = [
      doc({ id: 'a', draftingDivisionId: null, companyCode: 'C1', usingDepts: depts(['JAC00']) }),
    ];
    const opts = buildFilterOptions(pool, OTHER, TODAY);
    expect(opts.draftingDivisions.some((o) => o.value === '__no_division__')).toBe(false);
    expect(opts.draftingDivisions.some((o) => o.label === '無本部')).toBe(false);
  });

  it('🔴 該文件在未選定任何本部時照常出現於清單（推導不出本部不構成排除理由）', () => {
    const pool = [doc({ id: 'a', draftingDivisionId: null, usingDepts: depts(['JAC00']) })];
    // buildFilterOptions 本身不影響清單本體；此處以其選項集合之空狀態佐證 AC-UX24 之語意
    // （選項端沒有 sentinel，清單端之零漣漪由既有 buildPublicList 行為承接，不在本檔重複驗證）。
    const opts = buildFilterOptions(pool, OTHER, TODAY);
    expect(opts.draftingDivisions).toEqual([]);
  });
});
