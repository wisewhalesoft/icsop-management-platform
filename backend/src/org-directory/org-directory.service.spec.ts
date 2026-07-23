import { OrgDirectoryService } from './org-directory.service';
import {
  OrgUnitRecord,
  OrgUnitReadStore,
  directChildren,
  filterSubtree,
  escapeLikePrefix,
  buildOrgTree,
} from './org-unit-read';
import { PersonRecord, PersonStore } from './person-directory';

/**
 * ORG_UNIT 讀取端點邏輯 + PERSON 讀取（org-foundation）。
 * 對應 ORG-read-endpoints-test.md（TS-ORGREAD-001~008）與 ORG-PERSON-sync-test.md 讀取端
 * （TS-PERSON-012~014，由 ACCOUNT 提供）。RBAC/401 於 controller spec 驗證。
 */

const U = (over: Partial<OrgUnitRecord> & { orgCode: string; name: string }): OrgUnitRecord => ({
  companyCode: 'AS',
  codePrefix: over.orgCode.replace(/0+$/, ''),
  parentCode: null,
  tier: 'SECTION',
  descFull: null,
  managerEmpNo: null,
  isActive: true,
  ...over,
});

/** 契約 §8.1 實測範例 5 層 + 一筆已關閉部門。 */
const FIXTURE: OrgUnitRecord[] = [
  U({ orgCode: '00000', name: '和潤本部', tier: 'ROOT', parentCode: null }),
  U({ orgCode: 'J0000', name: '營業二本部', tier: 'DIVISION', parentCode: '00000' }),
  U({ orgCode: 'JA000', name: '營運管理部', tier: 'DEPARTMENT', parentCode: 'J0000' }),
  U({ orgCode: 'JAC00', name: '審查室', tier: 'SECTION', parentCode: 'JA000' }),
  U({ orgCode: 'JAD00', name: '核保室', tier: 'SECTION', parentCode: 'JA000' }),
  U({ orgCode: 'JCH00', name: '消費商品北一處', tier: 'SECTION', parentCode: 'JC000' }),
  U({ orgCode: 'JC000', name: '消費金融部', tier: 'DEPARTMENT', parentCode: 'J0000' }),
  U({ orgCode: 'JCHA0', name: '消費商品北一一課', tier: 'SUBSECTION', parentCode: 'JCH00' }),
  U({ orgCode: 'JCHB0', name: '消費商品北一二課', tier: 'SUBSECTION', parentCode: 'JCH00' }),
  U({ orgCode: 'JZZ00', name: '已關閉室', tier: 'SECTION', parentCode: 'JZ000', isActive: false }),
];

class FakeOrgStore implements OrgUnitReadStore {
  constructor(private readonly units: OrgUnitRecord[]) {}
  findByOrgCode(orgCode: string): Promise<OrgUnitRecord | null> {
    return Promise.resolve(this.units.find((u) => u.orgCode === orgCode) ?? null);
  }
  listByCompany(
    companyCode: string,
    opts?: { includeInactive?: boolean },
  ): Promise<OrgUnitRecord[]> {
    return Promise.resolve(
      this.units
        .filter((u) => u.companyCode === companyCode)
        .filter((u) => opts?.includeInactive || u.isActive),
    );
  }
}

class FakePersonStore implements PersonStore {
  constructor(private readonly people: PersonRecord[]) {}
  findByEmployeeNo(employeeNo: string): Promise<PersonRecord | null> {
    return Promise.resolve(this.people.find((p) => p.employeeNo === employeeNo) ?? null);
  }
  findByEmployeeNos(employeeNos: string[]): Promise<Map<string, PersonRecord>> {
    const m = new Map<string, PersonRecord>();
    for (const p of this.people) if (employeeNos.includes(p.employeeNo)) m.set(p.employeeNo, p);
    return Promise.resolve(m);
  }
  searchActive(keyword: string, limit = 20): Promise<PersonRecord[]> {
    return Promise.resolve(
      this.people
        .filter((p) => p.employmentStatus === 'active')
        .filter((p) => (p.name ?? '').includes(keyword) || p.employeeNo.includes(keyword))
        .slice(0, limit),
    );
  }
}

// ---------- 純函式 ----------
describe('org-unit-read 純函式', () => {
  it('directChildren：僅回直屬子層（不含孫層）', () => {
    const kids = directChildren(FIXTURE, 'JA000');
    expect(kids.map((u) => u.orgCode).sort()).toEqual(['JAC00', 'JAD00']);
  });

  it('directChildren：查無下層 → []', () => {
    expect(directChildren(FIXTURE, 'JAC00')).toEqual([]);
  });

  it('filterSubtree：prefix=JA → JA 開頭全部（跨層混合）', () => {
    const got = filterSubtree(FIXTURE, 'JA').map((u) => u.orgCode).sort();
    expect(got).toEqual(['JA000', 'JAC00', 'JAD00']);
  });

  it('filterSubtree：Root 前綴空字串 → 全域', () => {
    expect(filterSubtree(FIXTURE, '')).toHaveLength(FIXTURE.length);
  });

  it('filterSubtree：課層精確（JCHA 不誤含 JCHB）', () => {
    expect(filterSubtree(FIXTURE, 'JCHA').map((u) => u.orgCode)).toEqual(['JCHA0']);
  });

  it('escapeLikePrefix：% _ [ 跳脫（供 SQL LIKE index-seek 路徑）', () => {
    expect(escapeLikePrefix('JA%')).toBe('JA[%]');
    expect(escapeLikePrefix('J_0')).toBe('J[_]0');
    expect(escapeLikePrefix('J[A')).toBe('J[[]A');
  });

  it('buildOrgTree：依 parentCode 巢狀，root 為 parentCode=null 或父不在集合', () => {
    const tree = buildOrgTree(FIXTURE.filter((u) => u.isActive));
    const root = tree.find((n) => n.orgCode === '00000');
    expect(root).toBeDefined();
    const j = root?.children.find((n) => n.orgCode === 'J0000');
    const ja = j?.children.find((n) => n.orgCode === 'JA000');
    expect(ja?.children.map((n) => n.orgCode).sort()).toEqual(['JAC00', 'JAD00']);
  });
});

