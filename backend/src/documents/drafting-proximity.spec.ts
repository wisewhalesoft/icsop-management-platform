import { draftingProximity, divisionCodeOfKey, DraftingUnits } from './drafting-proximity';

/**
 * 2026-09-23 使用者裁定：依「制定單位與檢視者單位之相近程度」排序
 * （同室別 0 → 同部門 1 → 同本部 2 → 同公司 3 → 其他公司 4）。
 * 語料刻意讓每一層「只差一格」——若實作把任兩層合併或順序對調，至少一案翻紅。
 */
const unit = (over: Partial<DraftingUnits> = {}): DraftingUnits => ({
  companyCode: 'AS',
  draftingSectionId: 'JAC00',
  draftingDeptId: 'JA000',
  draftingDivisionCode: 'J0000',
  ...over,
});

describe('draftingProximity', () => {
  const staff = { orgCode: 'JAC00', companyCode: 'AS' };

  it('同制定室別 → 0', () => {
    expect(draftingProximity(unit(), staff)).toBe(0);
  });

  it('檢視者在制定室別之下轄課 → 仍為 0（子樹涵蓋）', () => {
    expect(draftingProximity(unit(), { orgCode: 'JACA0', companyCode: 'AS' })).toBe(0);
  });

  it('同部門、不同室別 → 1', () => {
    expect(draftingProximity(unit({ draftingSectionId: 'JAB00' }), staff)).toBe(1);
  });

  it('同本部、不同部門 → 2', () => {
    expect(
      draftingProximity(unit({ draftingSectionId: 'JBA00', draftingDeptId: 'JB000' }), staff),
    ).toBe(2);
  });

  it('同公司、不同本部 → 3', () => {
    expect(
      draftingProximity(
        unit({ draftingSectionId: 'KBA00', draftingDeptId: 'KB000', draftingDivisionCode: 'K0000' }),
        staff,
      ),
    ).toBe(3);
  });

  it('他公司之同碼單位 → 4（公司別先於代碼比對）', () => {
    expect(draftingProximity(unit({ companyCode: 'AD' }), staff)).toBe(4);
  });

  it('上層主管往上一層落：部長看轄下處室之文件 → 1', () => {
    expect(draftingProximity(unit(), { orgCode: 'JA000', companyCode: 'AS' })).toBe(1);
  });

  it('本部長看轄下文件 → 2', () => {
    expect(draftingProximity(unit(), { orgCode: 'J0000', companyCode: 'AS' })).toBe(2);
  });

  it('總經理（公司層 00000）：本公司文件一律 3、他公司 4', () => {
    const gm = { orgCode: '00000', companyCode: 'AS' };
    expect(draftingProximity(unit(), gm)).toBe(3);
    expect(draftingProximity(unit({ companyCode: 'AD' }), gm)).toBe(4);
  });

  it('制定單位為 ROOT（00000）不得對全公司命中', () => {
    expect(
      draftingProximity(
        unit({ draftingSectionId: null, draftingDeptId: '00000', draftingDivisionCode: null }),
        staff,
      ),
    ).toBe(3);
  });

  it('只有室別、無部門與本部時仍可命中室別；缺值層略過', () => {
    expect(
      draftingProximity(unit({ draftingDeptId: null, draftingDivisionCode: null }), staff),
    ).toBe(0);
    expect(
      draftingProximity(
        unit({ draftingSectionId: null, draftingDeptId: null, draftingDivisionCode: 'J0000' }),
        staff,
      ),
    ).toBe(2);
  });

  it('檢視者無單位 → 本公司 3；無公司 → 4；髒代碼不拋錯', () => {
    expect(draftingProximity(unit(), { orgCode: null, companyCode: 'AS' })).toBe(3);
    expect(draftingProximity(unit(), { orgCode: 'JAC00', companyCode: null })).toBe(4);
    expect(draftingProximity(unit({ draftingSectionId: 'JA' }), staff)).toBe(1);
  });
});

describe('divisionCodeOfKey', () => {
  it('複合鍵取出裸本部代碼', () => {
    expect(divisionCodeOfKey('AS__D0000')).toBe('D0000');
    expect(divisionCodeOfKey(null)).toBeNull();
    expect(divisionCodeOfKey('D0000')).toBeNull();
  });
});
