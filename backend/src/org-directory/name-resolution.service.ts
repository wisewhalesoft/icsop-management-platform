import { Inject, Injectable } from '@nestjs/common';
import { PERSON_STORE, PersonStore } from './person-directory';
import { ORG_UNIT_READ_STORE, OrgUnitReadStore } from './org-unit-read';

/** 組織路徑分隔符（OQ-NAMERES-1 暫定 '/'；與契約 §8.2 浮水印「處/室」切分一致）。 */
export const ORG_PATH_SEPARATOR = '/';

/**
 * 共用名稱解析服務（org-foundation）。供 F014（當責室長顯示）、F017（清單室長欄）、public、
 * doc-edit、F037（變更歷程快照）等模組重用，避免各自查詢/組字。
 *
 * 設計原則：
 *  - 所有方法單次 await 即回（TS-NAMERES-012：適合交易內同步呼叫，非需排入非同步佇列）。
 *  - 查無一律回明確「找不到」值（null），不拋未捕捉例外（TS-NAMERES-003/008）。
 *  - 離職人員仍可被單筆解析（TS-NAMERES-002；供歷史文件顯示既有室長）。
 */
@Injectable()
export class NameResolutionService {
  constructor(
    @Inject(PERSON_STORE) private readonly persons: PersonStore,
    @Inject(ORG_UNIT_READ_STORE) private readonly orgUnits: OrgUnitReadStore,
  ) {}

  /**
   * employeeNo → 姓名。查無 / 無姓名 → null。
   * 🔴 B 階段（多公司）：`companyCode` 為必要參數——`employeeNo` 僅在單一公司內唯一，
   * 見 `PersonStore` 介面 JSDoc。
   */
  async resolvePersonName(
    companyCode: string,
    employeeNo: string,
  ): Promise<string | null> {
    const p = await this.persons.findByEmployeeNo(companyCode, employeeNo);
    return p ? p.name : null;
  }

  /**
   * 批次 employeeNo → 姓名。回 Map<employeeNo, name>：僅含命中且有姓名者；
   * 未命中/無姓名鍵**缺席**於 Map（呼叫端可 `map.get(id) ?? fallback`）。避免 F017 N+1。
   */
  async resolvePersonNames(
    companyCode: string,
    employeeNos: string[],
  ): Promise<Map<string, string>> {
    const found = await this.persons.findByEmployeeNos(companyCode, employeeNos);
    const out = new Map<string, string>();
    for (const [empNo, rec] of found) {
      if (rec.name !== null) out.set(empNo, rec.name);
    }
    return out;
  }

  /**
   * orgId → 單層名稱（DESC_CHI）。查無 → null。
   * 🔴 B 階段（多公司）：`companyCode` 為必要參數——`orgCode` 各公司獨立編碼、字串可能相同，
   * 見 `OrgUnitReadStore.findByOrgCode` JSDoc。
   */
  async resolveOrgUnitName(
    companyCode: string,
    orgCode: string,
  ): Promise<string | null> {
    const u = await this.orgUnits.findByOrgCode(companyCode, orgCode);
    return u ? u.name : null;
  }

  /**
   * orgId → 由 Root 至該單位之完整路徑（各層 name 以 separator 連接）。
   * 起點查無 → null；上層鏈中途斷（如已關部門）→ 以已取得部分為準（不整段作廢）。
   * 循環守衛：以 seen 集合避免資料異常造成無窮迴圈。含全部層級（不假設固定 4 層，TS-NAMERES-009）。
   */
  async resolveOrgUnitPath(
    companyCode: string,
    orgCode: string,
    separator: string = ORG_PATH_SEPARATOR,
  ): Promise<string | null> {
    const chain: string[] = [];
    const seen = new Set<string>();
    let code: string | null = orgCode;
    let first = true;
    while (code !== null) {
      if (seen.has(code)) break;
      seen.add(code);
      const u = await this.orgUnits.findByOrgCode(companyCode, code);
      if (u === null) {
        if (first) return null;
        break;
      }
      chain.push(u.name);
      code = u.parentCode;
      first = false;
    }
    return chain.length === 0 ? null : chain.reverse().join(separator);
  }
}
