import { chunkByParamBudget, MSSQL_MAX_PARAMS } from './param-batching';

/**
 * MSSQL 單一陳述式參數上限＝2100（The server supports a maximum of 2100 parameters）。
 * 多列 INSERT 之參數量＝列數 × 每列欄位數，於大量來源資料（AS 2771 帳號）會超限。
 * chunkByParamBudget 依「每列欄位數」切批，確保每批 列數×欄位數 ≤ 預算（預設 2000 < 2100）。
 */

describe('chunkByParamBudget', () => {
  it('空陣列 → 空批次', () => {
    expect(chunkByParamBudget([], 13)).toEqual([]);
  });

  it('2771 列 × 13 欄（AS 首次同步全新建帳號）：每批參數 ≤ 2000 且 < MSSQL 上限', () => {
    const rows = Array.from({ length: 2771 }, (_, i) => i);
    const batches = chunkByParamBudget(rows, 13);
    // 每批列數 × 欄位數不得超過預算，且遠低於 2100 硬上限
    for (const b of batches) {
      expect(b.length * 13).toBeLessThanOrEqual(2000);
      expect(b.length * 13).toBeLessThan(MSSQL_MAX_PARAMS);
    }
    // 不遺漏、不重複、順序保留
    expect(batches.flat()).toEqual(rows);
  });

  it('303 列 × 9 欄（組織首次新建）：單批亦不超限', () => {
    const rows = Array.from({ length: 303 }, (_, i) => i);
    const batches = chunkByParamBudget(rows, 9);
    for (const b of batches) expect(b.length * 9).toBeLessThanOrEqual(2000);
    expect(batches.flat()).toEqual(rows);
  });

  it('筆數少於單批容量 → 單一批次', () => {
    const rows = [1, 2, 3];
    expect(chunkByParamBudget(rows, 13)).toEqual([[1, 2, 3]]);
  });

  it('每列欄位數超過預算 → 每批至少 1 列（不無限迴圈）', () => {
    const rows = [1, 2, 3];
    const batches = chunkByParamBudget(rows, 5000, 2000);
    expect(batches).toEqual([[1], [2], [3]]);
  });

  it('可自訂預算', () => {
    const rows = Array.from({ length: 10 }, (_, i) => i);
    const batches = chunkByParamBudget(rows, 2, 4); // 每批 2 列
    expect(batches).toHaveLength(5);
    expect(batches[0]).toEqual([0, 1]);
  });

  it('欄位數非正 → 拋錯', () => {
    expect(() => chunkByParamBudget([1], 0)).toThrow();
  });
});
