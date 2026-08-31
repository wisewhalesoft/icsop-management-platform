import { DataSource } from 'typeorm';
import {
  JobPositionReadStore,
  JobPositionRecord,
} from './job-position-directory';
import { JobPosition } from '../database/entities/job-position.entity';

/**
 * 生產 JobPositionReadStore：讀 F004 已同步之 JOB_POSITION 對照主檔。
 *
 * 全表載入（實測 73 列，成本可忽略）。⚠ 解析端雖為「本公司精確命中」，此處仍取全表：
 * 帳號清單為**跨公司可見**（AC-P23a），逐列以該列自身之 companyCode 解析，
 * 若在此依操作者公司過濾，他公司帳號之職位會全部顯示「—」。
 */
export class TypeOrmJobPositionStore implements JobPositionReadStore {
  constructor(private readonly ds: DataSource) {}

  private async ensureInit(): Promise<DataSource> {
    if (!this.ds.isInitialized) await this.ds.initialize();
    return this.ds;
  }

  async listAll(): Promise<JobPositionRecord[]> {
    const ds = await this.ensureInit();
    const rows = await ds.getRepository(JobPosition).find();
    return rows.map((p) => ({
      companyCode: p.companyCode,
      code: p.code,
      name: p.name,
    }));
  }
}
