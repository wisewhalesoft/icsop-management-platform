/**
 * 上游原始列 → 正規化模型（純邏輯，無 IO）
 *
 * 欄位對應：upstream-hr-source-contract.md §5.1（VW_DEPT_SQL）／§5.2（VW_PERSONNEL_SQL 白名單 10 欄，v2.0）。
 * 髒資料防禦（F004 Edge Cases / TC-010-03）：單筆型別/格式不符 → 拋 DirtyRowError，
 * 由同步服務跳過該筆並記警告，不影響其他正常筆數。
 */

import {
  deriveTier,
  deriveParentCode,
  deriveCodePrefix,
  OrgTier,
} from './org-hierarchy';
import { isEmploymentActive, isDeptActive } from './employment-status';
import { normalizeUpstreamDate } from './upstream-date';

/** 單筆髒資料錯誤（同步服務據此跳過該筆、記警告）。 */
export class DirtyRowError extends Error {
  constructor(
    message: string,
    readonly key?: string,
  ) {
    super(message);
    this.name = 'DirtyRowError';
  }
}

/** VW_DEPT_SQL 原始列（僅列出本同步使用之欄位）。 */
export interface RawDept {
  CODE: string;
  COMPID: string;
  DESC_CHI: string;
  DESC_FULL?: string | null;
  JOB_CODE?: string | null; // 實為 MANGER_EMPNO
  CLOSE_DATE: Date | string;
  ESTABLISHED_DATE?: Date | string | null;
}

/**
 * VW_PERSONNEL_SQL 白名單 10 欄原始列（v2.0；絕不含 ID_NO／ACCOUNT 等禁欄）。
 *
 * ⚠ 欄名陷阱（契約 §3.1／§3.3）——本型別**刻意不宣告**下列欄位，使誤用成為編譯期錯誤：
 * `NAME`（銀行名稱，非人名）、`DIV_CODE`（薪資部門，非組織部門）、`HIRE_DATE`（年資起算日，非到職日）。
 */
export interface RawAccount {
  COMPID: string;
  /** 穩定鍵＋員工編號（契約 §7.2）。 */
  NO: string;
  /** 🔴 人名。不是 `NAME`。 */
  NAME_IN_CHINESE?: string | null;
  /** 🔴 組織部門代碼。不是 `DIV_CODE`。 */
  DEPT_CODE?: string | null;
  EMAIL?: string | null;
  /** 語意＝最後在職日；哨兵 9999-12-31。在職判定見 `isEmploymentActive`。 */
  RESIGN_DATE?: Date | string | null;
  /** 🔴 到職日。不是 `HIRE_DATE`。 */
  REHIRE_DATE?: Date | string | null;
  DIRECT_BOSS?: string | null;
  TITLE_CODE?: string | null;
  MTDT: Date | string;
}

/** VW_PERSONAL_JOB 職稱對照原始列（僅三欄；絕不含 ID_NUMBER 等個資）。 */
export interface RawJobTitle {
  COMPID: string;
  JTITLE_ID: string;
  JTITLE_NM?: string | null;
}

export interface NormalizedJobTitle {
  companyCode: string;
  code: string;
  name: string;
}

export interface NormalizedOrgUnit {
  companyCode: string;
  orgCode: string;
  codePrefix: string;
  tier: OrgTier;
  parentCode: string | null;
  name: string;
  // 部門全名（← DESC_FULL，供 F020 浮水印「部門」欄）；上游可能為 null（見 OQ-DESCFULL-2）。
  // 僅忠實保存上游原始值，不做「無部層 fallback 取本部層」之組裝（屬 F020 責任）。
  descFull: string | null;
  managerEmpNo: string | null;
  isActive: boolean;
  /**
   * 真實部門關閉日（← CLOSE_DATE）；哨兵 9999-12-31／不可儲存之日期經 normalizeUpstreamDate 收斂為 null。
   * F006 §7.3 之提示需呈現「部門關閉日期」（AC8），故於此保留原始日期。
   * ⚠ 選填（不參與 classifyOrgUnit 比對、不落地 ORG_UNIT）：既有測試替身之物件字面值無需補此欄。
   */
  closeDate?: Date | null;
}

export interface NormalizedAccount {
  companyCode: string;
  loginId: string;
  employeeNo: string | null;
  name: string | null;
  email: string | null;
  orgCode: string | null;
  empActive: boolean;
  resignDate: Date | null;
  hireDate: Date | null;
  managerEmpNo: string | null;
  // 職稱代碼（← TITLE_CODE）。名稱由 JOB_TITLE 對照表解析，不落於帳號列。
  jobTitleCode: string | null;
  // 可為 null：哨兵/Invalid/超出 MSSQL 可儲存範圍之 MTDT 經 normalizeUpstreamDate 收斂為 null。
  upstreamModifiedAt: Date | null;
}

function nullableStr(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  return t.length === 0 ? null : t;
}

