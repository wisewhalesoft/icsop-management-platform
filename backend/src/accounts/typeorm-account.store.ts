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
 * （與 auth/org-sync 同一連線）。
 *
 * 🔵 F003 AC-P23a（2026-08-14）：清單**不再**以操作者公司過濾——SysAdmin／ICSOPAdmin 為全域
 * 管理角色，非租戶隔離角色；公司篩選改由選填之 `filters.companyCode` 表達（AC-P23b）。
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
      jobTitleCode: a.jobTitleCode,
      roleCode: a.roleCode,
      status: a.status,
      source: a.source,
      disableReason: a.disableReason,
      lastLoginAt: a.lastLoginAt ? a.lastLoginAt.toISOString() : null,
      // F041：供前端角色指派 modal 預選現值（僅 roleCode='User' 時呈現，INV-2）。
      userSubtype: a.userSubtype,
      // F003 AC-P23c/d/e：清單跨公司可見後，公司/部門/職位名稱須以該列自身之公司解析。
      companyCode: a.companyCode,
    };
  }

  /**
   * 清單。⚠ 第一參數（操作者公司）**刻意不再用於過濾**（AC-P23a）；保留於簽章以維持
   * `AccountStore` 介面與既有呼叫慣例一致。租戶範圍改由 `f.companyCode`（選填）表達。
   */
  async list(_operatorCompany: string, f: AccountListFilters): Promise<AccountView[]> {
    const qb = (await this.repo()).createQueryBuilder('a').where('1 = 1');
    if (f.companyCode) qb.andWhere('a.companyCode = :cc', { cc: f.companyCode });
    if (f.source) qb.andWhere('a.source = :src', { src: f.source });
    if (f.roleCode) qb.andWhere('a.roleCode = :rc', { rc: f.roleCode });
    if (f.status) qb.andWhere('a.status = :st', { st: f.status });
    if (f.keyword) {
      qb.andWhere('(a.loginId LIKE :kw OR a.name LIKE :kw)', {
        kw: `%${f.keyword}%`,
      });
    }
    // 安全上限：前端以客端分頁（每頁 50）呈現，需一次取得符合篩選之全部列。
    // 5000 覆蓋現行規模（AS 約 1,114 帳號；AC-P23a 跨公司後仍僅 AS 有上游同步帳號）；
    // 若日後全部公司帳號合計超過此數，需改為後端分頁（skip/take + total）。
    qb.orderBy('a.status', 'ASC').addOrderBy('a.loginId', 'ASC').take(5000);
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

  /**
   * F003 AC-P24：`loginId` 是否已存在於**任一**公司（含上游同步帳號）。
   * ⚠ 應用層 read-then-write，並發下非絕對（DB 唯一鍵僅 per-company）——此限制為刻意接受，
   * 手動建帳為低頻管理操作，且 AC-P10a 為其安全網。
   */
  async existsLoginIdGlobal(loginId: string): Promise<boolean> {
    const n = await (await this.repo()).count({ where: { loginId } });
    return n > 0;
  }

  async create(input: CreateAccountInput): Promise<AccountView> {
    const repo = await this.repo();
    const entity = repo.create({
      companyCode: input.companyCode,
      loginId: input.loginId,
      name: input.name,
      roleCode: input.roleCode,
      // 🔴 手動建立＝管理員於建立當下即指派角色 ⇒ 一律 'manual'，同步之推導永不覆寫。
      roleSource: 'manual',
      passwordHash: input.passwordHash,
      // F003 AC-P1：部門／職位（已由服務層正規化，空字串不落地）。
      orgCode: input.orgCode ?? null,
      jobTitleCode: input.jobTitleCode ?? null,
      // F003 AC-U3：手動建立之預設子分類（entity 亦有 DB default 'other'，此處顯式寫入）。
      userSubtype: input.userSubtype ?? 'other',
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
