import {
  WHITELIST_PERSONNEL_COLUMNS,
  FORBIDDEN_PERSONNEL_COLUMNS,
  FORBIDDEN_HPMUSER_COLUMNS,
  buildPersonnelIncrementalQuery,
  buildPersonnelActiveIdsQuery,
  buildDeptQuery,
  buildJobTitleQuery,
  assertNoForbiddenColumns,
  FORBIDDEN_PERSONAL_JOB_COLUMNS,
  JOB_TITLE_COLUMNS,
  UpstreamRef,
} from './upstream-queries';

/**
 * OPENQUERY 下推查詢建構（upstream-hr-source-contract.md §1 下推、§3.4 密碼欄禁讀、§5 欄位對應）。
 * 硬約束：
 *  - 一律包在 OPENQUERY([linkedServer], '...')，不得整表拉回本地。
 *  - VW_PERSONNEL_SQL 僅選白名單 10 欄（v2.0）；ID_NO／ACCOUNT 等禁欄不得出現於查詢字串。
 */

const ref: UpstreamRef = { linkedServer: 'APYHFC23', remoteDb: 'HR2' };

describe('白名單常數（v2.0：VW_PERSONNEL_SQL）', () => {
  it('恰為 10 欄', () => {
    expect(WHITELIST_PERSONNEL_COLUMNS).toHaveLength(10);
  });

  it('包含穩定鍵、在職判定欄與增量欄', () => {
    expect(WHITELIST_PERSONNEL_COLUMNS).toEqual(
      expect.arrayContaining([
        'COMPID',
        'NO',
        'NAME_IN_CHINESE',
        'DEPT_CODE',
        'EMAIL',
        'RESIGN_DATE',
        'REHIRE_DATE',
        'DIRECT_BOSS',
        'TITLE_CODE',
        'MTDT',
      ]),
    );
  });

  it('不含任何禁欄（新來源＋已停用來源之守衛清單皆然）', () => {
    for (const forbidden of [
      ...FORBIDDEN_PERSONNEL_COLUMNS,
      ...FORBIDDEN_HPMUSER_COLUMNS,
    ]) {
      expect(WHITELIST_PERSONNEL_COLUMNS).not.toContain(forbidden);
    }
  });

  it('🔴 不含三個欄名說謊之陷阱欄（契約 §3.1／§3.3）', () => {
    // NAME＝銀行名稱、DIV_CODE＝薪資部門、HIRE_DATE＝年資起算日。
    for (const trap of ['NAME', 'DIV_CODE', 'HIRE_DATE']) {
      expect(WHITELIST_PERSONNEL_COLUMNS).not.toContain(trap);
    }
  });

  it('🔴 字界比對不得誤傷白名單：禁欄清單套用於白名單欄位不得命中', () => {
    // 迴歸鎖定：HIRE_DATE 不得誤中 REHIRE_DATE、NAME 不得誤中 NAME_IN_CHINESE、
    // ID_NO 不得誤中 NO——否則正常查詢會被自身斷言擋下。
    for (const col of WHITELIST_PERSONNEL_COLUMNS) {
      expect(() => assertNoForbiddenColumns(`SELECT ${col} FROM x`)).not.toThrow();
    }
  });

  it('🔴 JOB_CODE 不得列入禁欄（VW_DEPT_SQL 合法使用，列入會擋掉部門查詢）', () => {
    expect(FORBIDDEN_PERSONNEL_COLUMNS).not.toContain('JOB_CODE');
    expect(() => buildDeptQuery(ref, 'AS')).not.toThrow();
  });
});

