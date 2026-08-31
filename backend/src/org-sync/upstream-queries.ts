/**
 * OPENQUERY 下推查詢建構（純字串邏輯，無 IO）
 *
 * 硬約束（upstream-hr-source-contract.md §1 / §3.4 / §5）：
 *  - linked server 之 is_collation_compatible=False → 一律以 OPENQUERY([linkedServer], '...')
 *    將彙總/過濾下推至對端執行，不得整表拉回本地比對。
 *  - VW_PERSONNEL_SQL 僅選白名單 11 欄；🔴 ID_NO（身分證字號）／ACCOUNT（銀行帳號）等禁欄
 *    永不出現於查詢字串。
 *  - 因 OPENQUERY 之對端 SQL 為「字串字面值」無法參數化，compid/日期等以嚴格驗證＋跳脫防注入。
 */

export interface UpstreamRef {
  linkedServer: string; // 例：APYHFC23
  remoteDb: string; // 例：HR2
}

/**
 * VW_PERSONNEL_SQL → ACCOUNT 白名單 **11 欄**（§5.2，v2.0；2026-08-31 加入 `JOB_CODE`）。
 * 順序固定，供測試與稽核比對。
 *
 * 🔴 該 view 共 40 欄，含身分證字號、金融個資與第三人聯絡資料，逐欄白名單為強制要求。
 * ⚠ `NO` 同時供應 `loginId` 與 `employeeNo`；`RESIGN_DATE` 同時供應 `isActive` 與 `resignDate`。
 */
export const WHITELIST_PERSONNEL_COLUMNS = [
  'COMPID',
  // 穩定鍵＋員工編號（契約 §7.2）。人員層 view 一人一列，(COMPID, NO) 為唯一鍵。
  'NO',
  // 🔴 不是 NAME —— 那是銀行名稱（契約 §3.1）。
  'NAME_IN_CHINESE',
  // 🔴 不是 DIV_CODE —— 那是薪資發放部門（契約 §3.1）。
  'DEPT_CODE',
  'EMAIL',
  // 在職判定（§6）＋ resignDate 兩用；語意＝最後在職日。
  'RESIGN_DATE',
  // 🔴 不是 HIRE_DATE —— 那是年資起算日（契約 §3.3）。
  'REHIRE_DATE',
  'DIRECT_BOSS',
  // 職稱代碼（G-ADM-001「**資位**」欄）。刻意取代碼而非名稱：名稱由 VW_PERSONAL_JOB 對照主檔
  // 解析（見 JOB_TITLE_COLUMNS），使上游改名不需 backfill 帳號。實測空值率 0（四家 1,362 筆）。
  'TITLE_CODE',
  // 🔴 職位代碼（G-ADM-001「**職位**」欄，2026-08-31 加入）。名稱由 VW_JOB_FUN 對照主檔解析，
  //    見 JOB_POSITION_COLUMNS。⚠ **與 DEPT_COLUMNS 之 `JOB_CODE` 同名但語意完全不同**：
  //    `VW_DEPT_SQL.JOB_CODE` ＝部門主管員編（MANGER_EMPNO，F014 來源），
  //    `VW_PERSONNEL_SQL.JOB_CODE` ＝該員之職位代碼。兩者不可互相推論。
  //    實測 2026-08-31：四家在職 1,362 筆 NULL 0／空字串 0。
  'JOB_CODE',
  'MTDT',
] as const;

/**
 * VW_PERSONAL_JOB → JOB_TITLE 對照主檔僅取 3 欄（§5.4）。
 * ⚠ 該 view 另含 `ID_NUMBER`（身分證字號）等高敏感個資，一律不取；見 FORBIDDEN_PERSONAL_JOB_COLUMNS。
 */
export const JOB_TITLE_COLUMNS = ['COMPID', 'JTITLE_ID', 'JTITLE_NM'] as const;

/**
 * VW_JOB_FUN → JOB_POSITION 對照主檔僅取 3 欄（§5.4.2）。
 *
 * ⚠ 該 view 是「職級／職務名稱」主檔（2026-08-25 正式環境實查更正），內容為
 * 董事長／總經理／本部長／部長／處長／室長／營業一般職／事務一般職／臨時人員 等——
 * 即畫面之「職位」。**不是**「職務功能」定義主檔（契約 §5.4 曾誤載）。
 * 其餘欄位（`DESC_ENG` 與六個異動軌跡欄）本系統不需要，一律不取。
 */
