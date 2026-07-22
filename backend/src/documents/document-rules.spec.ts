import {
  REQUIRED_FIELDS,
  missingRequired,
  isNumberAvailable,
  NumberHolder,
} from './document-rules';

describe('document-rules', () => {
  describe('missingRequired（F010：4 核心必填）', () => {
    it('4 必填齊備 → 空陣列', () => {
      expect(
        missingRequired({
          lifecycleId: 'lc1',
          status: 'active',
          documentNumber: 'ICSOP-SRC-101-1-01',
          documentName: '車輛分期進件作業',
        }),
      ).toEqual([]);
    });
    it('缺漏回缺欄名；空白視為缺', () => {
      expect(missingRequired({ lifecycleId: 'lc1', status: 'active' }).sort()).toEqual(
        ['documentName', 'documentNumber'].sort(),
      );
      expect(missingRequired({ lifecycleId: 'lc1', status: 'active', documentNumber: '  ', documentName: 'x' })).toEqual(['documentNumber']);
    });
    it('REQUIRED_FIELDS 恰為 4 欄', () => {
      expect([...REQUIRED_FIELDS].sort()).toEqual(
        ['documentName', 'documentNumber', 'lifecycleId', 'status'].sort(),
      );
    });
  });

  describe('isNumberAvailable（F013：比對有效+作廢、失效可重用、編輯排除自身）', () => {
    const holders: NumberHolder[] = [
      { id: 'd1', documentNumber: 'N-100', status: 'active' },
      { id: 'd2', documentNumber: 'N-200', status: 'void' },
      { id: 'd3', documentNumber: 'N-300', status: 'inactive' },
    ];
    it('與有效文件編號重複 → 不可用', () => {
      expect(isNumberAvailable('N-100', holders)).toBe(false);
    });
    it('與作廢文件編號重複 → 不可用（作廢仍佔用）', () => {
      expect(isNumberAvailable('N-200', holders)).toBe(false);
    });
    it('僅被失效文件占用 → 可用（失效釋出可重用）', () => {
      expect(isNumberAvailable('N-300', holders)).toBe(true);
    });
    it('全新編號 → 可用', () => {
      expect(isNumberAvailable('N-999', holders)).toBe(true);
    });
    it('編輯排除自身：維持原值不視為衝突', () => {
      expect(isNumberAvailable('N-100', holders, 'd1')).toBe(true);
      // 改為他筆有效已用 → 仍衝突
      expect(isNumberAvailable('N-100', holders, 'd2')).toBe(false);
    });
  });
});
