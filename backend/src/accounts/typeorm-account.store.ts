import { DataSource } from 'typeorm';
import { Account } from '../database/entities/account.entity';
import {
  AccountStore,
  AccountListFilters,
  AccountView,
  AccountRecord,
  CreateAccountInput,
  UpdateAccountPatch,
} from './accounts.store';

/**
 * 帳號管理 store 之 TypeORM 實作（app MSSQL 之 ACCOUNT 表）。沿用 AppDataSource 單例、延遲初始化
 * （與 auth/org-sync 同一連線）。company 範圍由呼叫端帶入（MVP 限操作者公司 AS）。
 */
export class TypeOrmAccountStore implements AccountStore {
  constructor(private readonly ds: DataSource) {}

  private async repo() {
    if (!this.ds.isInitialized) await this.ds.initialize();
    return this.ds.getRepository(Account);
  }

  private static toView(a: Account): AccountView {
    return {
      id: a.id,
      loginId: a.loginId,
      employeeNo: a.employeeNo,
      name: a.name,
      email: a.email,
      orgCode: a.orgCode,
      roleCode: a.roleCode,
      status: a.status,
      source: a.source,
      disableReason: a.disableReason,
    };
  }

  async list(companyCode: string, f: AccountListFilters): Promise<AccountView[]> {
    const qb = (await this.repo())
      .createQueryBuilder('a')
      .where('a.companyCode = :cc', { cc: companyCode });
    if (f.source) qb.andWhere('a.source = :src', { src: f.source });
    if (f.roleCode) qb.andWhere('a.roleCode = :rc', { rc: f.roleCode });
    if (f.status) qb.andWhere('a.status = :st', { st: f.status });
    if (f.keyword) {
      qb.andWhere('(a.loginId LIKE :kw OR a.name LIKE :kw)', {
        kw: `%${f.keyword}%`,
      });
    }
    qb.orderBy('a.status', 'ASC').addOrderBy('a.loginId', 'ASC').take(500);
    const rows = await qb.getMany();
    return rows.map(TypeOrmAccountStore.toView);
  }

  async findById(id: string): Promise<AccountRecord | null> {
    const a = await (await this.repo()).findOne({ where: { id } });
    if (!a) return null;
    return { ...TypeOrmAccountStore.toView(a), companyCode: a.companyCode };
  }

  async existsLoginId(companyCode: string, loginId: string): Promise<boolean> {
    const n = await (await this.repo()).count({ where: { companyCode, loginId } });
    return n > 0;
  }

  async create(input: CreateAccountInput): Promise<AccountView> {
    const repo = await this.repo();
    const entity = repo.create({
      companyCode: input.companyCode,
      loginId: input.loginId,
      name: input.name,
      roleCode: input.roleCode,
      passwordHash: input.passwordHash,
      source: 'manual',
      status: 'active',
    });
    const saved = await repo.save(entity);
    return TypeOrmAccountStore.toView(saved);
  }

  async updateById(id: string, patch: UpdateAccountPatch): Promise<AccountView> {
    const repo = await this.repo();
    await repo.update({ id }, patch);
    const a = await repo.findOneOrFail({ where: { id } });
    return TypeOrmAccountStore.toView(a);
  }
}
