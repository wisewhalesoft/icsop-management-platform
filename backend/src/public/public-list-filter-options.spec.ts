/**
 * F019 `AC-D5`／`AC-D7` — 前台五項可搜尋下拉之**選項來源**與資安檢核（2026-08-16 delta 第 2 項）
 *
 * 權威：
 *   · docs/specs/features/F019-public-list-browsing.md `AC-D5`（🔴 選項來源與資安檢核）、`AC-D7`
 *   · docs/specs/architecture-spec.md §10.6（A6：單一端點 `GET /public/documents/filter-options`、
 *     `visibleCandidates()` 物理共用、`value` 恆為 id/code、label fallback 為 code、本輪不做快取）
 *   · docs/specs/architecture-spec.md §10.15 第 10 項（「本輪測得到，應該測」）
 *   · prototypes/03-public-list.html 第 296-323 行（visibleDocs() → 五組 distinct）
 *
 * 🔴 本檔為 `AC-D5` 之**資安**載體：下拉選項本身不得洩漏他部門文件之存在
 *   （與 `AC-U4` `hiddenCount` 不洩漏原則同源）。任何一條放寬都是資安退化。
 */
import { PublicDocItem, buildFilterOptions, buildPublicList, visibleCandidates } from './public-list';
import { PublicDocumentsService, OrgNameResolver } from './public-documents.service';
import { PublicDocDetail, PublicDocumentStore } from './public-documents.store';
import { ViewerScope } from '../rbac/viewer-scope';
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

const OTHER: ViewerScope = { roleCode: 'User', userSubtype: 'other', orgCode: 'JAC00', companyCode: 'AS' };
const BUSINESS: ViewerScope = { roleCode: 'User', userSubtype: 'business', orgCode: 'JAC00', companyCode: 'AS' };
const ORPHAN: ViewerScope = { roleCode: 'User', userSubtype: 'business', orgCode: null, companyCode: 'AS' };

const values = (opts: ReadonlyArray<{ value: string }>): string[] => opts.map((o) => o.value).sort();

/**
 * `AC-D5` 之核心 fixture：池中僅有一筆使用部門為 `JAD00`（對業務@JAC00 不相符）之已公告文件，
 * 其 `companyCode='C9'`。業務 viewer 取得之「制定公司」選項**不得含 `C9`**。
 */
const LEAK_POOL: PublicDocItem[] = [
  doc({
    id: 'visible',
    usingDepts: depts(['JAC00']),
    companyCode: 'C1',
    draftingDeptId: 'JA000',
    draftingSectionId: 'JAC00',
    primaryChiefId: 'E001',
    lifecycleId: 'lc1',
  }),
  doc({
    id: 'hidden',
    usingDepts: depts(['JAD00']),
    companyCode: 'C9',
    draftingDeptId: 'JD000',
    draftingSectionId: 'JAD00',
    primaryChiefId: 'E900',
    secondaryChiefIds: ['E901'],
    lifecycleId: 'lc9',
  }),
];

