/**
 * OPENQUERY 下推查詢建構（純字串邏輯，無 IO）
 *
 * 硬約束（upstream-hr-source-contract.md §1 / §3.4 / §5）：
 *  - linked server 之 is_collation_compatible=False → 一律以 OPENQUERY([linkedServer], '...')
 *    將彙總/過濾下推至對端執行，不得整表拉回本地比對。
 *  - VW_HPMUSER 僅選白名單 12 欄；🔴 USERPW/DEFAULTPW 等禁欄永不出現於查詢字串。
 *  - 因 OPENQUERY 之對端 SQL 為「字串字面值」無法參數化，compid/日期等以嚴格驗證＋跳脫防注入。
 */

export interface UpstreamRef {
  linkedServer: string; // 例：APYHFC23
  remoteDb: string; // 例：HR2
}

/** VW_HPMUSER → ACCOUNT 白名單 12 欄（§5.2）。順序固定，供測試與稽核比對。 */
export const WHITELIST_HPMUSER_COLUMNS = [
  'USERID',
  'EMPNO',
  'USERNM',
  'COMPID',
  'DEPTID',
  'EMAILADDR',
  'EMPSTS',
  'RESIGNDT',
  'HIREDT',
  'DIRECTOR',
  'MTDT',
  // 職稱代碼（G-ADM-001「職位」欄）。刻意取代碼而非名稱：名稱由 VW_PERSONAL_JOB 對照主檔
  // 解析（見 JOB_TITLE_COLUMNS），使上游改名不需 backfill 帳號。實測空值率 0（AS 在職 1,115 筆）。
  'JOBTITLEID',
] as const;

/**
 * VW_PERSONAL_JOB → JOB_TITLE 對照主檔僅取 3 欄（§5.4）。
 * ⚠ 該 view 另含 `ID_NUMBER`（身分證字號）等高敏感個資，一律不取；見 FORBIDDEN_PERSONAL_JOB_COLUMNS。
 */
export const JOB_TITLE_COLUMNS = ['COMPID', 'JTITLE_ID', 'JTITLE_NM'] as const;

/** VW_DEPT_SQL → ORG_UNIT 使用欄位（§5.1；JOB_CODE 實為 MANGER_EMPNO）。 */
export const DEPT_COLUMNS = [
  'CODE',
  'COMPID',
  'DESC_CHI',
  'DESC_FULL',
  'JOB_CODE',
  'ESTABLISHED_DATE',
  'CLOSE_DATE',
] as const;

/** 🔴 明確禁讀欄位（§3.4 密碼欄 + 非必要個資）。 */
export const FORBIDDEN_HPMUSER_COLUMNS = [
  'USERPW',
  'DEFAULTPW',
  'PWCHANGEDT',
  'PWERRCNT',
  'BIRTHDAY',
  'MARRITALSTS',
  'ADDR',
  'ZIPCODE1',
  'ZIPCODE2',
  'TELNO',
  'TELAREA',
  'MOBILNO',
  'HRMOBILENO',
  'EDUCATIONLVL',
  'SCHNM',
  'MAJOR',
] as const;

/**
 * 🔴 VW_PERSONAL_JOB 之明確禁讀欄位。該 view 底層為 HREMPMF＋3 表 join，含身分證字號與
 * 姓名等個資；本系統僅需 (COMPID, JTITLE_ID, JTITLE_NM) 三欄之職稱對照。
 */
export const FORBIDDEN_PERSONAL_JOB_COLUMNS = [
  'ID_NUMBER',
  'EMPNM',
  'BUSINESS_TYPE',
] as const;

/** 全部上游來源之禁讀欄位聯集（assertNoForbiddenColumns 之實際依據）。 */
export const FORBIDDEN_UPSTREAM_COLUMNS = [
  ...FORBIDDEN_HPMUSER_COLUMNS,
  ...FORBIDDEN_PERSONAL_JOB_COLUMNS,
] as const;

function assertCompid(compid: string): void {
  if (!/^[A-Z]{2,10}$/.test(compid)) {
    throw new Error(`INVALID_COMPID: ${String(compid)}`);
  }
}

/** MSSQL 友善之日期字面值 'YYYY-MM-DD HH:mm:ss'（UTC）。 */
function formatSqlDate(d: Date): string {
  const p = (n: number, w = 2): string => String(n).padStart(w, '0');
  return (
    `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ` +
    `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`
  );
}

