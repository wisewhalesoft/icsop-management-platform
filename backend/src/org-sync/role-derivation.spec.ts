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

  /**
   * 🔴 UX16 delta `AC-UX8` 仲裁 #1（`impl-core` 申訴，2026-09-22；就地改寫，非回歸）：本案原本
   * 驗證「職稱含業務 → subtype 直接寫為 business」——規則 A（`isBusinessJobTitleName()` 之
   * 消費）已停用，`targetSubtype` 恆為 `'other'`（`AC-UX8`）。本語料（業務職稱、現值已是
   * `'other'`）下，新邏輯之 target 與現值相同 ⇒ **不產生任何變動**，與舊邏輯（target='business'
   * ≠ 現值 ⇒ 產生一筆變動）**恰好相反** ⇒ 語料本身仍有鑑別力（舊實作在此會翻紅）。
   * 🔒 「不適用只升不降」（子分類變動不受角色升降限制）之不變式改由下一案（L226，業務→非業務
   * 之現值 business 案）與其後之角色待審降級案（已改語料，見下方仲裁 #2）承接，非本案獨有。
   * 📝 已作廢（⚠ 不得復原）：`OLD>` 標題「職稱含業務 → subtype 直接寫為 business（裁定
   * Q1.3b：不適用只升不降）」，期望 `subtypeChanges=[{from:'other',to:'business'}]`、
   * `writeCount=1`。
   */
  it('AC-UX8：職稱含業務、現值已是 other → 不產生任何變動（規則 A 停用後之目標值恆為 other，與現值相同）', () => {
    const plan = deriveRoles({
      accounts: [acc({ jobTitleCode: 'J01', userSubtype: 'other' })],
      orgUnits: [],
      jobTitles: TITLES,
    });
    expect(plan.subtypeChanges).toEqual([]);
    expect(plan.writeCount).toBe(0);
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

  /**
   * 🔴 UX16 delta `AC-UX8` 仲裁 #2（`impl-core` 申訴，2026-09-22；就地改寫，非回歸）：原語料
   * （`userSubtype: 'other'`，`acc` 預設值）在新邏輯下 target='other'＝現值 ⇒ 不產生變動，本案
   * 要守的「兩條規則路徑分離」不變式因而失去載體。🔒 **改語料，不改斷言精神**：現值改為
   * `'business'` ⇒ 新邏輯 target='other' ≠ 現值 ⇒ 產生一筆 business→other 之變動，
   * 且此結果與 `roleDowngradeAlerts` 之產生**互相獨立**（同一輸入，角色與子分類兩條路徑各自
   * 判定），兩者仍然成對出現 ⇒ 本案原本要證明的事（子分類路徑不受角色待審降級影響）依然成立、
   * 依然有鑑別力。
   * 📝 已作廢（⚠ 不得復原）：`OLD>` 語料 `acc({ roleCode: 'Supervisor', jobTitleCode: 'J01' })`
   * （`userSubtype` 為預設值 `'other'`），期望 `subtypeChanges` 長度為 1。
   */
  it('🔴 角色為待審降級時，子分類仍照常寫入（兩條規則路徑分離之證明；AC-UX8 之後改用現值 business 之語料）', () => {
    const plan = deriveRoles({
      accounts: [acc({ roleCode: 'Supervisor', jobTitleCode: 'J01', userSubtype: 'business' })],
      orgUnits: [],
      jobTitles: TITLES,
    });
    expect(plan.roleDowngradeAlerts).toHaveLength(1); // 角色不動
    expect(plan.subtypeChanges).toEqual([
      expect.objectContaining({ from: 'business', to: 'other' }),
    ]); // 子分類照寫（business→other，AC-UX8 之回填語意）
  });

  /**
   * 🔴 UX16 delta `AC-UX8` 仲裁 #3（`impl-core` 申訴 2026-09-22；`team-lead` 二度覆核後之
   * 最終處置，2026-09-22：**恢復 `it.skip`（非刪除），理由見下**）：本案原本驗證「職稱以
   * (companyCode, code) 複合鍵解析」（端對端：透過 `deriveRoles()` 本身）——規則 A 停用後，
   * `isBusinessJobTitleName()` 完全不再被呼叫，`jobTitles` 參數之複合鍵解析對
   * `deriveRoles()` 之**任何輸出**已無可觀測影響。
   *
   * 🔒 **處置沿革**：第一版裁定為 `it.skip`；`team-lead` 第一次覆核要求改「遷移或刪除」
   * （理由：恆真／休眠斷言比沒有斷言更糟）；查證後於 `org-directory/job-title-directory
   * .spec.ts` 補上「同代碼跨公司不得互相覆蓋」之**單元層**直接斷言，並**刪除**本案。
   * `team-lead` 第二次覆核**推翻自己第一次的兩個選項、改為認可 `it.skip`**：人類裁決 A
   * 逐字要求「程式碼以註解保留**可復原**」，本案是 `deriveRoles()` 消費 `isBusinessJobTitleName
   * ()` 時之**端對端**驗證（帳號→複合鍵→查表→業務判定→子分類輸出全程），日後規則 A
   * 復活時是**現成**的驗證；若刪除，復原者得重寫一次。`job-title-directory.spec.ts` 之
   * 單元層新增**不是本案的替代品、是不同層次之互補**——它只證明 `jobTitleKey()` 這個
   * 建鍵函式本身不會跨公司碰撞，**不證明 `deriveRoles()` 有沒有正確地用它**（目前不可能證明，
   * 因為 `deriveRoles()` 的輸出完全不依賴這段解析）。兩者並存，各自負責不同的東西。
   *
   * 🔓 **解封條件（可判定，非「暫時停用」這種無觸發條件之措辭）**：當
   * `deriveRoles()`（`role-derivation.ts`）重新消費 `isBusinessJobTitleName()` 之回傳值——
   * 即規則 A 之呼叫點復原——時，移除本案之 `it.skip`（改回 `it`），並依當時之實際回填/
   * 升級語意核對下方期望值是否仍正確。
   *
   * 🔒 **目前誰在保護這件事（誠實現況，非省略）**：
   * - `AC-UX8` 本身（輸出恆為 `'other'`）由本檔 `describe('deriveRoles — UX16 delta AC-UX8...')`
   *   保護，與本案原本要保護的「複合鍵解析對不對」**不是同一件事**。
   * - 「`jobTitleKey()` 同代碼跨公司不得互相覆蓋」（複合鍵解析之**底層建鍵**）由
   *   `org-directory/job-title-directory.spec.ts` 保護（本輪新增）。
   * - 「`deriveRoles()` 有沒有正確地把 `companyCode` 併入查表鍵、而非只用 `jobTitleCode`」
   *   ——**本輪起此事實在 `deriveRoles()` 這一層無任何自動化保護**，本案（休眠中）是它
   *   唯一的現成驗證載體，解封前不存在其他等效覆蓋。
   *
   * 已記入 `docs/test-specs/risks-and-gaps.md`（`UX16-08`）。
   */
  it.skip('🔴（休眠，見上方註解——解封條件：deriveRoles() 重新消費 isBusinessJobTitleName() 時）職稱以 (companyCode, code) 複合鍵解析——AD 之 D04＝科長(非業務)，不得誤用 AS 之 D04＝營業經理', () => {
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

  /**
   * UX16 delta — `AC-UX10`：不跑 `AC-UX9` 回填 migration 時之後果，須以純函式向量兌現。
   * 權威：docs/specs/features/F041-user-subtype-business-scope.md#ux16-delta `AC-UX10`。
   * 699/1368 之組合已由既有測試（本檔 301-304 行，`OQ-RA-01` 首次全量套用案）覆蓋，本條補上
   * `AC-UX10` 文字明指之邊界對照（10/1368 → false，`writeCount <= minAbsolute` 放行）。
   */
  it('AC-UX10：699 筆／1368 人 → true（不放寬）；10 筆／1368 人 → false（未過絕對下限）', () => {
    expect(roleChangeRatioExceeded(planWith(0, 699), 1368)).toBe(true);
    expect(roleChangeRatioExceeded(planWith(0, ROLE_CHANGE_MIN_ABSOLUTE), 1368)).toBe(false);
  });
});

/**
 * UX16 delta — `AC-UX8`：停用「業務」自動判定（項 4）。
 * 權威：docs/specs/features/F041-user-subtype-business-scope.md#ux16-delta `AC-UX8`。
 * 裁決：docs/specs/open-questions.md#ux16-2026-09-22（`OQ-UX16-05`，方向 A 已核准）。
 *
 * 🔴 人類已裁決（2026-09-22，不得再翻案）：`isBusinessJobTitleName()` 之呼叫點（規則 A）停止
 * 消費其回傳值，`deriveRoles()` 輸出之 `subtypeChanges.to` 恆為 `'other'`。函式本身以註解保留
 * （可復原），其既有單元測試（本檔 49-88 行）維持綠燈且期望值未經修改——本區塊不改、不重複。
 */
describe('deriveRoles — UX16 delta AC-UX8：停用業務子分類自動判定（規則 A 停止消費 isBusinessJobTitleName）', () => {
  it('🔴 正向＋負向成對（AC-UX8 之全部鑑別力所在）：職稱為業務且現值已是 business 之帳號——規則 A 若仍運作則不動（targetSubtype=business=現值），規則 A 停用後之目標值恆為 other ⇒ 必須產生 business→other 之回填，且整份 subtypeChanges 中 to===business 之列數恆為 0', () => {
    const plan = deriveRoles({
      // 🔴 語料鑑別力核心（AC-UX8 逐字要求）：J01＝業務職稱、現值已是 'business'。
      // 舊邏輯（isBusinessJobTitleName 仍被諮詢）：targetSubtype='business'＝現值 ⇒ 不產生任何變動。
      // 新邏輯（規則 A 停用）：targetSubtype 恆為 'other' ⇒ 現值 'business' ≠ 'other' ⇒ 必須回填。
      // 若語料改用非業務職稱之現值 business 帳號，新舊兩種邏輯輸出相同（皆回填），本條就會恆真。
      accounts: [acc({ id: 'a-already-biz', jobTitleCode: 'J01', userSubtype: 'business' })],
      orgUnits: [],
      jobTitles: TITLES,
    });
    expect(plan.subtypeChanges.filter((c) => c.to === 'business')).toHaveLength(0);
    expect(plan.subtypeChanges).toEqual([
      expect.objectContaining({ accountId: 'a-already-biz', from: 'business', to: 'other' }),
    ]);
  });

  it('🔒 isBusinessJobTitleName 本身之既有單元測試不受影響（本檔 49-88 行）——本區塊不重複驗證該函式', () => {
    // 純函式本身之行為沒有改變——改變的是「有沒有人聽它的」（AC-UX8 之明文措辭）。
    expect(isBusinessJobTitleName('業務專員')).toBe(true);
    expect(isBusinessJobTitleName('辦事員')).toBe(false);
  });
});

/**
 * UX16 delta — F004 `AC-UX12`：同步端之門檻與流程一格未動（項 4 之同步端回指）。
 * 權威：docs/specs/features/F004-org-sync.md#ux16-delta `AC-UX12`。
 * 🔴 `AC-UX12` ②「不得為本次回填新增任何跳過門檻之旗標／環境變數／參數」係一種「未新增」之
 * 負向要求，本質上難以窮舉式證偽；本區塊以「既有兩常數之值與 `roleChangeRatioExceeded` 之
 * 既有呼叫形狀（含既有 `OQ-RA-01` 覆寫引數）之 arity 不變」作為結構性回歸鎖——若日後有人
 * 為本次回填新增一個「整批跳過」旗標（第 4 個新增引數，非既有覆寫閾值之第 3 引數），本條之
 * arity 斷言即翻紅。
 */
describe('org-sync UX16 delta AC-UX12：同步門檻與流程之零漣漪回歸鎖', () => {
  it('① 兩個常數之值一格未動', () => {
    expect(DEFAULT_ROLE_CHANGE_THRESHOLD).toBe(0.05);
    expect(ROLE_CHANGE_MIN_ABSOLUTE).toBe(10);
  });

  it('④ roleChangeRatioExceeded 之呼叫形狀維持既有三參數（plan, consideredAccountCount, 選填之覆寫閾值）——不得為本次回填新增第四個「整批跳過」旗標', () => {
    expect(roleChangeRatioExceeded.length).toBeLessThanOrEqual(3);
  });
});
