import {
  buildJobPositionResolver,
  jobPositionKey,
  JobPositionRecord,
} from './job-position-directory';

/**
 * 職位對照解析（G-ADM-001「職位」欄）。
 * 規則權威：upstream-hr-source-contract.md §5.4.2；實測數據見該節（2026-08-31 上游實查）。
 *
 * 🔴 本檔之核心命題：**與資位（job-title-directory）不同，職位不得有跨公司 fallback**。
 *    以下之 fallback 反例採實測真值（`C04`／`D04`／`B03`），語意相反而非近義。
 */

const AS_ROWS: JobPositionRecord[] = [
  { companyCode: 'AS', code: 'N03', name: '營業一般職' },
  { companyCode: 'AS', code: 'M03', name: '事務一般職' },
  { companyCode: 'AS', code: 'C04', name: '處長' },
  { companyCode: 'AS', code: 'D04', name: '營業經理' },
];

describe('jobPositionKey', () => {
  it('以 | 分隔公司與代碼（同 jobTitleKey 之慣例）', () => {
    expect(jobPositionKey('AS', 'N03')).toBe('AS|N03');
  });
});

describe('buildJobPositionResolver — 本公司精確命中', () => {
  it('命中 → 回該公司之名稱', () => {
    const resolve = buildJobPositionResolver(AS_ROWS);
    expect(resolve('AS', 'N03')).toBe('營業一般職');
    expect(resolve('AS', 'C04')).toBe('處長');
  });

  it('同代碼跨公司異義時，各自解析出自己公司之名稱', () => {
    const resolve = buildJobPositionResolver([
      ...AS_ROWS,
      { companyCode: 'AD', code: 'C04', name: '部長' },
      { companyCode: 'AD', code: 'D04', name: '科長' },
    ]);
    expect(resolve('AS', 'C04')).toBe('處長');
    expect(resolve('AD', 'C04')).toBe('部長');
    expect(resolve('AS', 'D04')).toBe('營業經理');
    expect(resolve('AD', 'D04')).toBe('科長');
  });
});

describe('🔴 buildJobPositionResolver — 絕不跨公司 fallback', () => {
  // 實測 2026-08-31：C04 在 AS/AE＝處長、在 AD＝部長；D04 在 AS＝營業經理、在 AD＝科長。
  // 若比照資位開放 fallback，AD 之 B20 會被解析成他公司的某個職位——顯示錯誤的職位。
  it('本公司查無 → null，即使他公司有同代碼', () => {
    const resolve = buildJobPositionResolver([
      ...AS_ROWS,
      { companyCode: 'AD', code: 'D06', name: '代理科長' },
    ]);
    expect(resolve('AS', 'D06')).toBeNull();
  });

  it('公司為 null/空字串 → null（不得退化為「任一公司同代碼」）', () => {
    const resolve = buildJobPositionResolver(AS_ROWS);
    expect(resolve(null, 'N03')).toBeNull();
    expect(resolve('', 'N03')).toBeNull();
    expect(resolve('   ', 'N03')).toBeNull();
  });

  it('實測未命中之 B20（AS 6 人）→ null，顯示「—」', () => {
    expect(buildJobPositionResolver(AS_ROWS)('AS', 'B20')).toBeNull();
  });
});

describe('buildJobPositionResolver — 查無與空值（一律 null，不拋錯）', () => {
  const resolve = buildJobPositionResolver(AS_ROWS);

  it.each([
    ['代碼為 null', null],
    ['代碼為 undefined', undefined],
    ['代碼為空字串', ''],
    ['代碼僅空白', '   '],
  ])('%s → null', (_label, code) => {
    expect(resolve('AS', code)).toBeNull();
  });

  it('代碼前後空白 → trim 後仍可命中', () => {
    expect(resolve(' AS ', ' N03 ')).toBe('營業一般職');
  });

  it('對照列本身殘缺（缺代碼/公司/名稱）→ 略過該列，不汙染解析表', () => {
    const resolve2 = buildJobPositionResolver([
      { companyCode: 'AS', code: '', name: '無代碼' },
      { companyCode: '', code: 'N03', name: '無公司' },
      { companyCode: 'AS', code: 'M03', name: '' },
      { companyCode: 'AS', code: 'N03', name: '營業一般職' },
    ]);
    expect(resolve2('AS', 'N03')).toBe('營業一般職');
    expect(resolve2('AS', 'M03')).toBeNull();
  });
});
