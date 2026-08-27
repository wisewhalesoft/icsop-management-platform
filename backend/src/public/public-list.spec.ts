import {
  PublicDocItem,
  isAnnounced,
  isPinned,
  splitAndSort,
  matchesKeyword,
  paginate,
  buildPublicList,
  escapeLikeContains,
} from './public-list';
import { escapeLikePrefix } from '../org-directory/org-unit-read';
import { ViewerScope, UsingDeptRef } from '../rbac/viewer-scope';

/**
 * F041 簽章遷移 shim（架構 §3.7 決策一，刻意的破壞性變更）：`buildPublicList` 第二參數
 * 由 `userOrgCode: string | null` 改為必要參數 `viewer: ViewerScope`。既有案例之測試標的與
 * 業務子分類無關，一律以「其他」子分類包裝——`isDeptScopedViewer` 對此恆為 false，
 * 故不施加任何額外過濾，行為與遷移前逐欄相同（AC-U5／F041 AC-19 回歸鎖定）。
 * `isPinned`／`splitAndSort` 簽章不變（仍吃 orgCode 字串），不受本次遷移影響。
 */
function viewerOf(orgCode: string | null): ViewerScope {
  return { roleCode: 'User', userSubtype: 'other', orgCode, companyCode: 'AS' };
}

/**
 * 測試用文件工廠（僅設定與斷言相關欄位）。
 *
 * 🔴 2026-08-16 delta（F019 AC-D4／AC-D7／AC-D12；architecture-spec §10.6）：`PublicDocItem`
 * additive 新增五欄 `companyCode`／`draftingSectionId`／`primaryChiefId`／
 * `secondaryChiefIds`／`edition`。`usingDeptIds` **保留**（AC-D12 明訂內部型別不變，
 * 置頂與 F041 可見性判定所需；只有對外 DTO 移除）。
 */
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
    usingDepts: [],
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

/**
 * 便利建構：同一公司（預設 AS）之使用部門參照清單。
 * 🔴 B 階段（多公司）：`usingDepts` 由裸 `orgCode[]` 改為帶公司別之 `UsingDeptRef[]`——
 * 跨公司隔離之專屬案例見 `rbac/viewer-scope.spec.ts`；本檔沿用單一公司（AS）情境，
 * 驗證公司維度加入後既有排序／置頂語意逐案不變。
 */
function depts(codes: string[], companyCode = 'AS'): UsingDeptRef[] {
  return codes.map((orgCode) => ({ companyCode, orgCode }));
}

const TODAY = new Date('2026-07-17T00:00:00Z');

