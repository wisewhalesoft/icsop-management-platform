import { DataSource } from 'typeorm';
import {
  AccountRepository,
  CurrentAccount,
  PasswordAuthAccount,
} from './account-repository';
import { normalizeEmail, ResolvableAccount } from './account-resolver';
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
          status: a.status,
          roleCode: a.roleCode,
          // org-foundation：身分快照欄位（每請求由 SessionGuard 填入 request-context）。
          orgCode: a.orgCode,
          name: a.name,
          employeeNo: a.employeeNo,
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
    if (!a) return null;
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
}
