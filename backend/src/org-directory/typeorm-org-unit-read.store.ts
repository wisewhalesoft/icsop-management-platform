import { DataSource } from 'typeorm';
import { OrgUnitReadStore, OrgUnitRecord } from './org-unit-read';
import { OrgUnit } from '../database/entities/org-unit.entity';

/**
 * 生產 OrgUnitReadStore：讀 F004 已同步之 ORG_UNIT（含 descFull）。
 * 規模小（單一公司 ≤114 有效部門）→ listByCompany 一次載入，cascade/subtree/tree 由服務層純函式處理。
 *
 * 🔴 B 階段（多公司）：移除建構子之 `defaultCompany='AS'`。該預設值使全部呼叫端沉默地只查 AS，
 * 是「AD/AE/AJ 部門一律查無、或代碼碰撞時顯示錯誤公司之部門」這條缺陷鏈的根因（見
 * `OrgUnitReadStore.findByOrgCode` 之 JSDoc）。公司別一律由呼叫端明確傳入。
 */
export class TypeOrmOrgUnitReadStore implements OrgUnitReadStore {
  constructor(private readonly ds: DataSource) {}

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

  async findByOrgCode(
    companyCode: string,
    orgCode: string,
  ): Promise<OrgUnitRecord | null> {
    const ds = await this.ensureInit();
    const o = await ds
      .getRepository(OrgUnit)
      .findOne({ where: { companyCode, orgCode } });
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
