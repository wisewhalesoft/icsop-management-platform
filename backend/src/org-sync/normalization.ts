/**
 * 上游原始列 → 正規化模型（純邏輯，無 IO）
 *
 * 欄位對應：upstream-hr-source-contract.md §5.1（VW_DEPT_SQL）／§5.2（VW_HPMUSER 白名單 11 欄）。
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

/** VW_HPMUSER 白名單 11 欄原始列（絕不含 USERPW/DEFAULTPW 等禁欄）。 */
export interface RawAccount {
  USERID: string;
  EMPNO?: string | null;
  USERNM?: string | null;
  COMPID: string;
  DEPTID?: string | null;
  EMAILADDR?: string | null;
  EMPSTS: string;
  RESIGNDT?: Date | string | null;
  HIREDT?: Date | string | null;
  DIRECTOR?: string | null;
  MTDT: Date | string;
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

export function normalizeAccount(raw: RawAccount): NormalizedAccount {
  const loginId = nullableStr(raw.USERID);
  if (loginId === null) throw new DirtyRowError('USERID 缺漏（穩定鍵不可缺）');
  const companyCode = nullableStr(raw.COMPID);
  if (companyCode === null) throw new DirtyRowError('COMPID 缺漏', loginId);

  return {
    companyCode,
    loginId,
    employeeNo: nullableStr(raw.EMPNO),
    name: nullableStr(raw.USERNM),
    email: nullableStr(raw.EMAILADDR),
    orgCode: nullableStr(raw.DEPTID),
    empActive: isEmploymentActive(raw.EMPSTS),
    // 日期一律經 normalizeUpstreamDate 收斂（哨兵/Invalid/超範圍 → null），避免寫入 MSSQL 時
    // 「Out of range」。不再因日期無法解析而使整列成髒（保留該帳號之其餘白名單欄位）。
    resignDate: normalizeUpstreamDate(raw.RESIGNDT),
    hireDate: normalizeUpstreamDate(raw.HIREDT),
    managerEmpNo: nullableStr(raw.DIRECTOR),
    upstreamModifiedAt: normalizeUpstreamDate(raw.MTDT),
  };
}
