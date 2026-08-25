/**
 * 角色推導（純邏輯，無 IO）——🔴 2026-08-25 角色自動化 delta。
 *
 * 權威＝`docs/stories/2026-08-25-role-automation-delta.md`（23 條裁定）
 *      ＋ `docs/specs/open-questions.md#ra-2026-08-25`（`OQ-RA-01`～`OQ-RA-03`）。
 *
 * **兩條規則（裁定 Q1.1：兩條都做，理由是盲區互補）**
 *  A. 業務子分類 ← 職稱名稱含「業務」二字（Q2.1～Q2.4、Q4.6）
 *  B. 主管角色   ← `ORG_UNIT.managerEmpNo` ＋ 層級與借調部過濾（Q3.1～Q3.5）
 *
 * ⭐ **為何必須兩條都做**：職稱認不出營業單位之主管——實測 AS `BAA00`（43 人）主管張振榮之
 * 職稱為中性的「襄理」而非「業務襄理」。但這些人正好被規則 B 認出，而依 F041 `INV-2`，
 * `userSubtype` 對非 `User` 角色**恆無效力**。規則 A 的盲區恰好落在規則 B 的涵蓋範圍內。
 *
 * 🔴 **兩條規則之寫入語意刻意不同，不得共用同一條路徑**（裁定 Q1.3 vs Q1.3b）：
 *  - `roleCode`      ：**只升不降**。降級一律轉為告警待審，不自動執行。
 *  - `userSubtype`   ：**直接寫**。不適用「只升不降」——否則 699 人（全體 51.1%）之
 *                      fail-open 缺口不會被關閉，功能等於沒有效果。
 */

/** 推導所需之本地帳號投影（含 `roleCode`／`userSubtype`／`roleSource`——刻意與同步之 `ExistingAccount` 分開）。 */
export interface DerivationAccount {
  id: string;
  companyCode: string;
  loginId: string;
  employeeNo: string | null;
  jobTitleCode: string | null;
  roleCode: string;
  userSubtype: string;
  /** `'derived'`＝可被推導覆寫；`'manual'`＝管理員指派過，永不覆寫（裁定 Q1.2）。 */
  roleSource: string;
}

/** 推導所需之組織單位投影。 */
export interface DerivationOrgUnit {
  companyCode: string;
  orgCode: string;
  tier: string;
  managerEmpNo: string | null;
  isActive: boolean;
}

/** 職稱對照列（`(companyCode, code)` 為鍵——`code` 單獨為鍵不成立，見契約 §5.4）。 */
export interface DerivationJobTitle {
  companyCode: string;
  code: string;
  name: string;
}

export interface RoleChange {
  accountId: string;
  companyCode: string;
  loginId: string;
  from: string;
  to: string;
}

export interface SubtypeChange {
  accountId: string;
  companyCode: string;
  loginId: string;
  from: string;
  to: string;
}

export interface RoleDerivationPlan {
  /** 自動執行之角色升級。 */
  roleUpgrades: RoleChange[];
  /** 🔴 **不執行**，僅產生告警待審（裁定 Q1.3）。 */
  roleDowngradeAlerts: RoleChange[];
  /** 自動執行之子分類變更（裁定 Q1.3b：不適用只升不降）。 */
  subtypeChanges: SubtypeChange[];
  /**
   * 🔴 閾值判定之分母（裁定 Q4.3／delta §七第 1 項）：**實際會寫入**之變更筆數
   * ＝ `roleUpgrades` ＋ `subtypeChanges`。
   *
   * **`subtypeChanges` 必須計入，這不是選擇題。** 因裁定 Q4.6 採「執行時字串比對、不存代碼
   * 對照表」，上游若將「業務專員」改名為「營業專員」，288 人會靜默失去限縮；該變更量佔
   * 1,368 之 21%，**唯有**閾值計入 `userSubtype` 時才會觸發中止而被發現。
   * 若本欄只算 `roleUpgrades`，該防線完全不存在。
   */
  writeCount: number;
}

/**
 * 🔴 AS「借調」部——**以代碼列舉，不得以部門名稱含「借調」比對**（裁定 Q3.3）。
 *
 * 該集合為 AS 特有且固定（實測 5 筆，主管一律掛總經理），用字串比對只會重蹈
 * 「上游改名即靜默改變判定」之脆弱性而毫無好處。
 */
export const SECONDMENT_ORG_CODES: readonly string[] = [
  'A2000', // 借調和運國際
  'A5000', // 借調和勁企業
  'A6000', // 借調和潤電能
  'A7000', // 借調和潤金融(柬埔寨)
  'A8000', // 借調和潤興業
];

