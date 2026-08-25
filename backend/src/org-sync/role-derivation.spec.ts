import {
  DEFAULT_ROLE_CHANGE_THRESHOLD,
  ROLE_CHANGE_MIN_ABSOLUTE,
  DerivationAccount,
  DerivationJobTitle,
  DerivationOrgUnit,
  SECONDMENT_ORG_CODES,
  collectSupervisorKeys,
  deriveRoles,
  isBusinessJobTitleName,
  isSupervisorBearingOrgUnit,
  roleChangeRatioExceeded,
} from './role-derivation';

const acc = (over: Partial<DerivationAccount> = {}): DerivationAccount => ({
  id: 'a1',
  companyCode: 'AS',
  loginId: 'AS20001',
  employeeNo: '20001',
  jobTitleCode: null,
  roleCode: 'User',
  userSubtype: 'other',
  roleSource: 'derived',
  ...over,
});

const unit = (over: Partial<DerivationOrgUnit> = {}): DerivationOrgUnit => ({
  companyCode: 'AS',
  orgCode: 'ANA00',
  tier: 'SECTION',
  managerEmpNo: '20001',
  isActive: true,
  ...over,
});

const TITLES: DerivationJobTitle[] = [
  { companyCode: 'AS', code: 'J01', name: '業務專員' },
  { companyCode: 'AS', code: 'J02', name: '辦事員' },
  { companyCode: 'AS', code: 'G02', name: '課長' },
  { companyCode: 'AS', code: 'G08', name: '業務襄理' },
  // 🔴 一碼多名跨公司：AD 之 I01 是「業務專員」、AS 之 I01 是「業務主任」（實測）。
  { companyCode: 'AD', code: 'I01', name: '業務專員' },
  { companyCode: 'AS', code: 'I01', name: '業務主任' },
  // 🔴 同代碼語意相反之實測反例：AS D04＝營業經理(業務)、AD D04＝科長(非業務)。
  { companyCode: 'AS', code: 'D04', name: '營業經理' },
  { companyCode: 'AD', code: 'D04', name: '科長' },
];

describe('isBusinessJobTitleName（規則 A：職稱含「業務」）', () => {
  it.each([
    '業務專員',
    '業務主任',
    '業務課長',
    '業務襄理',
    '業務副理',
    '業務經理',
    '業務高專',
  ])('%s → 業務', (name) => {
    expect(isBusinessJobTitleName(name)).toBe(true);
  });

  it.each([
    '辦事員',
    '專員',
    '高級專員',
    '副課長',
    '課長',
    '副理',
    '襄理',
    '經理',
    '協理',
    '工程師 L1',
    '臨時人員',
  ])('%s → 非業務（中性職員／管理／技術／非正職序列，裁定 Q2.2／Q2.3／Q2.4）', (name) => {
    expect(isBusinessJobTitleName(name)).toBe(false);
  });

  it('null／undefined → 非業務（無職稱者不限縮）', () => {
    expect(isBusinessJobTitleName(null)).toBe(false);
    expect(isBusinessJobTitleName(undefined)).toBe(false);
  });

  it('🔴「營業」不等於「業務」——職級軸用「營業」、職稱軸用「業務」，本規則只認職稱軸', () => {
    // 實測：VW_JOB_FUN（職級）用「營業一般職」，VW_PERSONAL_JOB（職稱）用「業務專員」。
    // 本函式之輸入恆為職稱名稱，故「營業經理」不應被誤判——它是職級軸的詞彙。
    expect(isBusinessJobTitleName('營業一般職')).toBe(false);
  });
});

describe('isSupervisorBearingOrgUnit（規則 B：哪些單位之主管算主管）', () => {
  it.each(['ROOT', 'DIVISION', 'DEPARTMENT', 'SECTION'])('%s → 是（裁定 Q3.1 到處/室）', (tier) => {
    expect(isSupervisorBearingOrgUnit(unit({ tier }))).toBe(true);
  });

  it('SUBSECTION（課）→ 否（裁定 Q3.1 明確排除）', () => {
    expect(isSupervisorBearingOrgUnit(unit({ tier: 'SUBSECTION' }))).toBe(false);
  });

  it('已停用單位 → 否', () => {
    expect(isSupervisorBearingOrgUnit(unit({ isActive: false }))).toBe(false);
  });

  it.each(SECONDMENT_ORG_CODES)('借調部 %s → 否（裁定 Q3.3）', (orgCode) => {
    expect(isSupervisorBearingOrgUnit(unit({ orgCode, tier: 'DEPARTMENT' }))).toBe(false);
  });

  it('🔴 借調部以代碼列舉，名稱含「借調」但代碼不在清單者 → 仍是（不得以名稱比對）', () => {
    expect(isSupervisorBearingOrgUnit(unit({ orgCode: 'ZZ000', tier: 'DEPARTMENT' }))).toBe(
      true,
    );
  });

  it('零人部門仍成立（裁定 Q3.5：照常給；本函式不看人數）', () => {
    expect(isSupervisorBearingOrgUnit(unit({ tier: 'DEPARTMENT' }))).toBe(true);
  });
});

