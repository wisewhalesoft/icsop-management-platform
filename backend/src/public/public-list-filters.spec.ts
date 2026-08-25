/**
 * F019 前台清單篩選改版 delta — 後端純函式層（2026-08-16 使用者裁決；缺失／變更 delta 第 2 項）
 *
 * 權威：
 *   · docs/specs/features/F019-public-list-browsing.md `AC-D4`／`AC-D6`／`AC-D7`／`AC-D11`／`AC-D13`
 *   · docs/specs/architecture-spec.md §10.6（A6：`visibleCandidates()` 物理共用、`chief-match.ts` 共用）
 *   · docs/specs/architecture-spec.md §10.9（A9：移除 `deptCode`／`matchesDeptFilter`）
 *   · prototypes/03-public-list.html 第 313-323 行（`FILTER`／`FILTERS` 六項）、第 414-425 行（比對語意）
 *
 * 🔒 本檔**不得**放寬 F041 之可見性判定：`isWithinSubtree`／`isDocVisibleToViewer`／
 *    `isUsingDeptMatched` 三純函式之簽章與語意一律不變（`AC-D13`），本檔另設回歸鎖定案例。
 */
import {
  PublicDocItem,
  PublicListFilters,
  buildPublicList,
  isPinned,
  visibleCandidates,
} from './public-list';
import { isDocVisibleToViewer, isUsingDeptMatched, ViewerScope } from '../rbac/viewer-scope';
import { isWithinSubtree } from '../org-sync/org-hierarchy';
import { UsingDeptRef } from '../rbac/viewer-scope';

/** 便利建構：同一公司（預設 AS）之使用部門參照（B 階段多公司；跨公司案例見 viewer-scope.spec.ts）。 */
function depts(codes: string[], companyCode = 'AS'): UsingDeptRef[] {
  return codes.map((orgCode) => ({ companyCode, orgCode }));
}


const TODAY = new Date('2026-07-17T00:00:00Z');

/**
 * 📝 **2026-08-16 fixture 硬化**（與 `public-list-dto.spec.ts` 之申訴 #3 同一形狀，一次處理完）：
 * 原以 `??` 逐欄套預設，會把**顯式傳入的 `null`** 當成「沒給」而還原為預設值
 * ⇒ 想測「該欄為 null」之案例永遠測不到。本檔目前之預設多為 `null`（故尚未被咬到），
 * 但形狀相同、隨時會被下一個案例踩中，故一併改為 `{ ...defaults, ...over }` 展開：
 * 顯式之 `null`／`''`／`0` 一律生效，未傳之鍵才落預設。
 * ✅ 已確認全檔無 `doc({ key: undefined })` 之呼叫，且預設值逐欄未變 ⇒ **現有案例行為完全不變**。
 */
const DOC_DEFAULTS: PublicDocItem = {
    id: 'd',
    status: 'active',
    documentNumber: 'N-1',
    documentName: '文件',
    lifecycleId: 'lc1',
    lifecycleName: null,
    usingDepts: depts([]),
    companyCode: 'AS',
    draftingDeptId: null,
    draftingCompanyId: null,
    draftingSectionId: null,
    primaryChiefId: null,
    secondaryChiefIds: [],
    edition: null,
    announcedDate: '2026-01-01',
    contentSummary: null,
};

function doc(over: Partial<PublicDocItem>): PublicDocItem {
  return { ...DOC_DEFAULTS, ...over };
}

/** 不受限 viewer（「其他」子分類）——本檔多數案例之測試標的與可見性無關。 */
const OTHER: ViewerScope = { roleCode: 'User', userSubtype: 'other', orgCode: 'JAC00', companyCode: 'AS' };

/**
 * `AC-D4`：制定公司／制定部門／制定室別／循環別皆為**等值比對**，比對鍵為
 * `draftingCompanyId`／`draftingDeptId`／`draftingSectionId`／`lifecycleId`（**非顯示名稱字串**）。
 */
