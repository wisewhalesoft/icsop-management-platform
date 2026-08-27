import {
  ViewerScope,
  UsingDeptRef,
  normalizeUserSubtype,
  isDeptScopedViewer,
  isUsingDeptMatched,
  isDocVisibleToViewer,
} from './viewer-scope';
import { isPinned, PublicDocItem } from '../public/public-list';
import type { RoleCode } from './function-matrix';

/**
 * F041 一般使用者子分類——資料列層級可見性之核心純函式。
 * 權威＝docs/specs/features/F041-user-subtype-business-scope.md（AC-01～AC-13）
 * ＋ docs/specs/architecture-spec.md §3.7 決策二（`rbac/viewer-scope.ts` 落點與函式簽章逐字）。
 *
 * ⚠ blind-to-implementation：本檔未讀取任何 `backend/src/rbac/viewer-scope.ts`（尚不存在）之實作。
 * 純函式簽章逐字採規格「本規格鎖定之命名」表；AC-10 之等價驗證改以「同輸入下與既有 isPinned 逐案相等」
 * 之行為斷言達成（INV-4「內部呼叫既有 isWithinSubtree」為架構設計陳述，非可獨立於行為之外斷言的內部呼叫次數）。
 */

/**
 * 測試用最小文件工廠，僅設定 usingDeptIds 相關欄位供 isPinned 呼叫。
 *
 * 📝 **2026-08-16 純機械補欄（F019 delta 之型別漣漪；`tdd-implementation` 申訴 #2，lead 已驗證）**：
 * `PublicDocItem` 依 architecture-spec §10.6 additive 新增五個**必填**欄
 * （`companyCode`／`draftingSectionId`／`primaryChiefId`／`secondaryChiefIds`／`edition`），
 * 本工廠未同步補齊即 `TS2739`，**整個 suite 無法編譯**。
 *
 * ⚠ 五欄**不得**改為選填：環自身之 `public-list-filter-options.spec.ts` 之
 * `distinct((d) => [d.primaryChiefId, ...d.secondaryChiefIds])` 要求 `secondaryChiefIds` 可迭代
 * （選填即 `TS2488`），其餘四欄選填會使型別成 `string | null | undefined`、不符 `Array<string | null>`。
 *
 * 🔒 **本次只補工廠欄位，五欄一律填中性值（本檔僅消費 `usingDeptIds`，其餘與 F041 語意無關）；
 *    本檔之任何斷言、期望值、案例結構一律未動** —— F041 deny-by-default 之核心測試，
 *    補欄後應**恢復全綠**（它本來就是綠的，不是本 delta 要推翻的對象）。
 */
function doc(usingDepts: UsingDeptRef[], companyCode = 'AS'): PublicDocItem {
  return {
    id: 'd',
    status: 'active',
    documentNumber: 'N-1',
    documentName: '文件',
    lifecycleId: 'lc1',
    lifecycleName: null,
    usingDepts,
    companyCode,
    draftingDeptId: null,
    draftingSectionId: null,
    primaryChiefId: null,
    secondaryChiefIds: [],
    edition: null,
    announcedDate: '2026-01-01',
    contentSummary: null,
  };
}

function viewer(over: Partial<ViewerScope>): ViewerScope {
  return {
    roleCode: 'User',
    userSubtype: 'business',
    orgCode: 'JAC00',
    companyCode: 'AS',
    ...over,
  };
}

/** 便利建構：同一公司（預設 AS）之使用部門參照清單。 */
function depts(codes: string[], companyCode = 'AS'): UsingDeptRef[] {
  return codes.map((orgCode) => ({ companyCode, orgCode }));
}

describe('normalizeUserSubtype（AC-01／AC-02）', () => {
  it('AC-01 合法值原值回傳', () => {
    expect(normalizeUserSubtype('business')).toBe('business');
    expect(normalizeUserSubtype('other')).toBe('other');
  });

  it.each([null, undefined, '', '   ', 'Business', 'BUSINESS', '業務', 'unknown', 123])(
    'AC-02 未知值 %p → 收斂為 other（fail-open，大小寫敏感、不模糊比對）',
    (v) => {
      expect(normalizeUserSubtype(v as unknown)).toBe('other');
    },
  );
});

describe('isDeptScopedViewer（AC-03／AC-04，INV-2）', () => {
  it.each<RoleCode>(['SysAdmin', 'ICSOPAdmin', 'Supervisor', 'DeptContact'])(
    'AC-03 角色=%s（即使 userSubtype=business）→ false（子分類僅對 User 生效）',
    (roleCode) => {
      expect(isDeptScopedViewer({ roleCode, userSubtype: 'business', orgCode: 'JAC00', companyCode: 'AS' })).toBe(false);
    },
  );

  it('AC-04 roleCode=User 且 userSubtype=business → true；userSubtype=other → false', () => {
    expect(isDeptScopedViewer({ roleCode: 'User', userSubtype: 'business', orgCode: 'JAC00', companyCode: 'AS' })).toBe(true);
    expect(isDeptScopedViewer({ roleCode: 'User', userSubtype: 'other', orgCode: 'JAC00', companyCode: 'AS' })).toBe(false);
  });
});

