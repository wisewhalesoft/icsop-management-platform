import { ChangeValueNamesService } from './change-value-names';
import { companyKey } from './change-value-display';
import { OrgUnitReadStore, OrgUnitRecord } from '../org-directory/org-unit-read';
import { NameResolutionService } from '../org-directory/name-resolution.service';
import { LifecycleDisplayNames } from './lifecycle-display-names';
import { DocumentNameLookup } from './document-name-lookup';

/** 🔴 2026-10-05 delta：代碼 → 名稱回查之 IO 協作（含停用單位、依公司分批查人）。 */

function unit(over: Partial<OrgUnitRecord>): OrgUnitRecord {
  return {
    companyCode: 'AS',
    orgCode: 'JA000',
    codePrefix: 'JA',
    parentCode: null,
    tier: 'DEPARTMENT',
    name: '營管部',
    descFull: '營運管理部',
    managerEmpNo: null,
    isActive: true,
    ...over,
  };
}

describe('ChangeValueNamesService', () => {
  const listCalls: Array<{ company: string; includeInactive?: boolean }> = [];
  const orgUnits = {
    listByCompany: (company: string, opts?: { includeInactive?: boolean }) => {
      listCalls.push({ company, includeInactive: opts?.includeInactive });
      return Promise.resolve(
        company === 'AS'
          ? [
              unit({}),
              unit({ orgCode: 'JAC00', tier: 'SECTION', name: '營管部/審查室', descFull: '營運管理部審查室', parentCode: 'JA000' }),
              unit({ orgCode: 'XX000', name: '已裁撤部', descFull: '已裁撤部', isActive: false }),
            ]
          : [unit({ companyCode: 'AD', orgCode: 'JA000', descFull: '和潤興業管理部' })],
      );
    },
  } as unknown as OrgUnitReadStore;
  const personCalls: Array<[string, string[]]> = [];
  const names = {
    resolvePersonNames: (company: string, emps: string[]) => {
      personCalls.push([company, emps]);
      return Promise.resolve(new Map(company === 'AS' ? [['20053', '周家宏']] : [['20053', '林另一人']]));
    },
  } as unknown as NameResolutionService;
  const lifecycles: LifecycleDisplayNames = {
    findDisplayNamesByIds: (ids) => Promise.resolve(new Map(ids.map((id) => [id, `循環-${id}`]))),
  };
  const docs: DocumentNameLookup = {
    findNamesByIds: () => Promise.resolve(new Map()),
    findCompanyCodesByIds: (ids) => Promise.resolve(new Map(ids.map((id) => [id, 'AS']))),
  };

  it('組織：含停用單位、處室名稱以部層全名切前綴；兩家公司各自成鍵', async () => {
    const svc = new ChangeValueNamesService(docs, orgUnits, names, lifecycles);
    const maps = await svc.resolve({
      orgCompanies: new Set(['AS', 'AD']),
      persons: new Map(),
      lifecycleIds: new Set(),
    });
    expect(listCalls.every((c) => c.includeInactive === true)).toBe(true);
    expect(maps.org.get(companyKey('AS', 'JAC00'))).toBe('審查室');
    expect(maps.org.get(companyKey('AS', 'XX000'))).toBe('已裁撤部');
    expect(maps.org.get(companyKey('AS', 'JA000'))).toBe('營運管理部');
    expect(maps.org.get(companyKey('AD', 'JA000'))).toBe('和潤興業管理部');
  });

  it('人員：依公司分批查、鍵含公司（同員編兩家不同人）', async () => {
    const svc = new ChangeValueNamesService(docs, orgUnits, names, lifecycles);
    const maps = await svc.resolve({
      orgCompanies: new Set(),
      persons: new Map([
        ['AS', new Set(['20053'])],
        ['AD', new Set(['20053'])],
      ]),
      lifecycleIds: new Set(['lc1']),
    });
    expect(personCalls).toEqual([
      ['AS', ['20053']],
      ['AD', ['20053']],
    ]);
    expect(maps.person.get(companyKey('AS', '20053'))).toBe('周家宏');
    expect(maps.person.get(companyKey('AD', '20053'))).toBe('林另一人');
    expect(maps.lifecycle.get('lc1')).toBe('循環-lc1');
  });

  it('文件公司：委派 DocumentNameLookup.findCompanyCodesByIds；未提供該方法 ⇒ 空', async () => {
    const svc = new ChangeValueNamesService(docs, orgUnits, names, lifecycles);
    expect((await svc.documentCompanies(['d1'])).get('d1')).toBe('AS');
    const bare = new ChangeValueNamesService({ findNamesByIds: docs.findNamesByIds }, orgUnits, names, lifecycles);
    expect((await bare.documentCompanies(['d1'])).size).toBe(0);
  });
});
