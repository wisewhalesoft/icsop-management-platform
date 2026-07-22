import {
  Controller,
  Get,
  Inject,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  ConfidentialClientApplication,
  CryptoProvider,
} from '@azure/msal-node';
import { buildMsalConfig, OIDC_SCOPES, requireEnv } from './msal.config';
import { classifyAccountByEmail } from './account-resolver';
import { decideAuthOutcome } from './auth-outcome';
import {
  AccountRepository,
  ACCOUNT_REPOSITORY,
} from './account-repository';
import { SessionTokenService, SessionUser } from './session-token.service';
import { SessionGuard, RequestWithSession } from './session.guard';
import {
  SESSION_COOKIE,
  OIDC_TX_COOKIE,
  sessionCookieOptions,
} from './session.config';

interface OidcTx {
  state: string;
  nonce: string;
  verifier: string;
}

function maskEmail(email: string): string {
  const [lp, domain] = email.split('@');
  if (!domain) return '***';
  return `${lp.slice(0, 2)}***@${domain}`;
}

@Controller('auth')
export class AuthController {
  private readonly cca = new ConfidentialClientApplication(buildMsalConfig());
  private readonly crypto = new CryptoProvider();
  private readonly redirectUri = requireEnv('AZURE_AD_REDIRECT_URI');

  constructor(
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepository,
    private readonly tokens: SessionTokenService,
  ) {}

  /** 途徑 A 起點：導向 Azure AD（帶 state / nonce / PKCE）。tx 存於簽章 cookie。 */
  @Get('login')
  async login(@Res() res: Response): Promise<void> {
    const { verifier, challenge } = await this.crypto.generatePkceCodes();
    const tx: OidcTx = {
      state: this.crypto.createNewGuid(),
      nonce: this.crypto.createNewGuid(),
      verifier,
    };

    res.cookie(OIDC_TX_COOKIE, JSON.stringify(tx), {
      httpOnly: true,
      sameSite: 'lax',
      signed: true, // 以 cookie-parser 密鑰簽章，防竄改
      maxAge: 10 * 60 * 1000,
    });

    const url = await this.cca.getAuthCodeUrl({
      scopes: OIDC_SCOPES,
      redirectUri: this.redirectUri,
      codeChallenge: challenge,
      codeChallengeMethod: 'S256',
      state: tx.state,
      nonce: tx.nonce,
    });
    res.redirect(url);
  }

  /** 回呼：驗 state → 換 token → 驗 nonce → 分類帳號 → 決策 → 核發 session 或拒絕。 */
  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Query('error_description') errorDesc: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    if (error) return this.renderError(res, `Azure：${error}`, errorDesc);

    const raw = (req.signedCookies as Record<string, string> | undefined)?.[
      OIDC_TX_COOKIE
    ];
    res.clearCookie(OIDC_TX_COOKIE);
    if (!raw) {
      return this.renderError(
        res,
        'AUTH_OIDC_STATE_MISMATCH',
        '找不到交易 cookie（逾時、未經 /auth/login，或簽章驗證失敗）。',
      );
    }

    let tx: OidcTx;
    try {
      tx = JSON.parse(raw) as OidcTx;
    } catch {
      return this.renderError(res, 'AUTH_OIDC_STATE_MISMATCH', '交易 cookie 損毀。');
    }

    if (!code || !state || state !== tx.state) {
      return this.renderError(
        res,
        'AUTH_OIDC_STATE_MISMATCH',
        'state 不符或 code 缺漏（可能為 CSRF／回呼竄改）。',
      );
    }

    let claims: Record<string, unknown>;
    try {
      const result = await this.cca.acquireTokenByCode({
        code,
        scopes: OIDC_SCOPES,
        redirectUri: this.redirectUri,
        codeVerifier: tx.verifier,
        state: tx.state,
      });
      claims = (result.idTokenClaims ?? {}) as Record<string, unknown>;
    } catch (e) {
      return this.renderError(
        res,
        'AUTH_OIDC_EXCHANGE_FAILED',
        e instanceof Error ? e.message : String(e),
      );
    }

