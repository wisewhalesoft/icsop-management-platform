import {
  WHITELIST_HPMUSER_COLUMNS,
  FORBIDDEN_HPMUSER_COLUMNS,
  buildHpmuserIncrementalQuery,
  buildHpmuserActiveIdsQuery,
  buildDeptQuery,
  assertNoForbiddenColumns,
  UpstreamRef,
} from './upstream-queries';

/**
 * OPENQUERY 下推查詢建構（upstream-hr-source-contract.md §1 下推、§3.4 密碼欄禁讀、§5 欄位對應）。
 * 硬約束：
 *  - 一律包在 OPENQUERY([linkedServer], '...')，不得整表拉回本地。
 *  - VW_HPMUSER 僅選白名單 11 欄；USERPW/DEFAULTPW 等禁欄不得出現於查詢字串。
 */

const ref: UpstreamRef = { linkedServer: 'APYHFC23', remoteDb: 'HR2' };

describe('白名單常數', () => {
  it('恰為 11 欄', () => {
    expect(WHITELIST_HPMUSER_COLUMNS).toHaveLength(11);
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

  it('只選白名單 11 欄、且無 SELECT *', () => {
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