export function normalizeDept(raw: RawDept, now: Date): NormalizedOrgUnit {
  const orgCode = nullableStr(raw.CODE);
  if (orgCode === null) throw new DirtyRowError('CODE 缺漏');
  let tier: OrgTier;
  let parentCode: string | null;
  let codePrefix: string;
  try {
    tier = deriveTier(orgCode);
    parentCode = deriveParentCode(orgCode);
    codePrefix = deriveCodePrefix(orgCode);
  } catch (e) {
    throw new DirtyRowError(
      `部門代碼不合法：${orgCode}（${e instanceof Error ? e.message : String(e)}）`,
      orgCode,
    );
  }
  const companyCode = nullableStr(raw.COMPID);
  if (companyCode === null) throw new DirtyRowError('COMPID 缺漏', orgCode);
  const name = nullableStr(raw.DESC_CHI);
  if (name === null) throw new DirtyRowError('DESC_CHI 缺漏', orgCode);

  let isActive: boolean;
  try {
    isActive = isDeptActive(raw.CLOSE_DATE, now);
  } catch (e) {
    throw new DirtyRowError(
      `CLOSE_DATE 無法解析：${String(raw.CLOSE_DATE)}`,
      orgCode,
    );
  }

  return {
    companyCode,
    orgCode,
    codePrefix,
    tier,
    parentCode,
    name,
    descFull: nullableStr(raw.DESC_FULL),
    managerEmpNo: nullableStr(raw.JOB_CODE),
    isActive,
    // 哨兵/超範圍/Invalid → null（同帳號日期欄之收斂慣例）；供 F006 §7.3 提示顯示關閉日期。
    closeDate: normalizeUpstreamDate(raw.CLOSE_DATE),
  };
}

/**
 * 帳號列正規化（v2.0：來源 `VW_PERSONNEL_SQL`）。
 *
 * @param now 在職判定之基準時刻（契約 §6）。v1.0 之 `EMPSTS='A'` 為自足判定、不需時間；
 *   v2.0 改由 `RESIGN_DATE` 與基準日比較，故必須顯式傳入，**不得於函式內取系統時鐘**
 *   （純函式、可測、同一次同步全批共用同一基準）。
 */
export function normalizeAccount(raw: RawAccount, now: Date): NormalizedAccount {
  const loginId = nullableStr(raw.NO);
  if (loginId === null) throw new DirtyRowError('NO 缺漏（穩定鍵不可缺）');
  const companyCode = nullableStr(raw.COMPID);
  if (companyCode === null) throw new DirtyRowError('COMPID 缺漏', loginId);

  // 日期一律經 normalizeUpstreamDate 收斂（哨兵/Invalid/超範圍 → null），避免寫入 MSSQL 時
  // 「Out of range」。不再因日期無法解析而使整列成髒（保留該帳號之其餘白名單欄位）。
  const resignDate = normalizeUpstreamDate(raw.RESIGN_DATE);

  return {
    companyCode,
    loginId,
    // 🔑 `NO` 同時供應穩定鍵與員工編號（契約 §5.2）——人員層 view 一人一列，
    //    v1.0「員編不唯一故不可作鍵」之顧慮源於 VW_HPMUSER 之帳號層粒度，已不適用。
    employeeNo: loginId,
    name: nullableStr(raw.NAME_IN_CHINESE),
    email: nullableStr(raw.EMAIL),
    orgCode: nullableStr(raw.DEPT_CODE),
    // 哨兵已收斂為 null ⇒ isEmploymentActive(null, now) === true（未離職）。
    empActive: isEmploymentActive(resignDate, now),
    resignDate,
    hireDate: normalizeUpstreamDate(raw.REHIRE_DATE),
    managerEmpNo: nullableStr(raw.DIRECT_BOSS),
    jobTitleCode: nullableStr(raw.TITLE_CODE),
    upstreamModifiedAt: normalizeUpstreamDate(raw.MTDT),
  };
}

/**
 * 穩定鍵去重（人類裁決 #1，契約 §7.2）。
 *
 * 上游確認 `(COMPID, NO)` 於正式環境無重複，dev 有 1 筆（`AS/20012`）。撞鍵會使整批 upsert
 * 失敗，故同步端須防禦性去重——**不得讓單筆髒資料打掉整次同步**。
 *
 * 決定性規則（避免同一份資料在不同次同步解析出不同結果）：
 *  1. `upstreamModifiedAt` 較新者勝；
 *  2. 同值（含皆為 null）→ **先出現者勝**（保留來源順序，穩定）。
 *
 * @returns `[去重後陣列, 被丟棄的筆數]`；呼叫端據以記警告。
 */
export function dedupeAccountsByStableKey(
  accounts: readonly NormalizedAccount[],
): [NormalizedAccount[], number] {
  const byKey = new Map<string, NormalizedAccount>();
  let dropped = 0;
  for (const a of accounts) {
    const key = `${a.companyCode}|${a.loginId}`;
    const prev = byKey.get(key);
    if (prev === undefined) {
      byKey.set(key, a);
      continue;
    }
    dropped++;
    const prevAt = prev.upstreamModifiedAt?.getTime() ?? null;
    const curAt = a.upstreamModifiedAt?.getTime() ?? null;
    // 嚴格大於：相等（或皆 null）時保留 prev＝先出現者。
    if (curAt !== null && (prevAt === null || curAt > prevAt)) {
      byKey.set(key, a);
    }
  }
  return [[...byKey.values()], dropped];
}

/**
 * 職稱對照列正規化。缺 COMPID/JTITLE_ID/JTITLE_NM 任一 → DirtyRowError（該列跳過、記警告），
 * 與部門/帳號之髒資料處置一致：對照表缺一列只會使少數帳號之職位顯示為「—」，不應中斷整批同步。
 */
export function normalizeJobTitle(raw: RawJobTitle): NormalizedJobTitle {
  const code = nullableStr(raw.JTITLE_ID);
  if (code === null) throw new DirtyRowError('JTITLE_ID 缺漏（對照鍵不可缺）');
  const companyCode = nullableStr(raw.COMPID);
  if (companyCode === null) throw new DirtyRowError('COMPID 缺漏', code);
  const name = nullableStr(raw.JTITLE_NM);
  if (name === null) throw new DirtyRowError('JTITLE_NM 缺漏', code);
  return { companyCode, code, name };
}