describe('isDocVisibleToViewer（AC-05～AC-13，重用 isWithinSubtree 之子樹展開）', () => {
  it('AC-05 文件掛部層 JA000、使用者在其下處室 JAC00 → 相符（祖先涵蓋）', () => {
    expect(isDocVisibleToViewer(depts(['JA000']), viewer({ orgCode: 'JAC00' }))).toBe(true);
  });

  it('AC-06 文件掛處室 JAC00、使用者在其上部層 JA000 → 不相符（反向不成立）', () => {
    expect(isDocVisibleToViewer(depts(['JAC00']), viewer({ orgCode: 'JA000' }))).toBe(false);
  });

  it('AC-07 文件掛同部另一處室 JAD00、使用者 JAC00 → 不相符', () => {
    expect(isDocVisibleToViewer(depts(['JAD00']), viewer({ orgCode: 'JAC00' }))).toBe(false);
  });

  it('AC-08 文件掛全公司 Root 00000 → 對任何業務使用者皆相符', () => {
    expect(isDocVisibleToViewer(depts(['00000']), viewer({ orgCode: 'JCHA0' }))).toBe(true);
  });

  it('AC-09 文件掛同處室另一課 JCHB0、使用者 JCHA0 → 不相符', () => {
    expect(isDocVisibleToViewer(depts(['JCHB0']), viewer({ orgCode: 'JCHA0' }))).toBe(false);
  });

  it('AC-11 多使用部門其一相符（OR 語意）→ 相符', () => {
    expect(isDocVisibleToViewer(depts(['JCHA0', 'JA000']), viewer({ orgCode: 'JAC00' }))).toBe(true);
  });

  it.each([null, undefined, ''])(
    'AC-12 orgCode=%p（孤兒帳號）→ 恆不相符（deny-by-default，不得放寬為全可見）',
    (orgCode) => {
      expect(isDocVisibleToViewer(depts(['JA000']), viewer({ orgCode: orgCode as string | null }))).toBe(false);
    },
  );

  it('AC-13 非受限 viewer（other 子分類 / orgCode=null 之 other / 非 User 角色）→ 恆可見，即使使用部門不相符', () => {
    const mismatched = depts(['JCHB0']);
    expect(isDocVisibleToViewer(mismatched, { roleCode: 'User', userSubtype: 'other', orgCode: 'JAC00', companyCode: 'AS' })).toBe(true);
    expect(isDocVisibleToViewer(mismatched, { roleCode: 'User', userSubtype: 'other', orgCode: null, companyCode: 'AS' })).toBe(true);
    expect(isDocVisibleToViewer(mismatched, { roleCode: 'Supervisor', userSubtype: 'business', orgCode: null, companyCode: 'AS' })).toBe(true);
  });
});

/**
 * AC-10（機器可驗證之重用宣示，INV-4）：isUsingDeptMatched 對任意輸入之回傳值須與既有 isPinned 逐案相等。
 * 輸入組合取自 public-seams-test-design.md §1.2 TS-PS-ORG-001～006（單一 usingDept）＋ AC-11 之多筆 OR 案例
 * ＋ AC-12 之孤兒帳號案例——涵蓋祖先/自身/下層/兄弟/Root/最細課層/OR/缺值共 8 類，任一類不等價即視為
 * 「存在第二套比對邏輯」而違反 INV-4。
 */
describe('AC-10：isUsingDeptMatched 與既有 isPinned 逐案相等（INV-4，唯一部門比對邏輯）', () => {
  const cases: Array<{ label: string; usingDeptIds: string[]; orgCode: string | null; expected: boolean }> = [
    { label: 'TS-PS-ORG-001 自身相同', usingDeptIds: ['JAC00'], orgCode: 'JAC00', expected: true },
    { label: 'TS-PS-ORG-002 使用部門為使用者之上層', usingDeptIds: ['JA000'], orgCode: 'JAC00', expected: true },
    { label: 'TS-PS-ORG-003 使用部門為使用者之下層', usingDeptIds: ['JAC00'], orgCode: 'JA000', expected: false },
    { label: 'TS-PS-ORG-004 同層兄弟', usingDeptIds: ['JAC00'], orgCode: 'JAD00', expected: false },
    { label: 'TS-PS-ORG-005 Root 全域涵蓋', usingDeptIds: ['00000'], orgCode: 'JCHA0', expected: true },
    { label: 'TS-PS-ORG-006 最細課層兄弟', usingDeptIds: ['JCHA0'], orgCode: 'JCHB0', expected: false },
    { label: 'AC-11 多筆 OR：其一相符', usingDeptIds: ['JCHA0', 'JA000'], orgCode: 'JAC00', expected: true },
    { label: 'AC-11 多筆 OR：全不相符', usingDeptIds: ['JCHA0', 'JAD00'], orgCode: 'JAC00', expected: false },
    { label: 'AC-12 orgCode=null', usingDeptIds: ['JA000'], orgCode: null, expected: false },
    { label: 'AC-12 orgCode=空字串', usingDeptIds: ['JA000'], orgCode: '', expected: false },
  ];

  it.each(cases)('$label（usingDeptIds=$usingDeptIds, orgCode=$orgCode）→ $expected', ({ usingDeptIds, orgCode, expected }) => {
    // 同公司（AS）情境：本組案例驗證公司維度加入後，既有之部門子樹語意逐案不變。
    const refs = depts(usingDeptIds);
    const viaIsUsingDeptMatched = isUsingDeptMatched(refs, orgCode, 'AS');
    const viaIsPinned = isPinned(doc(refs), orgCode, 'AS');
    expect(viaIsUsingDeptMatched).toBe(expected);
    expect(viaIsPinned).toBe(expected);
    expect(viaIsUsingDeptMatched).toBe(viaIsPinned); // 逐案相等，INV-4 之機器可驗證核心斷言
  });
});