export const JOB_POSITION_COLUMNS = ['COMPID', 'CODE', 'DESC_CHI'] as const;

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

/**
 * 🔴 `VW_PERSONNEL_SQL` 之明確禁讀欄位（契約 §5.2，v2.0）。
 *
 * 該 view **不含密碼欄**，但含另一組高敏感欄位：身分證字號、金融個資、第三人（緊急聯絡人）
 * 個資、特種個資。另納入兩個**陷阱欄**——存在且看似可用，語意卻是錯的：
 *  - `DIV_CODE`＝薪資發放部門（非組織部門，應用 `DEPT_CODE`）
 *  - `HIRE_DATE`＝年資起算日（非到職日，應用 `REHIRE_DATE`）
 *
 * ⚠ 字界比對之已驗證安全性（勿隨意增列而破壞）：
 *  - `HIRE_DATE` **不會**誤中白名單之 `REHIRE_DATE`（`E` 與 `H` 皆為 word char，無字界）
 *  - `NAME` **不會**誤中白名單之 `NAME_IN_CHINESE`（`_` 為 word char，無字界）
 *  - `ID_NO` 與白名單之 `NO` 互不誤中
 * 🔴 **不得**將 `JOB_CODE` 列入：該欄名在兩支 view 皆為**合法來源**，語意卻不同——
 *    `VW_DEPT_SQL.JOB_CODE` ＝部門主管員編（F014），`VW_PERSONNEL_SQL.JOB_CODE` ＝職位代碼
 *    （G-ADM-001「職位」欄，2026-08-31 起）。列入會使 `buildDeptQuery` 與人員查詢
 *    雙雙觸發斷言。純屬「不需要」而非「不得讀」之欄位（`AREA_CODE`／`JOB_LEVEL_CODE`／
 *    `EMPTP_CODE` 等）一律不列入，由白名單負責排除。
 */
export const FORBIDDEN_PERSONNEL_COLUMNS = [
  'ID_NO', // 身分證字號
  'ACCOUNT', // 銀行帳號（欄名說謊，非登入帳號）
  'BK_BR_ID', // 銀行分行
  'NAME', // 銀行名稱（欄名說謊，非人名）
  'CONTACTER', // 緊急聯絡人（第三人個資）
  'CONTACTER_REL',
  'CONTACT_PHONE',
  'ABORIGINAL', // 特種個資
  'MARRIAGE_STATUS',
  'DEPENDENCE',
  'BIRTHDAY',
  'NATIONALITY',
  'SEX',
  'BIRTH_PLACE',
  'LEGAL_PHONE',
  'LEGAL_ADDRESS',
  'CURRENT_PHONE',
  'CURRENT_ADDRESS',
  'INS_CON_ID',
  'INS_CON_REMARK',
  'DIV_CODE', // ⚠ 陷阱欄：薪資發放部門
  'HIRE_DATE', // ⚠ 陷阱欄：年資起算日
] as const;

/**
 * 🔴 `VW_HPMUSER` 之禁讀欄位（v1.0 §3.4 密碼欄 + 非必要個資）。
 *
 * ⚠ 該 view 已於 v2.0 停用（契約 §3.7 母體污染），本清單**保留為防再引入之守衛**：
 * 若日後有人重新連上此 view 取密碼欄，斷言仍會擋下。
 */
