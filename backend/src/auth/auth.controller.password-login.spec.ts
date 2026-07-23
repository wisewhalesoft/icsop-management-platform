import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import type { Response } from 'express';
import { JwtService } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { PasswordLoginService } from './password-login.service';
import { SessionTokenService } from './session-token.service';
import { SESSION_COOKIE, sessionCookieOptions } from './session.config';
import {
  AccountRepository,
  CurrentAccount,
  PasswordAuthAccount,
} from './account-repository';
import { ResolvableAccount } from './account-resolver';
import { hashPassword } from '../accounts/password';

/**
 * POST /auth/login（途徑 B）之 HTTP 邊界行為。對應 F001-test.md：
 *  - TS-F001-001 成功 → 核發 icsop_session cookie（httpOnly、與 sessionCookieOptions() 一致），內容正確
 *  - TS-F001-013 不干擾既有其他 cookie（不 clearCookie、僅在成功時設 SESSION_COOKIE）
 * 註：GET /auth/login（OIDC 起點）不變。
 */

const PW = 'S3cret!';

const manual = (over: Partial<PasswordAuthAccount> = {}): PasswordAuthAccount => ({
  loginId: 'mgr01',
  email: null,
  companyCode: 'AS',
  status: 'active',
  roleCode: 'ICSOPAdmin',
  source: 'manual',
  passwordHash: hashPassword(PW),
  ...over,
});

class FakeRepo implements AccountRepository {
  constructor(private readonly account: PasswordAuthAccount | null) {}
  findByLoginId(): Promise<PasswordAuthAccount | null> {
    return Promise.resolve(this.account);
  }
  findByEmail(): Promise<ResolvableAccount[]> {
    return Promise.resolve([]);
  }
  findCurrentByLogin(): Promise<CurrentAccount | null> {
    return Promise.resolve(null);
  }
}

function makeController(account: PasswordAuthAccount | null): {
  ctrl: AuthController;
  tokens: SessionTokenService;
} {
  const repo = new FakeRepo(account);
  const tokens = new SessionTokenService(new JwtService({ secret: 'ctrl-secret' }));
  const svc = new PasswordLoginService(repo, tokens);
  const ctrl = new AuthController(repo, tokens, svc);
  return { ctrl, tokens };
}

function fakeRes(): Response & { cookie: jest.Mock; clearCookie: jest.Mock } {
  return {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
  } as unknown as Response & { cookie: jest.Mock; clearCookie: jest.Mock };
}

describe('AuthController POST /auth/login（途徑 B）', () => {
  beforeAll(() => {
    // AuthController 建構時需 MSAL/OIDC 環境變數（途徑 A）；設定假值即可（不觸網）。
    process.env.AZURE_AD_TENANT_ID = 't';
    process.env.AZURE_AD_CLIENT_ID = 'c';
    process.env.AZURE_AD_CLIENT_SECRET = 's';
    process.env.AZURE_AD_REDIRECT_URI = 'http://localhost:3000/auth/callback';
  });

  it('TS-F001-001 正確帳密 → 核發 icsop_session（httpOnly、options 與 sessionCookieOptions 一致）、回內容正確', async () => {
    const { ctrl, tokens } = makeController(manual({ roleCode: 'ICSOPAdmin' }));
    const res = fakeRes();

    const user = await ctrl.passwordLogin({ loginId: 'mgr01', password: PW }, res);

    expect(user).toEqual({
      loginId: 'mgr01',
      email: '',
      companyCode: 'AS',
      roleCode: 'ICSOPAdmin',
    });
    expect(res.cookie).toHaveBeenCalledTimes(1);
    const [name, token, options] = res.cookie.mock.calls[0];
    expect(name).toBe(SESSION_COOKIE);
    expect(options).toEqual(sessionCookieOptions());
    expect(options).toEqual(expect.objectContaining({ httpOnly: true }));
    // cookie 內容可被同一 SessionTokenService 解回、且與回應 body 一致。
    expect(tokens.verify(token as string)).toEqual(user);
  });

  it('TS-F001-013 成功時只設 SESSION_COOKIE、不清除其他 cookie（不干擾 oidc_tx/既有 session）', async () => {
    const { ctrl } = makeController(manual());
    const res = fakeRes();
    await ctrl.passwordLogin({ loginId: 'mgr01', password: PW }, res);
    expect(res.clearCookie).not.toHaveBeenCalled();
    expect(res.cookie).toHaveBeenCalledTimes(1);
    expect(res.cookie.mock.calls[0][0]).toBe(SESSION_COOKIE);
  });

  it('TS-F001-002/013 密碼錯誤 → 401 AUTH_INVALID_CREDENTIALS，不設任何 cookie', async () => {
    const { ctrl } = makeController(manual());
    const res = fakeRes();
    await expect(
      ctrl.passwordLogin({ loginId: 'mgr01', password: 'wrong' }, res),
    ).rejects.toThrow(new UnauthorizedException('AUTH_INVALID_CREDENTIALS'));
    expect(res.cookie).not.toHaveBeenCalled();
    expect(res.clearCookie).not.toHaveBeenCalled();
  });

  it('TS-F001-006 缺漏欄位 → 400 AUTH_MISSING_FIELD，不設 cookie', async () => {
    const { ctrl } = makeController(manual());
    const res = fakeRes();
    await expect(
      ctrl.passwordLogin({ loginId: 'mgr01', password: '' }, res),
    ).rejects.toThrow(new BadRequestException('AUTH_MISSING_FIELD'));
    expect(res.cookie).not.toHaveBeenCalled();
  });
});
