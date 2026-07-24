import {
  deriveTier,
  deriveParentCode,
  deriveCodePrefix,
  isWithinSubtree,
  OrgTier,
} from './org-hierarchy';

/**
 * 對應 F004 之階層推導 AC（upstream-hr-source-contract.md §3.5 / data-model.md §orgunit-entity）。
 * 權威規則：層級由 5 碼部門代碼前綴決定，每一碼代表一層；
 * 明確禁用 P_DEPTID / TOP_DEPTID / S_DEPTID（本層純字串推導，不接觸這些欄位）。
 */

describe('deriveTier', () => {
  const cases: Array<[string, OrgTier]> = [
    ['00000', 'ROOT'],
    ['J0000', 'DIVISION'], // 本部
    ['JA000', 'DEPARTMENT'], // 部
    ['JAC00', 'SECTION'], // 處/室
    ['JCHA0', 'SUBSECTION'], // 課（第 4 碼有值）
    ['BJAA0', 'SUBSECTION'],
  ];
  it.each(cases)('%s → %s', (code, tier) => {
    expect(deriveTier(code)).toBe(tier);
  });

  it('AC：JAC00 → SECTION（處/室）', () => {
    expect(deriveTier('JAC00')).toBe('SECTION');
  });

  it('AC：JCHA0（第 4 碼有值）→ SUBSECTION（課），5 層不壓縮', () => {
    expect(deriveTier('JCHA0')).toBe('SUBSECTION');
  });

  it('非 5 碼 / null → 拋錯（供上層歸類為髒資料）', () => {
    expect(() => deriveTier('JA0')).toThrow();
    expect(() => deriveTier('')).toThrow();
    expect(() => deriveTier(null as unknown as string)).toThrow();
  });
});

describe('deriveCodePrefix（去尾端連續 0）', () => {
  it.each([
    ['00000', ''],
    ['J0000', 'J'],
    ['JA000', 'JA'],
    ['JAC00', 'JAC'],
    ['JCHA0', 'JCHA'],
  ])('%s → "%s"', (code, prefix) => {
    expect(deriveCodePrefix(code)).toBe(prefix);
  });

  it('內部 0 不移除（僅去尾端）', () => {
    expect(deriveCodePrefix('J0A00')).toBe('J0A');
  });
});

describe('deriveParentCode（上層代碼）', () => {
  it('AC：JAC00（處/室）→ 部層 JA000', () => {
    expect(deriveParentCode('JAC00')).toBe('JA000');
  });

  it('JCHA0（課）→ 處/室層 JCH00（不參考 P_DEPTID）', () => {
    expect(deriveParentCode('JCHA0')).toBe('JCH00');
  });

  it('JA000（部）→ 本部 J0000（＝ LEFT(1)+0000）', () => {
    expect(deriveParentCode('JA000')).toBe('J0000');
  });

  it('J0000（本部）→ Root 00000', () => {
    expect(deriveParentCode('J0000')).toBe('00000');
  });

  it('00000（Root）→ null（無上層）', () => {
    expect(deriveParentCode('00000')).toBeNull();
  });
});

/**
 * isWithinSubtree（public-seams）：targetCode 是否位於 scopeCode 所定義子樹（含自身）內。
 * F019 置頂／F026「使用部門相符性」／F019 部門篩選三處消費同一 predicate（僅參數角色互換）：
 *   置頂／F026：isWithinSubtree(文件使用部門, 使用者部門)
 *   部門篩選  ：isWithinSubtree(選定篩選單位, 文件使用部門)
 * 權威：F026-role-field-matrix.md「同一規則適用於 F019 前台部門篩選與 F033 RAG 檢索層權限過濾，
 *       三者不得各自訂定不同展開規則」；prototypes/03-public-list.html USER_SCOPE 祖先鏈示範。
 */
describe('isWithinSubtree（子樹歸屬：scope 涵蓋 target）', () => {
  it('TS-PS-ORG-001 scope 與 target 完全相同（自身）→ 相符', () => {
    expect(isWithinSubtree('JAC00', 'JAC00')).toBe(true);
  });

  it('TS-PS-ORG-002 scope 為 target 之上層（部層 JA000 涵蓋處室 JAC00）→ 相符', () => {
    // 對應 F026 AC-F026-a：文件使用部門設為部層 JA000、使用者所屬部門 JAC00 → 相符
    expect(isWithinSubtree('JA000', 'JAC00')).toBe(true);
  });

  it('TS-PS-ORG-003 scope 為 target 之下層（處室 JAC00 不涵蓋部層 JA000）→ 不相符', () => {
    expect(isWithinSubtree('JAC00', 'JA000')).toBe(false);
  });

  it('TS-PS-ORG-004 scope 與 target 為同層兄弟（JAC00 vs JAD00）→ 不相符', () => {
    // 對應 F026 AC-F026-b：文件使用部門設為處室層、使用者為同部另一處室 → 不相符
    expect(isWithinSubtree('JAC00', 'JAD00')).toBe(false);
  });

  it('TS-PS-ORG-005 scope 為 Root（00000，有效前綴空字串）→ 對任何 target 皆相符', () => {
    expect(isWithinSubtree('00000', 'JCHA0')).toBe(true);
    expect(isWithinSubtree('00000', 'JAC00')).toBe(true);
  });

  it('TS-PS-ORG-006 最細課層雙向皆不誤判（JCHA0 vs JCHB0）', () => {
    expect(isWithinSubtree('JCHA0', 'JCHB0')).toBe(false);
    expect(isWithinSubtree('JCHB0', 'JCHA0')).toBe(false);
    expect(isWithinSubtree('JCH00', 'JCHA0')).toBe(true); // 處室涵蓋其下課層
  });

  it('TS-PS-ORG-007 防呆不對稱（定案 OQ-PS-04）：僅 scopeCode 驗證，targetCode 不驗證', () => {
    // scopeCode 沿用 deriveCodePrefix/assertOrgCode 既有防呆
    expect(() => isWithinSubtree('X', 'JAC00')).toThrow(/INVALID_ORG_CODE/);
    // targetCode 比照既有 matchesDeptFilter 對 item.usingDeptIds 之信任慣例：不拋錯、字面比對
    expect(isWithinSubtree('JAC00', 'X')).toBe(false);
  });
});
