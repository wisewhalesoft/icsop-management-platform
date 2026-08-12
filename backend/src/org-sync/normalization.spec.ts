import {
  normalizeDept,
  normalizeAccount,
  normalizeJobTitle,
  DirtyRowError,
  RawDept,
  RawAccount,
  RawJobTitle,
} from './normalization';

/**
 * 上游原始列 → 正規化模型（含髒資料防禦）。
 * 欄位對應：upstream-hr-source-contract.md §5.1（VW_DEPT_SQL）／§5.2（VW_HPMUSER 白名單 12 欄）。
 * 髒資料（TC-010-03）：型別/格式不符之單筆 → 拋 DirtyRowError，由同步服務跳過該筆並記警告。
 */

const now = new Date('2026-07-21T00:00:00Z');

const rawDept = (over: Partial<RawDept> = {}): RawDept => ({
  CODE: 'JAC00',
  COMPID: 'AS',
  DESC_CHI: '營管部/審查室',
  DESC_FULL: '營運管理部審查室',
  JOB_CODE: 'E12345',
  CLOSE_DATE: '9999-12-31',
  ESTABLISHED_DATE: '2010-01-01',
  ...over,
});

const rawAccount = (over: Partial<RawAccount> = {}): RawAccount => ({
  USERID: 'peter',
  EMPNO: 'E0001',
  USERNM: '王小明',
  COMPID: 'AS',
  DEPTID: 'JAC00',
  EMAILADDR: 'peter@hfcfinance.com.tw',
  EMPSTS: 'A',
  RESIGNDT: '9999-12-31',
  HIREDT: '2015-03-01',
  DIRECTOR: 'E9999',
  MTDT: '2026-07-09T08:00:00Z',
  ...over,
});

describe('normalizeDept', () => {
  it('推導 tier / parentCode / codePrefix 並判定有效', () => {
    const d = normalizeDept(rawDept(), now);
    expect(d.orgCode).toBe('JAC00');
    expect(d.companyCode).toBe('AS');
    expect(d.name).toBe('營管部/審查室');
    expect(d.tier).toBe('SECTION');
    expect(d.parentCode).toBe('JA000');
    expect(d.codePrefix).toBe('JAC');
    expect(d.managerEmpNo).toBe('E12345');
    expect(d.isActive).toBe(true);
  });

  it('CLOSE_DATE 已過 → isActive=false', () => {
    const d = normalizeDept(rawDept({ CLOSE_DATE: '2020-01-01' }), now);
    expect(d.isActive).toBe(false);
  });

  it('CODE 非 5 碼 → DirtyRowError', () => {
    expect(() => normalizeDept(rawDept({ CODE: 'JA0' }), now)).toThrow(
      DirtyRowError,
    );
  });

  it('CLOSE_DATE 無法解析 → DirtyRowError', () => {
    expect(() => normalizeDept(rawDept({ CLOSE_DATE: 'not-a-date' }), now)).toThrow(
      DirtyRowError,
    );
  });

  it('JOB_CODE 缺 → managerEmpNo=null（非必填）', () => {
    const d = normalizeDept(rawDept({ JOB_CODE: null }), now);
    expect(d.managerEmpNo).toBeNull();
  });

  it('F006：真實 CLOSE_DATE 一併保留為 closeDate（提示需呈現「部門關閉日期」，AC8）', () => {
    const d = normalizeDept(rawDept({ CLOSE_DATE: '2026-03-31' }), now);
    expect(d.isActive).toBe(false);
    expect(d.closeDate?.toISOString().slice(0, 10)).toBe('2026-03-31');
  });

  it('F006：哨兵 9999-12-31 之 CLOSE_DATE → closeDate=null（非真實關閉日）', () => {
    const d = normalizeDept(rawDept(), now); // 預設 CLOSE_DATE=9999-12-31
    expect(d.isActive).toBe(true);
    expect(d.closeDate).toBeNull();
  });
});