// ---------- OrgDirectoryService 讀取 ----------
describe('OrgDirectoryService — ORG_UNIT 讀取', () => {
  const svc = () =>
    new OrgDirectoryService(new FakeOrgStore(FIXTURE), new FakePersonStore([]));

  it('TS-ORGREAD-001 list：依 companyCode 回全部（5 層俱全）', async () => {
    const list = await svc().listOrgUnits('AS');
    const tiers = new Set(list.map((u) => u.tier));
    expect(tiers).toEqual(
      new Set(['ROOT', 'DIVISION', 'DEPARTMENT', 'SECTION', 'SUBSECTION']),
    );
  });

  it('TS-ORGREAD-002 list：預設僅 isActive=true', async () => {
    const list = await svc().listOrgUnits('AS');
    expect(list.find((u) => u.orgCode === 'JZZ00')).toBeUndefined();
  });

  it('TS-ORGREAD-002b list：includeInactive → 含已關閉部門', async () => {
    const list = await svc().listOrgUnits('AS', { includeInactive: true });
    expect(list.find((u) => u.orgCode === 'JZZ00')).toBeDefined();
  });

  it('TS-ORGREAD-003 cascade：依 parentCode 回直屬子層', async () => {
    const kids = await svc().orgUnitChildren('JA000');
    expect(kids.map((u) => u.orgCode).sort()).toEqual(['JAC00', 'JAD00']);
  });

  it('TS-ORGREAD-004 cascade：查無上層 → 空陣列（非錯誤）', async () => {
    await expect(svc().orgUnitChildren('NOPE0')).resolves.toEqual([]);
  });

  it('TS-ORGREAD-005 subtree：prefix=JA 跨層混合', async () => {
    const got = (await svc().orgUnitSubtree('AS', 'JA')).map((u) => u.orgCode).sort();
    expect(got).toEqual(['JA000', 'JAC00', 'JAD00']);
  });

  it('TS-ORGREAD-006 subtree：空前綴 → 全域（僅 active）', async () => {
    const got = await svc().orgUnitSubtree('AS', '');
    expect(got).toHaveLength(FIXTURE.filter((u) => u.isActive).length);
  });

  it('TS-ORGREAD-008 subtree：JCHA 精確不含 JCHB', async () => {
    const got = (await svc().orgUnitSubtree('AS', 'JCHA')).map((u) => u.orgCode);
    expect(got).toEqual(['JCHA0']);
  });

  it('tree：回巢狀樹（active）', async () => {
    const tree = await svc().orgUnitTree('AS');
    expect(tree.some((n) => n.orgCode === '00000')).toBe(true);
  });
});

// ---------- PERSON 讀取（由 ACCOUNT 提供） ----------
describe('OrgDirectoryService — PERSON 讀取', () => {
  const people: PersonRecord[] = [
    { employeeNo: 'E001', name: '王在職', orgCode: 'JAC00', employmentStatus: 'active' },
    { employeeNo: 'E002', name: '李離職', orgCode: 'JAC00', employmentStatus: 'departed' },
    { employeeNo: 'E003', name: '陳在職', orgCode: 'JAD00', employmentStatus: 'active' },
  ];
  const svc = () =>
    new OrgDirectoryService(new FakeOrgStore(FIXTURE), new FakePersonStore(people));

  it('TS-PERSON-012 getPerson：employeeNo → 姓名（含部門）', async () => {
    const p = await svc().getPerson('E001');
    expect(p?.name).toBe('王在職');
    expect(p?.orgCode).toBe('JAC00');
  });

  it('TS-PERSON-013 searchActivePersons：僅回在職者', async () => {
    const res = await svc().searchActivePersons('在職');
    expect(res.map((p) => p.employeeNo).sort()).toEqual(['E001', 'E003']);
    expect(res.find((p) => p.employeeNo === 'E002')).toBeUndefined();
  });

  it('TS-PERSON-014 搜尋排除離職者，但個別 ID 查詢仍可解析', async () => {
    const s = svc();
    expect((await s.searchActivePersons('離職')).length).toBe(0);
    expect((await s.getPerson('E002'))?.name).toBe('李離職'); // 供歷史文件顯示既有室長
  });

  it('getPerson：查無 → null（不 throw）', async () => {
    await expect(svc().getPerson('E999')).resolves.toBeNull();
  });
});
