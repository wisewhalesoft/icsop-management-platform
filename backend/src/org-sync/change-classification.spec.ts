import {
  classifyOrgUnit,
  classifyAccount,
  ExistingOrgUnit,
  ExistingAccount,
} from './change-classification';
import { NormalizedOrgUnit, NormalizedAccount } from './normalization';

/**
 * 異動分類（新增 / 更新 / 離職停用 / 無異動）——冪等核心。
 * upstream-hr-source-contract.md §6（EMPSTS 權威）／US-010 AC2（無異動不寫）／AC4（三類異動）。
 * ⚠ 離職停用一律以 EMPSTS≠'A' 觸發，不得以「來源消失」逕行判定（US-010 AC4）。
 */

const srcOrg = (over: Partial<NormalizedOrgUnit> = {}): NormalizedOrgUnit => ({
  companyCode: 'AS',
  orgCode: 'JAC00',
  codePrefix: 'JAC',
  tier: 'SECTION',
  parentCode: 'JA000',
  name: '審查室',
  managerEmpNo: 'E1',
  isActive: true,
  ...over,
});

const localOrg = (over: Partial<ExistingOrgUnit> = {}): ExistingOrgUnit => ({
  orgCode: 'JAC00',
  codePrefix: 'JAC',
  tier: 'SECTION',
  parentCode: 'JA000',
  name: '審查室',
  managerEmpNo: 'E1',
  isActive: true,
  ...over,
});

const srcAcc = (over: Partial<NormalizedAccount> = {}): NormalizedAccount => ({
  companyCode: 'AS',
  loginId: 'peter',
  employeeNo: 'E0001',
  name: '王小明',
  email: 'peter@hfcfinance.com.tw',
  orgCode: 'JAC00',
  empActive: true,
  resignDate: new Date('9999-12-31T00:00:00Z'),
  hireDate: new Date('2015-03-01T00:00:00Z'),
  managerEmpNo: 'E9999',
  upstreamModifiedAt: new Date('2026-07-09T00:00:00Z'),
  ...over,
});

const localAcc = (over: Partial<ExistingAccount> = {}): ExistingAccount => ({
  companyCode: 'AS',
  loginId: 'peter',
  employeeNo: 'E0001',
  name: '王小明',
  email: 'peter@hfcfinance.com.tw',
  orgCode: 'JAC00',
  status: 'active',
  resignDate: new Date('9999-12-31T00:00:00Z'),
  hireDate: new Date('2015-03-01T00:00:00Z'),
  managerEmpNo: 'E9999',
  ...over,
});

describe('classifyOrgUnit', () => {
  it('本地不存在 → create', () => {
    expect(classifyOrgUnit(srcOrg(), null)).toBe('create');
  });
  it('完全相同 → noop（不寫入）', () => {
    expect(classifyOrgUnit(srcOrg(), localOrg())).toBe('noop');
  });
  it('名稱變動 → update', () => {
    expect(classifyOrgUnit(srcOrg({ name: '審查一室' }), localOrg())).toBe('update');
  });
  it('主管員編變動 → update', () => {
    expect(classifyOrgUnit(srcOrg({ managerEmpNo: 'E2' }), localOrg())).toBe(
      'update',
    );
  });
  it('部門關閉（isActive 變 false）→ update', () => {
    expect(classifyOrgUnit(srcOrg({ isActive: false }), localOrg())).toBe(
      'update',
    );
  });
});

describe('classifyAccount', () => {
  it('新人員（本地不存在、在職）→ create', () => {
    expect(classifyAccount(srcAcc(), null)).toBe('create');
  });

  it('無異動（在職、欄位相同）→ noop', () => {
    expect(classifyAccount(srcAcc(), localAcc())).toBe('noop');
  });

  it('部門/姓名/員編/email 任一異動（在職）→ update', () => {
    expect(classifyAccount(srcAcc({ orgCode: 'JAD00' }), localAcc())).toBe('update');
    expect(classifyAccount(srcAcc({ name: '王大明' }), localAcc())).toBe('update');
    expect(classifyAccount(srcAcc({ employeeNo: 'E9' }), localAcc())).toBe('update');
    expect(classifyAccount(srcAcc({ email: 'new@hfcfinance.com.tw' }), localAcc())).toBe(
      'update',
    );
  });

  it('EMPSTS≠A 且本地在職 → disable（離職停用）', () => {
    expect(classifyAccount(srcAcc({ empActive: false }), localAcc())).toBe('disable');
  });

  it('EMPSTS≠A 且本地已停用 → noop（不重複停用）', () => {
    expect(
      classifyAccount(srcAcc({ empActive: false }), localAcc({ status: 'disabled' })),
    ).toBe('noop');
  });

  it('EMPSTS≠A 且本地不存在 → noop（不建立離職帳號）', () => {
    expect(classifyAccount(srcAcc({ empActive: false }), null)).toBe('noop');
  });

  it('本地停用、上游回復在職 → update（誤判恢復）', () => {
    expect(classifyAccount(srcAcc(), localAcc({ status: 'disabled' }))).toBe('update');
  });

  it('upstreamModifiedAt 差異不觸發 update（僅水位，非業務欄）', () => {
    const s = srcAcc({ upstreamModifiedAt: new Date('2030-01-01T00:00:00Z') });
    expect(classifyAccount(s, localAcc())).toBe('noop');
  });
});
