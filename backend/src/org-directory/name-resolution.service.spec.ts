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
  add(rec: PersonRecord, companyCode = 'AS'): this {
    const k = this.key(companyCode, rec.employeeNo);
    const arr = this.byEmpNo.get(k) ?? [];
    arr.push(rec);
    this.byEmpNo.set(k, arr);
    return this;
  }
  // 🔴 B 階段（多公司）：替身以 `companyCode|employeeNo` 為鍵，**真正依公司隔離**——
  // 若只是加個被忽略的參數，測試就無法證明公司過濾確實生效（等於把防線測掉）。
  private key(companyCode: string, employeeNo: string): string {
    return `${companyCode}\0${employeeNo}`;
  }
  findByEmployeeNo(
    companyCode: string,
    employeeNo: string,
  ): Promise<PersonRecord | null> {
    const arr = this.byEmpNo.get(this.key(companyCode, employeeNo));
    return Promise.resolve(arr && arr.length > 0 ? arr[arr.length - 1] : null);
  }
  findByEmployeeNos(
    companyCode: string,
    employeeNos: string[],
  ): Promise<Map<string, PersonRecord>> {
    const m = new Map<string, PersonRecord>();
    for (const e of employeeNos) {
      const arr = this.byEmpNo.get(this.key(companyCode, e));
      if (arr && arr.length > 0) m.set(e, arr[arr.length - 1]);
    }
    return Promise.resolve(m);
  }
  searchActive(
    _companyCode: string,
    keyword: string,
    limit = 20,
  ): Promise<PersonRecord[]> {
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
    // 🔴 B 階段：鍵含公司別，替身據以真正隔離（同上理由）。
    this.byCode.set(`${rec.companyCode ?? 'AS'}\0${rec.orgCode}`, {
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
  findByOrgCode(
    companyCode: string,
    orgCode: string,
  ): Promise<OrgUnitRecord | null> {
    return Promise.resolve(this.byCode.get(`${companyCode}\0${orgCode}`) ?? null);
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
    expect(await svc.resolvePersonName('AS', 'E001')).toBe('王小明');
  });

  it('TS-NAMERES-002 離職人員仍正確回傳（不因離職拒絕解析）', async () => {
    const { svc, persons } = makeService();
    persons.add({ employeeNo: 'E002', name: '李離職', orgCode: 'JAC00', employmentStatus: 'departed' });
    expect(await svc.resolvePersonName('AS', 'E002')).toBe('李離職');
  });

  it('TS-NAMERES-003 查無此員編 → null（不 throw）', async () => {
    const { svc } = makeService();
    await expect(svc.resolvePersonName('AS', 'E999')).resolves.toBeNull();
  });

  it('TS-NAMERES-004 批次解析：命中入 Map、未命中缺席（不拋錯）', async () => {
    const { svc, persons } = makeService();
    persons
      .add({ employeeNo: 'E1', name: '甲', orgCode: null, employmentStatus: 'active' })
      .add({ employeeNo: 'E3', name: '丙', orgCode: null, employmentStatus: 'active' })
      .add({ employeeNo: 'E5', name: '戊', orgCode: null, employmentStatus: 'departed' });
    const m = await svc.resolvePersonNames('AS', ['E1', 'E2', 'E3', 'E4', 'E5']);
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
    await expect(svc.resolvePersonName('AS', 'E7')).resolves.toBe('新');
  });

  it('TS-NAMERES-011 F014 消費：以 managerEmpNo 取候選姓名', async () => {
    const { svc, persons } = makeService();
    persons.add({ employeeNo: 'E12345', name: '吳奇聰', orgCode: 'JAC00', employmentStatus: 'active' });
    expect(await svc.resolvePersonName('AS', 'E12345')).toBe('吳奇聰');
  });

  it('TS-NAMERES-012 單次 await 即回（適合交易內同步呼叫）', async () => {
    const { svc, persons } = makeService();
    persons.add({ employeeNo: 'E1', name: '甲', orgCode: null, employmentStatus: 'active' });
    const p = svc.resolvePersonName('AS', 'E1');
    expect(p).toBeInstanceOf(Promise);
    expect(await p).toBe('甲');
  });
});

describe('NameResolutionService — orgId → 名稱 / 路徑', () => {
  it('TS-NAMERES-005 命中 → 單層名稱（DESC_CHI）', async () => {
    const { svc } = makeService();
    expect(await svc.resolveOrgUnitName('AS', 'JAC00')).toBe('審查室');
  });

  it('TS-NAMERES-006 完整路徑 Root→該單位（/ 分隔）', async () => {
    const { svc } = makeService();
    expect(await svc.resolveOrgUnitPath('AS', 'JAC00')).toBe(
      '和潤本部/營業二本部/營運管理部/審查室',
    );
  });

  it('TS-NAMERES-007 Root 自身 → 單一節點路徑', async () => {
    const { svc } = makeService();
    expect(await svc.resolveOrgUnitPath('AS', '00000')).toBe('和潤本部');
  });

  it('TS-NAMERES-008 查無 orgId → null（不 throw）', async () => {
    const { svc } = makeService();
    await expect(svc.resolveOrgUnitPath('AS', 'ZZZZZ')).resolves.toBeNull();
    await expect(svc.resolveOrgUnitName('AS', 'ZZZZZ')).resolves.toBeNull();
  });

  it('TS-NAMERES-009 5 層皆存在 → 路徑含全部 5 段（含課層，防 4 層退化）', async () => {
    const { svc } = makeService();
    const path = await svc.resolveOrgUnitPath('AS', 'BJAA0');
    expect(path).toBe('和潤本部/供應商金融本部/供應商金融部/北區綜合處/醫療一課');
    expect(path?.split('/')).toHaveLength(5);
  });
});


