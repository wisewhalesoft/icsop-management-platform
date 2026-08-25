import { randomUUID } from 'node:crypto';
import {
  Body,
  Controller,
  Get,
  Inject,
  Logger,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtService } from '@nestjs/jwt';
import {
  ConfidentialClientApplication,
  CryptoProvider,
} from '@azure/msal-node';
import {
  buildAadAuthorityConfig,
  buildMsalConfig,
  OIDC_SCOPES,
  requireEnv,
} from './msal.config';
import { expectedAadIssuer, isAcceptableAadIssuer } from './aad-authority';
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
  sessionSecret,
} from './session.config';
import {
  CandidateAccount,
  CallbackPlan,
  decideMultiAccountLogin,
  planCallbackResponse,
} from './multi-account-picker';
import {
  SELECTION_TICKET_COOKIE,
  SELECTION_TICKET_TTL_SECONDS,
  SelectionTicketService,
} from './selection-ticket';
import { buildCandidatePayload, DisplayResolvers } from './candidate-payload';
import { resolveCompanyShortName } from '../org-directory/company-name';
import { roleLabel } from '../audit/access-history-labels';
import { AppDataSource } from '../database/data-source';
import { OrgUnit } from '../database/entities/org-unit.entity';

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

/**
 * 登入失敗頁**唯一**可顯示之錯誤碼（F001 `AC-E13`(a)(1)）。皆為 error-handling.md 錯誤碼表所定之對外契約。
 * 不新增任何錯誤碼——本批僅擴充 `AUTH_OIDC_EXCHANGE_FAILED` 之適用階段至 `/auth/login`。
 */
type AuthFailureCode =
  | 'AUTH_OIDC_STATE_MISMATCH'
  | 'AUTH_OIDC_EXCHANGE_FAILED'
  | 'AUTH_OIDC_TOKEN_INVALID'
  | 'AUTH_EMAIL_CLAIM_MISSING'
  | 'AUTH_ACCOUNT_NOT_FOUND'
  | 'AUTH_ACCOUNT_DISABLED';

/**
 * 登入失敗頁**唯一**可顯示之說明句（F001 `AC-E13`(a)(2)(b)）。
 *
 * 本表存在的理由是把「使用者可見字串」變成**原始碼中可列舉之有限常數集合**：
 * `renderError()` 的 detail 參數型別即為本表之值域，因此「把例外 message／上游回應／host／
 * Azure 回呼之 error 參數插進畫面」在型別層就寫不出來。
 * 上游原始錯誤、host、堆疊一律只進伺服器日誌（`AC-E13`(c)：畫面收斂、日誌保全）。
 */
const AUTH_FAILURE_DETAIL = {
  TX_COOKIE_MISSING: '找不到交易 cookie（逾時、未經 /auth/login，或簽章驗證失敗）。',
  TX_COOKIE_CORRUPT: '交易 cookie 損毀。',
  STATE_MISMATCH: 'state 不符或 code 缺漏（可能為 CSRF／回呼竄改）。',
  EXCHANGE_FAILED: '驗證失敗，請重新登入。',
  TOKEN_REPLAY: 'nonce 不符（可能為 token 重放）。',
  TOKEN_INVALID: 'id_token 未通過驗證。',
  EMAIL_CLAIM_MISSING:
    'id_token 未含 email claim；請確認 app registration 之 optional claim 與帳號 mail 屬性。',
  ACCOUNT_DISABLED: '您的帳號已停用，請洽系統管理員。',
  ACCOUNT_NOT_FOUND: '查無有效帳號，請洽系統管理員。',
} as const;

