import { randomUUID } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';

/**
 * F001 帳號選擇 delta — 選擇票證（`AC-M10`／`AC-M19`／`AC-M20`／`AC-M22`／`AC-M23`／`AC-M29`）。
 * 簽章／時效機制比照 `session-token.service.ts`；一次性消耗紀錄比照 `login-throttle.ts` 之
 * 單機 process 記憶體做法（`AC-M23` 人類裁決）。
 *
 * 🔴 時效判斷以建構子注入之 `now()` 為準（`AC-M19` 非 sliding），不依賴 `jsonwebtoken` 內建
 * `exp`（該值綁定真實系統時鐘，單元測試以假時鐘推進時對它不生效）；`verify()` 呼叫時以
 * `{ ignoreExpiration: true }` 略過內建檢查，改以簽發當下 `now()` 之 `issuedAt` 與現在 `now()`
 * 之差值比對 `SELECTION_TICKET_TTL_SECONDS`。`expiresIn` 於簽章時仍附上作為第二層防線。
 */

export const SELECTION_TICKET_COOKIE = 'icsop_login_select';
export const SELECTION_TICKET_TTL_SECONDS = 300; // 5 分鐘（AC-M19 人類裁決）

export interface SelectionTicketCandidateRef {
  accountId: string;
  companyCode: string;
  loginId: string;
}

export interface SelectionTicketPayload {
  email: string;
  name: string;
  candidates: SelectionTicketCandidateRef[];
}

export type SelectionTicketCheck =
  | { ok: true; payload: SelectionTicketPayload }
  | { ok: false };

/** 簽章 claims：對外之 SelectionTicketPayload 之外，另嵌 jti（一次性消耗鍵）與 issuedAt（時效判準）。 */
interface SelectionTicketClaims extends SelectionTicketPayload {
  jti: string;
  issuedAt: number;
}

export class SelectionTicketService {
  /** 已消耗之票證 jti 集合（process 記憶體，AC-M23／AC-M29；不落 DB）。 */
  private readonly consumed = new Set<string>();

  constructor(
    private readonly jwt: JwtService,
    private readonly now: () => number = () => Date.now(),
  ) {}

  issue(payload: SelectionTicketPayload): string {
    const claims: SelectionTicketClaims = {
      ...payload,
      jti: randomUUID(),
      issuedAt: this.now(),
    };
    return this.jwt.sign(claims, { expiresIn: SELECTION_TICKET_TTL_SECONDS });
  }

  /** 唯讀：驗簽章＋時效＋未被消耗。不改變狀態。 */
  verify(token: string | undefined | null): SelectionTicketCheck {
    return this.check(token, false);
  }

  /** 同 verify()，成功時原子性標記為已消耗（AC-M23）。 */
  consume(token: string | undefined | null): SelectionTicketCheck {
    return this.check(token, true);
  }

  private check(token: string | undefined | null, markConsumed: boolean): SelectionTicketCheck {
    if (!token) return { ok: false };

    let claims: SelectionTicketClaims;
    try {
      claims = this.jwt.verify<SelectionTicketClaims>(token, { ignoreExpiration: true });
    } catch {
      return { ok: false };
    }

    if (this.now() - claims.issuedAt >= SELECTION_TICKET_TTL_SECONDS * 1000) {
      return { ok: false };
    }
    if (this.consumed.has(claims.jti)) {
      return { ok: false };
    }
    if (markConsumed) {
      this.consumed.add(claims.jti);
    }

    return {
      ok: true,
      payload: {
        email: claims.email,
        name: claims.name,
        candidates: claims.candidates,
      },
    };
  }
}
