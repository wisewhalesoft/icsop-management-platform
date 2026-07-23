import { DataSource, In } from 'typeorm';
import { PersonRecord, PersonStore } from './person-directory';
import { Account } from '../database/entities/account.entity';
import { chunkByParamBudget } from '../org-sync/param-batching';

/**
 * 生產 PersonStore：直接讀 ACCOUNT（不另建 PERSON 表——ACCOUNT 已同步全體在職 AS 員工，
 * 離職者保留為 status='disabled'）。範圍限 companyCode（本輪 AS）。
 *
 * ⚠ AS 之 EMPNO（employeeNo）非唯一（一人多帳號）→ 單筆解析時以「在職優先、其次 upstreamModifiedAt
 *   由新到舊」取一列（同一員編各列姓名一致，取任一皆正確）。
 * ⚠ MSSQL 2100 參數上限：批次 IN 以 chunkByParamBudget 切批（單欄 IN，每批 ≤1000）。
 */
export class TypeOrmPersonStore implements PersonStore {
  constructor(
    private readonly ds: DataSource,
    private readonly companyCode = 'AS',
  ) {}

  private async ensureInit(): Promise<DataSource> {
    if (!this.ds.isInitialized) await this.ds.initialize();
    return this.ds;
  }

  private toRecord(a: Account): PersonRecord {
    return {
      employeeNo: a.employeeNo ?? '',
      name: a.name,
      orgCode: a.orgCode,
      employmentStatus: a.status === 'disabled' ? 'departed' : 'active',
    };
  }

  async findByEmployeeNo(employeeNo: string): Promise<PersonRecord | null> {
    const key = employeeNo.trim();
    if (key.length === 0) return null;
    const ds = await this.ensureInit();
    const rows = await ds
      .getRepository(Account)
      .createQueryBuilder('a')
      .where('a.companyCode = :c AND a.employeeNo = :e', {
        c: this.companyCode,
        e: key,
      })
      // 在職優先（status='active' 排前），其次上游異動時間由新到舊。
      .orderBy("CASE WHEN a.status = 'active' THEN 0 ELSE 1 END", 'ASC')
      .addOrderBy('a.upstreamModifiedAt', 'DESC')
      .getMany();
    return rows.length > 0 ? this.toRecord(rows[0]) : null;
  }

  async findByEmployeeNos(
    employeeNos: string[],
  ): Promise<Map<string, PersonRecord>> {
    const keys = [...new Set(employeeNos.map((e) => e.trim()).filter(Boolean))];
    const out = new Map<string, PersonRecord>();
    if (keys.length === 0) return out;
    const ds = await this.ensureInit();
    const repo = ds.getRepository(Account);
    // 單欄 IN → 每列 1 參數；切批 ≤1000 遠低於 2100 上限。
    for (const batch of chunkByParamBudget(
      keys.map((k) => ({ k })),
      1,
      1000,
    )) {
      const rows = await repo.find({
        where: {
          companyCode: this.companyCode,
          employeeNo: In(batch.map((b) => b.k)),
        },
      });
      for (const a of rows) {
        const rec = this.toRecord(a);
        const existing = out.get(rec.employeeNo);
        // 在職優先：若已有離職者記錄、後來遇到在職者則覆蓋。
        if (
          !existing ||
          (existing.employmentStatus === 'departed' &&
            rec.employmentStatus === 'active')
        ) {
          out.set(rec.employeeNo, rec);
        }
      }
    }
    return out;
  }

  async searchActive(keyword: string, limit = 20): Promise<PersonRecord[]> {
    const kw = keyword.trim();
    const ds = await this.ensureInit();
    const qb = ds
      .getRepository(Account)
      .createQueryBuilder('a')
      .where('a.companyCode = :c AND a.status = :s', {
        c: this.companyCode,
        s: 'active',
      });
    if (kw.length > 0) {
      // LIKE 前綴/含子字串比對，跳脫 % _；ESCAPE '\'。
      const esc = kw.replace(/[%_\\]/g, (m) => `\\${m}`);
      qb.andWhere(
        "(a.name LIKE :kw ESCAPE '\\' OR a.employeeNo LIKE :kw ESCAPE '\\')",
        { kw: `%${esc}%` },
      );
    }
    const rows = await qb.take(limit).getMany();
    return rows.map((a) => this.toRecord(a));
  }
}