export const FORBIDDEN_HPMUSER_COLUMNS = [
  'USERPW',
  'DEFAULTPW',
  'PWCHANGEDT',
  'PWERRCNT',
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
  ...FORBIDDEN_PERSONNEL_COLUMNS,
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
 * VW_PERSONNEL_SQL 增量（MTDT > sinceMtdt）或全量（sinceMtdt=null，首次同步）取白名單 10 欄。
 *
 * 🔴 **刻意不以 `RESIGN_DATE` 過濾**：離職者必須一併取回，`classifyAccount` 方能據以產生
 * `disable`（F005 離職停用）。在職與否由 `normalizeAccount` 於本地以
 * `isEmploymentActive` 判定，不在此下推。
 */
export function buildPersonnelIncrementalQuery(
  ref: UpstreamRef,
  compid: string,
  sinceMtdt: Date | null,
): string {
  assertCompid(compid);
  let where = `COMPID='${compid}'`;
  if (sinceMtdt) {
    where += ` AND MTDT > '${formatSqlDate(sinceMtdt)}'`;
  }
  const sql = buildOpenQuery(
    ref,
    WHITELIST_PERSONNEL_COLUMNS,
    'VW_PERSONNEL_SQL',
    where,
  );
  assertNoForbiddenColumns(sql);
  return sql;
}

/**
 * 消失閾值用：本次來源之在職 `NO` 集合。
 *
 * 在職判定於**對端**下推為 `RESIGN_DATE >= CAST(GETDATE() AS DATE)`（契約 §6）。
 * ⚠ `CAST(... AS DATE)` 不可省：`GETDATE()` 含時分秒，會使「最後在職日為今天」者被漏算，
 * 進而虛增消失比例、誤觸 §7.3 之中止閾值。
 * ⚠ 此處之「今天」為**上游 server 之本地日期**，與本地 `isEmploymentActive` 之 UTC 判定
 * 最多相差一日；兩者僅分別用於「消失比例」與「個別帳號狀態」，不互為真值來源。
 */
export function buildPersonnelActiveIdsQuery(
  ref: UpstreamRef,
  compid: string,
): string {
  assertCompid(compid);
  const where = `COMPID='${compid}' AND RESIGN_DATE >= CAST(GETDATE() AS DATE)`;
  const sql = buildOpenQuery(ref, ['NO'], 'VW_PERSONNEL_SQL', where);
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
 * 職位對照主檔全量取回（VW_JOB_FUN 三欄；實測四家 73 列，成本極低）。
 *
 * ⚠ **不以 COMPID 過濾**：解析端雖為「本公司精確命中」（見下），但主檔本身取全量可使
 *   日後擴充公司不需改查詢；73 列之傳輸成本可忽略。
 * ⚠ **無 DISTINCT**：該 view 逐「代碼」一列（非逐人），`(COMPID, CODE)` 實測即為唯一鍵
 *   （2026-08-31 實查：四家 73 列 / 73 組鍵，同公司內零歧義）。
 * ⚠ **無需 END_DT 過濾**：該 view 定義本身已內建 `END_DT >= GETDATE()`（契約 §2），
 *   取回者恆為有效列；view 本身亦無 `END_DT` 欄可過濾。
 *
 * 🔴 **解析端絕不得做跨公司 fallback**（與 `buildJobTitleQuery` 之職稱刻意不同）：
 *   同一代碼跨公司語意可**相反**——實測 `D04` 在 AS＝營業經理、在 AD＝科長；
 *   `C04` 在 AD＝部長、他家＝處長（2026-08-31 實查共 7 碼歧義：
 *   B01／B03／C04／D04／D05／M03／N03）。fallback 會顯示出**錯誤職位**，
 *   比顯示「—」嚴重得多。見 job-position-directory.ts。
 */
export function buildJobPositionQuery(ref: UpstreamRef): string {
  const colList = JOB_POSITION_COLUMNS.join(', ');
  const inner = `SELECT ${colList} FROM [${ref.remoteDb}].[dbo].[VW_JOB_FUN]`;
  const escaped = inner.replace(/'/g, "''");
  const sql = `SELECT ${colList} FROM OPENQUERY([${ref.linkedServer}], '${escaped}') AS src`;
  assertNoForbiddenColumns(sql);
  return sql;
}

/**
 * 防禦性檢查：查詢字串不得含任何禁讀欄位（以字界比對，避免 EMAILADDR 誤中 ADDR）。
 * 涵蓋全部上游來源之禁欄聯集（VW_PERSONNEL_SQL 身分證/金融/第三人個資＋陷阱欄、
 * VW_PERSONAL_JOB 身分證字號、以及已停用之 VW_HPMUSER 密碼欄守衛）。
 */
export function assertNoForbiddenColumns(sql: string): void {
  const re = new RegExp(`\\b(${FORBIDDEN_UPSTREAM_COLUMNS.join('|')})\\b`);
  const m = re.exec(sql);
  if (m) {
    throw new Error(`FORBIDDEN_COLUMN_IN_QUERY: ${m[1]}`);
  }
}
