import { resolvePasswordLogin } from './password-login';
import { PasswordAuthAccount } from './account-repository';
import { hashPassword } from '../accounts/password';

/**
 * 途徑 B（帳密登入）之純決策邏輯測試。對應 F001-test.md：
 *  - TS-F001-001 正確帳密 → authenticated
 *  - TS-F001-002 密碼錯誤 → rejected
 *  - TS-F001-003 查無帳號（null）→ rejected（與密碼錯誤同一回傳值）
 *  - TS-F001-004 停用帳號＋密碼正確 → rejected（不因啟用狀態不同而洩漏）
 *  - TS-F001-005 上游帳號（passwordHash=null）→ rejected，不拋例外
 *  - TS-F001-007 密碼不 trim（含前後空白視為錯誤密碼）
 * 所有拒絕情境回傳值須「逐字相同」（{kind:'rejected'}），為非列舉之單元層代理斷言。
 */

const PW = 'S3cret!';
const HASH = hashPassword(PW);

const manual = (over: Partial<PasswordAuthAccount> = {}): PasswordAuthAccount => ({
  loginId: 'mgr01',
  email: null,
  companyCode: 'AS',
  status: 'active',
  roleCode: 'User',
  source: 'manual',
  passwordHash: HASH,
  ...over,
});

describe('resolvePasswordLogin', () => {
  it('TS-F001-001 手動帳號＋在職＋密碼正確 → authenticated，帶原帳號', () => {
    const acc = manual();
    const r = resolvePasswordLogin(acc, PW);
    expect(r).toEqual({ kind: 'authenticated', account: acc });
  });

  it('TS-F001-002 密碼錯誤 → rejected', () => {
    expect(resolvePasswordLogin(manual(), 'wrong')).toEqual({ kind: 'rejected' });
  });

  it('TS-F001-003 帳號不存在（null）→ rejected，且與密碼錯誤逐字相同', () => {
    const notFound = resolvePasswordLogin(null, PW);
    const wrongPw = resolvePasswordLogin(manual(), 'wrong');
    expect(notFound).toEqual({ kind: 'rejected' });
    expect(notFound).toEqual(wrongPw);
  });

  it('TS-F001-004 停用帳號＋密碼正確 → rejected（不洩漏啟用狀態，與密碼錯誤同）', () => {
    const disabled = resolvePasswordLogin(manual({ status: 'disabled' }), PW);
    expect(disabled).toEqual({ kind: 'rejected' });
    expect(disabled).toEqual(resolvePasswordLogin(manual(), 'wrong'));
  });

  it('TS-F001-005 上游帳號（source=upstream, passwordHash=null）→ rejected，不拋例外', () => {
    const upstream = manual({ source: 'upstream', passwordHash: null, email: 'x@hfcfinance.com.tw' });
    expect(() => resolvePasswordLogin(upstream, PW)).not.toThrow();
    expect(resolvePasswordLogin(upstream, PW)).toEqual({ kind: 'rejected' });
  });

  it('防禦：手動帳號但 passwordHash=null → rejected，不拋例外', () => {
    const broken = manual({ passwordHash: null });
    expect(() => resolvePasswordLogin(broken, PW)).not.toThrow();
    expect(resolvePasswordLogin(broken, PW)).toEqual({ kind: 'rejected' });
  });

  it('TS-F001-007 密碼不 trim：含前後空白視為錯誤密碼 → rejected', () => {
    expect(resolvePasswordLogin(manual(), ` ${PW} `)).toEqual({ kind: 'rejected' });
  });
});