describe('buildPersonnelIncrementalQuery', () => {
  it('包在 OPENQUERY 並以 4 段式命名 remoteDb 存取 VW_HPMUSER', () => {
    const sql = buildPersonnelIncrementalQuery(ref, 'AS', null);
    expect(sql).toContain('OPENQUERY([APYHFC23]');
    expect(sql).toContain('[HR2].[dbo].[VW_PERSONNEL_SQL]');
  });

  it('只選白名單 12 欄、且無 SELECT *', () => {
    const sql = buildPersonnelIncrementalQuery(ref, 'AS', null);
    expect(sql).not.toMatch(/SELECT\s+\*/i);
    for (const col of WHITELIST_PERSONNEL_COLUMNS) {
      expect(sql).toContain(col);
    }
  });

  it('🔴 查詢字串不得出現任何密碼欄 / 非必要個資欄（以 token 比對，EMAILADDR 合法含 ADDR）', () => {
    const sql = buildPersonnelIncrementalQuery(ref, 'AS', null);
    for (const forbidden of FORBIDDEN_HPMUSER_COLUMNS) {
      expect(sql).not.toMatch(new RegExp(`\\b${forbidden}\\b`));
    }
    expect(() => assertNoForbiddenColumns(sql)).not.toThrow();
  });

  it('限定 COMPID=AS（單引號於 OPENQUERY 內以雙寫跳脫）', () => {
    const sql = buildPersonnelIncrementalQuery(ref, 'AS', null);
    expect(sql).toContain("COMPID=''AS''");
  });

  it('sinceMtdt 提供時附加 MTDT 增量過濾', () => {
    const since = new Date('2026-07-01T00:00:00Z');
    const sql = buildPersonnelIncrementalQuery(ref, 'AS', since);
    expect(sql).toContain('MTDT');
    expect(sql).toMatch(/MTDT\s*>/);
  });

  it('sinceMtdt 為 null（首次同步）→ 不含 MTDT 過濾（全量）', () => {
    const sql = buildPersonnelIncrementalQuery(ref, 'AS', null);
    expect(sql).not.toMatch(/MTDT\s*>/);
  });

  it('compid 注入防禦：非法 compid → 拋錯', () => {
    expect(() =>
      buildPersonnelIncrementalQuery(ref, "AS'; DROP TABLE x--", null),
    ).toThrow();
  });

  /**
   * Bug 2（時區語意）之 ring 一環：team-lead 唯讀根因調查指出 `sinceMtdt`（＝ `SYNC_RUN.watermark`）
   * 若由不同時區之行程寫入/讀取，會使增量同步整整漏抓或重抓 8 小時之上游異動——這是「影響資料
   * 正確性、非僅顯示」之風險項。本組測試涵蓋鏈路的**後半段**（水位值→組出的 OPENQUERY 字面值
   * 本身是否為行程時區不敏感之純函式）；鏈路**前半段**（水位值從 DB 讀出來時是否已經是正確的
   * 瞬間，取決於 TypeORM 之 useUTC 設定）不是本檔（純字串邏輯、無 IO）能驗證的範圍，改由
   * `backend/test/int/timezone-date-semantics.itest.ts` 之 SyncRun.watermark 案例補上。
   *
   * 断言之期望字面值由固定 UTC 瞬間之 UTC 曆法分量手算而得（`2026-07-01T05:30:00.000Z` →
   * `'2026-07-01 05:30:00'`），非讀 production 原始碼得知「該用 getUTC*」——這是 OPENQUERY 對
   * 端資料庫（VW_PERSONNEL_SQL.MTDT，上游欄位不帶時區資訊）比較時，唯一不隨行程時區飄移的組字方式，
   * 屬於本 agent 可據以推導期望值的通用正確性原則，非實作細節。
   */
  it('🔴 Bug 2：sinceMtdt 組出的 MTDT 字面值須為行程時區不敏感（同一 UTC 瞬間，跨三個相異 process.env.TZ 逐字相同）', () => {
    const ORIGINAL_TZ = process.env.TZ;
    try {
      const instant = new Date('2026-07-01T05:30:00.000Z'); // 刻意非整點/非午夜，避免巧合掩蓋日期進位錯誤
      process.env.TZ = 'Asia/Taipei'; // UTC+8
      const sqlTaipei = buildPersonnelIncrementalQuery(ref, 'AS', instant);
      process.env.TZ = 'America/New_York'; // UTC-4/-5（視 DST）
      const sqlNewYork = buildPersonnelIncrementalQuery(ref, 'AS', instant);
      process.env.TZ = 'UTC';
      const sqlUtc = buildPersonnelIncrementalQuery(ref, 'AS', instant);

      expect(sqlTaipei).toBe(sqlNewYork);
      expect(sqlTaipei).toBe(sqlUtc);
      // 逐字核對期望之 UTC 字面值，避免「三者剛好都錯成同一個值」之假陽性巧合命中。
      expect(sqlTaipei).toContain("MTDT > ''2026-07-01 05:30:00''");
    } finally {
      if (ORIGINAL_TZ === undefined) delete process.env.TZ;
      else process.env.TZ = ORIGINAL_TZ;
    }
  });
});

