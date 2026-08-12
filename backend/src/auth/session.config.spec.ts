import { cookieSecure, sessionCookieOptions } from './session.config';

describe('cookie Secure 旗標（HTTPS 部署）', () => {
  const original = process.env.SESSION_COOKIE_SECURE;

  afterEach(() => {
    if (original === undefined) delete process.env.SESSION_COOKIE_SECURE;
    else process.env.SESSION_COOKIE_SECURE = original;
  });

  it('未設定時為 false——dev 走 http://localhost，設 true 會導致 cookie 根本不送出', () => {
    delete process.env.SESSION_COOKIE_SECURE;
    expect(cookieSecure()).toBe(false);
    expect(sessionCookieOptions().secure).toBe(false);
  });

  it('SESSION_COOKIE_SECURE=true 時 session cookie 加上 Secure', () => {
    process.env.SESSION_COOKIE_SECURE = 'true';
    expect(cookieSecure()).toBe(true);
    expect(sessionCookieOptions().secure).toBe(true);
  });

  it('大小寫與前後空白不敏感（.env 手填容錯）', () => {
    process.env.SESSION_COOKIE_SECURE = ' TRUE ';
    expect(cookieSecure()).toBe(true);
  });

  it('其他值視為 false，不因誤填而在 http 環境鎖死登入', () => {
    for (const v of ['false', '1', 'yes', '']) {
      process.env.SESSION_COOKIE_SECURE = v;
      expect(cookieSecure()).toBe(false);
    }
  });

  it('其餘 cookie 屬性不受影響（httpOnly／sameSite／path）', () => {
    process.env.SESSION_COOKIE_SECURE = 'true';
    const opts = sessionCookieOptions();
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe('lax');
    expect(opts.path).toBe('/');
  });
});
