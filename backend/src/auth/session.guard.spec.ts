import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SessionGuard, RequestWithSession } from './session.guard';
import { SessionTokenService, SessionUser } from './session-token.service';
import { SESSION_COOKIE } from './session.config';

const user: SessionUser = {
  loginId: 'peter',
  email: 'peter@hfcfinance.com.tw',
  companyCode: 'AS',
  roleCode: 'ICSOPAdmin',
};

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
  const guard = new SessionGuard(tokens);

  it('有效 session → 放行、掛 req.sessionUser、刷新 cookie（sliding）', () => {
    const { ctx, req, res } = ctxWith(tokens.issue(user));
    expect(guard.canActivate(ctx)).toBe(true);
    expect(req.sessionUser).toEqual(user);
    expect(res.cookie).toHaveBeenCalledWith(
      SESSION_COOKIE,
      expect.any(String),
      expect.objectContaining({ httpOnly: true }),
    );
  });

  it('無 cookie → 401 AUTH_SESSION_EXPIRED', () => {
    const { ctx } = ctxWith(undefined);
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('過期 token → 401（不刷新）', () => {
    const expired = new SessionTokenService(
      new JwtService({ secret: 'guard-secret' }),
      -10,
    );
    const { ctx, res } = ctxWith(expired.issue(user));
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('他密鑰簽的 token → 401（拒絕偽造）', () => {
    const other = new SessionTokenService(new JwtService({ secret: 'other' }));
    const { ctx } = ctxWith(other.issue(user));
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });
});