describe('collectSupervisorKeys（Q3.2 兼管／Q3.4 跨公司獨立）', () => {
  it('一人管多部門 → 只是同一鍵被加入多次（裁定 Q3.2 兼管一律給）', () => {
    const keys = collectSupervisorKeys([
      unit({ orgCode: 'JDE00', managerEmpNo: '21697' }),
      unit({ orgCode: 'JDEA0', tier: 'SUBSECTION', managerEmpNo: '21697' }),
      unit({ orgCode: 'JDEE0', tier: 'SUBSECTION', managerEmpNo: '21697' }),
    ]);
    expect(keys.has('AS|21697')).toBe(true);
    expect(keys.size).toBe(1);
  });

  it('🔴 跨公司以複合鍵區分（裁定 Q3.4）——同號不同公司不得互相溢出', () => {
    const keys = collectSupervisorKeys([
      unit({ companyCode: 'AS', orgCode: '00000', tier: 'ROOT', managerEmpNo: '20050' }),
      unit({ companyCode: 'AD', orgCode: '00000', tier: 'ROOT', managerEmpNo: '70001' }),
    ]);
    expect(keys.has('AS|20050')).toBe(true);
    expect(keys.has('AD|70001')).toBe(true);
    expect(keys.has('AD|20050')).toBe(false); // 不得跨公司誤命中
  });

  it('managerEmpNo 空白／null → 略過（不產生空鍵）', () => {
    const keys = collectSupervisorKeys([
      unit({ managerEmpNo: null }),
      unit({ orgCode: 'ANB00', managerEmpNo: '  ' }),
    ]);
    expect(keys.size).toBe(0);
  });
});

describe('deriveRoles', () => {
  it('非主管之 User、職稱非業務 → 無任何異動', () => {
    const plan = deriveRoles({
      accounts: [acc({ jobTitleCode: 'J02' })],
      orgUnits: [],
      jobTitles: TITLES,
    });
    expect(plan.roleUpgrades).toHaveLength(0);
    expect(plan.roleDowngradeAlerts).toHaveLength(0);
    expect(plan.subtypeChanges).toHaveLength(0);
    expect(plan.writeCount).toBe(0);
  });

  it('User 且為部門主管 → 升級為 Supervisor（自動執行）', () => {
    const plan = deriveRoles({
      accounts: [acc({ employeeNo: '20001' })],
      orgUnits: [unit({ managerEmpNo: '20001' })],
      jobTitles: TITLES,
    });
    expect(plan.roleUpgrades).toEqual([
      expect.objectContaining({ from: 'User', to: 'Supervisor' }),
    ]);
    expect(plan.roleDowngradeAlerts).toHaveLength(0);
  });

  it('🔴 Supervisor 但已非部門主管 → **只告警不執行**（裁定 Q1.3）', () => {
    const plan = deriveRoles({
      accounts: [acc({ roleCode: 'Supervisor' })],
      orgUnits: [],
      jobTitles: TITLES,
    });
    expect(plan.roleUpgrades).toHaveLength(0);
    expect(plan.roleDowngradeAlerts).toEqual([
      expect.objectContaining({ from: 'Supervisor', to: 'User' }),
    ]);
    // 告警不計入寫入量（它不會被寫）。
    expect(plan.writeCount).toBe(0);
  });

  it('🔴 SysAdmin／ICSOPAdmin 不會被降級為 User（只升不降之保護）', () => {
    const plan = deriveRoles({
      accounts: [
        acc({ id: 'a1', roleCode: 'SysAdmin' }),
        acc({ id: 'a2', roleCode: 'ICSOPAdmin' }),
      ],
      orgUnits: [],
      jobTitles: TITLES,
    });
    expect(plan.roleUpgrades).toHaveLength(0);
    expect(plan.roleDowngradeAlerts.map((c) => c.from)).toEqual([
      'SysAdmin',
      'ICSOPAdmin',
    ]);
    expect(plan.writeCount).toBe(0);
  });

  it('🔴 roleSource=manual → 完全跳過（裁定 Q1.2 人工指派永不被覆寫）', () => {
    const plan = deriveRoles({
      accounts: [acc({ roleSource: 'manual', jobTitleCode: 'J01' })],
      orgUnits: [unit({ managerEmpNo: '20001' })],
      jobTitles: TITLES,
    });
    expect(plan.roleUpgrades).toHaveLength(0);
    expect(plan.subtypeChanges).toHaveLength(0);
  });

  it('職稱含業務 → subtype 直接寫為 business（裁定 Q1.3b：不適用只升不降）', () => {
    const plan = deriveRoles({
      accounts: [acc({ jobTitleCode: 'J01', userSubtype: 'other' })],
      orgUnits: [],
      jobTitles: TITLES,
    });
    expect(plan.subtypeChanges).toEqual([
      expect.objectContaining({ from: 'other', to: 'business' }),
    ]);
    expect(plan.writeCount).toBe(1);
  });

  it('業務改任非業務職稱 → subtype 直接寫回 other（**限縮之解除亦自動執行**）', () => {
    const plan = deriveRoles({
      accounts: [acc({ jobTitleCode: 'J02', userSubtype: 'business' })],
      orgUnits: [],
      jobTitles: TITLES,
    });
    expect(plan.subtypeChanges).toEqual([
      expect.objectContaining({ from: 'business', to: 'other' }),
    ]);
  });

  it('🔴 角色為待審降級時，子分類仍照常寫入（兩條規則路徑分離之證明）', () => {
    const plan = deriveRoles({
      accounts: [acc({ roleCode: 'Supervisor', jobTitleCode: 'J01' })],
      orgUnits: [],
      jobTitles: TITLES,
    });
    expect(plan.roleDowngradeAlerts).toHaveLength(1); // 角色不動
    expect(plan.subtypeChanges).toHaveLength(1); // 子分類照寫
  });

  it('🔴 職稱以 (companyCode, code) 複合鍵解析——AD 之 D04＝科長(非業務)，不得誤用 AS 之 D04＝營業經理', () => {
    const plan = deriveRoles({
      accounts: [
        acc({ id: 'as1', companyCode: 'AS', jobTitleCode: 'J01' }), // 業務專員 → business
        acc({ id: 'ad1', companyCode: 'AD', jobTitleCode: 'D04' }), // 科長 → other（不變）
      ],
      orgUnits: [],
      jobTitles: TITLES,
    });
    expect(plan.subtypeChanges).toEqual([
      expect.objectContaining({ accountId: 'as1', to: 'business' }),
    ]);
  });

  it('職稱代碼查無對照 → 視為非業務（不臆測）', () => {
    const plan = deriveRoles({
      accounts: [acc({ jobTitleCode: 'ZZZ', userSubtype: 'other' })],
      orgUnits: [],
      jobTitles: TITLES,
    });
    expect(plan.subtypeChanges).toHaveLength(0);
  });

  it('employeeNo 為 null → 不可能成為主管（不產生空鍵誤命中）', () => {
    const plan = deriveRoles({
      accounts: [acc({ employeeNo: null })],
      orgUnits: [unit({ managerEmpNo: null })],
      jobTitles: TITLES,
    });
    expect(plan.roleUpgrades).toHaveLength(0);
  });
});