describe('F019 AC-D4：四項篩選為 id 等值比對（非顯示名稱）', () => {
  const rows = [
    doc({
      id: 'hit',
      draftingCompanyId: 'CO-1',
      draftingDeptId: 'JA000',
      draftingSectionId: 'JAC00',
      lifecycleId: 'lc1',
    }),
    doc({
      id: 'miss',
      draftingCompanyId: 'CO-2',
      draftingDeptId: 'JB000',
      draftingSectionId: 'JBB00',
      lifecycleId: 'lc2',
    }),
  ];

  it.each<[keyof PublicListFilters, string]>([
    ['draftingCompanyId', 'CO-1'],
    ['draftingDeptId', 'JA000'],
    ['draftingSectionId', 'JAC00'],
    ['lifecycleId', 'lc1'],
  ])('TS-F019-D4-001 %s 等值比對僅回傳相符者', (key, value) => {
    const page = buildPublicList(rows, OTHER, { [key]: value } as PublicListFilters, TODAY);
    expect(page.items.map((d) => d.id)).toEqual(['hit']);
  });

  it('TS-F019-D4-002 未提供之篩選不施加限制（四項皆 undefined → 全數回傳）', () => {
    const page = buildPublicList(rows, OTHER, {}, TODAY);
    expect(page.items.map((d) => d.id).sort()).toEqual(['hit', 'miss']);
  });

  it('TS-F019-D4-003 比對鍵為 id 而非顯示名稱：以名稱字串為篩選值一律不命中', () => {
    // 制定公司之顯示名稱（例：和潤企業股份有限公司）不得成為有效比對鍵——
    // 名稱由 NameResolutionService 解析，同名不同 id 為可達狀態（§10.6 明訂 value 恆為 id/code）。
    const page = buildPublicList(rows, OTHER, { draftingCompanyId: '和潤企業股份有限公司' }, TODAY);
    expect(page.items).toEqual([]);
  });

  it('TS-F019-D4-004 值為空字串／null 之文件不因空篩選值被誤納', () => {
    const rowsWithNull = [doc({ id: 'null-co', draftingCompanyId: null }), doc({ id: 'co', draftingCompanyId: 'CO-1' })];
    const page = buildPublicList(rowsWithNull, OTHER, { draftingCompanyId: 'CO-1' }, TODAY);
    expect(page.items.map((d) => d.id)).toEqual(['co']);
  });

  it('TS-F019-D4-005 `狀態` 維持既有裝飾性 no-op（基底條件已鎖「已公告」，OQ-F019-04）', () => {
    const rowsForStatus = [
      doc({ id: 'ann', status: 'active', announcedDate: '2026-01-01' }),
      doc({ id: 'ina', status: 'inactive', announcedDate: '2026-01-01' }),
    ];
    for (const status of ['有效', 'active', 'inactive', '失效']) {
      const page = buildPublicList(rowsForStatus, OTHER, { status }, TODAY);
      expect(page.items.map((d) => d.id)).toEqual(['ann']);
    }
  });
});

/** `AC-D7`：「當責室長」比對範圍＝主要 ∪ 次要（前台側）。 */
describe('F019 AC-D7：當責室長篩選＝主要 ∪ 次要', () => {
  const target = doc({ id: 'target', primaryChiefId: 'E001', secondaryChiefIds: ['E002'] });
  const other = doc({ id: 'other', primaryChiefId: 'E009', secondaryChiefIds: [] });

  it('TS-F019-D7-001 以次要室長 E002 篩選 → 該文件被列入', () => {
    const page = buildPublicList([target, other], OTHER, { chiefId: 'E002' }, TODAY);
    expect(page.items.map((d) => d.id)).toEqual(['target']);
  });

  it('TS-F019-D7-002 以主要室長 E001 篩選 → 亦被列入', () => {
    const page = buildPublicList([target, other], OTHER, { chiefId: 'E001' }, TODAY);
    expect(page.items.map((d) => d.id)).toEqual(['target']);
  });

  it('TS-F019-D7-003 以未關聯之 E003 篩選 → 不被列入', () => {
    const page = buildPublicList([target, other], OTHER, { chiefId: 'E003' }, TODAY);
    expect(page.items).toEqual([]);
  });

  it('TS-F019-D7-004 次要室長為多筆時，命中任一即納入', () => {
    const many = doc({ id: 'many', primaryChiefId: 'E100', secondaryChiefIds: ['E101', 'E102', 'E103'] });
    for (const chiefId of ['E100', 'E101', 'E102', 'E103']) {
      expect(buildPublicList([many], OTHER, { chiefId }, TODAY).items.map((d) => d.id)).toEqual(['many']);
    }
  });
});

