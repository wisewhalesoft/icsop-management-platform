import { orgUnitDisplayName } from '../org-directory/org-path';
import { OrgUnitReadStore } from '../org-directory/org-unit-read';
import { NameResolutionService } from '../org-directory/name-resolution.service';
import { LifecycleDisplayNames } from './lifecycle-display-names';
import { DocumentNameLookup } from './document-name-lookup';
import { ChangeValueNameMaps, NameRequests, companyKey } from './change-value-display';

/**
 * 🔴 2026-10-05 delta：文件變更歷程代碼 → 名稱之回查（見 change-value-display）。
 * 以獨立 token 注入，使 `DocumentChangeHistoryService` 之既有純建構單測不受影響。
 */
export const CHANGE_VALUE_NAMES = Symbol('CHANGE_VALUE_NAMES');

export interface ChangeValueNames {
  /** documentId → 文件目前之公司別（查無 ⇒ 缺席）。 */
  documentCompanies(documentIds: string[]): Promise<Map<string, string>>;
  resolve(req: NameRequests): Promise<ChangeValueNameMaps>;
}

export class ChangeValueNamesService implements ChangeValueNames {
  constructor(
    private readonly docs: DocumentNameLookup,
    private readonly orgUnits: OrgUnitReadStore,
    private readonly names: NameResolutionService,
    private readonly lifecycles: LifecycleDisplayNames,
  ) {}

  async documentCompanies(documentIds: string[]): Promise<Map<string, string>> {
    if (documentIds.length === 0 || !this.docs.findCompanyCodesByIds) return new Map();
    return this.docs.findCompanyCodesByIds(documentIds);
  }

  async resolve(req: NameRequests): Promise<ChangeValueNameMaps> {
    const org = new Map<string, string>();
    for (const company of req.orgCompanies) {
      // 含停用單位：變更歷程記的是當時之部門，事後裁撤者仍須顯示名稱。
      const units = await this.orgUnits.listByCompany(company, { includeInactive: true });
      const byCode = new Map(units.map((u) => [u.orgCode, u]));
      for (const u of units) {
        const label = orgUnitDisplayName(u, (code) => byCode.get(code) ?? null);
        if (label) org.set(companyKey(company, u.orgCode), label);
      }
    }
    const person = new Map<string, string>();
    for (const [company, emps] of req.persons) {
      const found = await this.names.resolvePersonNames(company, [...emps]);
      for (const [emp, name] of found) person.set(companyKey(company, emp), name);
    }
    const lifecycle =
      req.lifecycleIds.size > 0
        ? await this.lifecycles.findDisplayNamesByIds([...req.lifecycleIds])
        : new Map<string, string>();
    return { org, person, lifecycle };
  }
}
