import {
  WHITELIST_HPMUSER_COLUMNS,
  FORBIDDEN_HPMUSER_COLUMNS,
  buildHpmuserIncrementalQuery,
  buildHpmuserActiveIdsQuery,
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
 *  - VW_HPMUSER 僅選白名單 12 欄；USERPW/DEFAULTPW 等禁欄不得出現於查詢字串。
 */

const ref: UpstreamRef = { linkedServer: 'APYHFC23', remoteDb: 'HR2' };

describe('白名單常數', () => {
  it('恰為 12 欄', () => {
    expect(WHITELIST_HPMUSER_COLUMNS).toHaveLength(12);
  });
  it('包含穩定鍵與增量欄且不含任何禁欄', () => {
    expect(WHITELIST_HPMUSER_COLUMNS).toEqual(
      expect.arrayContaining([
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
        'JOBTITLEID',
      ]),
    );
    for (const forbidden of FORBIDDEN_HPMUSER_COLUMNS) {
      expect(WHITELIST_HPMUSER_COLUMNS).not.toContain(forbidden);
    }
  });
});

describe('buildHpmuserIncrementalQuery', () => {
  it('包在 OPENQUERY 並以 4 段式命名 remoteDb 存取 VW_HPMUSER', () => {
    const sql = buildHpmuserIncrementalQuery(ref, 'AS', null);
    expect(sql).toContain('OPENQUERY([APYHFC23]');
    expect(sql).toContain('[HR2].[dbo].[VW_HPMUSER]');
  });

  it('只選白名單 12 欄、且無 SELECT *', () => {
    const sql = buildHpmuserIncrementalQuery(ref, 'AS', null);
    expect(sql).not.toMatch(/SELECT\s+\*/i);
    for (const col of WHITELIST_HPMUSER_COLUMNS) {
      expect(sql).toContain(col);
    }
  });

  it('🔴 查詢字串不得出現任何密碼欄 / 非必要個資欄（以 token 比對，EMAILADDR 合法含 ADDR）', () => {
    const sql = buildHpmuserIncrementalQuery(ref, 'AS', null);
    for (const forbidden of FORBIDDEN_HPMUSER_COLUMNS) {
      expect(sql).not.toMatch(new RegExp(`\\b${forbidden}\\b`));
    }
    expect(() => assertNoForbiddenColumns(sql)).not.toThrow();
  });

  it('限定 COMPID=AS（單引號於 OPENQUERY 內以雙寫跳脫）', () => {
    const sql = buildHpmuserIncrementalQuery(ref, 'AS', null);
    expect(sql).toContain("COMPID=''AS''");
  });

  it('sinceMtdt 提供時附加 MTDT 增量過濾', () => {
    const since = new Date('2026-07-01T00:00:00Z');
    const sql = buildHpmuserIncrementalQuery(ref, 'AS', since);
    expect(sql).toContain('MTDT');
    expect(sql).toMatch(/MTDT\s*>/);
  });

  it('sinceMtdt 為 null（首次同步）→ 不含 MTDT 過濾（全量）', () => {
    const sql = buildHpmuserIncrementalQuery(ref, 'AS', null);
    expect(sql).not.toMatch(/MTDT\s*>/);
  });

  it('compid 注入防禦：非法 compid → 拋錯', () => {
    expect(() =>
      buildHpmuserIncrementalQuery(ref, "AS'; DROP TABLE x--", null),
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
   * 端資料庫（VW_HPMUSER.MTDT，上游欄位不帶時區資訊）比較時，唯一不隨行程時區飄移的組字方式，
   * 屬於本 agent 可據以推導期望值的通用正確性原則，非實作細節。
   */
  it('🔴 Bug 2：sinceMtdt 組出的 MTDT 字面值須為行程時區不敏感（同一 UTC 瞬間，跨三個相異 process.env.TZ 逐字相同）', () => {
    const ORIGINAL_TZ = process.env.TZ;
    try {
      const instant = new Date('2026-07-01T05:30:00.000Z'); // 刻意非整點/非午夜，避免巧合掩蓋日期進位錯誤
      process.env.TZ = 'Asia/Taipei'; // UTC+8
      const sqlTaipei = buildHpmuserIncrementalQuery(ref, 'AS', instant);
      process.env.TZ = 'America/New_York'; // UTC-4/-5（視 DST）
      const sqlNewYork = buildHpmuserIncrementalQuery(ref, 'AS', instant);
      process.env.TZ = 'UTC';
      const sqlUtc = buildHpmuserIncrementalQuery(ref, 'AS', instant);

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

describe('buildHpmuserActiveIdsQuery（消失閾值用之在職 USERID 集合）', () => {
  it('僅選 USERID、以 EMPSTS=A 於對端下推過濾', () => {
    const sql = buildHpmuserActiveIdsQuery(ref, 'AS');
    expect(sql).toContain('OPENQUERY([APYHFC23]');
    expect(sql).toContain('USERID');
    expect(sql).toContain("EMPSTS=''A''");
    expect(sql).toContain("COMPID=''AS''");
    // 不得洩漏禁欄（token 比對）
    for (const forbidden of FORBIDDEN_HPMUSER_COLUMNS) {
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
      assertNoForbiddenColumns('SELECT USERID, USERPW FROM x'),
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
