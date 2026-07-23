import { NameResolutionService } from './name-resolution.service';
import { PersonRecord, PersonStore } from './person-directory';
import { OrgUnitRecord, OrgUnitReadStore } from './org-unit-read';

/**
 * 共用名稱解析（org-foundation）。對應 NAME-resolution-test.md。
 * 供 F014（當責室長顯示）、F017（清單室長欄）、public、doc-edit 重用。
 *
 * ACCOUNT-vs-PERSON 定案：ACCOUNT 已同步全體在職 AS 員工（同一 VW_HPMUSER、同 COMPID='AS'、
 * 同 EMPSTS='A'），故 PersonStore 生產實作讀 ACCOUNT，不另建 PERSON 表。此處以記憶體假 store 測。
 */

class FakePersonStore implements PersonStore {
  private readonly byEmpNo = new Map<string, PersonRecord[]>();
  add(rec: PersonRecord): this {
    const arr = this.byEmpNo.get(rec.employeeNo) ?? [];
    arr.push(rec);
    this.byEmpNo.set(rec.employeeNo, arr);
    return this;
  }
  findByEmployeeNo(employeeNo: string): Promise<PersonRecord | null> {
    const arr = this.byEmpNo.get(employeeNo);
    return Promise.resolve(arr && arr.length > 0 ? arr[arr.length - 1] : null);
  }
  findByEmployeeNos(
    employeeNos: string[],
  ): Promise<Map<string, PersonRecord>> {
    const m = new Map<string, PersonRecord>();
    for (const e of employeeNos) {
      const arr = this.byEmpNo.get(e);
      if (arr && arr.length > 0) m.set(e, arr[arr.length - 1]);
    }
    return Promise.resolve(m);
  }
  searchActive(keyword: string, limit = 20): Promise<PersonRecord[]> {
    const all = [...this.byEmpNo.values()].flat();
    return Promise.resolve(
      all
        .filter((p) => p.employmentStatus === 'active')
        .filter(
          (p) =>
            (p.name ?? '').includes(keyword) || p.employeeNo.includes(keyword),
        )
        .slice(0, limit),
    );
  }
}

class FakeOrgUnitReadStore implements OrgUnitReadStore {
  private readonly byCode = new Map<string, OrgUnitRecord>();
  add(rec: Partial<OrgUnitRecord> & { orgCode: string; name: string }): this {
    this.byCode.set(rec.orgCode, {
      companyCode: 'AS',
      codePrefix: rec.orgCode.replace(/0+$/, ''),
      parentCode: null,
      tier: 'SECTION',
      descFull: null,
      managerEmpNo: null,
      isActive: true,
      ...rec,
    });
    return this;
  }
  findByOrgCode(orgCode: string): Promise<OrgUnitRecord | null> {
    return Promise.resolve(this.byCode.get(orgCode) ?? null);
  }
  listByCompany(): Promise<OrgUnitRecord[]> {
    return Promise.resolve([...this.byCode.values()]);
  }
}

function makeService(): {
  svc: NameResolutionService;
  persons: FakePersonStore;
  orgs: FakeOrgUnitReadStore;
} {
  const persons = new FakePersonStore();
  const orgs = new FakeOrgUnitReadStore();
  // TS-NAMERES-006 完整鏈（J 分支）
  orgs
    .add({ orgCode: '00000', name: '和潤本部', tier: 'ROOT', parentCode: null })
    .add({ orgCode: 'J0000', name: '營業二本部', tier: 'DIVISION', parentCode: '00000' })
    .add({ orgCode: 'JA000', name: '營運管理部', tier: 'DEPARTMENT', parentCode: 'J0000' })
    .add({ orgCode: 'JAC00', name: '審查室', tier: 'SECTION', parentCode: 'JA000' })
    // TS-NAMERES-009 5 層（含課層）B 分支
    .add({ orgCode: 'B0000', name: '供應商金融本部', tier: 'DIVISION', parentCode: '00000' })
    .add({ orgCode: 'BJ000', name: '供應商金融部', tier: 'DEPARTMENT', parentCode: 'B0000' })
    .add({ orgCode: 'BJA00', name: '北區綜合處', tier: 'SECTION', parentCode: 'BJ000' })
    .add({ orgCode: 'BJAA0', name: '醫療一課', tier: 'SUBSECTION', parentCode: 'BJA00' });
  return { svc: new NameResolutionService(persons, orgs), persons, orgs };
}

