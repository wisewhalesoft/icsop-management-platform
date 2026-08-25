import {
  normalizeDept,
  normalizeAccount,
  dedupeAccountsByStableKey,
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
  COMPID: 'AS',
  NO: 'E0001',
  NAME_IN_CHINESE: '王小明',
  DEPT_CODE: 'JAC00',
  EMAIL: 'peter@hfcfinance.com.tw',
  RESIGN_DATE: '9999-12-31',
  REHIRE_DATE: '2015-03-01',
  DIRECT_BOSS: 'E9999',
  TITLE_CODE: 'J01',
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

describe('normalizeAccount（v2.0：VW_PERSONNEL_SQL）', () => {
  it('對應白名單欄位；NO 同時供應 loginId 與 employeeNo', () => {
    const a = normalizeAccount(rawAccount(), now);
    expect(a.loginId).toBe('E0001');
    expect(a.employeeNo).toBe('E0001'); // 同源於 NO（契約 §5.2）
    expect(a.name).toBe('王小明');
    expect(a.companyCode).toBe('AS');
    expect(a.orgCode).toBe('JAC00');
    expect(a.email).toBe('peter@hfcfinance.com.tw');
    expect(a.empActive).toBe(true);
    expect(a.managerEmpNo).toBe('E9999');
    expect(a.jobTitleCode).toBe('J01');
    expect(a.upstreamModifiedAt?.getTime()).toBe(
      new Date('2026-07-09T08:00:00Z').getTime(),
    );
  });

  it('離職日已過 → empActive=false（離職）', () => {
    expect(
      normalizeAccount(rawAccount({ RESIGN_DATE: '2024-06-30' }), now).empActive,
    ).toBe(false);
  });

  it('🔴 最後在職日＝基準日當天 → empActive=true', () => {
    // 迴歸鎖定：以日比較（契約 §6）。若退回比時間戳，當天離職者會整批被誤停用。
    const basis = new Date('2026-07-21T18:00:00Z');
    expect(
      normalizeAccount(rawAccount({ RESIGN_DATE: '2026-07-21' }), basis).empActive,
    ).toBe(true);
  });

  it('EMAIL 空值允許 → email=null', () => {
    expect(normalizeAccount(rawAccount({ EMAIL: '' }), now).email).toBeNull();
    expect(normalizeAccount(rawAccount({ EMAIL: null }), now).email).toBeNull();
  });

  it('NO 缺 → DirtyRowError（穩定鍵不可缺）', () => {
    expect(() => normalizeAccount(rawAccount({ NO: '' }), now)).toThrow(
      DirtyRowError,
    );
  });

  it('MTDT 無法解析 → upstreamModifiedAt=null（不再使整列成髒；帳號仍保留）', () => {
    const a = normalizeAccount(rawAccount({ MTDT: 'bad' }), now);
    expect(a.upstreamModifiedAt).toBeNull();
    expect(a.loginId).toBe('E0001'); // 其餘白名單欄位仍正常
  });

  it('RESIGN_DATE 哨兵 9999-12-31 → null（未離職，避免 MSSQL datetime 溢位）', () => {
    const a = normalizeAccount(rawAccount(), now);
    expect(a.resignDate).toBeNull();
    expect(a.empActive).toBe(true); // 哨兵收斂為 null 後仍須判為在職
  });

  it('RESIGN_DATE 為真實離職日 → 保留', () => {
    const a = normalizeAccount(rawAccount({ RESIGN_DATE: '2024-06-30' }), now);
    expect(a.resignDate?.getUTCFullYear()).toBe(2024);
  });

  it('REHIRE_DATE / RESIGN_DATE 超出 MSSQL datetime 範圍（< 1753）→ null（不再拋錯）', () => {
    const a = normalizeAccount(
      rawAccount({ REHIRE_DATE: '1600-01-01', RESIGN_DATE: '1600-01-01' }),
      now,
    );
    expect(a.hireDate).toBeNull();
    expect(a.resignDate).toBeNull();
  });

  it('hireDate 取 REHIRE_DATE（到職日），非 HIRE_DATE（年資起算日）', () => {
    const a = normalizeAccount(rawAccount({ REHIRE_DATE: '2015-03-01' }), now);
    expect(a.hireDate?.getUTCFullYear()).toBe(2015);
  });
});


/**
 * 職稱（G-ADM-001「職位」欄）。代碼取自 VW_PERSONNEL_SQL.TITLE_CODE；名稱另由 VW_PERSONAL_JOB
 * 對照主檔攝入（契約 §5.4）。
 */
describe('normalizeAccount — jobTitleCode（← TITLE_CODE）', () => {
  const raw = (over: Partial<RawAccount> = {}): RawAccount => ({
    COMPID: 'AS',
    NO: 'AS0001',
    MTDT: '2026-07-09T00:00:00Z',
    ...over,
  });

  it('帶出職稱代碼', () => {
    expect(normalizeAccount(raw({ TITLE_CODE: 'J01' }), now).jobTitleCode).toBe('J01');
  });

  it('前後空白修剪', () => {
    expect(normalizeAccount(raw({ TITLE_CODE: '  F01 ' }), now).jobTitleCode).toBe('F01');
  });

  it.each([
    ['缺欄', undefined],
    ['null', null],
    ['空字串', ''],
    ['僅空白', '   '],
  ])('%s → null（不使該列成髒；職位僅為顯示欄位）', (_l, v) => {
    expect(normalizeAccount(raw({ TITLE_CODE: v }), now).jobTitleCode).toBeNull();
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

/**
 * 穩定鍵去重（人類裁決 #1，契約 §7.2／§11 #11）。
 *
 * 上游確認 `(COMPID, NO)` 於正式環境無重複；dev 實測有 1 筆（`AS/20012`）。
 * 撞鍵會使整批 upsert 違反 `UQ_ACCOUNT_company_login` 而失敗，故同步端須防禦性去重——
 * **單筆上游髒資料不得打掉整次同步**。
 */
describe('dedupeAccountsByStableKey', () => {
  const acct = (
    loginId: string,
    mtdt: string | null,
    companyCode = 'AS',
    name = `n-${loginId}`,
  ): ReturnType<typeof normalizeAccount> =>
    normalizeAccount(
      {
        COMPID: companyCode,
        NO: loginId,
        NAME_IN_CHINESE: name,
        MTDT: mtdt ?? 'bad-date', // 無法解析 → upstreamModifiedAt=null
      },
      new Date('2026-08-24T00:00:00Z'),
    );

  it('無重複 → 原樣回傳、dropped=0', () => {
    const [out, dropped] = dedupeAccountsByStableKey([
      acct('A1', '2026-01-01T00:00:00Z'),
      acct('A2', '2026-01-02T00:00:00Z'),
    ]);
    expect(out).toHaveLength(2);
    expect(dropped).toBe(0);
  });

  it('同鍵重複 → 保留 MTDT 較新者、dropped 計數正確', () => {
    const [out, dropped] = dedupeAccountsByStableKey([
      acct('20012', '2026-01-01T00:00:00Z', 'AS', '舊'),
      acct('20012', '2026-06-30T00:00:00Z', 'AS', '新'),
    ]);
    expect(out).toHaveLength(1);
    expect(dropped).toBe(1);
    expect(out[0].name).toBe('新');
  });

  it('較新者先出現亦成立（不因來源順序而異）', () => {
    const [out] = dedupeAccountsByStableKey([
      acct('20012', '2026-06-30T00:00:00Z', 'AS', '新'),
      acct('20012', '2026-01-01T00:00:00Z', 'AS', '舊'),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('新');
  });

  it('🔴 MTDT 相同 → 保留先出現者（決定性；否則同份資料每次同步結果不同）', () => {
    const [out] = dedupeAccountsByStableKey([
      acct('20012', '2026-06-30T00:00:00Z', 'AS', '第一'),
      acct('20012', '2026-06-30T00:00:00Z', 'AS', '第二'),
    ]);
    expect(out[0].name).toBe('第一');
  });

  it('🔴 MTDT 皆無法解析（null）→ 保留先出現者，不得因 null 比較而翻面', () => {
    const [out, dropped] = dedupeAccountsByStableKey([
      acct('20012', null, 'AS', '第一'),
      acct('20012', null, 'AS', '第二'),
    ]);
    expect(dropped).toBe(1);
    expect(out[0].name).toBe('第一');
  });

  it('先出現者 MTDT 為 null、後者有值 → 取有值者（null 不視為最新）', () => {
    const [out] = dedupeAccountsByStableKey([
      acct('20012', null, 'AS', '無水位'),
      acct('20012', '2026-01-01T00:00:00Z', 'AS', '有水位'),
    ]);
    expect(out[0].name).toBe('有水位');
  });

  it('🔴 不同公司之相同 NO → 不去重（鍵為 (COMPID, NO) 複合鍵）', () => {
    const [out, dropped] = dedupeAccountsByStableKey([
      acct('20012', '2026-01-01T00:00:00Z', 'AS'),
      acct('20012', '2026-01-01T00:00:00Z', 'AD'),
    ]);
    expect(out).toHaveLength(2);
    expect(dropped).toBe(0);
  });

  it('空陣列 → 空結果', () => {
    expect(dedupeAccountsByStableKey([])).toEqual([[], 0]);
  });
});
