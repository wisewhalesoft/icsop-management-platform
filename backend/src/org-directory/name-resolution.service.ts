import { Inject, Injectable } from '@nestjs/common';
import { PERSON_STORE, PersonStore } from './person-directory';
import { ORG_UNIT_READ_STORE, OrgUnitReadStore, OrgUnitRecord } from './org-unit-read';
import { departmentCodeOf, orgUnitDisplayName } from './org-path';

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
   * orgId → **`制定部門`／`制定室別` 欄之顯示名**（部＝`DESC_FULL` 全名；處/室＝`DESC_CHI` 末段）。
   * 查無 → null。規則與理由見 `org-path.ts#orgUnitDisplayName`（2026-09-04 定案）。
   *
   * 🔴 **刻意與 `resolveOrgUnitName()` 併存、不合併**：後者回傳 `ORG_UNIT.name` 原字串，仍為
   * 上傳者所屬部門（F018／F039 之 `uploadedByDept`）與 F042 已完成 OJT 單位清單之來源。那些欄
   * 呈現的是「某人／某單位自己登記的名字」，與制定組織欄之取捨不同一件事；把兩者合流會讓
   * 一次改動同時波及四個 feature 的顯示。
   */
  async resolveOrgUnitDisplayName(
    companyCode: string,
    orgCode: string,
  ): Promise<string | null> {
    const u = await this.orgUnits.findByOrgCode(companyCode, orgCode);
    if (!u) return null;
    /**
     * 處/室、課才需要部層之 `descFull`（用於自 `DESC_FULL` 切除前綴）；部層以上只看自己，
     * 不多打這一次查詢。查無部層列 → 傳回 `null`，純函式自動退回 `DESC_CHI` 末段
     * （真庫實測：`AS/WAA00 職安室` 即無部層列，仍正確顯示）。
     */
    const deptCode = departmentCodeOf(orgCode);
    const dept =
      (u.tier === 'SECTION' || u.tier === 'SUBSECTION') && deptCode !== orgCode
        ? await this.orgUnits.findByOrgCode(companyCode, deptCode)
        : null;
    return orgUnitDisplayName(u, (code) => (code === deptCode ? dept : null));
  }

  /**
   * 該公司之**全部**組織單位（`ARCH-UX2`／architecture-spec §16.2）。
   *
   * 🔴 **為何需要「整家公司」而非既有之逐代碼點查**：本部之解析要沿 `parentCode` **上溯**
   * （`org-division.ts#divisionOf`），中繼祖先不一定落在呼叫端手上那批 `orgKeys` 之內——
   * 兩者是不同形狀的查詢，既有 `resolveOrgUnitDisplayName()` 之批次點查兌現不了。
   *
   * 🔒 單純 passthrough 至既有 `ORG_UNIT_READ_STORE.listByCompany()`，**不新增快取**：
   * `ORG_UNIT` 為有界集合（四家合計數百列），清單請求最多命中 4 家公司；加 TTL 快取只是
   * 多一個「何時失效」的維度，本輪測不到也不需要。
   *
   * 🔴 上溯與顯示名之組裝**一律留在服務層**（純函式），不搬進本服務——本服務之既有職責是
   * **資料存取**；把分類邏輯塞進 IO 服務，會讓其固定向量測試被迫改寫成需要 mock DB 的形式。
   */
  async listOrgUnitsByCompany(companyCode: string): Promise<OrgUnitRecord[]> {
    return this.orgUnits.listByCompany(companyCode);
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