describe('NameResolutionService — employeeNo → 姓名', () => {
  it('TS-NAMERES-001 命中在職人員 → 姓名', async () => {
    const { svc, persons } = makeService();
    persons.add({ employeeNo: 'E001', name: '王小明', orgCode: 'JAC00', employmentStatus: 'active' });
    expect(await svc.resolvePersonName('E001')).toBe('王小明');
  });

  it('TS-NAMERES-002 離職人員仍正確回傳（不因離職拒絕解析）', async () => {
    const { svc, persons } = makeService();
    persons.add({ employeeNo: 'E002', name: '李離職', orgCode: 'JAC00', employmentStatus: 'departed' });
    expect(await svc.resolvePersonName('E002')).toBe('李離職');
  });

  it('TS-NAMERES-003 查無此員編 → null（不 throw）', async () => {
    const { svc } = makeService();
    await expect(svc.resolvePersonName('E999')).resolves.toBeNull();
  });

  it('TS-NAMERES-004 批次解析：命中入 Map、未命中缺席（不拋錯）', async () => {
    const { svc, persons } = makeService();
    persons
      .add({ employeeNo: 'E1', name: '甲', orgCode: null, employmentStatus: 'active' })
      .add({ employeeNo: 'E3', name: '丙', orgCode: null, employmentStatus: 'active' })
      .add({ employeeNo: 'E5', name: '戊', orgCode: null, employmentStatus: 'departed' });
    const m = await svc.resolvePersonNames(['E1', 'E2', 'E3', 'E4', 'E5']);
    expect(m.get('E1')).toBe('甲');
    expect(m.get('E3')).toBe('丙');
    expect(m.get('E5')).toBe('戊'); // 離職者仍解析
    expect(m.has('E2')).toBe(false); // 未命中：缺席、不拋錯
    expect(m.has('E4')).toBe(false);
    expect(m.size).toBe(3);
  });

  it('TS-NAMERES-010 同 employeeNo 重複 → 不中斷、回其中一筆', async () => {
    const { svc, persons } = makeService();
    persons
      .add({ employeeNo: 'E7', name: '舊', orgCode: null, employmentStatus: 'active' })
      .add({ employeeNo: 'E7', name: '新', orgCode: null, employmentStatus: 'active' });
    await expect(svc.resolvePersonName('E7')).resolves.toBe('新');
  });

  it('TS-NAMERES-011 F014 消費：以 managerEmpNo 取候選姓名', async () => {
    const { svc, persons } = makeService();
    persons.add({ employeeNo: 'E12345', name: '吳奇聰', orgCode: 'JAC00', employmentStatus: 'active' });
    expect(await svc.resolvePersonName('E12345')).toBe('吳奇聰');
  });

  it('TS-NAMERES-012 單次 await 即回（適合交易內同步呼叫）', async () => {
    const { svc, persons } = makeService();
    persons.add({ employeeNo: 'E1', name: '甲', orgCode: null, employmentStatus: 'active' });
    const p = svc.resolvePersonName('E1');
    expect(p).toBeInstanceOf(Promise);
    expect(await p).toBe('甲');
  });
});

describe('NameResolutionService — orgId → 名稱 / 路徑', () => {
  it('TS-NAMERES-005 命中 → 單層名稱（DESC_CHI）', async () => {
    const { svc } = makeService();
    expect(await svc.resolveOrgUnitName('JAC00')).toBe('審查室');
  });

  it('TS-NAMERES-006 完整路徑 Root→該單位（/ 分隔）', async () => {
    const { svc } = makeService();
    expect(await svc.resolveOrgUnitPath('JAC00')).toBe(
      '和潤本部/營業二本部/營運管理部/審查室',
    );
  });

  it('TS-NAMERES-007 Root 自身 → 單一節點路徑', async () => {
    const { svc } = makeService();
    expect(await svc.resolveOrgUnitPath('00000')).toBe('和潤本部');
  });

  it('TS-NAMERES-008 查無 orgId → null（不 throw）', async () => {
    const { svc } = makeService();
    await expect(svc.resolveOrgUnitPath('ZZZZZ')).resolves.toBeNull();
    await expect(svc.resolveOrgUnitName('ZZZZZ')).resolves.toBeNull();
  });

  it('TS-NAMERES-009 5 層皆存在 → 路徑含全部 5 段（含課層，防 4 層退化）', async () => {
    const { svc } = makeService();
    const path = await svc.resolveOrgUnitPath('BJAA0');
    expect(path).toBe('和潤本部/供應商金融本部/供應商金融部/北區綜合處/醫療一課');
    expect(path?.split('/')).toHaveLength(5);
  });
});