/** `AC-D6`：六項篩選（含關鍵字）之 AND 組合。 */
describe('F019 AC-D6：六項篩選 ＋ 關鍵字為 AND 交集', () => {
  const full = doc({
    id: 'full',
    documentName: '車輛分期進件作業',
    draftingCompanyId: 'CO-1',
    draftingDeptId: 'JA000',
    draftingSectionId: 'JAC00',
    primaryChiefId: 'E001',
    lifecycleId: 'lc1',
  });
  const partial = doc({
    id: 'partial',
    documentName: '車輛分期對保作業',
    draftingCompanyId: 'CO-1',
    draftingDeptId: 'JA000',
    draftingSectionId: 'JAD00', // 制定室別不同
    primaryChiefId: 'E001',
    lifecycleId: 'lc1',
  });
  const ALL: PublicListFilters = {
    draftingCompanyId: 'CO-1',
    draftingDeptId: 'JA000',
    draftingSectionId: 'JAC00',
    chiefId: 'E001',
    lifecycleId: 'lc1',
    keyword: '進件',
  };

  it('TS-F019-D6-001 六條件同時套用 → 回傳交集（僅完全相符者）', () => {
    const page = buildPublicList([full, partial], OTHER, ALL, TODAY);
    expect(page.items.map((d) => d.id)).toEqual(['full']);
    expect(page.total).toBe(1);
  });

  it('TS-F019-D6-002 任一條件單獨不符 → 交集為空（AND 而非 OR）', () => {
    const page = buildPublicList([full], OTHER, { ...ALL, draftingSectionId: 'ZZ999' }, TODAY);
    expect(page.items).toEqual([]);
    expect(page.total).toBe(0);
  });

  /**
   * 🔴 lead 授權之鑑別力補強：原案**只有** `.not.toThrow()`，而純函式幾乎不會拋錯
   * ⇒ 該斷言在「回傳了錯誤結果」時仍然綠，鑑別力近乎零。
   * 原斷言（逐字保留）：
   *   OLD> `expect(() => buildPublicList([full], OTHER, { ...ALL, chiefId: 'E999' }, TODAY)).not.toThrow();`
   * 取代：保留「不拋錯」，並補上 `AC-D6` 明訂之**實際結果**（`items === []`、`total === 0`）。
   */
  it('TS-F019-D6-003 交集為空係正常查詢結果：不拋錯且 items=[]／total=0（供前端顯示「查無符合結果」）', () => {
    const run = (): ReturnType<typeof buildPublicList> =>
      buildPublicList([full], OTHER, { ...ALL, chiefId: 'E999' }, TODAY);
    expect(run).not.toThrow();
    const page = run();
    expect(page.items).toEqual([]);
    expect(page.total).toBe(0);
  });
});

/**
 * `AC-D11`（🔒 置頂機制回歸鎖定）：移除顯示欄位**不改變置頂結果**。
 * `AC-D13`（🔒 後端判定回歸鎖定）：三純函式之簽章與語意逐字未變。
 */
