import { DataSource } from 'typeorm';
import {
  AccountRepository,
  CurrentAccount,
  PasswordAuthAccount,
} from './account-repository';
import { normalizeEmail, ResolvableAccount } from './account-resolver';
import { CandidateAccount } from './multi-account-picker';
import { Account } from '../database/entities/account.entity';

/**
 * 真實帳號來源（app MSSQL 之 ACCOUNT 表，由 F004 組織同步＋種子寫入）。
 * 取代 SeedAccountRepository，解掉 auth 先前之種子 gap。
 * - 沿用 AppDataSource 單例（與 OrgSyncModule 同一連線），延遲初始化。
 * - findByEmail 回傳同 email 之**全部帳號（含停用）**，由 classifyAccountByEmail 判定
 *   在職/停用/多筆；比對以 LOWER(email) 進行（不分大小寫，對應 §12.2）。
 */
export class TypeOrmAccountRepository implements AccountRepository {
  constructor(private readonly ds: DataSource) {}

  private async ensureInit(): Promise<DataSource> {
    if (!this.ds.isInitialized) await this.ds.initialize();
    return this.ds;
  }

  async findByEmail(email: string): Promise<ResolvableAccount[]> {
    const norm = normalizeEmail(email);
    if (norm === null) return [];
    const ds = await this.ensureInit();
    const rows = await ds
      .getRepository(Account)
      .createQueryBuilder('a')
      .where('LOWER(a.email) = :email', { email: norm })
      .getMany();
    return rows.map((a) => ({
      loginId: a.loginId,
      email: a.email,
      companyCode: a.companyCode,
      status: a.status === 'disabled' ? 'disabled' : 'active',
      roleCode: a.roleCode,
    }));
  }

  async findCurrentByLogin(
    companyCode: string,
    loginId: string,
  ): Promise<CurrentAccount | null> {
    const ds = await this.ensureInit();
    const a = await ds
      .getRepository(Account)
      .findOne({ where: { companyCode, loginId } });
    return a
      ? {
          id: a.id, // 稽核操作者鍵（accountId=uniqueidentifier）
          status: a.status,
          roleCode: a.roleCode,
          // org-foundation：身分快照欄位（每請求由 SessionGuard 填入 request-context）。
          orgCode: a.orgCode,
          name: a.name,
          employeeNo: a.employeeNo,
          // F041：一般使用者子分類（findOne 未指定 select，隨列一併取得，零額外查詢成本）。
          userSubtype: a.userSubtype,
        }
      : null;
  }

  /**
   * 途徑 B（帳密）登入解析：以 (companyCode, loginId) 取含 passwordHash 之單一帳號快照。
   * PK 唯一（UQ_ACCOUNT_company_login）故至多一筆。source/passwordHash 供「僅手動帳號可帳密登入」判定。
   */
  async findByLoginId(
    companyCode: string,
    loginId: string,
  ): Promise<PasswordAuthAccount | null> {
    const ds = await this.ensureInit();
    const a = await ds
      .getRepository(Account)
      .findOne({ where: { companyCode, loginId } });
    return a ? TypeOrmAccountRepository.toPasswordAuth(a) : null;
  }

  /** ACCOUNT 列 → 途徑 B 判定所需之快照（`findByLoginId` 與跨公司第②段共用同一組收斂規則）。 */
  private static toPasswordAuth(a: Account): PasswordAuthAccount {
    return {
      loginId: a.loginId,
      email: a.email,
      companyCode: a.companyCode,
      status: a.status === 'disabled' ? 'disabled' : 'active',
      roleCode: a.roleCode,
      source: a.source === 'manual' ? 'manual' : 'upstream',
      passwordHash: a.passwordHash,
    };
  }

  /**
   * F001 帳號選擇 delta（`AC-M1`〜`AC-M29`）：以 email 取回同 email 下全部帳號（含停用）之
   * 候選集合資料，供 `decideMultiAccountLogin()` 使用（含姓名一致判定所需之 `name`）。
   * 查詢方式與 `findByEmail` 相同（LOWER(email) 比對），僅多帶 `accountId`／`name`／`orgCode`。
   */
  async findCandidatesByEmail(email: string): Promise<CandidateAccount[]> {
    const norm = normalizeEmail(email);
    if (norm === null) return [];
    const ds = await this.ensureInit();
    const rows = await ds
      .getRepository(Account)
      .createQueryBuilder('a')
      .where('LOWER(a.email) = :email', { email: norm })
      .getMany();
    return rows.map((a) => ({
      accountId: a.id,
      loginId: a.loginId,
      email: a.email,
      companyCode: a.companyCode,
      orgCode: a.orgCode,
      roleCode: a.roleCode,
      status: a.status === 'disabled' ? 'disabled' : 'active',
      name: a.name,
    }));
  }

  /**
   * F001 AC-C1 第②段（跨公司解析）：以 loginId 取回**全部公司**之候選快照。
   * DB 唯一鍵為 (companyCode, loginId)＝per-company，故此處可能多筆（歷史／上游資料）；
   * 是否採用交呼叫端依「恰一筆」判定（多筆一律拒絕，不任選）。
   */
  async findByLoginIdAnyCompany(loginId: string): Promise<PasswordAuthAccount[]> {
    const ds = await this.ensureInit();
    const rows = await ds.getRepository(Account).find({ where: { loginId } });
    return rows.map((a) => TypeOrmAccountRepository.toPasswordAuth(a));
  }

  /**
   * 成功登入時間戳（GATE 決策 #2）：以 (companyCode, loginId) 更新 lastLoginAt。
   * 查無帳號 → update 影響 0 列（no-op），不拋錯。
   */
  async markLoggedIn(
    companyCode: string,
    loginId: string,
    at: Date,
  ): Promise<void> {
    const ds = await this.ensureInit();
    await ds
      .getRepository(Account)
      .update({ companyCode, loginId }, { lastLoginAt: at });
  }
}
