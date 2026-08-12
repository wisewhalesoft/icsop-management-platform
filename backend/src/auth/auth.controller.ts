import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
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
import { PasswordLoginService } from './password-login.service';
import {
  SESSION_COOKIE,
  OIDC_TX_COOKIE,
  sessionCookieOptions,
  cookieSecure,
} from './session.config';

interface OidcTx {
  state: string;
  nonce: string;
  verifier: string;
}

/** POST /auth/login（途徑 B）之請求 body。識別鍵＝loginId（見 F001 定案 A）。 */
interface PasswordLoginBody {
  loginId?: string;
  password?: string;
  companyCode?: string;
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
    private readonly passwordLoginSvc: PasswordLoginService,
  ) {}

  /**
   * 途徑 B：帳密登入（SPA JSON）。以 (companyCode, loginId)＋密碼比對手動帳號（F001 定案 A/B/C）。
   *  - 成功 → 核發 icsop_session cookie（與途徑 A 同一 issue()／sessionCookieOptions()），回 SessionUser。
   *  - 失敗 → 統一 401 AUTH_INVALID_CREDENTIALS；缺漏 → 400 AUTH_MISSING_FIELD（由 service 拋出，Nest 例外過濾器格式化）。
   * GET /auth/login（OIDC 起點）不受影響。
   */
  @Post('login')
  async passwordLogin(
    @Body() body: PasswordLoginBody,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionUser> {
    // req.ip 交 service 之 IP 軸節流（brute-force 防護）。
    // ⚠ 部署於反向代理（nginx）之後時，需於 main.ts 設定 `trust proxy`，否則 req.ip 恆為反代位址，
    //    使所有使用者共用同一 IP 節流額度（見 hardening 實作日誌之部署待辦）。
    const { user, token } = await this.passwordLoginSvc.login(
      body ?? {},
      req.ip ?? '',
    );
    res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
    return user;
  }

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
      secure: cookieSecure(), // 與 session cookie 同策略：HTTPS 部署時設 SESSION_COOKIE_SECURE=true
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
    // GATE#2：記錄最後登入時間戳（途徑 A OIDC 成功一次）。與途徑 B 一致，try/catch 保證不阻斷登入。
    try {
      await this.accounts.markLoggedIn(su.companyCode, su.loginId, new Date());
    } catch {
      // 靜默：登入已成功；時間戳為輔助資料。
    }
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

  /**
   * 登出：清除 session cookie 後轉址回登入頁。
   * 前端 topbar「登出」是整頁導覽（useAuth 之 window.location.href = '/auth/logout'），
   * 故此處必須轉址；若回 HTML 會把使用者留在後端頁面而非 SPA 登入畫面。
   */
  @Get('logout')
  logout(@Res() res: Response): void {
    // 順序固定：先清 cookie 再轉址，否則使用者被導回後仍持有有效 session。
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    return res.redirect(postLogoutRedirect());
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

/**
 * 登出後導向目標。與 postLoginRedirect() 對稱，但預設維持【相對路徑】'/'：
 * 登出是由 SPA 同源發起（dev 經 Vite proxy :5173、正式經 nginx），相對轉址會落回 SPA，
 * 而 SPA 在 status==='unauthenticated' 時任一路由皆渲染登入頁。
 * 用相對路徑亦避開絕對轉址掉 port 的雷（見 frontend/nginx.conf 之 absolute_redirect off）。
 * POST_LOGOUT_REDIRECT_URL 僅供例外部署（登出入口非同源）覆寫。
 */
function postLogoutRedirect(): string {
  return process.env.POST_LOGOUT_REDIRECT_URL?.trim() || '/';
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
