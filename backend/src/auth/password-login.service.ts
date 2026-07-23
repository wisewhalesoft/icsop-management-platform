import {
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ACCOUNT_REPOSITORY,
  AccountRepository,
} from './account-repository';
import { SessionTokenService, SessionUser } from './session-token.service';
import { resolvePasswordLogin } from './password-login';

export interface PasswordLoginInput {
  loginId?: string;
  password?: string;
  companyCode?: string;
}

export interface PasswordLoginResult {
  user: SessionUser;
  token: string;
}

/** MVP 限單一公司（AS）。允許以 env 覆寫，未指定時回 AS。 */
function defaultCompanyCode(): string {
  return process.env.DEFAULT_COMPANY_CODE?.trim() || 'AS';
}

/** 登入識別鍵字串遮罩（記錄失敗事件時避免落地完整帳號）。 */
function maskLoginId(loginId: string): string {
  if (loginId.length <= 2) return '***';
  return `${loginId.slice(0, 2)}***`;
}

/**
 * 途徑 B（帳密登入）編排服務。對應 F001 途徑 B／F003 建立→登入閉環：
 *  1) 必填檢核（loginId／password）→ 缺漏回 AUTH_MISSING_FIELD（400），且不查詢帳號。
 *  2) 以 (companyCode, loginId) 取含 passwordHash 之帳號快照（PK 唯一，至多一筆）。
 *  3) 交純決策 resolvePasswordLogin 判定；拒絕一律回統一 AUTH_INVALID_CREDENTIALS（401，
 *     不洩漏帳號是否存在／是否啟用），並記錄失敗事件（現況 console.error；F023 AUDIT_LOG 未建）。
 *  4) 成功 → 重用途徑 A 之 SessionTokenService.issue() 簽發 session（同一生命週期）。
 *
 * loginId 去頭尾空白後比對（比照建立時 controller 之 trim）；密碼不 trim（精確比對，避免削弱有效密碼空間）。
 */
@Injectable()
export class PasswordLoginService {
  constructor(
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepository,
    private readonly tokens: SessionTokenService,
  ) {}

  async login(input: PasswordLoginInput): Promise<PasswordLoginResult> {
    const loginId = input.loginId?.trim();
    const password = input.password;
    if (!loginId || !password) {
      throw new BadRequestException('AUTH_MISSING_FIELD');
    }
    const companyCode = input.companyCode?.trim() || defaultCompanyCode();

    const account = await this.accounts.findByLoginId(companyCode, loginId);
    const outcome = resolvePasswordLogin(account, password);

    if (outcome.kind === 'rejected') {
      // eslint-disable-next-line no-console
      console.error(
        `[ALERT] 帳密登入失敗（統一 AUTH_INVALID_CREDENTIALS）：companyCode=${companyCode} loginId=${maskLoginId(loginId)}`,
      );
      throw new UnauthorizedException('AUTH_INVALID_CREDENTIALS');
    }

    const user: SessionUser = {
      loginId: outcome.account.loginId,
      email: outcome.account.email ?? '',
      companyCode: outcome.account.companyCode,
      roleCode: outcome.account.roleCode,
    };
    return { user, token: this.tokens.issue(user) };
  }
}