/** 主管角色下放之層級（裁定 Q3.1：到處/室，**排除 `SUBSECTION`＝課**）。 */
const SUPERVISOR_TIERS: readonly string[] = [
  'ROOT',
  'DIVISION',
  'DEPARTMENT',
  'SECTION',
];

/**
 * 角色高低序（僅供「只升不降」比較，**不是**權限大小之權威——權限權威為 F025 矩陣）。
 * 索引越大越高。未知角色 → `-1`，一律視為「不可比較」而不動作（fail-safe）。
 */
const ROLE_RANK: readonly string[] = [
  'User',
  'DeptContact',
  'Supervisor',
  'ICSOPAdmin',
  'SysAdmin',
];

function rankOf(role: string): number {
  return ROLE_RANK.indexOf(role);
}

/**
 * 職稱名稱是否代表業務（裁定 Q2.1／Q4.6）。
 *
 * 規則刻意極簡：**名稱含「業務」二字**。實測 16 種職稱／699 人命中，
 * 完整涵蓋 業務專員→業務主任→業務課長→業務襄理→業務副理→業務經理→業務高專 之職涯階梯。
 *
 * ⚠ 中性職員序列（辦事員／專員／高級專員，333 人）與中性管理序列（副課長／課長／副理／
 * 襄理／經理，238 人）**一律非業務**（裁定 Q2.2／Q2.3）——已明確接受「營業單位之辦事員
 * 維持不限縮」之代價。
 *
 * ⚠ 上游新增代碼由本規則**即時判定、無人工步驟**（裁定 Q4.2）。
 */
export function isBusinessJobTitleName(name: string | null | undefined): boolean {
  return typeof name === 'string' && name.includes('業務');
}

/** 該組織單位是否應使其主管取得 `Supervisor`（裁定 Q3.1／Q3.3／Q3.5）。 */
export function isSupervisorBearingOrgUnit(unit: DerivationOrgUnit): boolean {
  if (!unit.isActive) return false;
  if (!SUPERVISOR_TIERS.includes(unit.tier)) return false; // Q3.1：排除「課」
  if (SECONDMENT_ORG_CODES.includes(unit.orgCode)) return false; // Q3.3：排除借調部
  return true;
}

/**
 * 由組織單位集合取出「應為主管」之員工編號集合。
 *
 * ⚠ 依裁定 Q3.4（各公司獨立判定），鍵為 `${companyCode}|${employeeNo}` 而非裸員編——
 * 同一自然人在不同公司持有不同工號（實測林彥良於 AS／AD／AJ 各有一個），
 * 且不同公司之工號可能重號。
 *
 * ⚠ 裁定 Q3.2（兼管一律給）於此天然成立：一人管多個部門只是同一個鍵被加入多次。
 */
export function collectSupervisorKeys(
  orgUnits: readonly DerivationOrgUnit[],
): Set<string> {
  const keys = new Set<string>();
  for (const u of orgUnits) {
    if (!isSupervisorBearingOrgUnit(u)) continue;
    const emp = u.managerEmpNo?.trim();
    if (!emp) continue;
    keys.add(supervisorKey(u.companyCode, emp));
  }
  return keys;
}

/** 複合鍵（`|` 分隔——比照本專案既有複合鍵慣例，避免代碼含分隔字元時之歧義）。 */
export function supervisorKey(companyCode: string, employeeNo: string): string {
  return `${companyCode}|${employeeNo}`;
}

/** `(companyCode, code)` 之職稱查表鍵。 */
function titleKey(companyCode: string, code: string): string {
  return `${companyCode}|${code}`;
}

/**
 * 產生推導計畫（純函式，無 IO）。
 *
 * 🔴 **只處理 `roleSource === 'derived'` 之帳號**（裁定 Q1.2）——`'manual'` 者為管理員
 * 指派過之結果，同步永不覆寫。此為「自動化」與「人工優先權」得以共存的唯一機制。
 */
