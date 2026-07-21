import {
  deriveTier,
  deriveParentCode,
  deriveCodePrefix,
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