describe('F019 排序：使用部門置頂 + 編號降冪', () => {
  it('TS-F019-001 使用者部門與文件使用部門完全相符 → 置頂', () => {
    const d1 = doc({ id: 'D1', usingDepts: depts(['JAC00']), documentNumber: 'A002' });
    const d2 = doc({ id: 'D2', usingDepts: depts(['JCHA0']), documentNumber: 'A001' });
    const out = splitAndSort([d2, d1], 'JAC00', 'AS');
    expect(out.map((d) => d.id)).toEqual(['D1', 'D2']); // D1 置頂在前
  });

  it('TS-F019-002 置頂區與其餘區各自依文件編號降冪', () => {
    const p1 = doc({ id: 'A003', usingDepts: depts(['JAC00']), documentNumber: 'A003' });
    const p2 = doc({ id: 'A001', usingDepts: depts(['JAC00']), documentNumber: 'A001' });
    const r1 = doc({ id: 'B010', usingDepts: depts(['ZZ000']), documentNumber: 'B010' });
    const r2 = doc({ id: 'B002', usingDepts: depts(['ZZ000']), documentNumber: 'B002' });
    const out = splitAndSort([p2, r2, p1, r1], 'JAC00', 'AS');
    expect(out.map((d) => d.id)).toEqual(['A003', 'A001', 'B010', 'B002']);
  });

  it('TS-F019-003 使用者部門查無相符文件 → 無置頂，純編號降冪', () => {
    const a = doc({ id: 'a', usingDepts: depts(['ZZ000']), documentNumber: 'N-1' });
    const b = doc({ id: 'b', usingDepts: depts(['YY000']), documentNumber: 'N-2' });
    const out = splitAndSort([a, b], 'JAC00', 'AS');
    expect(out.map((d) => d.id)).toEqual(['b', 'a']); // 純降冪，無異常空區塊
  });

  it('TS-F019-004 文件使用部門為多部門，其一相符 → 仍列入置頂', () => {
    const d1 = doc({ id: 'D1', usingDepts: depts(['JCHA0', 'JAC00']), documentNumber: 'A001' });
    const d2 = doc({ id: 'D2', usingDepts: depts(['ZZ000']), documentNumber: 'A009' });
    const out = splitAndSort([d2, d1], 'JAC00', 'AS');
    expect(out[0].id).toBe('D1'); // 置頂優先於編號較大之非置頂
  });

  /**
   * ⚠ 取代原 `TS-F019-005`（原斷言「精確集合成員比對」＝ OQ-F019-03 之暫定假設，期望值為 false）。
   * 人類已裁定改採「子樹祖先鏈」：文件使用部門若為使用者部門之祖先（含自身）即置頂。
   * 證據：prototypes/03-public-list.html 第 137-140 行 USER_SCOPE 祖先鏈；
   *       F026-role-field-matrix.md AC「部層 JA000 + 使用者 JAC00 → 相符（子樹自動展開）」。
   */
  it('TS-PS-F019-001 文件使用部門為使用者部門之上層（部層 JA000）→ 置頂', () => {
    const d1 = doc({ id: 'D1', usingDepts: depts(['JA000']) });
    expect(isPinned(d1, 'JAC00', 'AS')).toBe(true);
  });

  it('TS-PS-F019-002 使用者部門與文件使用部門完全相符（自身層級）→ 置頂', () => {
    expect(isPinned(doc({ usingDepts: depts(['JAC00']) }), 'JAC00', 'AS')).toBe(true);
  });

  it('TS-PS-F019-003 文件使用部門為使用者所屬部門之下層（更細單位）→ 不置頂', () => {
    // 使用者掛部層 JA000；文件使用部門為其下處室 JAC00 → 不涵蓋使用者
    expect(isPinned(doc({ usingDepts: depts(['JAC00']) }), 'JA000', 'AS')).toBe(false);
  });

  it('TS-PS-F019-004 多筆使用部門其一為使用者之上層 → 仍置頂（OR 語意不變）', () => {
    expect(isPinned(doc({ usingDepts: depts(['JCHA0', 'JA000']) }), 'JAC00', 'AS')).toBe(true);
  });

  it('TS-PS-F019-005 使用者無部門（orgCode 空）→ 一律非置頂', () => {
    expect(isPinned(doc({ usingDepts: depts(['JAC00']) }), null, 'AS')).toBe(false);
    expect(isPinned(doc({ usingDepts: depts(['JAC00']) }), undefined, 'AS')).toBe(false);
    expect(isPinned(doc({ usingDepts: depts(['JAC00']) }), '', 'AS')).toBe(false);
  });

  it('TS-PS-F019-006 全公司（Root 00000）使用部門 → 對任何使用者皆置頂', () => {
    expect(isPinned(doc({ usingDepts: depts(['00000']) }), 'JCHA0', 'AS')).toBe(true);
    expect(isPinned(doc({ usingDepts: depts(['00000']) }), 'JAC00', 'AS')).toBe(true);
  });

  it('TS-PS-F019-007 兄弟處室之使用部門 → 不置頂（回歸：子樹展開不放寬至兄弟）', () => {
    expect(isPinned(doc({ usingDepts: depts(['JAD00']) }), 'JAC00', 'AS')).toBe(false);
  });
});

