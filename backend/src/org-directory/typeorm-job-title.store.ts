import { DataSource } from 'typeorm';
import { JobTitleReadStore, JobTitleRecord } from './job-title-directory';
import { JobTitle } from '../database/entities/job-title.entity';

/**
 * 生產 JobTitleReadStore：讀 F004 已同步之 JOB_TITLE 對照主檔。
 *
 * ⚠ 刻意**不以 companyCode 過濾**：解析採「本公司優先、查無再跨公司 fallback」
 * （見 job-title-directory），過濾後即無法補齊本公司主檔缺漏之代碼。
 * 全表實測 109 列，一次載入成本可忽略。
 */
export class TypeOrmJobTitleStore implements JobTitleReadStore {
  constructor(private readonly ds: DataSource) {}

  private async ensureInit(): Promise<DataSource> {
    if (!this.ds.isInitialized) await this.ds.initialize();
    return this.ds;
  }

  async listAll(): Promise<JobTitleRecord[]> {
    const ds = await this.ensureInit();
    const rows = await ds.getRepository(JobTitle).find();
    return rows.map((t) => ({
      companyCode: t.companyCode,
      code: t.code,
      name: t.name,
    }));
  }
}
