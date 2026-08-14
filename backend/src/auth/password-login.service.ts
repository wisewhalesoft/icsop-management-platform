import {
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ACCOUNT_REPOSITORY,
  AccountRepository,
  PasswordAuthAccount,
} from './account-repository';
import { SessionTokenService, SessionUser } from './session-token.service';
import { resolvePasswordLogin } from './password-login';
import {
  LoginThrottleService,
  LOGIN_THROTTLE_PER_IP_LIMIT,
  LOGIN_THROTTLE_PER_LOGINID_LIMIT,
  tooManyAttemptsException,
} from './login-throttle';

export interface PasswordLoginInput {
  loginId?: string;
  password?: string;
  companyCode?: string;
}

export interface PasswordLoginResult {
  user: SessionUser;
  token: string;
}

/**
 * 第①段（本公司精確命中）之預設公司。允許以 env 覆寫，未指定時回 AS。
 * ⚠ 已**不再**是唯一搜尋範圍——見 `resolveAccount` 之第②段（F001 AC-C1）。
 */
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
 *  2) 解析帳號快照（含 passwordHash）：先以 (companyCode, loginId) 精確命中，未命中且未明確
 *     指定公司時再跨公司搜尋、恰一筆才採用（F001 AC-C1 兩段式，見 resolveAccount）。
 *  3) 交純決策 resolvePasswordLogin 判定；拒絕一律回統一 AUTH_INVALID_CREDENTIALS（401，
 *     不洩漏帳號是否存在／是否啟用），並記錄失敗事件（現況 console.error；F023 AUDIT_LOG 未建）。
 *  4) 成功 → 重用途徑 A 之 SessionTokenService.issue() 簽發 session（同一生命週期）。
 *
 * loginId 去頭尾空白後比對（比照建立時 controller 之 trim）；密碼不 trim（精確比對，避免削弱有效密碼空間）。
 *
 * 節流（brute-force 防護，OQ-F001-B-04）接線順序（見 hardening-test-design.md §2.3）：
 *  1) IP 軸檢查先於欄位驗證（惡意來源儘早、廉價擋下，不觸發正常欄位驗證分支）；
 *  2) 欄位缺漏不計入任何節流計數（非「憑證猜測」，延伸現況「缺漏不查帳號」原則）；
 *  3) loginId 軸達門檻即拒（即使本次密碼正確亦不驗證——標準節流語意）；
 *  4) 拒絕 → 同時記 IP 與 loginId 兩軸失敗；成功 → 僅重置 loginId 軸（IP 為共享資源，不因單一帳號
 *     成功而清空同 IP 下他人之失敗記錄，避免以「登入一個會成功的帳號」繞過 IP 節流）。
 */
@Injectable()
export class PasswordLoginService {
  constructor(
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepository,
    private readonly tokens: SessionTokenService,
    private readonly throttle: LoginThrottleService,
  ) {}

  async login(
    input: PasswordLoginInput,
    clientIp: string,
  ): Promise<PasswordLoginResult> {
    // 1) IP 軸節流（先於欄位驗證；達門檻即回 429，不查 DB、不驗證欄位）。
    const ipKey = `ip:${clientIp}`;
    if (this.throttle.isBlocked(ipKey, LOGIN_THROTTLE_PER_IP_LIMIT)) {
      throw tooManyAttemptsException();
    }

    // 2) 欄位缺漏（不計入任何節流計數；亦不查詢帳號）。
    const loginId = input.loginId?.trim();
    const password = input.password;
    if (!loginId || !password) {
      throw new BadRequestException('AUTH_MISSING_FIELD');
    }
    // AC-C1：body 明確帶 companyCode → 僅以該公司精確查詢（不進入第②段），既有契約不變。
    const explicitCompany = input.companyCode?.trim();
    const companyCode = explicitCompany || defaultCompanyCode();

    // 3) loginId 軸節流（達門檻即回 429，即使本次密碼正確亦不進入驗證）。
    const loginKey = `login:${companyCode}:${loginId}`;
    if (this.throttle.isBlocked(loginKey, LOGIN_THROTTLE_PER_LOGINID_LIMIT)) {
      throw tooManyAttemptsException();
    }

    const account = await this.resolveAccount(
      companyCode,
      loginId,
      Boolean(explicitCompany),
    );
    const outcome = resolvePasswordLogin(account, password);

    if (outcome.kind === 'rejected') {
      // 4a) 拒絕 → 記 IP 與 loginId 兩軸失敗（不存在帳號亦同——不洩漏帳號是否存在）。
      this.throttle.recordFailure(ipKey, LOGIN_THROTTLE_PER_IP_LIMIT);
      this.throttle.recordFailure(loginKey, LOGIN_THROTTLE_PER_LOGINID_LIMIT);
      // eslint-disable-next-line no-console
      console.error(
        `[ALERT] 帳密登入失敗（統一 AUTH_INVALID_CREDENTIALS）：companyCode=${companyCode} loginId=${maskLoginId(loginId)}`,
      );
      throw new UnauthorizedException('AUTH_INVALID_CREDENTIALS');
    }

    // 4b) 成功 → 僅重置 loginId 軸（不重置共享 IP 軸）；成功本身不計入任何節流計數。
    this.throttle.reset(loginKey);

    // GATE#2：記錄最後登入時間戳（每次成功登入一次）。以 try/catch 包覆——時間戳寫入失敗絕不阻斷登入。
    try {
      await this.accounts.markLoggedIn(
        outcome.account.companyCode,
        outcome.account.loginId,
        new Date(),
      );
    } catch {
      // 靜默：登入本身已成功；時間戳為輔助資料。
    }

    const user: SessionUser = {
      loginId: outcome.account.loginId,
      email: outcome.account.email ?? '',
      companyCode: outcome.account.companyCode,
      roleCode: outcome.account.roleCode,
    };
    return { user, token: this.tokens.issue(user) };
  }

  /**
   * 帳號解析（F001 `AC-C1`，兩段式；`AC-P25` 之落地）。
   *
   *  ① 以 `(companyCode, loginId)` 精確查詢，命中即採用——**既有路徑，`AS` 帳號之行為與
   *     查詢次數逐項不變**（`AC-P27` 回歸護欄）。
   *  ② 未命中則以 `loginId` **跨全部公司**查詢：**恰**命中一筆才採用。
   *  ③ 命中 0 筆或多筆（歷史資料異常）→ 回 `null`，交由 `resolvePasswordLogin` 統一收斂為
   *     401 `AUTH_INVALID_CREDENTIALS`——**不任選一筆、不洩漏原因**（比照既有 email 命中多筆之處置）。
   *
   * 第②段之跳過條件（任一成立即維持既有單公司行為）：
   *  - body 明確帶入 `companyCode`（呼叫端已指定範圍，`AC-C1` 明載不進入第②段）；
   *  - repository 未實作 `findByLoginIdAnyCompany`（既有測試替身）。
   *
   * ⚠ 不修訂本段則於 `AS` 以外公司建立之手動帳號**建立後永遠無法登入**（`AC-P25` 標記為
   * 公司可跨選裁決之最嚴重漣漪）。
   */
  private async resolveAccount(
    companyCode: string,
    loginId: string,
    companyExplicit: boolean,
  ): Promise<PasswordAuthAccount | null> {
    const exact = await this.accounts.findByLoginId(companyCode, loginId);
    if (exact) return exact;
    if (companyExplicit || !this.accounts.findByLoginIdAnyCompany) return null;
    const candidates = await this.accounts.findByLoginIdAnyCompany(loginId);
    return candidates.length === 1 ? candidates[0] : null;
  }
}