type AuthFailureDetail = (typeof AUTH_FAILURE_DETAIL)[keyof typeof AUTH_FAILURE_DETAIL];

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
  /** 生效之 endpoint host + 租戶。endpoint 可搬，issuer 由 aad-authority.ts 釘死為 canonical。 */
  private readonly aad = buildAadAuthorityConfig();
  private readonly logger = new Logger(AuthController.name);

  constructor(
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepository,
    private readonly tokens: SessionTokenService,
    private readonly passwordLoginSvc: PasswordLoginService,
    // F001 帳號選擇 delta：第 4 參數選填＋預設值，使既有以 3 參數直接建構本類別之測試檔
    // （如 aad-failure-disclosure.spec.ts）不受影響；正式路徑由 AuthModule 之 DI 明確提供。
    private readonly tickets: SelectionTicketService = new SelectionTicketService(
      new JwtService({ secret: sessionSecret() }),
    ),
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

    // AC-E12：發起階段若真的出網且失敗（分支 B），必須自行處理成與 callback 同碼、同訊息之錯誤頁；
    // 不得回 500、不得讓例外或堆疊冒到使用者面前。靜態 metadata 之下此階段零出網（分支 A）。
    let url: string;
    try {
      url = await this.cca.getAuthCodeUrl({
        scopes: OIDC_SCOPES,
        redirectUri: this.redirectUri,
        codeChallenge: challenge,
        codeChallengeMethod: 'S256',
        state: tx.state,
        nonce: tx.nonce,
      });
    } catch (e) {
      return this.renderError(
        res,
        'AUTH_OIDC_EXCHANGE_FAILED',
        AUTH_FAILURE_DETAIL.EXCHANGE_FAILED,
        '/auth/login 建構 authorization URL 失敗；' + this.diagnose(e),
      );
    }
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
    // AC-E13：Azure 回呼之 error／error_description 為外部來源字串，只進日誌不進畫面；
    // 對外改回我方常數碼＋固定訊息。
    if (error) {
      return this.renderError(
        res,
        'AUTH_OIDC_EXCHANGE_FAILED',
        AUTH_FAILURE_DETAIL.EXCHANGE_FAILED,
        `Azure 回呼帶錯誤參數 error=${error}；error_description=${errorDesc ?? '(無)'}`,
      );
    }

    const raw = (req.signedCookies as Record<string, string> | undefined)?.[
      OIDC_TX_COOKIE
    ];
    res.clearCookie(OIDC_TX_COOKIE);
    if (!raw) {
      return this.renderError(
        res,
        'AUTH_OIDC_STATE_MISMATCH',
        AUTH_FAILURE_DETAIL.TX_COOKIE_MISSING,
        '回呼未帶簽章 tx cookie（逾時、未經 /auth/login，或 cookie 簽章驗證失敗）',
      );
    }

    let tx: OidcTx;
    try {
      tx = JSON.parse(raw) as OidcTx;
    } catch {
      return this.renderError(
        res,
        'AUTH_OIDC_STATE_MISMATCH',
        AUTH_FAILURE_DETAIL.TX_COOKIE_CORRUPT,
        'tx cookie 內容非合法 JSON',
      );
    }

    if (!code || !state || state !== tx.state) {
      return this.renderError(
        res,
        'AUTH_OIDC_STATE_MISMATCH',
        AUTH_FAILURE_DETAIL.STATE_MISMATCH,
        'state 不符或 code 缺漏（可能為 CSRF／回呼竄改）',
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
      // AC-E13 缺陷修正：此處原本把 `e.message` 印在畫面上，使用者會看到
      // `network_error: Network request failed: fetch failed`。上游原始訊息改為只進日誌。
      return this.renderError(
        res,
        'AUTH_OIDC_EXCHANGE_FAILED',
        AUTH_FAILURE_DETAIL.EXCHANGE_FAILED,
        `authorization code 交換失敗（endpoint host=${this.aad.authorityHost}）；` +
          this.diagnose(e),
      );
    }

    // nonce 強制驗證（防重放）
    if (claims['nonce'] !== tx.nonce) {
      return this.renderError(
        res,
        'AUTH_OIDC_TOKEN_INVALID',
        AUTH_FAILURE_DETAIL.TOKEN_REPLAY,
        'id_token 之 nonce 與本次流程之暫存值不符',
      );
    }

    // issuer 釘死（AC-E5～AC-E7）：MSAL 不比對 `iss`，此檢查為我方新增。
    // 期望值恆為 canonical issuer，**與 AZURE_AD_AUTHORITY_HOST 無關**——endpoint 可搬，issuer 不搬。
    const iss = claims['iss'] as string | undefined;
    if (!isAcceptableAadIssuer(iss, this.aad)) {
      return this.renderError(
        res,
        'AUTH_OIDC_TOKEN_INVALID',
        AUTH_FAILURE_DETAIL.TOKEN_INVALID,
        `id_token 之 iss 不符：收到 ${iss ?? '(缺漏)'}，期望 ${expectedAadIssuer(this.aad)}`,
      );
    }

    const email = (claims['email'] as string | undefined) ?? null;
    if (!email || email.trim() === '') {
      return this.renderError(
        res,
        'AUTH_EMAIL_CLAIM_MISSING',
        AUTH_FAILURE_DETAIL.EMAIL_CLAIM_MISSING,
        'id_token 未含 email claim 或其值為空',
      );
    }

    // F001 帳號選擇 delta（`AC-M1`〜`AC-M29`）：repo 若支援 findCandidatesByEmail 即走新流程
    // （0/1/多筆姓名一致→選單／姓名不一致→既有拒登）；缺此方法（既有測試替身）→ 逐字沿用既有行為
    // （`AC-M27` 零漣漪）。
    if (this.accounts.findCandidatesByEmail) {
      const richCandidates: CandidateAccount[] = await this.accounts.findCandidatesByEmail(email);
      const decision = decideMultiAccountLogin(email, richCandidates);
      const plan = planCallbackResponse(decision);
      return this.applyCallbackPlan(plan, email, res);
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
          ? AUTH_FAILURE_DETAIL.ACCOUNT_DISABLED
          : AUTH_FAILURE_DETAIL.ACCOUNT_NOT_FOUND;
      return this.renderError(
        res,
        outcome.code,
        msg,
        `帳號比對拒絕 ${outcome.code}（email=${maskEmail(email)}）`,
      );
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

  /**
   * F001 帳號選擇 delta：把 `planCallbackResponse()` 之規劃套用到實際 Express 回應。
   * `issueSession`／`reject` 兩分支之既有動作與既有 fallback 段逐項相同（`AC-M27`）；
   * `requireSelection` 為本 delta 新增：簽發選擇票證、導向 `/login/select-account`、
   * 不得下發 session cookie（`AC-M3`）。
   */
  private async applyCallbackPlan(plan: CallbackPlan, email: string, res: Response): Promise<void> {
    switch (plan.action) {
      case 'issueSession': {
        const account = plan.account;
        const su: SessionUser = {
          loginId: account.loginId,
          email: account.email ?? email,
          companyCode: account.companyCode,
          roleCode: account.roleCode,
        };
        try {
          await this.accounts.markLoggedIn(su.companyCode, su.loginId, new Date());
        } catch {
          // 靜默：登入已成功；時間戳為輔助資料。
        }
        res.cookie(SESSION_COOKIE, this.tokens.issue(su), sessionCookieOptions());
        res.redirect(postLoginRedirect());
        return;
      }
      case 'requireSelection': {
        const token = this.tickets.issue(plan.ticketPayload);
        res.cookie(SELECTION_TICKET_COOKIE, token, {
          httpOnly: true,
          sameSite: 'lax',
          secure: cookieSecure(),
          maxAge: SELECTION_TICKET_TTL_SECONDS * 1000,
          path: '/',
        });
        res.redirect(selectAccountRedirect());
        return;
      }
      case 'reject': {
        if (plan.warnLog) {
          // AC-M8：WARN 記錄共用信箱告警（email＋候選 (companyCode, loginId) 清單＋相異姓名組數）；
          // 不得記錄密碼／passwordHash／clientSecret（warnLog 本身之型別已不含姓名/密碼欄）。
          this.logger.warn(
            `[ALERT] ${plan.warnLog.event}：email=${maskEmail(plan.warnLog.email)}；` +
              `候選=${JSON.stringify(plan.warnLog.accounts)}；相異姓名組數=${plan.warnLog.distinctNameCount}`,
          );
        }
        const msg =
          plan.code === 'AUTH_ACCOUNT_DISABLED'
            ? AUTH_FAILURE_DETAIL.ACCOUNT_DISABLED
            : AUTH_FAILURE_DETAIL.ACCOUNT_NOT_FOUND;
        this.renderError(res, plan.code, msg, `帳號比對拒絕 ${plan.code}（email=${maskEmail(email)}）`);
        return;
      }
    }
  }

  /**
   * F001 帳號選擇 delta（丙節）：`GET /auth/select-account`——以選擇票證取回候選清單投影。
   * 無票證／竄改／過期／已消耗 → 401 `AUTH_SELECTION_TICKET_INVALID`（`AC-M17`／`AC-M19`／`AC-M20`）。
   */
  @Get('select-account')
  async getSelectAccount(@Req() req: Request, @Res() res: Response): Promise<void> {
    const token = (req.cookies as Record<string, string> | undefined)?.[
      SELECTION_TICKET_COOKIE
    ];
    const check = this.tickets.verify(token);
    if (!check.ok) {
      throw new UnauthorizedException('AUTH_SELECTION_TICKET_INVALID');
    }

    const candidateAccounts: CandidateAccount[] = await Promise.all(
      check.payload.candidates.map(async (ref) => {
        const current = await this.accounts.findCurrentByLogin(ref.companyCode, ref.loginId);
        return {
          accountId: ref.accountId,
          loginId: ref.loginId,
          email: check.payload.email,
          companyCode: ref.companyCode,
          orgCode: current?.orgCode ?? null,
          roleCode: current?.roleCode,
          status: (current?.status === 'disabled' ? 'disabled' : 'active') as
            | 'active'
            | 'disabled',
          name: check.payload.name,
        };
      }),
    );

    const payload = await buildCandidatePayload(
      check.payload.email,
      check.payload.name,
      candidateAccounts,
      this.candidateDisplayResolvers(),
    );
    res.json(payload);
  }

  /**
   * F001 帳號選擇 delta（丁節）：`POST /auth/select-account`——以選擇票證＋`accountId` 兌換 session。
   * 驗證順序：票證有效性 → `accountId` 屬於票證綁定集合（`AC-M21`／`AC-M22`）→ 現行狀態仍 active
   * （`AC-M24`）→ 原子性消耗票證（`AC-M23`）。任一步失敗皆不得核發 session、不得回退重查候選
   * （`AC-M20`）。
   */
  @Post('select-account')
  async postSelectAccount(
    @Body() body: { accountId?: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionUser> {
    const token = (req.cookies as Record<string, string> | undefined)?.[
      SELECTION_TICKET_COOKIE
    ];
    const check = this.tickets.verify(token);
    if (!check.ok) {
      throw new UnauthorizedException('AUTH_SELECTION_TICKET_INVALID');
    }

    const ref = check.payload.candidates.find((c) => c.accountId === body?.accountId);
    if (!ref) {
      throw new UnauthorizedException('AUTH_SELECTION_TICKET_INVALID');
    }

    const current = await this.accounts.findCurrentByLogin(ref.companyCode, ref.loginId);
    if (!current || current.status !== 'active') {
      throw new UnauthorizedException('AUTH_ACCOUNT_DISABLED');
    }

    // 至此已通過票證有效性＋帳號集合成員資格＋現行狀態三項確認 → 原子性標記消耗（AC-M23）。
    const consumed = this.tickets.consume(token);
    if (!consumed.ok) {
      throw new UnauthorizedException('AUTH_SELECTION_TICKET_INVALID');
    }

    const su: SessionUser = {
      loginId: ref.loginId,
      email: check.payload.email,
      companyCode: ref.companyCode,
      roleCode: current.roleCode,
    };
    try {
      await this.accounts.markLoggedIn(su.companyCode, su.loginId, new Date());
    } catch {
      // 靜默：登入已成功；時間戳為輔助資料。
    }
    res.clearCookie(SELECTION_TICKET_COOKIE, { path: '/' });
    res.cookie(SESSION_COOKIE, this.tokens.issue(su), sessionCookieOptions());
    return su;
  }

  /** 候選畫面顯示名稱解析器（`AC-M14`）：company 走靜態簡稱表；org 查 ORG_UNIT；role 走既有標籤表。 */
  private candidateDisplayResolvers(): DisplayResolvers {
    return {
      companyName: (c) => resolveCompanyShortName(c ?? null),
      orgName: (o) => this.resolveOrgName(o),
      roleName: (r) => (r ? roleLabel(r) || r : ''),
    };
  }

  private async resolveOrgName(orgCode: string | null | undefined): Promise<string | null> {
    if (orgCode == null || orgCode.trim() === '') return null;
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const unit = await AppDataSource.getRepository(OrgUnit).findOne({ where: { orgCode } });
    return unit ? unit.name : null;
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

  /**
   * 例外之可診斷摘要——**只給日誌用**（`AC-E13`(c)）。含 name／message／堆疊；
   * 絕不含 `AZURE_AD_CLIENT_SECRET`（本函式不讀該變數，亦不序列化整個設定物件）。
   */
  private diagnose(e: unknown): string {
    if (!(e instanceof Error)) return `非 Error 例外：${String(e)}`;
    return `${e.name}: ${e.message}\n${e.stack ?? '(無堆疊)'}`;
  }

  /**
   * 登入失敗頁（`AC-E13`）。
   *
   * **畫面收斂**：只輸出我方錯誤碼常數、`AUTH_FAILURE_DETAIL` 表內之固定訊息、重試連結，
   * 以及我方產生之隨機 correlation id。`detail` 之型別即為該表之值域，故任何執行期插值之
   * 外部字串（例外 message、上游回應、AADSTS 代碼、host、tenantId、email…）在型別層就進不來。
   * **日誌保全**：`diagnostic` 承載全部細節，附同一 correlation id 以供對照。
   */
  private renderError(
    res: Response,
    code: AuthFailureCode,
    detail: AuthFailureDetail,
    diagnostic?: string,
  ): void {
    // 我方產生之隨機識別碼，不由任何外部值導出、不含任何內容資訊（AC-E13(a)(4)）。
    const correlationId = randomUUID();
    this.logger.warn(`[${correlationId}] ${code}${diagnostic ? ' — ' + diagnostic : ''}`);

    res
      .status(401)
      .type('html')
      .send(
        page(
          '登入失敗',
          `<p style="color:#dc2626;font-size:16px">登入失敗</p>
           <p style="font-family:monospace">${esc(code)}</p>
           <p style="color:#64748b">${esc(detail)}</p>
           <p style="color:#94a3b8;font-size:12px">參考碼 ${esc(correlationId)}</p>
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
 * F001 帳號選擇 delta（`AC-M3`）：`N ≥ 2` 且前置條件成立時之導向目標——`/login/select-account`。
 * 與 postLoginRedirect() 同一 dev/正式雙軌邏輯：正式（同源反代）為相對路徑；
 * dev（redirect_uri 在 :3000、SPA 在 :5173）以 POST_LOGIN_REDIRECT_URL 之 origin 為基準跨埠導回 SPA。
 */
function selectAccountRedirect(): string {
  const base = process.env.POST_LOGIN_REDIRECT_URL?.trim();
  return base ? `${base.replace(/\/$/, '')}/login/select-account` : '/login/select-account';
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
