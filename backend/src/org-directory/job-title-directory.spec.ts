import {
  buildJobTitleResolver,
  jobTitleKey,
  JobTitleRecord,
} from './job-title-directory';

/**
 * 職稱對照解析（G-ADM-001「職位」欄）。
 * 規則權威：upstream-hr-source-contract.md §5.4；實測數據見該節（2026-08-12 上游盤點）。
 */

const AS_ROWS: JobTitleRecord[] = [
  { companyCode: 'AS', code: 'J01', name: '業務專員' },
  { companyCode: 'AS', code: 'F01', name: '課長' },
  { companyCode: 'AS', code: 'C01', name: '協理' },
];

describe('jobTitleKey', () => {
  it('以 | 分隔公司與代碼', () => {
    expect(jobTitleKey('AS', 'J01')).toBe('AS|J01');
  });
});

describe('buildJobTitleResolver — 第 1 段：本公司優先', () => {
  it('本公司命中 → 回該公司之名稱', () => {
    const resolve = buildJobTitleResolver(AS_ROWS);
    expect(resolve('AS', 'J01')).toBe('業務專員');
    expect(resolve('AS', 'F01')).toBe('課長');
  });

  it('同代碼跨公司異名時，本公司之值優先於其他公司', () => {
    const resolve = buildJobTitleResolver([
      { companyCode: 'AR', code: 'C01', name: '高級協理' },
      ...AS_ROWS,
    ]);
    expect(resolve('AS', 'C01')).toBe('協理');
    expect(resolve('AR', 'C01')).toBe('高級協理');
  });
});

describe('buildJobTitleResolver — 第 2 段：跨公司 fallback', () => {
  // 實測：AS 在職 1,115 筆中 I10(9 筆)/G03(1 筆) 不在 AS 對照列內，
  // 僅第 1 段時命中率 99.1%，加入 fallback 後 100%。
  it('本公司查無 → 以其他公司之對照補齊', () => {
    const resolve = buildJobTitleResolver([
      ...AS_ROWS,
      { companyCode: 'AR', code: 'I10', name: '資深專員' },
    ]);
    expect(resolve('AS', 'I10')).toBe('資深專員');
  });

  it('fallback 為確定性：多公司皆有該代碼時固定取 companyCode 字典序最小者', () => {
    const rows: JobTitleRecord[] = [
      { companyCode: 'BF', code: 'X99', name: 'BF 名稱' },
      { companyCode: 'AR', code: 'X99', name: 'AR 名稱' },
      { companyCode: 'AJ', code: 'X99', name: 'AJ 名稱' },
    ];
    // 輸入順序不得影響結果（否則同帳號在不同次同步會解析出不同職稱）
    expect(buildJobTitleResolver(rows)('AS', 'X99')).toBe('AJ 名稱');
    expect(buildJobTitleResolver([...rows].reverse())('AS', 'X99')).toBe('AJ 名稱');
  });
});

describe('buildJobTitleResolver — 查無與空值（一律 null，不拋錯）', () => {
  const resolve = buildJobTitleResolver(AS_ROWS);

  it.each([
    ['代碼為 null', null],
    ['代碼為 undefined', undefined],
    ['代碼為空字串', ''],
    ['代碼僅空白', '   '],
  ])('%s → null', (_label, code) => {
    expect(resolve('AS', code)).toBeNull();
  });

  it('代碼查無對照 → null（前端顯示「—」）', () => {
    expect(resolve('AS', 'ZZZ')).toBeNull();
  });

  it('公司為空但代碼存在 → 仍以跨公司 fallback 解析', () => {
    expect(resolve(null, 'J01')).toBe('業務專員');
  });

  it('對照列本身殘缺（缺代碼/公司/名稱）→ 略過該列，不汙染解析表', () => {
    const resolve2 = buildJobTitleResolver([
      { companyCode: 'AS', code: '', name: '無代碼' },
      { companyCode: '', code: 'J01', name: '無公司' },
      { companyCode: 'AS', code: 'F01', name: '' },
      { companyCode: 'AS', code: 'J01', name: '業務專員' },
    ]);
    expect(resolve2('AS', 'J01')).toBe('業務專員');
    expect(resolve2('AS', 'F01')).toBeNull();
  });
});
