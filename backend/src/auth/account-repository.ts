import { normalizeEmail, ResolvableAccount } from './account-resolver';

/** SessionGuard 每請求即時把關所需之現行帳號狀態（來源真相＝DB）。 */
export interface CurrentAccount {
  status: string; // active / disabled
  roleCode?: string;
}

/**
 * 帳號來源介面（解耦）。
 * - 現行：TypeOrmAccountRepository（真實 ACCOUNT 表）；SeedAccountRepository 保留供測試/spike。
 * - findByEmail：登入解析用，回「同 email 之全部帳號」（含停用），交 classifyAccountByEmail 判定。
 * - findCurrentByLogin：SessionGuard 每請求以 (companyCode, loginId) 取現行 status/roleCode，
 *   達成停用即時失效（AC3/F005）與角色變更即時生效（US-006）。查無 → null。
 */
export interface AccountRepository {
  findByEmail(email: string): Promise<ResolvableAccount[]>;
  findCurrentByLogin(
    companyCode: string,
    loginId: string,
  ): Promise<CurrentAccount | null>;
}

export const ACCOUNT_REPOSITORY = Symbol('ACCOUNT_REPOSITORY');

/** ⚠️ 種子實作。F004 組織同步就緒後改接真實 ACCOUNT 表（見 upstream-hr-source-contract.md §12.2）。 */
export class SeedAccountRepository implements AccountRepository {
  private readonly accounts: ResolvableAccount[] = [
    // 真實登入者（AS 和潤企業），刻意存小寫以驗證大小寫不敏感比對。
    {
      loginId: 'peter',
      email: 'peter@hfcfinance.com.tw',
      companyCode: 'AS',
      status: 'active',
      roleCode: 'ICSOPAdmin',
    },
  ];

  findByEmail(email: string): Promise<ResolvableAccount[]> {
    const norm = normalizeEmail(email);
    return Promise.resolve(
      this.accounts.filter((a) => normalizeEmail(a.email) === norm),
    );
  }

  findCurrentByLogin(
    companyCode: string,
    loginId: string,
  ): Promise<CurrentAccount | null> {
    const a = this.accounts.find(
      (x) => x.companyCode === companyCode && x.loginId === loginId,
    );
    return Promise.resolve(
      a ? { status: a.status, roleCode: a.roleCode } : null,
    );
  }
}
