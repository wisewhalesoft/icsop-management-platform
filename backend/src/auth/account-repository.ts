import { normalizeEmail, ResolvableAccount } from './account-resolver';

/**
 * SessionGuard 每請求即時把關所需之現行帳號狀態（來源真相＝DB）。
 * orgCode/name/employeeNo（org-foundation 擴充）：供 SessionGuard 填入 request-context 之
 * SessionUser（F019 置頂／F020 身分快照）。刻意選填（`?`）以相容既有測試替身（只回 status/roleCode）。
 */
export interface CurrentAccount {
  status: string; // active / disabled
  roleCode?: string;
  orgCode?: string | null; // ← ACCOUNT.orgCode（對應 ORG_UNIT.orgCode）
  name?: string | null; // ← ACCOUNT.name（USERNM）
  employeeNo?: string | null; // ← ACCOUNT.employeeNo（EMPNO）
}

/**
 * 帳密登入（途徑 B）解析所需之單一帳號快照。以 (companyCode, loginId) 唯一命中（PK 唯一，
 * 故至多一筆，無 email 路徑之 MultipleActive 問題）。含 passwordHash／source 供比對與「僅手動
 * 帳號可帳密登入」之判定；上游帳號 passwordHash 恆為 null（嚴禁保存密碼）。
 */
export interface PasswordAuthAccount {
  loginId: string;
  email: string | null;
  companyCode: string;
  status: 'active' | 'disabled';
  roleCode?: string;
  source: 'manual' | 'upstream';
  passwordHash: string | null;
}

/**
 * 帳號來源介面（解耦）。
 * - 現行：TypeOrmAccountRepository（真實 ACCOUNT 表）；SeedAccountRepository 保留供測試/spike。
 * - findByEmail：途徑 A（AD）登入解析用，回「同 email 之全部帳號」（含停用），交 classifyAccountByEmail 判定。
 * - findCurrentByLogin：SessionGuard 每請求以 (companyCode, loginId) 取現行 status/roleCode，
 *   達成停用即時失效（AC3/F005）與角色變更即時生效（US-006）。查無 → null。
 * - findByLoginId：途徑 B（帳密）登入解析用，以 (companyCode, loginId) 取含 passwordHash 之快照。
 *   查無 → null。（F001 途徑 B／F003 建立→登入閉環）
 */
export interface AccountRepository {
  findByEmail(email: string): Promise<ResolvableAccount[]>;
  findCurrentByLogin(
    companyCode: string,
    loginId: string,
  ): Promise<CurrentAccount | null>;
  findByLoginId(
    companyCode: string,
    loginId: string,
  ): Promise<PasswordAuthAccount | null>;
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

  findByLoginId(
    companyCode: string,
    loginId: string,
  ): Promise<PasswordAuthAccount | null> {
    const a = this.accounts.find(
      (x) => x.companyCode === companyCode && x.loginId === loginId,
    );
    // 種子帳號（peter）為 AD 身分，非手動帳密帳號 → source=upstream、passwordHash=null。
    return Promise.resolve(
      a
        ? {
            loginId: a.loginId,
            email: a.email,
            companyCode: a.companyCode,
            status: a.status,
            roleCode: a.roleCode,
            source: 'upstream',
            passwordHash: null,
          }
        : null,
    );
  }
}