describe('buildPersonnelActiveIdsQuery（消失閾值用之在職 NO 集合）', () => {
  it('僅選 NO、以 RESIGN_DATE 於對端下推過濾', () => {
    const sql = buildPersonnelActiveIdsQuery(ref, 'AS');
    expect(sql).toContain('OPENQUERY([APYHFC23]');
    expect(sql).toContain('NO');
    expect(sql).toContain("COMPID=''AS''");
  });

  it('🔴 以 CAST(GETDATE() AS DATE) 比較，不得直接比 GETDATE()', () => {
    // 迴歸鎖定：GETDATE() 含時分秒，會漏算「最後在職日為今天」者，
    // 進而虛增消失比例、誤觸 §7.3 之中止閾值（契約 §6）。
    const sql = buildPersonnelActiveIdsQuery(ref, 'AS');
    expect(sql).toContain('RESIGN_DATE >= CAST(GETDATE() AS DATE)');
    expect(sql).not.toMatch(/RESIGN_DATE\s*>=\s*GETDATE\(\)/);
  });

  it('不得洩漏禁欄（token 比對）', () => {
    const sql = buildPersonnelActiveIdsQuery(ref, 'AS');
    for (const forbidden of [
      ...FORBIDDEN_PERSONNEL_COLUMNS,
      ...FORBIDDEN_HPMUSER_COLUMNS,
    ]) {
      expect(sql).not.toMatch(new RegExp(`\\b${forbidden}\\b`));
    }
  });
});

describe('buildDeptQuery（組織階層全量）', () => {
  it('包在 OPENQUERY、存取 VW_DEPT_SQL、限 COMPID=AS', () => {
    const sql = buildDeptQuery(ref, 'AS');
    expect(sql).toContain('OPENQUERY([APYHFC23]');
    expect(sql).toContain('[HR2].[dbo].[VW_DEPT_SQL]');
    expect(sql).toContain("COMPID=''AS''");
    expect(sql).not.toMatch(/SELECT\s+\*/i);
  });
});

describe('assertNoForbiddenColumns', () => {
  it('偵測到密碼欄 → 拋錯（防禦性檢查）', () => {
    expect(() =>
      assertNoForbiddenColumns('SELECT NO, USERPW FROM x'),
    ).toThrow();
  });
});


describe('buildJobTitleQuery（職稱對照主檔，契約 §5.4）', () => {
  it('包在 OPENQUERY、存取 VW_PERSONAL_JOB、無 SELECT *', () => {
    const sql = buildJobTitleQuery(ref);
    expect(sql).toContain('OPENQUERY([APYHFC23]');
    expect(sql).toContain('[HR2].[dbo].[VW_PERSONAL_JOB]');
    expect(sql).not.toMatch(/SELECT\s+\*/i);
  });

  it('僅取 COMPID / JTITLE_ID / JTITLE_NM 三欄', () => {
    const sql = buildJobTitleQuery(ref);
    for (const col of JOB_TITLE_COLUMNS) expect(sql).toContain(col);
    expect(JOB_TITLE_COLUMNS).toHaveLength(3);
  });

  it('🔴 絕不出現 ID_NUMBER（身分證字號）等該 view 之個資欄', () => {
    const sql = buildJobTitleQuery(ref);
    for (const forbidden of FORBIDDEN_PERSONAL_JOB_COLUMNS) {
      expect(sql).not.toMatch(new RegExp(`\b${forbidden}\b`));
    }
    expect(() => assertNoForbiddenColumns(sql)).not.toThrow();
  });

  it('DISTINCT 於對端下推（該 view 逐「人」一列，不 DISTINCT 會整批拉回）', () => {
    expect(buildJobTitleQuery(ref)).toMatch(/SELECT DISTINCT/);
  });

  it('刻意不以 COMPID 過濾（跨公司 fallback 需要其他公司之對照列）', () => {
    expect(buildJobTitleQuery(ref)).not.toMatch(/COMPID=/);
  });

  it('排除名稱為 NULL 之列（正規化端會判為髒資料）', () => {
    expect(buildJobTitleQuery(ref)).toContain('JTITLE_NM IS NOT NULL');
  });
});

describe('assertNoForbiddenColumns — VW_PERSONAL_JOB 個資欄', () => {
  it('偵測到 ID_NUMBER → 拋錯', () => {
    expect(() =>
      assertNoForbiddenColumns('SELECT JTITLE_ID, ID_NUMBER FROM x'),
    ).toThrow();
  });
});