/**
 * 🔴 2026-08-16 delta：原 `describe('F019 部門篩選：子樹前綴展開（契約 §9）')` 之
 * `TS-F019-006`／`007`／`008`／`009`／`010`／「未提供部門篩選 → 全通過」六案**已刪除**。
 *
 * 理由（架構決策 A9，architecture-spec §10.9「交棒給 test-generator 之明示」）：前台「使用部門」
 * 篩選器經使用者裁決移除（F019 `AC-D1`），`PublicListFilters.deptCode` 與 `matchesDeptFilter()`
 * **連同函式本體一併移除**，故以 `deptCode` 為輸入之案例**隨函式一起刪除**。
 * **刪除 ≠ 修改期望值**，故不違反 `AC-U5`／F041 `AC-19`「不得修改任何既有期望值」。
 *
 * 🔒 該六案所驗之**子樹展開語意本身並未消失**，其驗證載體改由下列既有測試持續持有，
 *   全數維持綠燈、期望值未動（F019 `AC-D13` 回歸鎖定）：
 *   · `backend/src/org-sync/org-hierarchy.spec.ts` `TS-PS-ORG-001`～`007`（`isWithinSubtree`）
 *   · `backend/src/rbac/viewer-scope.spec.ts`（`isUsingDeptMatched`／`isDocVisibleToViewer`）
 *   · 本檔 `TS-PS-F019-001`～`007`（`isPinned` 之置頂判定）
 */
describe('F019 SQL LIKE 前綴跳脫（`matchesDeptFilter` 移除後之殘留約束）', () => {
  it('TS-F019-011 前綴含萬用字元 %/_ 視為字面值（不擴大比對）', () => {
    // 記憶體 startsWith 天然字面安全：前綴 'J%' 不應命中 'JA000'
    expect('JA000'.startsWith('J%')).toBe(false);
    // SQL 下推路徑之跳脫函式（[integration] 用）：% _ [ 逐字跳脫
    expect(escapeLikePrefix('J%_[')).toBe('J[%][_][[]');
  });
});

describe('F019 狀態/循環篩選 + AND 組合', () => {
  it('TS-F019-013 循環篩選（lifecycleId 相等）', () => {
    const items = [
      doc({ id: 'a', lifecycleId: 'LC-A' }),
      doc({ id: 'b', lifecycleId: 'LC-B' }),
    ];
    const page = buildPublicList(items, viewerOf(null), { lifecycleId: 'LC-A' }, TODAY);
    expect(page.items.map((d) => d.id)).toEqual(['a']);
  });

  /**
   * 🔴 2026-08-16 delta：本案原以 `deptCode`（使用部門篩選）為第一條件，該篩選器已移除（`AC-D1`／A9）。
   * 依 architecture-spec §10.9「以 F019 `AC-D6` 之新六項篩選任意組合替代」，第一條件改為
   * `draftingDeptId`（制定部門，`AC-D4` 等值比對）。**本案之測試標的（AND 而非 OR）未變。**
   * 原斷言（供追溯）：`buildPublicList(items, viewerOf(null), { deptCode: 'JAC00', lifecycleId: 'LC-A' }, TODAY)`
   *   → `['hit']`，fixture 以 `usingDeptIds` 區分命中與否。
   */
  it('TS-F019-014 制定部門＋循環兩條件交集（AND，非聯集）', () => {
    const items = [
      doc({ id: 'hit', draftingDeptId: 'JA000', lifecycleId: 'LC-A' }),
      doc({ id: 'deptOnly', draftingDeptId: 'JA000', lifecycleId: 'LC-B' }),
      doc({ id: 'cycOnly', draftingDeptId: 'ZZ000', lifecycleId: 'LC-A' }),
    ];
    const page = buildPublicList(items, viewerOf(null), { draftingDeptId: 'JA000', lifecycleId: 'LC-A' }, TODAY);
    expect(page.items.map((d) => d.id)).toEqual(['hit']);
  });

  /**
   * 🔴 2026-08-16 delta：同上，第一條件由 `deptCode` 改為 `draftingDeptId`。
   * 原斷言（供追溯）：`{ deptCode: 'JAC00', keyword: '審查' }` → `['hit']`。
   */
  it('TS-F019-015 篩選 AND 關鍵字同時套用', () => {
    const items = [
      doc({ id: 'hit', draftingDeptId: 'JA000', documentName: '審查作業' }),
      doc({ id: 'deptNoKw', draftingDeptId: 'JA000', documentName: '其他' }),
    ];
    const page = buildPublicList(items, viewerOf(null), { draftingDeptId: 'JA000', keyword: '審查' }, TODAY);
    expect(page.items.map((d) => d.id)).toEqual(['hit']);
  });
});

