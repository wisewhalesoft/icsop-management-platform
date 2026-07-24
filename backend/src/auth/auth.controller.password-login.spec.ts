import {
  UnauthorizedException,
  BadRequestException,
  HttpException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtService } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { PasswordLoginService } from './password-login.service';
import { SessionTokenService } from './session-token.service';
import { LoginThrottleService } from './login-throttle';
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
  markLoggedIn(): Promise<void> {
    return Promise.resolve();
  }
}

function makeController(account: PasswordAuthAccount | null): {
  ctrl: AuthController;
  tokens: SessionTokenService;
  svc: PasswordLoginService;
} {
  const repo = new FakeRepo(account);
  const tokens = new SessionTokenService(new JwtService({ secret: 'ctrl-secret' }));
  const throttle = new LoginThrottleService();
  const svc = new PasswordLoginService(repo, tokens, throttle);
  const ctrl = new AuthController(repo, tokens, svc);
  return { ctrl, tokens, svc };
}

function fakeRes(): Response & { cookie: jest.Mock; clearCookie: jest.Mock } {
  return {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
  } as unknown as Response & { cookie: jest.Mock; clearCookie: jest.Mock };
}

/** 比照 fakeRes()：僅承載節流所需之 req.ip。 */
function fakeReq(ip: string): Request {
  return { ip } as unknown as Request;
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

    const user = await ctrl.passwordLogin(
      { loginId: 'mgr01', password: PW },
      fakeReq('1.2.3.4'),
      res,
    );

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
    await ctrl.passwordLogin({ loginId: 'mgr01', password: PW }, fakeReq('1.2.3.4'), res);
    expect(res.clearCookie).not.toHaveBeenCalled();
    expect(res.cookie).toHaveBeenCalledTimes(1);
    expect(res.cookie.mock.calls[0][0]).toBe(SESSION_COOKIE);
  });

  it('TS-F001-002/013 密碼錯誤 → 401 AUTH_INVALID_CREDENTIALS，不設任何 cookie', async () => {
    const { ctrl } = makeController(manual());
    const res = fakeRes();
    await expect(
      ctrl.passwordLogin({ loginId: 'mgr01', password: 'wrong' }, fakeReq('1.2.3.4'), res),
    ).rejects.toThrow(new UnauthorizedException('AUTH_INVALID_CREDENTIALS'));
    expect(res.cookie).not.toHaveBeenCalled();
    expect(res.clearCookie).not.toHaveBeenCalled();
  });

  it('TS-F001-006 缺漏欄位 → 400 AUTH_MISSING_FIELD，不設 cookie', async () => {
    const { ctrl } = makeController(manual());
    const res = fakeRes();
    await expect(
      ctrl.passwordLogin({ loginId: 'mgr01', password: '' }, fakeReq('1.2.3.4'), res),
    ).rejects.toThrow(new BadRequestException('AUTH_MISSING_FIELD'));
    expect(res.cookie).not.toHaveBeenCalled();
  });

  /**
   * 節流邊界（hardening-test-design.md §2.7 TS-HD-CTRL-001〜003）。
   * 重點：鎖定 429 之「物件形狀」body（防退化為裸字串破壞前端 extractError），
   * 並驗證 controller 確實把 req.ip 傳遞給 service。
   */
  describe('節流 429 邊界', () => {
    it('TS-HD-CTRL-001 第 6 次失敗 → 拋出例外 getResponse() 深比對等於物件 body（非裸字串）', async () => {
      const { ctrl } = makeController(manual());
      const req = fakeReq('1.2.3.4');
      for (let i = 0; i < 5; i++) {
        await expect(
          ctrl.passwordLogin({ loginId: 'mgr01', password: 'wrong' }, req, fakeRes()),
        ).rejects.toThrow(UnauthorizedException);
      }
      let err: unknown;
      try {
        await ctrl.passwordLogin({ loginId: 'mgr01', password: 'wrong' }, req, fakeRes());
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(429);
      expect((err as HttpException).getResponse()).toEqual({
        statusCode: 429,
        message: 'AUTH_TOO_MANY_ATTEMPTS',
        error: 'Too Many Requests',
      });
    });

    it('TS-HD-CTRL-002 429 情境不設定任何 cookie', async () => {
      const { ctrl } = makeController(manual());
      const req = fakeReq('1.2.3.4');
      for (let i = 0; i < 5; i++) {
        await ctrl
          .passwordLogin({ loginId: 'mgr01', password: 'wrong' }, req, fakeRes())
          .catch(() => undefined);
      }
      const res = fakeRes();
      await expect(
        ctrl.passwordLogin({ loginId: 'mgr01', password: 'wrong' }, req, res),
      ).rejects.toThrow(HttpException);
      expect(res.cookie).not.toHaveBeenCalled();
    });

    it('TS-HD-CTRL-003 controller 將 req.ip 作為第二參數傳遞給 service', async () => {
      const { ctrl, svc } = makeController(manual());
      const spy = jest
        .spyOn(svc, 'login')
        .mockResolvedValue({
          user: { loginId: 'mgr01', email: '', companyCode: 'AS', roleCode: 'ICSOPAdmin' },
          token: 'tok',
        });
      await ctrl.passwordLogin({ loginId: 'mgr01', password: 'x' }, fakeReq('9.8.7.6'), fakeRes());
      expect(spy).toHaveBeenCalledWith({ loginId: 'mgr01', password: 'x' }, '9.8.7.6');
    });
  });
});
