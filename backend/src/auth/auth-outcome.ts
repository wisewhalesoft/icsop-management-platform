import {
  AccountClassification,
  ResolvableAccount,
} from './account-resolver';

/**
 * 登入結果決策（純邏輯）。將帳號分類映射為「核發 session」或「拒絕＋錯誤碼」。
 * 對應 F001 AC 與 error-handling.md#auth：
 *  - SingleActive           → authenticated
 *  - NotFound               → AUTH_ACCOUNT_NOT_FOUND
 *  - Disabled               → AUTH_ACCOUNT_DISABLED
 *  - MultipleActive         → 拒絕、對外回 AUTH_ACCOUNT_NOT_FOUND（不可列舉）、alertAdmin=true（不得任選一筆）
 */
export type AuthRejectionCode = 'AUTH_ACCOUNT_NOT_FOUND' | 'AUTH_ACCOUNT_DISABLED';

export type AuthOutcome =
  | { kind: 'authenticated'; account: ResolvableAccount }
  | { kind: 'rejected'; code: AuthRejectionCode; alertAdmin: boolean };

export function decideAuthOutcome(c: AccountClassification): AuthOutcome {
  switch (c.kind) {
    case 'SingleActive':
      return { kind: 'authenticated', account: c.account };
    case 'NotFound':
      return { kind: 'rejected', code: 'AUTH_ACCOUNT_NOT_FOUND', alertAdmin: false };
    case 'Disabled':
      return { kind: 'rejected', code: 'AUTH_ACCOUNT_DISABLED', alertAdmin: false };
    case 'MultipleActive':
      // 對外不洩漏「命中多筆」，仍回 NOT_FOUND；但須告警系統管理員，且絕不任選一筆。
      return { kind: 'rejected', code: 'AUTH_ACCOUNT_NOT_FOUND', alertAdmin: true };
  }
}
