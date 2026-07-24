import { DataSource, In } from 'typeorm';
import { Account } from '../database/entities/account.entity';
import { UploaderDirectory, UploaderInfo } from './usage-forms.store';

/**
 * G-ADM-024 上傳者名冊之 TypeORM 實作：以 accountId 批次讀 ACCOUNT（name + orgCode）。
 * 反循環：不匯入 accounts 模組，自建 adapter 讀 ACCOUNT 實體（AppDataSource 單例、延遲初始化）。
 */
export class TypeOrmUploaderDirectory implements UploaderDirectory {
  constructor(private readonly ds: DataSource) {}

  private async init(): Promise<DataSource> {
    if (!this.ds.isInitialized) await this.ds.initialize();
    return this.ds;
  }

  async resolveUploaders(accountIds: string[]): Promise<Map<string, UploaderInfo>> {
    const ids = [...new Set(accountIds.filter(Boolean))];
    if (ids.length === 0) return new Map();
    const ds = await this.init();
    const rows = await ds
      .getRepository(Account)
      .find({ where: { id: In(ids) }, select: { id: true, name: true, orgCode: true } });
    return new Map(rows.map((r) => [r.id, { name: r.name, orgCode: r.orgCode }]));
  }
}