describe('F019 AC-D5：選項來源＝全域 distinct，且先經 isDocVisibleToViewer 過濾', () => {
  it('TS-F019-D5-101 業務@JAC00：不相符文件之 companyCode「C9」不得出現於選項', () => {
    const opts = buildFilterOptions(LEAK_POOL, BUSINESS, TODAY);
    expect(opts.draftingCompanies.some((o) => o.value === 'C9')).toBe(false);
    expect(values(opts.draftingCompanies)).toEqual(['C1']);
  });

  it('TS-F019-D5-102 五組選項全數不得洩漏不可見文件之衍生值', () => {
    const opts = buildFilterOptions(LEAK_POOL, BUSINESS, TODAY);
    expect(values(opts.draftingCompanies)).toEqual(['C1']);
    expect(values(opts.draftingDepts)).toEqual(['JA000']);
    expect(values(opts.draftingSections)).toEqual(['JAC00']);
    expect(values(opts.chiefs)).toEqual(['E001']);
    expect(values(opts.lifecycles)).toEqual(['lc1']);
  });

  it('TS-F019-D5-103 同一池、兩個不同 viewer → 選項集合不同（可見性確實作用於選項端）', () => {
    const biz = buildFilterOptions(LEAK_POOL, BUSINESS, TODAY);
    const other = buildFilterOptions(LEAK_POOL, OTHER, TODAY);
    expect(values(other.draftingCompanies)).toEqual(['C1', 'C9']); // 不受限者看得到兩者
    expect(values(biz.draftingCompanies)).toEqual(['C1']);
    expect(values(biz.draftingCompanies)).not.toEqual(values(other.draftingCompanies));
  });

  it('TS-F019-D5-104 孤兒帳號（業務、orgCode 缺值）→ 五組選項皆為空（deny-by-default，非錯誤）', () => {
    const opts = buildFilterOptions(LEAK_POOL, ORPHAN, TODAY);
    expect(opts.draftingCompanies).toEqual([]);
    expect(opts.draftingDepts).toEqual([]);
    expect(opts.draftingSections).toEqual([]);
    expect(opts.chiefs).toEqual([]);
    expect(opts.lifecycles).toEqual([]);
  });

  it('TS-F019-D5-105 非已公告文件（進度中／失效／作廢）之衍生值不得進入選項', () => {
    const pool = [
      doc({ id: 'ip', status: 'active', announcedDate: '2099-01-01', companyCode: 'C-IP' }),
      doc({ id: 'ina', status: 'inactive', companyCode: 'C-INA' }),
      doc({ id: 'void', status: 'void', companyCode: 'C-VOID' }),
      doc({ id: 'ann', status: 'active', announcedDate: '2026-01-01', companyCode: 'C-OK' }),
    ];
    expect(values(buildFilterOptions(pool, OTHER, TODAY).draftingCompanies)).toEqual(['C-OK']);
  });

  it('TS-F019-D5-106 選項為**全域 distinct**：不隨已套用之其他篩選收斂（避免「篩了就選不回來」）', () => {
    // 已在清單側施加篩選（只留 C1）之後，選項側仍須回傳全部可見值（C1 ＋ C9）。
    // ⚠ 結構面（handler 收不到 filters）另由 `public-filter-options.controller.spec.ts`
    //   `TS-F019-D5-205`（handler arity === 1）把關；此處為行為面之直接佐證。
    const filtered = buildPublicList(LEAK_POOL, OTHER, { companyCode: 'C1' }, TODAY);
    expect(filtered.items.map((d) => d.id)).toEqual(['visible']);

    const opts = buildFilterOptions(LEAK_POOL, OTHER, TODAY);
    expect(values(opts.draftingCompanies)).toEqual(['C1', 'C9']);
  });

  it('TS-F019-D5-107 空值（null／空字串）不得成為選項', () => {
    const pool = [
      doc({ id: 'a', draftingSectionId: null, companyCode: 'C1' }),
      doc({ id: 'b', draftingSectionId: '', companyCode: 'C1' }),
      doc({ id: 'c', draftingSectionId: 'JAC00', companyCode: 'C1' }),
    ];
    expect(values(buildFilterOptions(pool, OTHER, TODAY).draftingSections)).toEqual(['JAC00']);
  });

  it('TS-F019-D5-108 重複值僅出現一次（distinct）', () => {
    const pool = [
      doc({ id: 'a', companyCode: 'C1', lifecycleId: 'lc1' }),
      doc({ id: 'b', companyCode: 'C1', lifecycleId: 'lc1' }),
    ];
    const opts = buildFilterOptions(pool, OTHER, TODAY);
    expect(opts.draftingCompanies).toHaveLength(1);
    expect(opts.lifecycles).toHaveLength(1);
  });

  /**
   * 🔴 結構性保證（§10.6）：選項與清單**物理共用** `visibleCandidates()`。
   * 以「選項集合逐組等於 `visibleCandidates()` 之 distinct」把兩者綁在一起——
   * 任一邊日後偏離另一邊即紅燈，而非仰賴「記得也要過濾」之約定。
   */
  it('TS-F019-D5-109 五組選項逐組等於 visibleCandidates() 之 distinct（物理共用之行為層佐證）', () => {
    for (const viewer of [OTHER, BUSINESS, ORPHAN]) {
      const cands = visibleCandidates(LEAK_POOL, viewer, TODAY);
      const opts = buildFilterOptions(LEAK_POOL, viewer, TODAY);
      const distinct = (pick: (d: PublicDocItem) => Array<string | null>): string[] =>
        [...new Set(cands.flatMap(pick).filter((v): v is string => !!v))].sort();
      expect(values(opts.draftingCompanies)).toEqual(distinct((d) => [d.companyCode]));
      expect(values(opts.draftingDepts)).toEqual(distinct((d) => [d.draftingDeptId]));
      expect(values(opts.draftingSections)).toEqual(distinct((d) => [d.draftingSectionId]));
      expect(values(opts.chiefs)).toEqual(distinct((d) => [d.primaryChiefId, ...d.secondaryChiefIds]));
      expect(values(opts.lifecycles)).toEqual(distinct((d) => [d.lifecycleId]));
    }
  });
});

