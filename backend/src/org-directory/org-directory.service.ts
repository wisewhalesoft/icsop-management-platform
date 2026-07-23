import { Inject, Injectable } from '@nestjs/common';
import { PERSON_STORE, PersonRecord, PersonStore } from './person-directory';
import {
  ORG_UNIT_READ_STORE,
  OrgTreeNode,
  OrgUnitReadStore,
  OrgUnitRecord,
  buildOrgTree,
  directChildren,
  filterSubtree,
} from './org-unit-read';

export interface OrgReadOptions {
  includeInactive?: boolean;
}

/**
 * 組織/人員讀取端點之編排服務（org-foundation）。
 * ORG_UNIT 由 F004 同步、PERSON 由 ACCOUNT 提供；本服務僅讀取（list/tree/cascade/subtree、人員搜尋）。
 * 規模小（≤114 組織 / ≤1,114 在職人員）→ 以「載入該公司 + 記憶體純函式」實作，天然免 SQL 注入；
 * SQL index-seek 下推屬 [integration]（TS-ORGREAD-013，本輪 defer）。
 */
@Injectable()
export class OrgDirectoryService {
  constructor(
    @Inject(ORG_UNIT_READ_STORE) private readonly orgUnits: OrgUnitReadStore,
    @Inject(PERSON_STORE) private readonly persons: PersonStore,
  ) {}

  /** list：依 companyCode 取全部（預設僅 active，5 層俱全）。 */
  listOrgUnits(
    companyCode: string,
    opts: OrgReadOptions = {},
  ): Promise<OrgUnitRecord[]> {
    return this.orgUnits.listByCompany(companyCode, opts);
  }

  /** cascade：依上層 orgCode 回直屬子層（查無 → []）。 */
  async orgUnitChildren(
    parentCode: string,
    opts: OrgReadOptions = {},
    companyCode = 'AS',
  ): Promise<OrgUnitRecord[]> {
    const all = await this.orgUnits.listByCompany(companyCode, opts);
    return directChildren(all, parentCode);
  }

  /** subtree：codePrefix 前綴展開（空前綴 → 全域）。 */
  async orgUnitSubtree(
    companyCode: string,
    codePrefix: string,
    opts: OrgReadOptions = {},
  ): Promise<OrgUnitRecord[]> {
    const all = await this.orgUnits.listByCompany(companyCode, opts);
    return filterSubtree(all, codePrefix);
  }

  /** tree：依 parentCode 巢狀樹（供三級呈現，公司層由 COMPANY 靜態名另行包裝，不混入本結構）。 */
  async orgUnitTree(
    companyCode: string,
    opts: OrgReadOptions = {},
  ): Promise<OrgTreeNode[]> {
    const all = await this.orgUnits.listByCompany(companyCode, opts);
    return buildOrgTree(all);
  }

  /** 單筆人員解析（含離職者，供歷史顯示）。查無 → null。 */
  getPerson(employeeNo: string): Promise<PersonRecord | null> {
    return this.persons.findByEmployeeNo(employeeNo);
  }

  /** 人員搜尋（僅在職者，供 F014 當責室長候選）。 */
  searchActivePersons(keyword: string, limit?: number): Promise<PersonRecord[]> {
    return this.persons.searchActive(keyword, limit);
  }
}
