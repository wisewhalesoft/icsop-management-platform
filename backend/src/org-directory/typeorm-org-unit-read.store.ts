import { DataSource } from 'typeorm';
import { OrgUnitReadStore, OrgUnitRecord } from './org-unit-read';
import { OrgUnit } from '../database/entities/org-unit.entity';

/**
 * 生產 OrgUnitReadStore：讀 F004 已同步之 ORG_UNIT（含 descFull）。範圍限 companyCode（本輪 AS）。
 * 規模小（≤114 有效部門）→ listByCompany 一次載入，cascade/subtree/tree 由服務層純函式處理。
 */
export class TypeOrmOrgUnitReadStore implements OrgUnitReadStore {
  constructor(
    private readonly ds: DataSource,
    private readonly defaultCompany = 'AS',
  ) {}

  private async ensureInit(): Promise<DataSource> {
    if (!this.ds.isInitialized) await this.ds.initialize();
    return this.ds;
  }

  private toRecord(o: OrgUnit): OrgUnitRecord {
    return {
      companyCode: o.companyCode,
      orgCode: o.orgCode,
      codePrefix: o.codePrefix,
      parentCode: o.parentCode,
      tier: o.tier,
      name: o.name,
      descFull: o.descFull,
      managerEmpNo: o.managerEmpNo,
      isActive: o.isActive,
    };
  }

  async findByOrgCode(orgCode: string): Promise<OrgUnitRecord | null> {
    const ds = await this.ensureInit();
    const o = await ds
      .getRepository(OrgUnit)
      .findOne({ where: { companyCode: this.defaultCompany, orgCode } });
    return o ? this.toRecord(o) : null;
  }

  async listByCompany(
    companyCode: string,
    opts?: { includeInactive?: boolean },
  ): Promise<OrgUnitRecord[]> {
    const ds = await this.ensureInit();
    const where = opts?.includeInactive
      ? { companyCode }
      : { companyCode, isActive: true };
    const rows = await ds.getRepository(OrgUnit).find({ where });
    return rows.map((o) => this.toRecord(o));
  }
}
