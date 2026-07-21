import { normalizeEmail, ResolvableAccount } from './account-resolver';

/**
 * 帳號來源介面（解耦）。
 * - 現行：SeedAccountRepository（種子，spike/開發用）
 * - 未來：F004 組織同步寫入之本地 `ACCOUNT` 表（MSSQL）之實作
 * findByEmail 回傳「同 email 之全部帳號」（含停用），由 classifyAccountByEmail 判定在職/停用/多筆。
 */
export interface AccountRepository {
  findByEmail(email: string): Promise<ResolvableAccount[]>;
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
}
