import { normalizeIdList } from './document-org-fields';

/**
 * F014：多值欄位（當責室長-次要 employeeNo、文件使用部門 orgCode）之正規化純函式。
 * 規則：非陣列→空；逐項轉字串並去頭尾空白；去空字串；保留首次出現順序去重。
 */
describe('normalizeIdList（F014 多值欄位正規化）', () => {
  it('非陣列（undefined/null/字串/物件）→ 空陣列', () => {
    expect(normalizeIdList(undefined)).toEqual([]);
    expect(normalizeIdList(null)).toEqual([]);
    expect(normalizeIdList('E1')).toEqual([]);
    expect(normalizeIdList({ 0: 'E1' })).toEqual([]);
  });

  it('保留順序、去頭尾空白', () => {
    expect(normalizeIdList(['20053', ' 20541 ', 'A2000'])).toEqual(['20053', '20541', 'A2000']);
  });

  it('去除空字串與純空白項', () => {
    expect(normalizeIdList(['20053', '', '   ', 'B0000'])).toEqual(['20053', 'B0000']);
  });

  it('去重（保留首次出現順序）', () => {
    expect(normalizeIdList(['E1', 'E2', 'E1', ' E2 ', 'E3'])).toEqual(['E1', 'E2', 'E3']);
  });

  it('非字串元素轉字串後處理', () => {
    expect(normalizeIdList([123, 456])).toEqual(['123', '456']);
  });

  it('空陣列 → 空陣列', () => {
    expect(normalizeIdList([])).toEqual([]);
  });
});