describe('F019 AC-D11／AC-D13：置頂與可見性判定回歸鎖定', () => {
  it('TS-F019-D11-001 使用者部門 JAC00、文件使用部門為部層 JA000 → 仍出現於置頂區', () => {
    const d = doc({ id: 'anc', usingDepts: depts(['JA000']) });
    const page = buildPublicList([d], OTHER, {}, TODAY);
    expect(page.items.map((x) => x.id)).toEqual(['anc']);
    expect(isPinned(page.items[0], 'JAC00', 'AS')).toBe(true);
  });

  it('TS-F019-D11-002 套用新五項篩選後，置頂判定仍以 usingDeptIds 為依據（不隨制定組織改變）', () => {
    const d = doc({ id: 'anc', usingDepts: depts(['JA000']), draftingDeptId: 'ZZ999' });
    const page = buildPublicList([d], OTHER, { draftingDeptId: 'ZZ999' }, TODAY);
    expect(isPinned(page.items[0], 'JAC00', 'AS')).toBe(true);
  });

  it('TS-F019-D13-001 三純函式之簽章（arity）鎖定：2／3／2', () => {
    // 簽章鎖定以 arity 表達：任何一方新增/移除參數即紅燈（`AC-D13` 之機器可驗證載體）。
    //
    // 🔄 B 階段（2026-08-24，開放多公司）更新期望值：`isUsingDeptMatched` 由 2 → **3**
    // （新增 `userCompanyCode`）。本鎖之用意是防止「AC-D12 移除顯示欄位」那批 delta 順手改動
    // 判定邏輯，**不是永久凍結簽章**；本次為有明確授權之安全性修正（跨公司誤中＝越權瀏覽，
    // 見 `viewer-scope.ts` 之 `isUsingDeptMatched` JSDoc 與 `viewer-scope.spec.ts` 之跨公司隔離組）。
    //
    // `isWithinSubtree` 維持 2（純字串前綴比對，公司過濾由呼叫端負責，刻意不下沉至此）；
    // `isDocVisibleToViewer` 維持 2（公司別隨 `ViewerScope` 一併傳入，未增參數）。
    expect(isWithinSubtree.length).toBe(2);
    expect(isUsingDeptMatched.length).toBe(3);
    expect(isDocVisibleToViewer.length).toBe(2);
  });

  it('TS-F019-D13-002 三純函式之語意未變（子樹祖先鏈、deny-by-default、非受限恆可見）', () => {
    expect(isWithinSubtree('JA000', 'JAC00')).toBe(true);
    expect(isWithinSubtree('JAC00', 'JA000')).toBe(false);
    expect(isUsingDeptMatched(depts(['JA000']), 'JAC00', 'AS')).toBe(true);
    expect(isUsingDeptMatched(depts(['JAD00']), 'JAC00', 'AS')).toBe(false);
    expect(isUsingDeptMatched(depts(['JAC00']), null, 'AS')).toBe(false); // 孤兒帳號 deny-by-default
    expect(isDocVisibleToViewer(depts(['JAD00']), OTHER)).toBe(true); // 非受限恆可見
    expect(isDocVisibleToViewer(depts(['JAD00']), { roleCode: 'User', userSubtype: 'business', orgCode: 'JAC00', companyCode: 'AS' })).toBe(false);
  });
});

/**
 * `AC-D5` 之**結構性**保證（architecture-spec §10.6）：`buildPublicList()` 與 `buildFilterOptions()`
 * 物理共用同一個 `visibleCandidates()`。本節鎖定 `visibleCandidates()` 本身之語意
 * ＝「已公告基底條件 → `isDocVisibleToViewer`」，且**清單結果恆為其子集**。
 */
describe('F019 AC-D5（結構）：visibleCandidates 為清單與選項之唯一共同上游', () => {
  const pool = [
    doc({ id: 'ann-visible', status: 'active', announcedDate: '2026-01-01', usingDepts: depts(['JAC00']) }),
    doc({ id: 'ann-invisible', status: 'active', announcedDate: '2026-01-01', usingDepts: depts(['JAD00']) }),
    doc({ id: 'in-progress', status: 'active', announcedDate: '2099-01-01', usingDepts: depts(['JAC00']) }),
    doc({ id: 'void', status: 'void', announcedDate: '2026-01-01', usingDepts: depts(['JAC00']) }),
  ];

  it('TS-F019-D5-001 業務 viewer：僅「已公告且使用部門相符」進入候選', () => {
    const biz: ViewerScope = { roleCode: 'User', userSubtype: 'business', orgCode: 'JAC00', companyCode: 'AS' };
    expect(visibleCandidates(pool, biz, TODAY).map((d) => d.id)).toEqual(['ann-visible']);
  });

  it('TS-F019-D5-002 「其他」viewer：可見性不設限，僅受已公告基底條件約束', () => {
    expect(visibleCandidates(pool, OTHER, TODAY).map((d) => d.id).sort()).toEqual([
      'ann-invisible',
      'ann-visible',
    ]);
  });

  it('TS-F019-D5-003 清單結果恆為 visibleCandidates 之子集（過濾位置在使用者條件之前）', () => {
    const biz: ViewerScope = { roleCode: 'User', userSubtype: 'business', orgCode: 'JAC00', companyCode: 'AS' };
    const candidateIds = new Set(visibleCandidates(pool, biz, TODAY).map((d) => d.id));
    const page = buildPublicList(pool, biz, { keyword: '文件' }, TODAY);
    expect(page.items.length).toBeGreaterThan(0);
    for (const item of page.items) expect(candidateIds.has(item.id)).toBe(true);
  });
});
