import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { SessionTokenService, SessionUser } from './session-token.service';
import { SESSION_COOKIE, sessionCookieOptions } from './session.config';

export interface RequestWithSession extends Request {
  sessionUser?: SessionUser;
}

/**
 * 保護受限路由：驗證 session cookie；無效/過期 → 401 AUTH_SESSION_EXPIRED。
 * 通過者：掛 req.sessionUser，並**重發 cookie 刷新 30 分鐘視窗**（sliding idle timeout，OQ-E01-04）。
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly tokens: SessionTokenService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<RequestWithSession>();
    const res = ctx.switchToHttp().getResponse<Response>();

    const token = (req.cookies as Record<string, string> | undefined)?.[
      SESSION_COOKIE
    ];
    const user = this.tokens.verify(token);
    if (!user) {
      throw new UnauthorizedException('AUTH_SESSION_EXPIRED');
    }

    req.sessionUser = user;
    // 每次有效請求刷新逾時視窗
    res.cookie(SESSION_COOKIE, this.tokens.issue(user), sessionCookieOptions());
    return true;
  }
}