describe('F019 關鍵字搜尋（編號＋名稱）+ 跳脫', () => {
  it('TS-F019-016 關鍵字為文件編號部分字串', () => {
    expect(matchesKeyword(doc({ documentNumber: 'ICSOP-2026-001' }), '2026-001')).toBe(true);
  });
  it('TS-F019-017 關鍵字為文件名稱部分字串', () => {
    expect(matchesKeyword(doc({ documentName: '消費金融作業程序書' }), '消費金融')).toBe(true);
  });
  it('TS-F019-018 關鍵字含 %/_/\' 視為字面值，無錯誤/注入', () => {
    const d = doc({ documentName: "100%_test'x" });
    expect(matchesKeyword(d, "100%_test'")).toBe(true); // 字面命中
    expect(matchesKeyword(doc({ documentName: '無關' }), "100%_test'")).toBe(false);
    // SQL 下推之跳脫（[integration]）
    expect(escapeLikeContains("100%_")).toBe('100[%][_]');
  });
  it('空關鍵字 → 全通過', () => {
    expect(matchesKeyword(doc({}), '')).toBe(true);
    expect(matchesKeyword(doc({}), '   ')).toBe(true);
  });
});

describe('F019 強制基底條件（不可繞過）', () => {
  it('TS-F019-020 僅回傳已公告文件（有效且公告日期≤今日）', () => {
    const announced = doc({ id: 'ann', status: 'active', announcedDate: '2026-01-01' });
    const inProgress = doc({ id: 'ip', status: 'active', announcedDate: '2026-12-31' });
    const inactive = doc({ id: 'ina', status: 'inactive', announcedDate: '2026-01-01' });
    const voided = doc({ id: 'void', status: 'void', announcedDate: '2026-01-01' });
    const page = buildPublicList([announced, inProgress, inactive, voided], viewerOf(null), {}, TODAY);
    expect(page.items.map((d) => d.id)).toEqual(['ann']);
  });

  it('G-PUB-012 hiddenCount＝被基底條件隱藏之候選數（進度中/失效/作廢），與使用者篩選無關', () => {
    const announced = doc({ id: 'ann', status: 'active', announcedDate: '2026-01-01' });
    const inProgress = doc({ id: 'ip', status: 'active', announcedDate: '2026-12-31' });
    const inactive = doc({ id: 'ina', status: 'inactive', announcedDate: '2026-01-01' });
    const voided = doc({ id: 'void', status: 'void', announcedDate: '2026-01-01' });
    // 即使套用關鍵字篩選（縮小 items），hiddenCount 仍反映全候選中之非公告數（3）。
    const page = buildPublicList(
      [announced, inProgress, inactive, voided],
      viewerOf(null),
      { keyword: '找不到的關鍵字' },
      TODAY,
    );
    expect(page.hiddenCount).toBe(3);
  });

  it('TS-F019-021 呼叫端夾帶 status 參數企圖繞過 → 後端強制忽略', () => {
    const inactive = doc({ id: 'ina', status: 'inactive', announcedDate: '2026-01-01' });
    // 前端傳入 status=失效 亦不放寬：基底條件恆鎖已公告
    const page = buildPublicList([inactive], viewerOf(null), { status: 'inactive' }, TODAY);
    expect(page.items).toHaveLength(0);
  });

  it('TS-F019-022 有效且公告日期＝今日（含當日）→ 已公告', () => {
    expect(isAnnounced(doc({ status: 'active', announcedDate: '2026-07-17' }), TODAY)).toBe(true);
  });

  it('TS-F019-023 有效但公告日期＝明日 → 進度中，不列入', () => {
    expect(isAnnounced(doc({ status: 'active', announcedDate: '2026-07-18' }), TODAY)).toBe(false);
  });
});

