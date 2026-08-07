import { JwtService } from '@nestjs/jwt';
import type { Response } from 'express';
import { AuthController } from './auth.controller';
import { PasswordLoginService } from './password-login.service';
import { SessionTokenService } from './session-token.service';
import { LoginThrottleService } from './login-throttle';
import { SESSION_COOKIE } from './session.config';
import {
  AccountRepository,
  CurrentAccount,
  PasswordAuthAccount,
} from './account-repository';
import { ResolvableAccount } from './account-resolver';

/**
 * GET /auth/logout（登出）之 HTTP 邊界行為。鎖定既有 bug 之修復契約：
 *  - AC-1：清除 icsop_session cookie（path '/'，與 sessionCookieOptions() 對稱）
 *  - AC-2：轉址（res.redirect）回登入頁目的地，不得回 HTML 頁面（現況 bug：回一頁「已登出」測試用 HTML）
 *  - AC-3：可由 POST_LOGOUT_REDIRECT_URL 覆寫轉址目的地（未設 fallback '/'），
 *          與既有 POST_LOGIN_REDIRECT_URL / postLoginRedirect() 對稱（跨埠 dev：SPA :5173、backend :3000）
 *  - AC-4：清 cookie 必須先於轉址（順序正確，否則使用者被導回後仍是已登入狀態）
 * 對照任務交接：backend/src/auth/auth.controller.ts:235-241。
 */

class FakeRepo implements AccountRepository {
  findByEmail(): Promise<ResolvableAccount[]> {
    return Promise.resolve([]);
  }
  findCurrentByLogin(): Promise<CurrentAccount | null> {
    return Promise.resolve(null);
  }
  findByLoginId(): Promise<PasswordAuthAccount | null> {
    return Promise.resolve(null);
  }
  markLoggedIn(): Promise<void> {
    return Promise.resolve();
  }
}

function makeController(): AuthController {
  const repo = new FakeRepo();
  const tokens = new SessionTokenService(new JwtService({ secret: 'logout-secret' }));
  const throttle = new LoginThrottleService();
  const svc = new PasswordLoginService(repo, tokens, throttle);
  return new AuthController(repo, tokens, svc);
}

type FakeLogoutRes = Response & {
  clearCookie: jest.Mock;
  redirect: jest.Mock;
  type: jest.Mock;
  send: jest.Mock;
  callOrder: string[];
};

/** 支援現行（bug）與修復後兩種呼叫鏈：res.clearCookie(...)／res.type('html').send(...)／res.redirect(...)。 */
function fakeRes(): FakeLogoutRes {
  const callOrder: string[] = [];
  const res = {
    clearCookie: jest.fn(() => {
      callOrder.push('clearCookie');
    }),
    redirect: jest.fn(() => {
      callOrder.push('redirect');
    }),
    send: jest.fn(() => {
      callOrder.push('send');
    }),
    callOrder,
  };
  (res as unknown as { type: jest.Mock }).type = jest.fn(() => res); // 可鏈式 .type('html').send(...)
  return res as unknown as FakeLogoutRes;
}

describe('AuthController GET /auth/logout（登出）', () => {
  beforeAll(() => {
    // AuthController 建構時需 MSAL/OIDC 環境變數（途徑 A）；設定假值即可（不觸網）。
    process.env.AZURE_AD_TENANT_ID = 't';
    process.env.AZURE_AD_CLIENT_ID = 'c';
    process.env.AZURE_AD_CLIENT_SECRET = 's';
    process.env.AZURE_AD_REDIRECT_URI = 'http://localhost:3000/auth/callback';
  });

  afterEach(() => {
    delete process.env.POST_LOGOUT_REDIRECT_URL;
  });

  it('AC-1 清除 icsop_session cookie（path 與 sessionCookieOptions() 對稱之 "/"）', () => {
    const ctrl = makeController();
    const res = fakeRes();

    ctrl.logout(res);

    expect(res.clearCookie).toHaveBeenCalledWith(SESSION_COOKIE, { path: '/' });
  });

  it('AC-2 轉址回登入頁目的地（未設 env 時預設 "/"），不得回 HTML 頁面', () => {
    const ctrl = makeController();
    const res = fakeRes();

    ctrl.logout(res);

    expect(res.redirect).toHaveBeenCalledWith('/');
    expect(res.send).not.toHaveBeenCalled();
  });

  it('AC-3 POST_LOGOUT_REDIRECT_URL 已設定 → 轉址至該目的地（跨埠 dev，與 postLoginRedirect() 對稱）', () => {
    process.env.POST_LOGOUT_REDIRECT_URL = 'http://localhost:5173/';
    const ctrl = makeController();
    const res = fakeRes();

    ctrl.logout(res);

    expect(res.redirect).toHaveBeenCalledWith('http://localhost:5173/');
  });

  it('AC-4 清 cookie 必須先於轉址（順序正確，否則使用者導回後仍是已登入狀態）', () => {
    const ctrl = makeController();
    const res = fakeRes();

    ctrl.logout(res);

    expect(res.callOrder).toEqual(['clearCookie', 'redirect']);
  });
});
