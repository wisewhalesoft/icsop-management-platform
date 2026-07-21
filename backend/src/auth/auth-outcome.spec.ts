import { decideAuthOutcome } from './auth-outcome';
import { ResolvableAccount } from './account-resolver';

const account: ResolvableAccount = {
  loginId: 'peter',
  email: 'peter@hfcfinance.com.tw',
  companyCode: 'AS',
  status: 'active',
};

describe('decideAuthOutcome', () => {
  it('SingleActive → authenticated（帶回帳號）', () => {
    const o = decideAuthOutcome({ kind: 'SingleActive', account });
    expect(o).toEqual({ kind: 'authenticated', account });
  });

  it('NotFound → 拒絕 AUTH_ACCOUNT_NOT_FOUND，不告警', () => {
    const o = decideAuthOutcome({ kind: 'NotFound' });
    expect(o).toEqual({
      kind: 'rejected',
      code: 'AUTH_ACCOUNT_NOT_FOUND',
      alertAdmin: false,
    });
  });

  it('Disabled → 拒絕 AUTH_ACCOUNT_DISABLED', () => {
    const o = decideAuthOutcome({ kind: 'Disabled', accounts: [account] });
    expect(o).toEqual({
      kind: 'rejected',
      code: 'AUTH_ACCOUNT_DISABLED',
      alertAdmin: false,
    });
  });

  it('MultipleActive → 對外回 NOT_FOUND（不可列舉）但 alertAdmin=true', () => {
    const o = decideAuthOutcome({
      kind: 'MultipleActive',
      accounts: [account, { ...account, loginId: 'peter2' }],
    });
    expect(o).toEqual({
      kind: 'rejected',
      code: 'AUTH_ACCOUNT_NOT_FOUND',
      alertAdmin: true,
    });
  });
});