describe('F019 AC-D7：「當責室長」選項＝可見文件之 primaryChiefId ∪ secondaryChiefIds 之 distinct', () => {
  it('TS-F019-D7-101 次要室長亦進入選項清單', () => {
    const pool = [doc({ id: 'a', primaryChiefId: 'E001', secondaryChiefIds: ['E002', 'E003'] })];
    expect(values(buildFilterOptions(pool, OTHER, TODAY).chiefs)).toEqual(['E001', 'E002', 'E003']);
  });

  it('TS-F019-D7-102 主要與次要重複之員編僅出現一次', () => {
    const pool = [
      doc({ id: 'a', primaryChiefId: 'E001', secondaryChiefIds: ['E002'] }),
      doc({ id: 'b', primaryChiefId: 'E002', secondaryChiefIds: ['E001'] }),
    ];
    expect(values(buildFilterOptions(pool, OTHER, TODAY).chiefs)).toEqual(['E001', 'E002']);
  });

  it('TS-F019-D7-103 不可見文件之次要室長不得洩漏至選項', () => {
    expect(buildFilterOptions(LEAK_POOL, BUSINESS, TODAY).chiefs.some((o) => o.value === 'E901')).toBe(false);
  });
});

/**
 * `AC-D5` ／ §10.6「回傳形狀」：`Option = { value, label }`，**`value` 恆為 id／code**
 * （`companyCode`／`draftingDeptId`／`draftingSectionId`／`employeeNo`／`lifecycleId`），
 * **不得**為顯示名稱——`AC-D4` 已鎖定比對鍵為 id。
 *
 * 📌 純函式層只斷言 §10.6 明訂之部分：`value` 為 id、未解析時 `label` fallback 為 code。
 *    **名稱解析之注入形狀不在此層斷言**——§10.6 只說「由既有 `NameResolutionService`／
 *    `resolvePersonName`／`lifecycleDisplayName` 解析」，未指定注入點；臆造一個解析器介面
 *    等同以測試發明協作點。解析行為改於**服務層**（既有 `OrgNameResolver` 接縫）斷言，見下一 describe。
 */
describe('F019 AC-D5：Option 形狀（value 恆為 id／code；未解析時 label fallback 為 code）', () => {
  it('TS-F019-D5-110 五組之 value 皆為 id／code，且 label 於未解析時 fallback 為同一 code', () => {
    const pool = [
      doc({
        id: 'a',
        companyCode: 'C1',
        draftingDeptId: 'JA000',
        draftingSectionId: 'JAC00',
        primaryChiefId: 'E001',
        lifecycleId: 'lc1',
      }),
    ];
    const opts = buildFilterOptions(pool, OTHER, TODAY);
    expect(opts.draftingCompanies).toEqual([{ value: 'C1', label: 'C1' }]);
    expect(opts.draftingDepts).toEqual([{ value: 'JA000', label: 'JA000' }]);
    expect(opts.draftingSections).toEqual([{ value: 'JAC00', label: 'JAC00' }]);
    expect(opts.chiefs).toEqual([{ value: 'E001', label: 'E001' }]);
    expect(opts.lifecycles).toEqual([{ value: 'lc1', label: 'lc1' }]);
  });

  it('TS-F019-D5-111 label 一律為非空字串，且不得為 `null`／`undefined` 之字面（不顯示佔位字）', () => {
    const pool = [doc({ id: 'a', companyCode: 'C1', lifecycleId: 'lc1' })];
    const opts = buildFilterOptions(pool, OTHER, TODAY);
    for (const group of Object.values(opts)) {
      for (const o of group) {
        expect(typeof o.label).toBe('string');
        expect(o.label.length).toBeGreaterThan(0);
        expect(['null', 'undefined']).not.toContain(o.label);
      }
    }
  });
});

