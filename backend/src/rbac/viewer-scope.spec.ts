import {
  ViewerScope,
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

/** 測試用最小文件工廠，僅設定 usingDeptIds 相關欄位供 isPinned 呼叫。 */
function doc(usingDeptIds: string[]): PublicDocItem {
  return {
    id: 'd',
    status: 'active',
    documentNumber: 'N-1',
    documentName: '文件',
    lifecycleId: 'lc1',
    lifecycleName: null,
    usingDeptIds,
    draftingDeptId: null,
    announcedDate: '2026-01-01',
    contentSummary: null,
  };
}

function viewer(over: Partial<ViewerScope>): ViewerScope {
  return { roleCode: 'User', userSubtype: 'business', orgCode: 'JAC00', ...over };
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
      expect(isDeptScopedViewer({ roleCode, userSubtype: 'business', orgCode: 'JAC00' })).toBe(false);
    },
  );

  it('AC-04 roleCode=User 且 userSubtype=business → true；userSubtype=other → false', () => {
    expect(isDeptScopedViewer({ roleCode: 'User', userSubtype: 'business', orgCode: 'JAC00' })).toBe(true);
    expect(isDeptScopedViewer({ roleCode: 'User', userSubtype: 'other', orgCode: 'JAC00' })).toBe(false);
  });
});

describe('isDocVisibleToViewer（AC-05～AC-13，重用 isWithinSubtree 之子樹展開）', () => {
  it('AC-05 文件掛部層 JA000、使用者在其下處室 JAC00 → 相符（祖先涵蓋）', () => {
    expect(isDocVisibleToViewer(['JA000'], viewer({ orgCode: 'JAC00' }))).toBe(true);
  });

  it('AC-06 文件掛處室 JAC00、使用者在其上部層 JA000 → 不相符（反向不成立）', () => {
    expect(isDocVisibleToViewer(['JAC00'], viewer({ orgCode: 'JA000' }))).toBe(false);
  });

  it('AC-07 文件掛同部另一處室 JAD00、使用者 JAC00 → 不相符', () => {
    expect(isDocVisibleToViewer(['JAD00'], viewer({ orgCode: 'JAC00' }))).toBe(false);
  });

  it('AC-08 文件掛全公司 Root 00000 → 對任何業務使用者皆相符', () => {
    expect(isDocVisibleToViewer(['00000'], viewer({ orgCode: 'JCHA0' }))).toBe(true);
  });

  it('AC-09 文件掛同處室另一課 JCHB0、使用者 JCHA0 → 不相符', () => {
    expect(isDocVisibleToViewer(['JCHB0'], viewer({ orgCode: 'JCHA0' }))).toBe(false);
  });

  it('AC-11 多使用部門其一相符（OR 語意）→ 相符', () => {
    expect(isDocVisibleToViewer(['JCHA0', 'JA000'], viewer({ orgCode: 'JAC00' }))).toBe(true);
  });

  it.each([null, undefined, ''])(
    'AC-12 orgCode=%p（孤兒帳號）→ 恆不相符（deny-by-default，不得放寬為全可見）',
    (orgCode) => {
      expect(isDocVisibleToViewer(['JA000'], viewer({ orgCode: orgCode as string | null }))).toBe(false);
    },
  );

  it('AC-13 非受限 viewer（other 子分類 / orgCode=null 之 other / 非 User 角色）→ 恆可見，即使使用部門不相符', () => {
    const mismatched = ['JCHB0'];
    expect(isDocVisibleToViewer(mismatched, { roleCode: 'User', userSubtype: 'other', orgCode: 'JAC00' })).toBe(true);
    expect(isDocVisibleToViewer(mismatched, { roleCode: 'User', userSubtype: 'other', orgCode: null })).toBe(true);
    expect(isDocVisibleToViewer(mismatched, { roleCode: 'Supervisor', userSubtype: 'business', orgCode: null })).toBe(true);
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
    const viaIsUsingDeptMatched = isUsingDeptMatched(usingDeptIds, orgCode);
    const viaIsPinned = isPinned(doc(usingDeptIds), orgCode);
    expect(viaIsUsingDeptMatched).toBe(expected);
    expect(viaIsPinned).toBe(expected);
    expect(viaIsUsingDeptMatched).toBe(viaIsPinned); // 逐案相等，INV-4 之機器可驗證核心斷言
  });
});
