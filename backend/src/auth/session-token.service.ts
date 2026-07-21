import { JwtService } from '@nestjs/jwt';

/** Session 閒置逾時：30 分鐘（F001／OQ-E01-04）。每次有效請求重發，達成 sliding idle timeout。 */
export const SESSION_TTL_SECONDS = 30 * 60;

export interface SessionUser {
  loginId: string;
  email: string;
  companyCode: string;
  roleCode?: string;
}

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