describe('F019 分頁', () => {
  it('TS-F019-024/025 分頁中繼與跨頁排序一致（105 筆 / 每頁 50）', () => {
    // 產生編號可排序之 105 筆（皆已公告、無置頂）
    const items = Array.from({ length: 105 }, (_, i) =>
      doc({ id: `d${i}`, documentNumber: `N-${String(i).padStart(3, '0')}`, usingDepts: depts(['ZZ000']) }),
    );
    const sorted = splitAndSort(items.filter((i) => isAnnounced(i, TODAY)), null, 'AS');
    const p1 = paginate(sorted, 1, 50);
    const p2 = paginate(sorted, 2, 50);
    const p3 = paginate(sorted, 3, 50);
    expect(p1.items).toHaveLength(50);
    expect(p2.items).toHaveLength(50);
    expect(p3.items).toHaveLength(5);
    expect(p1.total).toBe(105);
    expect(p3.hasNext).toBe(false);
    expect(p2.hasNext).toBe(true);
    // 第 2 頁銜接第 1 頁末筆之後，無重複/遺漏
    const ids = [...p1.items, ...p2.items, ...p3.items].map((d) => d.id);
    expect(new Set(ids).size).toBe(105);
    expect(ids).toEqual(sorted.map((d) => d.id));
  });
});

/**
 * F041 AC-14～AC-19（F019 delta AC-U1～AC-U5）：buildPublicList 於既有「已公告」基底條件之後、
 * 其餘篩選之前，對業務子分類 viewer 追加「使用部門相符」可見性過濾（AND）。
 * 權威：docs/specs/features/F041-user-subtype-business-scope.md §C；
 * docs/specs/architecture-spec.md §3.7 決策三(a)（插入點在 base 之後，hiddenCount 計算式零額外邏輯）。
 */
function bizViewer(orgCode: string | null = 'JAC00'): ViewerScope {
  return { roleCode: 'User', userSubtype: 'business', orgCode, companyCode: 'AS' };
}

