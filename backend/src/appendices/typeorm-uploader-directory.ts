import { DataSource, In } from 'typeorm';
import { Account } from '../database/entities/account.entity';
import { UploaderDirectory, UploaderInfo } from './appendices.store';

/**
 * `ACCOUNT.id` 為 MSSQL `uniqueidentifier`：以非 GUID 值（'unknown' 字面、legacy 上傳者）
 * 餵入 `IN` 查詢會拋「Validation failed for parameter: Invalid GUID」→ 整頁 overview 500。
 * 故於查詢前濾除非 GUID 值——其對應 uploadedByName/Dept 自然留 null，端點恆 200。
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 上傳者名冊之 TypeORM 實作：以 accountId 批次讀 ACCOUNT（name + orgCode）。
 * architecture-spec §3.6 決策一：**複製**（非跨模組匯入 usage-forms 內部檔案），
 * 維持 §3.1「模組間不互相匯入業務模組內部檔案」原則。
 * 反循環：不匯入 accounts 模組，自建 adapter 讀 ACCOUNT 實體（AppDataSource 單例、延遲初始化）。
 */
export class TypeOrmUploaderDirectory implements UploaderDirectory {
  constructor(private readonly ds: DataSource) {}

  private async init(): Promise<DataSource> {
    if (!this.ds.isInitialized) await this.ds.initialize();
    return this.ds;
  }

  async resolveUploaders(accountIds: string[]): Promise<Map<string, UploaderInfo>> {
    const ids = [...new Set(accountIds.filter((x) => !!x && UUID_RE.test(x)))];
    if (ids.length === 0) return new Map();
    const ds = await this.init();
    const rows = await ds
      .getRepository(Account)
      .find({ where: { id: In(ids) }, select: { id: true, name: true, orgCode: true } });
    return new Map(rows.map((r) => [r.id, { name: r.name, orgCode: r.orgCode }]));
  }
}