/**
 * 組一支「外層明確選欄 + 內層下推」之 OPENQUERY。
 * 內層字面值之單引號以雙寫跳脫（OPENQUERY 第二引數本身為字串字面值）。
 */
function buildOpenQuery(
  ref: UpstreamRef,
  columns: readonly string[],
  view: string,
  whereInner: string | null,
): string {
  const colList = columns.join(', ');
  const inner =
    `SELECT ${colList} FROM [${ref.remoteDb}].[dbo].[${view}]` +
    (whereInner ? ` WHERE ${whereInner}` : '');
  const escaped = inner.replace(/'/g, "''");
  return `SELECT ${colList} FROM OPENQUERY([${ref.linkedServer}], '${escaped}') AS src`;
}

/**
 * VW_HPMUSER 增量（MTDT > sinceMtdt）或全量（sinceMtdt=null，首次同步）取白名單 12 欄。
 */
export function buildHpmuserIncrementalQuery(
  ref: UpstreamRef,
  compid: string,
  sinceMtdt: Date | null,
): string {
  assertCompid(compid);
  let where = `COMPID='${compid}'`;
  if (sinceMtdt) {
    where += ` AND MTDT > '${formatSqlDate(sinceMtdt)}'`;
  }
  const sql = buildOpenQuery(ref, WHITELIST_HPMUSER_COLUMNS, 'VW_HPMUSER', where);
  assertNoForbiddenColumns(sql);
  return sql;
}

/** 消失閾值用：本次來源之在職 USERID 集合（EMPSTS='A' 於對端下推）。 */
export function buildHpmuserActiveIdsQuery(ref: UpstreamRef, compid: string): string {
  assertCompid(compid);
  const where = `COMPID='${compid}' AND EMPSTS='A'`;
  const sql = buildOpenQuery(ref, ['USERID'], 'VW_HPMUSER', where);
  assertNoForbiddenColumns(sql);
  return sql;
}

/** 組織階層全量取回（VW_DEPT_SQL，僅 114 筆，成本極低；不依 MTDT 增量）。 */
export function buildDeptQuery(ref: UpstreamRef, compid: string): string {
  assertCompid(compid);
  const where = `COMPID='${compid}'`;
  return buildOpenQuery(ref, DEPT_COLUMNS, 'VW_DEPT_SQL', where);
}

/**
 * 職稱對照主檔全量取回（VW_PERSONAL_JOB 之 distinct 三欄；實測全公司 109 列，成本極低）。
 *
 * ⚠ 刻意**不以 COMPID 過濾**：解析採「本公司優先、查無再跨公司 fallback」，需要其他公司之
 *   對照列才能補齊本公司主檔缺漏之代碼。實測（2026-08-12）AS 在職 1,115 筆中，
 *   `I10`(9 筆)／`G03`(1 筆) 兩碼不存在於 AS 之對照列，改以跨公司 fallback 後命中率 100%。
 * DISTINCT 於對端下推：該 view 逐「人」一列（數千列），不 DISTINCT 會整批拉回。
 */
export function buildJobTitleQuery(ref: UpstreamRef): string {
  const colList = JOB_TITLE_COLUMNS.join(', ');
  const inner =
    `SELECT DISTINCT ${colList} FROM [${ref.remoteDb}].[dbo].[VW_PERSONAL_JOB] ` +
    `WHERE JTITLE_NM IS NOT NULL`;
  const escaped = inner.replace(/'/g, "''");
  const sql = `SELECT ${colList} FROM OPENQUERY([${ref.linkedServer}], '${escaped}') AS src`;
  assertNoForbiddenColumns(sql);
  return sql;
}

/**
 * 防禦性檢查：查詢字串不得含任何禁讀欄位（以字界比對，避免 EMAILADDR 誤中 ADDR）。
 * 涵蓋全部上游來源之禁欄聯集（VW_HPMUSER 密碼/個資 + VW_PERSONAL_JOB 身分證字號等）。
 */
export function assertNoForbiddenColumns(sql: string): void {
  const re = new RegExp(`\\b(${FORBIDDEN_UPSTREAM_COLUMNS.join('|')})\\b`);
  const m = re.exec(sql);
  if (m) {
    throw new Error(`FORBIDDEN_COLUMN_IN_QUERY: ${m[1]}`);
  }
}