describe('normalizeAccount', () => {
  it('對應白名單欄位並以 EMPSTS 判定在職', () => {
    const a = normalizeAccount(rawAccount());
    expect(a.loginId).toBe('peter');
    expect(a.employeeNo).toBe('E0001');
    expect(a.name).toBe('王小明');
    expect(a.companyCode).toBe('AS');
    expect(a.orgCode).toBe('JAC00');
    expect(a.email).toBe('peter@hfcfinance.com.tw');
    expect(a.empActive).toBe(true);
    expect(a.managerEmpNo).toBe('E9999');
    expect(a.upstreamModifiedAt?.getTime()).toBe(
      new Date('2026-07-09T08:00:00Z').getTime(),
    );
  });

  it('EMPSTS=B → empActive=false（離職）', () => {
    expect(normalizeAccount(rawAccount({ EMPSTS: 'B' })).empActive).toBe(false);
  });

  it('EMAILADDR 空值允許（AS 實測 76 筆空）→ email=null', () => {
    expect(normalizeAccount(rawAccount({ EMAILADDR: '' })).email).toBeNull();
    expect(normalizeAccount(rawAccount({ EMAILADDR: null })).email).toBeNull();
  });

  it('USERID 缺 → DirtyRowError（穩定鍵不可缺）', () => {
    expect(() => normalizeAccount(rawAccount({ USERID: '' }))).toThrow(
      DirtyRowError,
    );
  });

  it('MTDT 無法解析 → upstreamModifiedAt=null（不再使整列成髒；帳號仍保留）', () => {
    const a = normalizeAccount(rawAccount({ MTDT: 'bad' }));
    expect(a.upstreamModifiedAt).toBeNull();
    expect(a.loginId).toBe('peter'); // 其餘白名單欄位仍正常
  });

  it('RESIGNDT 哨兵 9999-12-31 → null（未離職，避免 MSSQL datetime 溢位）', () => {
    const a = normalizeAccount(rawAccount());
    expect(a.resignDate).toBeNull();
  });

  it('RESIGNDT 為真實離職日 → 保留', () => {
    const a = normalizeAccount(rawAccount({ RESIGNDT: '2024-06-30' }));
    expect(a.resignDate?.getUTCFullYear()).toBe(2024);
  });

  it('HIREDT / RESIGNDT 超出 MSSQL datetime 範圍（< 1753）→ null（不再拋錯）', () => {
    const a = normalizeAccount(rawAccount({ HIREDT: '1600-01-01', RESIGNDT: '1600-01-01' }));
    expect(a.hireDate).toBeNull();
    expect(a.resignDate).toBeNull();
  });
});


/**
 * 職稱（G-ADM-001「職位」欄）。代碼取自 VW_HPMUSER.JOBTITLEID；名稱另由 VW_PERSONAL_JOB
 * 對照主檔攝入（契約 §5.4）。
 */
describe('normalizeAccount — jobTitleCode（← JOBTITLEID）', () => {
  const raw = (over: Partial<RawAccount> = {}): RawAccount => ({
    USERID: 'AS0001',
    COMPID: 'AS',
    EMPSTS: 'A',
    MTDT: '2026-07-09T00:00:00Z',
    ...over,
  });

  it('帶出職稱代碼', () => {
    expect(normalizeAccount(raw({ JOBTITLEID: 'J01' })).jobTitleCode).toBe('J01');
  });

  it('前後空白修剪', () => {
    expect(normalizeAccount(raw({ JOBTITLEID: '  F01 ' })).jobTitleCode).toBe('F01');
  });

  it.each([
    ['缺欄', undefined],
    ['null', null],
    ['空字串', ''],
    ['僅空白', '   '],
  ])('%s → null（不使該列成髒；職位僅為顯示欄位）', (_l, v) => {
    expect(normalizeAccount(raw({ JOBTITLEID: v })).jobTitleCode).toBeNull();
  });
});

describe('normalizeJobTitle（VW_PERSONAL_JOB → JOB_TITLE 對照列）', () => {
  const raw = (over: Partial<RawJobTitle> = {}): RawJobTitle => ({
    COMPID: 'AS',
    JTITLE_ID: 'J01',
    JTITLE_NM: '業務專員',
    ...over,
  });

  it('三欄正規化', () => {
    expect(normalizeJobTitle(raw())).toEqual({
      companyCode: 'AS',
      code: 'J01',
      name: '業務專員',
    });
  });

  it('修剪前後空白', () => {
    expect(normalizeJobTitle(raw({ JTITLE_ID: ' J01 ', JTITLE_NM: ' 業務專員 ' }))).toEqual({
      companyCode: 'AS',
      code: 'J01',
      name: '業務專員',
    });
  });

  it.each([
    ['JTITLE_ID 缺漏', { JTITLE_ID: '' }],
    ['COMPID 缺漏', { COMPID: '  ' }],
    ['JTITLE_NM 缺漏', { JTITLE_NM: null }],
  ])('%s → DirtyRowError（該列跳過，不中斷整批）', (_l, over) => {
    expect(() => normalizeJobTitle(raw(over as Partial<RawJobTitle>))).toThrow(DirtyRowError);
  });
});