describe('F041 AC-14～AC-19：buildPublicList 業務子分類可見性過濾', () => {
  it('AC-14 業務@JAC00：3 筆已公告文件中僅 2 筆相符（JA000 祖先 + 00000 Root）進入 items，total 同步收斂', () => {
    const items = [
      doc({ id: 'match-anc', usingDepts: depts(['JA000']) }),
      doc({ id: 'no-match', usingDepts: depts(['JAD00']) }),
      doc({ id: 'match-root', usingDepts: depts(['00000']) }),
    ];
    const page = buildPublicList(items, bizViewer('JAC00'), {}, TODAY);
    expect(page.items.map((d) => d.id).sort()).toEqual(['match-anc', 'match-root']);
    expect(page.total).toBe(2);
  });

  it('AC-15 業務子分類之結果全部項目皆滿足 isPinned（置頂區＝全部、其餘區恆空，OQ-E08-07 4a 之數學推論）', () => {
    // buildPublicList 純函式層之 items 本身不攜帶 .pinned 旗標（該欄位於服務層 toDto() 才附加，
    // 見 public-documents.service.spec.ts）；此處以「與置頂判定式同一函式」isPinned() 直接驗證
    // 每一項目對業務 viewer 之 orgCode 皆滿足置頂條件——此即 AC-15「其餘區恆空」之數學推論本身。
    const items = [
      doc({ id: 'a', usingDepts: depts(['JA000']) }),
      doc({ id: 'b', usingDepts: depts(['00000']) }),
    ];
    const page = buildPublicList(items, bizViewer('JAC00'), {}, TODAY);
    expect(page.items).toHaveLength(2);
    expect(page.items.every((d) => isPinned(d, 'JAC00', 'AS'))).toBe(true);
  });

  /**
   * 🔴 2026-08-16 delta：F041 `AC-16` 之原載體為 `filters.deptCode`，該欄位隨前台「使用部門」
   * 篩選器一併移除（F019 `AC-D1`／架構 A9），spec 已標記本條「因篩選器移除而不再適用」。
   * 依 §10.9 之等價替代原則，改以 `AC-D6` 新六項篩選其一（制定部門）選到業務子樹範圍外之值。
   * **測試標的（交集為空係正常查詢結果、不得拋錯）逐字未變。**
   * 原斷言（供追溯）：`buildPublicList([doc({usingDeptIds:['JA000']})], bizViewer('JAC00'), { deptCode: 'JCHA0' }, TODAY)`
   *   → `items === []`、`total === 0`、不拋錯。
   */
  it('AC-16（載體遷移）新篩選選到業務可見集合外之值 → items=[]、total=0，不拋錯（交集為空係正常查詢結果）', () => {
    const items = [doc({ id: 'a', usingDepts: depts(['JA000']), draftingDeptId: 'JA000' })];
    expect(() => {
      const page = buildPublicList(items, bizViewer('JAC00'), { draftingDeptId: 'ZZ999' }, TODAY);
      expect(page.items).toEqual([]);
      expect(page.total).toBe(0);
    }).not.toThrow();
  });

  /**
   * 🔴 2026-08-16 delta：組合列表中之 `deptCode` 條件（原組合 ③ 與 ⑤ 之一部分）改以 `AC-D6`
   * 之新六項篩選替代，並**擴充為五項篩選逐一 ＋ 全項合併**——比原本三種條件更強。
   * 原斷言（供追溯）：combos ＝ `[{}, {keyword:'審查'}, {deptCode:'JAD00'}, {lifecycleId:'L1'},
   *   {keyword:'審查', deptCode:'JAD00', lifecycleId:'L1'}]`，逐一斷言 `items` 不含該文件。
   *
   * 📌 §10.9 之更強保證：`isDocVisibleToViewer` 之過濾位置在 `base` 之後、`filtered` 之前，
   *    故**無論篩選項增減或排列組合**，不相符文件根本不會進入 `filtered` 的輸入。
   *    本案為該結構保證之行為層佐證（列舉），而非其替代。
   */
  it('AC-17 不相符文件於新六項篩選之任何排列組合下皆不出現（業務限制與其餘條件 AND）', () => {
    const mismatched = doc({
      id: 'ICSOP-AD-001',
      documentNumber: 'ICSOP-AD-001',
      documentName: '審查作業',
      usingDepts: depts(['JAD00']), // 業務@JAC00 不可見
      companyCode: 'C9',
      draftingDeptId: 'JAD00',
      draftingSectionId: 'JADA0',
      primaryChiefId: 'E001',
      secondaryChiefIds: ['E002'],
      lifecycleId: 'L1',
    });
    const viewer = bizViewer('JAC00');
    const combos: Array<Record<string, string>> = [
      {},
      { keyword: '審查' },
      { companyCode: 'C9' },
      { draftingDeptId: 'JAD00' },
      { draftingSectionId: 'JADA0' },
      { chiefId: 'E001' },
      { chiefId: 'E002' }, // AC-D7：次要室長命中亦不得使不可見文件現身
      { lifecycleId: 'L1' },
      {
        keyword: '審查',
        companyCode: 'C9',
        draftingDeptId: 'JAD00',
        draftingSectionId: 'JADA0',
        chiefId: 'E001',
        lifecycleId: 'L1',
      },
    ];
    for (const filters of combos) {
      const page = buildPublicList([mismatched], viewer, filters, TODAY);
      expect(page.items.map((d) => d.id)).not.toContain('ICSOP-AD-001');
      expect(page.total).toBe(0);
    }
  });

  it('AC-18 hiddenCount 僅計「已公告基底條件」隱藏者（進度中/失效/作廢），不含被業務限制過濾者', () => {
    const items = [
      doc({ id: 'in-progress', status: 'active', announcedDate: '2099-01-01' }),
      doc({ id: 'void', status: 'void' }),
      doc({ id: 'announced-mismatch', status: 'active', usingDepts: depts(['JAD00']) }),
    ];
    const page = buildPublicList(items, bizViewer('JAC00'), {}, TODAY);
    expect(page.items).toEqual([]);
    expect(page.hiddenCount).toBe(2); // 僅 in-progress + void；announced-mismatch 不計入
  });

  /**
   * 🔴 2026-08-16 delta：篩選鍵由 `deptCode` 改為 `draftingDeptId`（載體遷移，`AC-D1`／A9）。
   * 原斷言（供追溯）：`buildPublicList(items, other, { deptCode: 'JAC00', lifecycleId: 'LC-A' }, TODAY)`
   *   → `items.map(id) === ['hit']`（fixture 以 `usingDeptIds` 區分）。
   *
   * 🔒 本案為 F041 `AC-19` 之**逐欄回歸對照組**，本次**加嚴**（非放寬）：由僅比對 `items` 之 id
   *    擴為逐欄比對 `items`／`total`／`page`／`pageSize`／`hasNext`／`hiddenCount` 與每項 `isPinned`。
   */
  it('AC-19（回歸鎖定）「其他」子分類 viewer → 輸出逐欄與業務限制未介入時相同', () => {
    const items = [
      doc({ id: 'hit', usingDepts: depts(['JAC00']), draftingDeptId: 'JA000', lifecycleId: 'LC-A' }),
      doc({ id: 'deptOnly', usingDepts: depts(['JAC00']), draftingDeptId: 'JA000', lifecycleId: 'LC-B' }),
      doc({ id: 'cycOnly', usingDepts: depts(['ZZ000']), draftingDeptId: 'ZZ000', lifecycleId: 'LC-A' }),
    ];
    const other: ViewerScope = { roleCode: 'User', userSubtype: 'other', orgCode: 'JAC00', companyCode: 'AS' };
    const page = buildPublicList(items, other, { draftingDeptId: 'JA000', lifecycleId: 'LC-A' }, TODAY);
    expect(page.items.map((d) => d.id)).toEqual(['hit']); // 未受業務限制影響
    expect(page.total).toBe(1);
    expect(page.page).toBe(1);
    expect(page.pageSize).toBe(50);
    expect(page.hasNext).toBe(false);
    expect(page.hiddenCount).toBe(0);
    expect(page.items.map((d) => isPinned(d, 'JAC00', 'AS'))).toEqual([true]);
  });

  /**
   * 🔒 F041 `AC-19` 之第二道回歸對照組（**本 delta 新增**）：非 `'User'` 角色（例如 ICSOPAdmin）
   * 與「其他」子分類一樣不受限，且**新增之五項篩選對其語意與對一般使用者完全相同**——
   * 篩選是使用者條件，可見性才是角色條件，兩者正交（F019 `AC-D13`／`AC-U5`）。
   */
  it('AC-19（回歸鎖定）非 User 角色 viewer → 新五項篩選語意與「其他」子分類逐欄相同', () => {
    const items = [
      doc({ id: 'hit', usingDepts: depts(['JAD00']), companyCode: 'C1', primaryChiefId: 'E001' }),
      doc({ id: 'miss', usingDepts: depts(['JAD00']), companyCode: 'C2', primaryChiefId: 'E001' }),
    ];
    const admin: ViewerScope = { roleCode: 'ICSOPAdmin', userSubtype: 'other', orgCode: 'JAC00', companyCode: 'AS' };
    const other: ViewerScope = { roleCode: 'User', userSubtype: 'other', orgCode: 'JAC00', companyCode: 'AS' };
    const filters = { companyCode: 'C1', chiefId: 'E001' };
    const a = buildPublicList(items, admin, filters, TODAY);
    const b = buildPublicList(items, other, filters, TODAY);
    expect(a.items.map((d) => d.id)).toEqual(['hit']);
    expect({ ...a, items: a.items.map((d) => d.id) }).toEqual({ ...b, items: b.items.map((d) => d.id) });
  });
});