describe('roleChangeRatioExceeded（裁定 Q4.3 閾值）', () => {
  const planWith = (upgrades: number, subtypes: number) => ({
    roleUpgrades: Array.from({ length: upgrades }, () => ({}) as never),
    roleDowngradeAlerts: [],
    subtypeChanges: Array.from({ length: subtypes }, () => ({}) as never),
    writeCount: upgrades + subtypes,
  });

  it('恰等於閾值 → 放行（嚴格大於才算超過，語意同 disappearedRatioExceeded）', () => {
    expect(roleChangeRatioExceeded(planWith(50, 0), 1000)).toBe(false);
  });

  it('超過閾值 → 中止', () => {
    expect(roleChangeRatioExceeded(planWith(51, 0), 1000)).toBe(true);
  });

  it('🔴 subtypeChanges 必須計入——否則「上游改名致 288 人靜默失去限縮」無任何防線', () => {
    // 僅子分類變動、角色完全沒動：這正是上游職稱改名之形狀。
    expect(roleChangeRatioExceeded(planWith(0, 288), 1368)).toBe(true);
  });

  it('首次全量套用（699/1368＝51%）必然超過 → 依 OQ-RA-01 以環境變數一次性放寬', () => {
    expect(roleChangeRatioExceeded(planWith(0, 699), 1368)).toBe(true);
    expect(roleChangeRatioExceeded(planWith(0, 699), 1368, 0.6)).toBe(false);
  });

  it('分母為 0 → 不視為超過（無帳號可推導，非異常）', () => {
    expect(roleChangeRatioExceeded(planWith(0, 0), 0)).toBe(false);
  });

  it('預設閾值＝5%，與既有消失閾值一致', () => {
    expect(DEFAULT_ROLE_CHANGE_THRESHOLD).toBe(0.05);
  });

  it('🔴 小公司絕對下限：AE（16 人）之單筆變更不得被擋——否則其推導永遠不會套用', () => {
    expect(roleChangeRatioExceeded(planWith(0, 1), 16)).toBe(false);
    expect(roleChangeRatioExceeded(planWith(0, 3), 16)).toBe(false);
  });

  it('🔴 但小公司之大規模異動仍會被擋（10/16＝62%，超過下限即回歸比例判定）', () => {
    expect(roleChangeRatioExceeded(planWith(0, ROLE_CHANGE_MIN_ABSOLUTE), 16)).toBe(false);
    expect(roleChangeRatioExceeded(planWith(0, ROLE_CHANGE_MIN_ABSOLUTE + 1), 16)).toBe(true);
  });

  it('下限對 AS（1,050 人）無影響——其 5%＝52 已遠大於下限', () => {
    expect(roleChangeRatioExceeded(planWith(0, 52), 1050)).toBe(false);
    expect(roleChangeRatioExceeded(planWith(0, 53), 1050)).toBe(true);
  });
});