export function deriveRoles(input: {
  accounts: readonly DerivationAccount[];
  orgUnits: readonly DerivationOrgUnit[];
  jobTitles: readonly DerivationJobTitle[];
}): RoleDerivationPlan {
  const supervisorKeys = collectSupervisorKeys(input.orgUnits);
  const titleNames = new Map<string, string>();
  for (const t of input.jobTitles) {
    titleNames.set(titleKey(t.companyCode, t.code), t.name);
  }

  const roleUpgrades: RoleChange[] = [];
  const roleDowngradeAlerts: RoleChange[] = [];
  const subtypeChanges: SubtypeChange[] = [];

  for (const acc of input.accounts) {
    if (acc.roleSource !== 'derived') continue; // Q1.2：人工指派過即鎖定

    // --- 規則 B：主管角色（只升不降）---
    const isSupervisor =
      acc.employeeNo !== null &&
      acc.employeeNo.trim() !== '' &&
      supervisorKeys.has(supervisorKey(acc.companyCode, acc.employeeNo.trim()));
    const targetRole = isSupervisor ? 'Supervisor' : 'User';
    const currentRank = rankOf(acc.roleCode);
    const targetRank = rankOf(targetRole);
    if (currentRank >= 0 && targetRank >= 0 && currentRank !== targetRank) {
      const change: RoleChange = {
        accountId: acc.id,
        companyCode: acc.companyCode,
        loginId: acc.loginId,
        from: acc.roleCode,
        to: targetRole,
      };
      if (targetRank > currentRank) roleUpgrades.push(change);
      else roleDowngradeAlerts.push(change); // Q1.3：不執行，僅告警
    }

    // --- 規則 A：業務子分類（直接寫，不適用只升不降）---
    // ⚠ 與 roleCode 完全分離：即使角色本身無異動（或屬待審之降級），子分類仍照推導寫入。
    const titleName = acc.jobTitleCode
      ? (titleNames.get(titleKey(acc.companyCode, acc.jobTitleCode)) ?? null)
      : null;
    const targetSubtype = isBusinessJobTitleName(titleName) ? 'business' : 'other';
    if (acc.userSubtype !== targetSubtype) {
      subtypeChanges.push({
        accountId: acc.id,
        companyCode: acc.companyCode,
        loginId: acc.loginId,
        from: acc.userSubtype,
        to: targetSubtype,
      });
    }
  }

  return {
    roleUpgrades,
    roleDowngradeAlerts,
    subtypeChanges,
    writeCount: roleUpgrades.length + subtypeChanges.length,
  };
}

/**
 * 變更量是否超過閾值（裁定 Q4.3：比照既有消失閾值之 5%）。
 *
 * ⚠ 語意與 `disappearedRatioExceeded` 一致：**嚴格大於**才算超過（恰等於閾值＝放行）。
 * ⚠ 分母為「本次納入推導之帳號數」（即 `roleSource='derived'` 者），非全部帳號——
 *    否則鎖定帳號愈多、保護愈鬆。
 *
 * 🔴 首次全量套用需變更 699 人、必然超過（1,368 之 5% ＝ 68），依 `OQ-RA-01` 之裁定
 * 以**環境變數一次性放寬**，跑完即移除；不得為此永久調高閾值或移除保護。
 */
export const DEFAULT_ROLE_CHANGE_THRESHOLD = 0.05;

/**
 * 🔴 **小公司絕對下限**（本值不在 2026-08-25 之 23 條裁定內，為實作期發現之必要補充，
 * 待人類確認——見 delta §待補）。
 *
 * **為何非有不可**：AE 實測在職僅 **16 人**，5% ＝ 0.8 人 ⇒ **任何一筆**變更（1/16＝6.25%）
 * 都會超過閾值，使 AE 之角色推導**永遠不會套用**。AJ（134 人）亦僅需 7 筆即被擋。
 * 純比例閾值在小母體下會把正常人事異動誤判為異常。
 *
 * **為何是 10**：閾值要防的是「上游改名致 288 人靜默翻轉」這類**大規模**異常；
 * 16～134 人規模之公司，單日正常異動為個位數。取 10 使正常異動一律放行，
 * 而任何堪稱「大規模」的情形（即使在最小的 AE，10/16＝62%）仍會被擋下。
 *
 * ⚠ 對 AS（1,050 人）完全無影響——其 5% ＝ 52 已遠大於本下限。
 */
export const ROLE_CHANGE_MIN_ABSOLUTE = 10;

/**
 * 超過閾值 ⇔ `writeCount` **同時**大於「比例門檻」與「絕對下限」。
 * 兩者皆為嚴格大於（恰等於＝放行），語意與 `disappearedRatioExceeded` 一致。
 */
export function roleChangeRatioExceeded(
  plan: RoleDerivationPlan,
  consideredAccountCount: number,
  threshold: number = DEFAULT_ROLE_CHANGE_THRESHOLD,
  minAbsolute: number = ROLE_CHANGE_MIN_ABSOLUTE,
): boolean {
  if (consideredAccountCount <= 0) return false;
  if (plan.writeCount <= minAbsolute) return false;
  return plan.writeCount / consideredAccountCount > threshold;
}
