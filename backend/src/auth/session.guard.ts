import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { SessionTokenService, SessionUser } from './session-token.service';
import { SESSION_COOKIE, sessionCookieOptions } from './session.config';
import { ACCOUNT_REPOSITORY, AccountRepository } from './account-repository';

export interface RequestWithSession extends Request {
  sessionUser?: SessionUser;
}

/**
 * 保護受限路由。兩層把關：
 *  1) session cookie 之 JWT 驗證（簽章/過期）——無效 → 401 AUTH_SESSION_EXPIRED。
 *  2) **每請求以 (companyCode, loginId) 查 DB 現行帳號**（來源真相）：
 *     - 查無或非在職 → 401 AUTH_ACCOUNT_DISABLED（停用即時失效，F003 AC3／F005）。
 *     - 以 DB 現行 roleCode 覆寫 sessionUser（角色變更即時生效，US-006；不採 JWT 內舊角色）。
 * 通過者掛 req.sessionUser 並重發 cookie 刷新 30 分鐘視窗（sliding，OQ-E01-04）。
 * 註：此為使用者定案之即時撤銷方式（每請求查 DB），取代先前純無狀態設計。
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly tokens: SessionTokenService,
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepository,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<RequestWithSession>();
    const res = ctx.switchToHttp().getResponse<Response>();

    const token = (req.cookies as Record<string, string> | undefined)?.[
      SESSION_COOKIE
    ];
    const user = this.tokens.verify(token);
    if (!user) {
      throw new UnauthorizedException('AUTH_SESSION_EXPIRED');
    }

    // 每請求即時把關：DB 為現行 status/roleCode 之來源真相。
    const current = await this.accounts.findCurrentByLogin(
      user.companyCode,
      user.loginId,
    );
    if (!current || current.status !== 'active') {
      throw new UnauthorizedException('AUTH_ACCOUNT_DISABLED');
    }

    const fresh: SessionUser = { ...user, roleCode: current.roleCode };
    req.sessionUser = fresh;
    // 每次有效請求刷新逾時視窗（採 DB 現行角色重簽，使角色變更於 token 內亦收斂）
    res.cookie(SESSION_COOKIE, this.tokens.issue(fresh), sessionCookieOptions());
    return true;
  }
}