    // nonce 強制驗證（防重放）
    if (claims['nonce'] !== tx.nonce) {
      return this.renderError(
        res,
        'AUTH_OIDC_TOKEN_INVALID',
        'nonce 不符（可能為 token 重放）。',
      );
    }

    const email = (claims['email'] as string | undefined) ?? null;
    if (!email || email.trim() === '') {
      return this.renderError(
        res,
        'AUTH_EMAIL_CLAIM_MISSING',
        'id_token 未含 email claim；請確認 app registration 之 optional claim 與帳號 mail 屬性。',
      );
    }

    const candidates = await this.accounts.findByEmail(email);
    const outcome = decideAuthOutcome(classifyAccountByEmail(email, candidates));

    if (outcome.kind === 'rejected') {
      if (outcome.alertAdmin) {
        // eslint-disable-next-line no-console
        console.error(
          `[ALERT] email 命中多筆在職帳號，拒絕登入並須告警系統管理員：${maskEmail(email)}`,
        );
      }
      const msg =
        outcome.code === 'AUTH_ACCOUNT_DISABLED'
          ? '您的帳號已停用，請洽系統管理員。'
          : '查無有效帳號，請洽系統管理員。';
      return this.renderError(res, outcome.code, msg);
    }

    // 核發我方 session（httpOnly cookie）
    const su: SessionUser = {
      loginId: outcome.account.loginId,
      email: outcome.account.email ?? email,
      companyCode: outcome.account.companyCode,
      roleCode: outcome.account.roleCode,
    };
    res.cookie(SESSION_COOKIE, this.tokens.issue(su), sessionCookieOptions());
    // 登入成功 → 導回前端 SPA（session cookie 已核發，SPA 之 /auth/me 即認得）。
    // POST_LOGIN_REDIRECT_URL：正式（同源反代）用 '/'；dev（redirect_uri 在 :3000、SPA 在 :5173）
    // 設為 http://localhost:5173/ 以跨埠導回 SPA（cookie 為 localhost host-only、跨埠共用）。
    return res.redirect(postLoginRedirect());
  }

  /** 受保護：回傳當前 session 使用者。同時驗證 guard 之 sliding 刷新。 */
  @UseGuards(SessionGuard)
  @Get('me')
  me(@Req() req: RequestWithSession): SessionUser {
    return req.sessionUser as SessionUser;
  }

  /** 登出：清除 session cookie。 */
  @Get('logout')
  logout(@Res() res: Response): void {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res
      .type('html')
      .send(page('已登出', '<p>已清除 session。</p><p><a href="/auth/login">重新登入</a></p>'));
  }

  private renderError(res: Response, code: string, detail?: string): void {
    res
      .status(401)
      .type('html')
      .send(
        page(
          '登入失敗',
          `<p style="color:#dc2626;font-size:16px">登入失敗</p>
           <p style="font-family:monospace">${esc(code)}</p>
           ${detail ? `<p style="color:#64748b">${esc(detail)}</p>` : ''}
           <p style="margin-top:20px"><a href="/auth/login">↻ 重試登入</a></p>`,
        ),
      );
  }
}

/** 登入成功後導向目標。正式（同源反代）預設 '/'；dev 以 POST_LOGIN_REDIRECT_URL 指向 SPA 埠。 */
function postLoginRedirect(): string {
  return process.env.POST_LOGIN_REDIRECT_URL?.trim() || '/';
}

function page(title: string, body: string): string {
  return `<!doctype html><meta charset="utf-8"><title>ICSOP — ${esc(title)}</title>
<div style="max-width:640px;margin:40px auto;font-family:system-ui,'Noto Sans TC',sans-serif;color:#0f172a">${body}</div>`;
}

function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ] ?? c,
  );
}