/**
 * 🔴 B 階段（多公司）安全性回歸鎖：**跨公司不得誤中**。
 *
 * `orgCode` 為 5 碼部門代碼、每家公司各自從 `00000` 獨立編碼——AD 的 `JAC00` 與 AS 的 `JAC00`
 * 字串相同、意義完全不同。修正前 `isUsingDeptMatched` 只做字串前綴比對，AD 之「業務」子分類
 * 使用者會看到 AS 的文件（越權瀏覽，且靜默無痕）。
 *
 * 本組案例刻意讓「部門代碼完全相同、只有公司別不同」——若有人把公司過濾拿掉，這幾條會立刻紅。
 */
describe('🔒 B 階段：跨公司隔離（同 orgCode 不同 companyCode 不得相符）', () => {
  it('同部門代碼但不同公司 → 不相符（越權防線）', () => {
    const adDoc = depts(['JAC00'], 'AD');
    expect(isUsingDeptMatched(adDoc, 'JAC00', 'AS')).toBe(false);
    expect(isPinned(doc(adDoc, 'AD'), 'JAC00', 'AS')).toBe(false);
  });

  it('同公司同部門代碼 → 相符（確認上一條不是因為整體失效而過）', () => {
    const asDoc = depts(['JAC00'], 'AS');
    expect(isUsingDeptMatched(asDoc, 'JAC00', 'AS')).toBe(true);
    expect(isPinned(doc(asDoc, 'AS'), 'JAC00', 'AS')).toBe(true);
  });

  it('Root（00000）亦受公司邊界拘束——不得成為跨公司後門', () => {
    // Root 之有效前綴為空字串，isWithinSubtree 對任何 targetCode 皆 true；
    // 若公司過濾漏了，別家公司掛 Root 的文件會對全體使用者可見，是最嚴重的洩漏形狀。
    expect(isUsingDeptMatched(depts(['00000'], 'AD'), 'JCHA0', 'AS')).toBe(false);
    expect(isUsingDeptMatched(depts(['00000'], 'AS'), 'JCHA0', 'AS')).toBe(true);
  });

  it('多筆混合公司 → 僅同公司者參與比對', () => {
    const mixed: UsingDeptRef[] = [
      { companyCode: 'AD', orgCode: 'JA000' }, // 跨公司，不得使其相符
      { companyCode: 'AS', orgCode: 'JCHB0' }, // 同公司但兄弟部門，不相符
    ];
    expect(isUsingDeptMatched(mixed, 'JAC00', 'AS')).toBe(false);
    // 加入一筆同公司之上層 → 應相符（驗證過濾後仍正常運作）
    expect(
      isUsingDeptMatched([...mixed, { companyCode: 'AS', orgCode: 'JA000' }], 'JAC00', 'AS'),
    ).toBe(true);
  });

  it('viewer 之 companyCode 缺值 → deny-by-default（不得放寬為忽略公司比對）', () => {
    expect(isUsingDeptMatched(depts(['JAC00'], 'AS'), 'JAC00', null)).toBe(false);
    expect(isUsingDeptMatched(depts(['JAC00'], 'AS'), 'JAC00', '')).toBe(false);
    expect(isDocVisibleToViewer(depts(['JAC00'], 'AS'), viewer({ companyCode: null }))).toBe(false);
  });

  it('AC-13 例外仍成立：非受限 viewer 不受公司邊界影響（恆可見）', () => {
    // 公司隔離只作用於「受部門限縮」之 viewer；其餘角色本就全可見，不得因本修正而被誤鎖。
    const adDoc = depts(['JAC00'], 'AD');
    expect(
      isDocVisibleToViewer(adDoc, { roleCode: 'User', userSubtype: 'other', orgCode: 'JAC00', companyCode: 'AS' }),
    ).toBe(true);
    expect(
      isDocVisibleToViewer(adDoc, { roleCode: 'ICSOPAdmin', userSubtype: 'business', orgCode: 'JAC00', companyCode: 'AS' }),
    ).toBe(true);
  });
});
