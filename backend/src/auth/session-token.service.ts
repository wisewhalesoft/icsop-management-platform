import { JwtService } from '@nestjs/jwt';

/** Session 閒置逾時：30 分鐘（F001／OQ-E01-04）。每次有效請求重發，達成 sliding idle timeout。 */
export const SESSION_TTL_SECONDS = 30 * 60;

/**
 * 每請求之 session 身分（request context）。
 * ⚠ orgCode/name/employeeNo 為 **request-context 專屬**（來源＝SessionGuard 每請求查回之
 *   CurrentAccount / DB 現行值），**不進 signed JWT**（見下方 SessionClaims 註）。故其權威值為
 *   DB 現行快照，供 F019 置頂（依部門）與 F020 浮水印身分快照。未經 guard（如登入當下直接建構）
 *   時可能為 undefined；下游應以 `?? null` 寬容處理。
 */
export interface SessionUser {
  loginId: string;
  email: string;
  companyCode: string;
  roleCode?: string;
  orgCode?: string | null;
  name?: string | null;
  employeeNo?: string | null;
  accountId?: string | null; // ← ACCOUNT.id（UUID）；request-context（SessionGuard 每請求填入，不進 JWT）；稽核操作者鍵
}

/**
 * JWT payload（已簽章、未加密）。刻意 **僅** 攜帶核心 4 欄。
 * 🔴 定案：orgCode/name/employeeNo 屬 PII，不得寫入（client 可 base64 解碼讀取 payload），
 *   且避免陳舊（session 存續期間部門/姓名可能異動）。身分快照改由每請求查 DB（CurrentAccount）取得。
 */
interface SessionClaims {
  sub: string;
  email: string;
  companyCode: string;
  roleCode?: string;
}

/**
 * 我方 session token（非 Azure token）。Azure 僅負責初次認證；
 * 之後由本服務簽發/驗證我方 JWT，並自行管理 30 分鐘閒置逾時（sliding）。
 * 無狀態設計（架構 §7.4）：逾時＝token 過期；「登出即撤銷」以清 cookie 達成，
 * 立即撤銷被竊 token 需 server 端 denylist（後續 infra，尚未實作）。
 */
export class SessionTokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly ttlSeconds: number = SESSION_TTL_SECONDS,
  ) {}

  issue(user: SessionUser): string {
    const claims: SessionClaims = {
      sub: user.loginId,
      email: user.email,
      companyCode: user.companyCode,
      roleCode: user.roleCode,
    };
    return this.jwt.sign(claims, { expiresIn: this.ttlSeconds });
  }

  /** 驗證並解出使用者；無效／過期／竄改一律回 null（不拋例外給呼叫端）。 */
  verify(token: string | undefined | null): SessionUser | null {
    if (!token) return null;
    try {
      const c = this.jwt.verify<SessionClaims>(token);
      return {
        loginId: c.sub,
        email: c.email,
        companyCode: c.companyCode,
        roleCode: c.roleCode,
      };
    } catch {
      return null;
    }
  }
}
