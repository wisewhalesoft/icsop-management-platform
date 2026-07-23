import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SessionGuard, RequestWithSession } from './session.guard';
import { SessionTokenService, SessionUser } from './session-token.service';
import { SESSION_COOKIE } from './session.config';
import {
  AccountRepository,
  CurrentAccount,
  PasswordAuthAccount,
} from './account-repository';
import { ResolvableAccount } from './account-resolver';

const user: SessionUser = {
  loginId: 'peter',
  email: 'peter@hfcfinance.com.tw',
  companyCode: 'AS',
  roleCode: 'ICSOPAdmin',
};

/** 假帳號來源：controllable status/roleCode 供 SessionGuard 每請求即時把關測試。 */
class FakeRepo implements AccountRepository {
  constructor(private current: CurrentAccount | null) {}
  findByEmail(): Promise<ResolvableAccount[]> {
    return Promise.resolve([]);
  }
  findCurrentByLogin(): Promise<CurrentAccount | null> {
    return Promise.resolve(this.current);
  }
  findByLoginId(): Promise<PasswordAuthAccount | null> {
    return Promise.resolve(null);
  }
}

function ctxWith(cookie: string | undefined): {
  ctx: ExecutionContext;
  req: RequestWithSession;
  res: { cookie: jest.Mock };
} {
  const req = { cookies: cookie ? { [SESSION_COOKIE]: cookie } : {} } as RequestWithSession;
  const res = { cookie: jest.fn() };
  const ctx = {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ExecutionContext;
  return { ctx, req, res };
}

describe('SessionGuard', () => {
  const tokens = new SessionTokenService(new JwtService({ secret: 'guard-secret' }));
  const activeRepo = new FakeRepo({ status: 'active', roleCode: 'ICSOPAdmin' });
  const guard = new SessionGuard(tokens, activeRepo);

  it('有效 session＋DB 在職 → 放行、掛 req.sessionUser、刷新 cookie（sliding）', async () => {
    const { ctx, req, res } = ctxWith(tokens.issue(user));
    expect(await guard.canActivate(ctx)).toBe(true);
    expect(req.sessionUser).toMatchObject({ loginId: 'peter', roleCode: 'ICSOPAdmin' });
    expect(res.cookie).toHaveBeenCalledWith(
      SESSION_COOKIE,
      expect.any(String),
      expect.objectContaining({ httpOnly: true }),
    );
  });

  it('無 cookie → 401 AUTH_SESSION_EXPIRED', async () => {
    const { ctx } = ctxWith(undefined);
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('過期 token → 401（不刷新）', async () => {
    const expired = new SessionTokenService(new JwtService({ secret: 'guard-secret' }), -10);
    const { ctx, res } = ctxWith(expired.issue(user));
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('他密鑰簽的 token → 401（拒絕偽造）', async () => {
    const other = new SessionTokenService(new JwtService({ secret: 'other' }));
    const { ctx } = ctxWith(other.issue(user));
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('DB 帳號已停用 → 401 AUTH_ACCOUNT_DISABLED（停用即時失效，AC3/F005）', async () => {
    const disabledGuard = new SessionGuard(tokens, new FakeRepo({ status: 'disabled', roleCode: 'ICSOPAdmin' }));
    const { ctx } = ctxWith(tokens.issue(user));
    await expect(disabledGuard.canActivate(ctx)).rejects.toThrow('AUTH_ACCOUNT_DISABLED');
  });

  it('DB 查無帳號 → 401（帳號已移除/異常）', async () => {
    const goneGuard = new SessionGuard(tokens, new FakeRepo(null));
    const { ctx } = ctxWith(tokens.issue(user));
    await expect(goneGuard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('DB 角色已變更 → req.sessionUser 採 DB 現行角色（角色變更即時生效，US-006）', async () => {
    const promoted = new SessionGuard(tokens, new FakeRepo({ status: 'active', roleCode: 'SysAdmin' }));
    const { ctx, req } = ctxWith(tokens.issue(user)); // JWT 內為 ICSOPAdmin
    expect(await promoted.canActivate(ctx)).toBe(true);
    expect(req.sessionUser?.roleCode).toBe('SysAdmin'); // 以 DB 為準
  });
});