/**
 * `resolveOrgUnitDisplayName`（2026-09-04 走 A+）＝`制定部門`／`制定室別` 欄之顯示名。
 *
 * 🔴 **本 describe 另建語料，不共用 `makeService()`**：上方 fixture 的 `name` 全是乾淨值
 * （`營運管理部`／`審查室`），在那份語料下「回 name」與「回 descFull／切前綴」輸出相同 ⇒
 * 斷言恆真。此處改用 dev SOP 庫 2026-09-04 之實測形態（`營管部` / `營運管理部`、
 * `作服/文管室` / `作業服務部文案管理室`），數種實作各給不同答案。
 */
describe('NameResolutionService — orgId → 制定組織顯示名', () => {
  function dirtyService(): NameResolutionService {
    const orgs = new FakeOrgUnitReadStore();
    orgs
      .add({ orgCode: 'JA000', name: '營管部', descFull: '營運管理部', tier: 'DEPARTMENT' })
      .add({
        orgCode: 'JAC00',
        name: '營管部/審查室',
        descFull: '營運管理部審查室',
        tier: 'SECTION',
        parentCode: 'JA000',
      })
      .add({ orgCode: 'CF000', name: '作業服務部', descFull: '作業服務部', tier: 'DEPARTMENT' })
      .add({
        orgCode: 'CFA00',
        name: '作服/文管室',
        descFull: '作業服務部文案管理室',
        tier: 'SECTION',
        parentCode: 'CF000',
      })
      // 🔴 部層列刻意缺席（WA000 不存在）——真庫之 `AS/WAA00 職安室` 即為此形態。
      .add({
        orgCode: 'WAA00',
        name: '職安室',
        descFull: '職業安全衛生室',
        tier: 'SECTION',
        parentCode: null,
      })
      // 🔴 跨公司同代碼不同單位：和勁企業（AJ）之 AD000 是「信用審查部」。
      .add({
        companyCode: 'AJ',
        orgCode: 'AD000',
        name: '信用審查',
        descFull: '信用審查部',
        tier: 'DEPARTMENT',
      });
    return new NameResolutionService(new FakePersonStore(), orgs);
  }

  it('部層 → DESC_FULL 全名（營管部 → 營運管理部）', async () => {
    await expect(dirtyService().resolveOrgUnitDisplayName('AS', 'JA000')).resolves.toBe(
      '營運管理部',
    );
  });

  it('處室 → 自 DESC_FULL 切除部層全名前綴（營運管理部審查室 → 審查室）', async () => {
    await expect(dirtyService().resolveOrgUnitDisplayName('AS', 'JAC00')).resolves.toBe('審查室');
  });

  /**
   * 🔒 本案證明 service **確實去查了部層那一列**：若忘了查（或查錯代碼），純函式收到
   * `deptFull=null` 會退回 `DESC_CHI` 末段 `文管室`，斷言即紅。這是接線層唯一能被單元測到的點。
   */
  it('🔒 處室之全名需部層列才切得出來（文案管理室，非末段簡稱「文管室」）', async () => {
    const r = await dirtyService().resolveOrgUnitDisplayName('AS', 'CFA00');
    expect(r).toBe('文案管理室');
    expect(r).not.toBe('文管室');
  });

  it('部層列查無（WA000）→ 退回 DESC_CHI 末段，不拋錯亦不留空', async () => {
    await expect(dirtyService().resolveOrgUnitDisplayName('AS', 'WAA00')).resolves.toBe('職安室');
  });

  it('🔴 companyCode 為必要參數：以 AJ 查 AD000 得和勁之單位，以 AS 查則查無', async () => {
    const svc = dirtyService();
    await expect(svc.resolveOrgUnitDisplayName('AJ', 'AD000')).resolves.toBe('信用審查部');
    await expect(svc.resolveOrgUnitDisplayName('AS', 'AD000')).resolves.toBeNull();
  });

  it('查無 orgCode → null（不 throw，與 resolveOrgUnitName 同語意）', async () => {
    await expect(dirtyService().resolveOrgUnitDisplayName('AS', 'ZZZZZ')).resolves.toBeNull();
  });

  /**
   * 🔒 回歸鎖：兩支方法**刻意併存且語意相異**。`resolveOrgUnitName` 仍供 F018／F039 之
   * 上傳者部門與 F042 已完成 OJT 單位使用；若日後有人「順手統一」成同一支，本案翻紅。
   */
  it('🔒 resolveOrgUnitName 仍回 ORG_UNIT.name 原字串（兩支不得合流）', async () => {
    const svc = dirtyService();
    await expect(svc.resolveOrgUnitName('AS', 'JAC00')).resolves.toBe('營管部/審查室');
    await expect(svc.resolveOrgUnitName('AS', 'JA000')).resolves.toBe('營管部');
  });
});