/**
 * 服務層：`PublicDocumentsService.filterOptions(viewer)` ——
 * §10.6「單一端點一次回傳五組」之服務側落點，且與清單**同一份候選集合**（`visibleCandidates()`）。
 * 名稱解析走**既有** `OrgNameResolver` 接縫（`public-documents.service.ts` 之既有第 2 建構子參數，
 * 見既有 `public-documents.service.spec.ts` `TS-F019-030`），fallback 為 code。
 *
 * ✅ **2026-08-17 缺口關閉（`G-L3-03`）**：原註記為「`chiefs` 之人員姓名解析所需之接縫，spec 與 §10.6
 *    皆未指定……本層僅斷言其 `value` 為員編」。該缺口即是前台「當責室長」下拉長期顯示**員編**、
 *    使用者無從搜尋姓名之成因（`prototypes/03-public-list.html:319` 明訂選項為姓名）。
 *    接縫已定為 `OrgNameResolver.resolvePersonNames`（`NameResolutionService` 之既有批次方法，
 *    綁定端 `useExisting` 故無新增協作點）；`lifecycles` 之 label 則取自候選項既有之 `lifecycleName`。
 *    兩者之斷言見 `TS-F019-D5-305`～`TS-F019-D5-308`。
 */
class OptStore implements PublicDocumentStore {
  constructor(private readonly items: PublicDocItem[]) {}
  listCandidates(): Promise<PublicDocItem[]> {
    return Promise.resolve(this.items);
  }
  findDetailById(): Promise<PublicDocDetail | null> {
    return Promise.resolve(null);
  }
}
/**
 * `persons` 未給 ⇒ 人員一律未命中（label fallback 為員編）——既有案例之期望值因而完全不變。
 * 「未命中之鍵**缺席**於 Map」為 `NameResolutionService.resolvePersonNames` 之逐字契約，此處同形。
 */
/**
 * 🔴 2026-08-26：替身**主動檢查 `companyCode` 位置的實際值**，不再只是照抄 port 的形狀。
 *
 * 本檔原本的替身寫的是 `(code) => ...`／`(empNos) => ...`（單參數，抄自當時同樣過期的
 * `OrgNameResolver` 宣告）。於是「服務層漏傳 `companyCode`」這件事在替身上**完全看不出來**——
 * 替身照收第一個參數當代碼、測試全綠，正式環境卻因為真正的 `NameResolutionService` 是兩參數而
 * 對 `undefined` 呼叫 `.map`，整條前台 500。替身只要跟著錯誤的 port 一起漂移，它就從「攔截器」
 * 變成「共犯」。此處改為明確斷言第一參數是公司代碼形狀，讓同型回歸當場炸掉而非靜默通過。
 */
function assertCompanyCode(v: unknown): asserts v is string {
  if (typeof v !== 'string' || v.trim() === '') {
    throw new TypeError(
      `OrgNameResolver 第一參數必須為 companyCode（收到 ${JSON.stringify(v)}）——` +
        '呼叫端疑似仍在用已作廢的單參數簽章。',
    );
  }
}

const resolverOf = (
  map: Record<string, string>,
  persons: Record<string, string> = {},
): OrgNameResolver => ({
  resolveOrgUnitDisplayName: (companyCode, code) => {
    assertCompanyCode(companyCode);
    return Promise.resolve(map[code] ?? null);
  },
  resolvePersonNames: (companyCode, empNos) => {
    assertCompanyCode(companyCode);
    if (!Array.isArray(empNos)) {
      throw new TypeError(`resolvePersonNames 第二參數必須為員編陣列（收到 ${typeof empNos}）。`);
    }
    return Promise.resolve(
      new Map(empNos.filter((e) => persons[e] !== undefined).map((e) => [e, persons[e]])),
    );
  },
});

describe('F019 AC-D5：PublicDocumentsService.filterOptions（服務層組裝與名稱解析）', () => {
  const pool = [
    doc({
      id: 'a',
      usingDepts: depts(['JAC00']),
      companyCode: 'AS',
      draftingDeptId: 'JA000',
      draftingSectionId: 'JAC00',
      primaryChiefId: 'E001',
      lifecycleId: 'lc1',
    }),
  ];
  // 🔴 制定公司之 label 不再經 OrgNameResolver（改由公司主檔全稱解析），故本表不含公司。
  const NAMES = { JA000: '營運管理部', JAC00: '審查室' };

  it('TS-F019-D5-301 三組組織選項之 label 由既有 OrgNameResolver 解析，value 仍為 code', async () => {
    const svc = new PublicDocumentsService(new OptStore(pool), resolverOf(NAMES), () => TODAY);
    const opts = await svc.filterOptions(OTHER);
    // 制定公司：value＝公司代碼、label＝公司主檔全稱（2026-08-27 裁定）。
    expect(opts.draftingCompanies).toEqual([{ value: 'AS', label: '和潤企業股份有限公司' }]);
    expect(opts.draftingDepts).toEqual([{ value: 'JA000', label: '營運管理部' }]);
    expect(opts.draftingSections).toEqual([{ value: 'JAC00', label: '審查室' }]);
  });

  it('TS-F019-D5-302 名稱未命中 → label fallback 為 code（不得為 null／undefined／空字串）', async () => {
    const svc = new PublicDocumentsService(new OptStore(pool), resolverOf({}), () => TODAY);
    const opts = await svc.filterOptions(OTHER);
    expect(opts.draftingSections).toEqual([{ value: 'JAC00', label: 'JAC00' }]);
    // 🔴 制定公司不經 OrgNameResolver ⇒ 空 resolver 不影響其 label；
    //    要落到 fallback 得是**公司主檔查無之代碼**。
    expect(opts.draftingCompanies).toEqual([{ value: 'AS', label: '和潤企業股份有限公司' }]);
    const unknown = await new PublicDocumentsService(
      new OptStore([doc({ id: 'x', usingDepts: depts(['JAC00']), companyCode: 'ZZ' })]),
      resolverOf({}),
      () => TODAY,
    ).filterOptions(OTHER);
    expect(unknown.draftingCompanies).toEqual([{ value: 'ZZ', label: 'ZZ' }]);
  });

  it('TS-F019-D5-303 🔴 服務層亦經可見性過濾：業務@JAC00 取不到不相符文件之衍生值', async () => {
    const svc = new PublicDocumentsService(new OptStore(LEAK_POOL), resolverOf(NAMES), () => TODAY);
    const opts = await svc.filterOptions(BUSINESS);
    expect(values(opts.draftingCompanies)).toEqual(['C1']);
    expect(opts.chiefs.some((o) => o.value === 'E901')).toBe(false);
  });

  it('TS-F019-D5-304 `chiefs` 之 value 為員編（主要∪次要），不得為姓名字串', async () => {
    const svc = new PublicDocumentsService(new OptStore(LEAK_POOL), resolverOf(NAMES), () => TODAY);
    const opts = await svc.filterOptions(OTHER);
    expect(values(opts.chiefs)).toEqual(['E001', 'E900', 'E901']);
  });

  /**
   * 🔴 2026-08-17 缺失修正第 1 項（權威＝`prototypes/03-public-list.html:319`，該處選項即為姓名）。
   * `value` 仍為員編（`AC-D4` 鎖定比對鍵為 id，本修正**只動 label**），故 `TS-F019-D5-304` 同時綠。
   */
  it('TS-F019-D5-305 `chiefs` 之 label 為姓名（value 仍為員編）', async () => {
    const svc = new PublicDocumentsService(
      new OptStore(LEAK_POOL),
      resolverOf(NAMES, { E001: '陳彥廷', E900: '林建宏', E901: '王志文' }),
      () => TODAY,
    );
    const opts = await svc.filterOptions(OTHER);
    // 🔴 以 value→label 之對映斷言，**刻意不斷言 CJK 之排列次序**：中文定序由 ICU 之
    // zh-Hant collation（筆畫）決定，跨 Node/ICU 版本可能不同，硬編次序會產生與本修正無關之脆弱失敗。
    // 「依 label 排序」之行為另以 ASCII 標籤於 TS-F019-D5-309 斷言，該處次序無歧義。
    expect(Object.fromEntries(opts.chiefs.map((o) => [o.value, o.label]))).toEqual({
      E001: '陳彥廷',
      E900: '林建宏',
      E901: '王志文',
    });
  });

  it('TS-F019-D5-306 人員未命中 → `chiefs` 之 label fallback 為員編（不得為空字串／null）', async () => {
    const svc = new PublicDocumentsService(
      new OptStore(pool),
      resolverOf(NAMES, {}),
      () => TODAY,
    );
    const opts = await svc.filterOptions(OTHER);
    expect(opts.chiefs).toEqual([{ value: 'E001', label: 'E001' }]);
  });

  /**
   * 🔴 2026-08-17 缺失修正第 2 項。F019 `AC-S2` 補註明訂「`lifecycleDisplayName` 之組字自
   * 2026-08-16 delta 起**由後端提供**（filter-options 管線一併回傳已組合之 label）」——
   * 現況回傳 lifecycleId（UUID），本條為其回歸鎖。同名不同子分類必須是兩個相異選項。
   */
  it('TS-F019-D5-307 `lifecycles` 之 label 為 lifecycleDisplayName（含子分類），value 仍為 lifecycleId', async () => {
    const cyclePool = [
      doc({ id: 'a', usingDepts: depts(['JAC00']), lifecycleId: 'lc-c', lifecycleName: '銷售及收款循環（消金）' }),
      doc({ id: 'b', usingDepts: depts(['JAC00']), lifecycleId: 'lc-b', lifecycleName: '銷售及收款循環（企金）' }),
    ];
    const svc = new PublicDocumentsService(new OptStore(cyclePool), resolverOf(NAMES), () => TODAY);
    const opts = await svc.filterOptions(OTHER);
    // 同名不同子分類 ⇒ 兩個相異選項（`AC-S2`）。次序不斷言，理由同 TS-F019-D5-305。
    expect(Object.fromEntries(opts.lifecycles.map((o) => [o.value, o.label]))).toEqual({
      'lc-c': '銷售及收款循環（消金）',
      'lc-b': '銷售及收款循環（企金）',
    });
  });

  it('TS-F019-D5-308 循環名稱未解析（store 回 null）→ label fallback 為 lifecycleId', async () => {
    const svc = new PublicDocumentsService(new OptStore(pool), resolverOf(NAMES), () => TODAY);
    const opts = await svc.filterOptions(OTHER);
    expect(opts.lifecycles).toEqual([{ value: 'lc1', label: 'lc1' }]);
  });

  /**
   * 🔴 排序依 **label**：純函式依 value（代碼／員編／UUID）排序，套上名稱後畫面上看不出規律。
   * 本條涵蓋五組——三組組織欄位原本也有同一毛病，一併修正。
   */
  it('TS-F019-D5-309 五組選項皆依 label 排序（非依 value）', async () => {
    const sortPool = [
      doc({
        id: 'a',
        usingDepts: depts(['JAC00']),
        companyCode: 'C1',
        primaryChiefId: 'E001',
        lifecycleId: 'lc1',
        lifecycleName: 'Zulu 循環',
      }),
      doc({
        id: 'b',
        usingDepts: depts(['JAC00']),
        companyCode: 'C2',
        primaryChiefId: 'E002',
        lifecycleId: 'lc2',
        lifecycleName: 'Alpha 循環',
      }),
    ];
    const svc = new PublicDocumentsService(
      new OptStore(sortPool),
      // 🔴 標籤刻意用 ASCII：value 序為 C1<C2、E001<E002、lc1<lc2，label 序三組皆恰好相反，
      // 故本條能區分「依 value 排」與「依 label 排」，且不依賴 CJK collation。
      resolverOf({}, { E001: 'Zoe', E002: 'Adam' }),
      () => TODAY,
    );
    const opts = await svc.filterOptions(OTHER);
    // 🔴 制定公司已自本案移除：其 label 改由公司主檔全稱決定，四家全稱皆為中文，
    //    要構造「value 序與 label 序相反」必然得依賴 CJK collation——正是本案註記要避開的。
    //    「依 label 排序」之規則仍由下列兩組（ASCII 標籤）鎖定，涵蓋同一段程式碼路徑。
    expect(opts.chiefs.map((o) => o.label)).toEqual(['Adam', 'Zoe']);
    expect(opts.lifecycles.map((o) => o.label)).toEqual(['Alpha 循環', 'Zulu 循環']);
  });
});
