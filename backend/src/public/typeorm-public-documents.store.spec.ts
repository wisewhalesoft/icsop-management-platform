import { groupUsingDeptIds } from './typeorm-public-documents.store';

/**
 * F019 真實 `DOC_USING_DEPT` 讀取路徑之**可單元測試部分**：分離查詢後之 JS 端分組純函式。
 *
 * 設計理由（見 public-seams-test-design §2.3.2）：採「文件列 + 一次性 `In()` 使用部門列 + JS 分組」，
 * 而非 SQL 1:N JOIN——JOIN 會使 ICSOP_DOCUMENT 列因一對多而重複展開；分離查詢天然不重複，
 * 且分組邏輯不需 DataSource 即可測。真實 join 之筆數/欄位對映驗證屬 [integration]
 * （test/int/public-documents.itest.ts）。
 */
describe('groupUsingDeptIds（DOC_USING_DEPT 列 → Map<documentId, orgCode[]>）', () => {
  it('TS-PS-F019-STORE-001 空輸入 → 空 Map', () => {
    expect(groupUsingDeptIds([]).size).toBe(0);
  });

  it('TS-PS-F019-STORE-002 單一文件單筆列 → 陣列長度 1', () => {
    const map = groupUsingDeptIds([{ documentId: 'd1', orgCode: 'JAC00' }]);
    expect(map.get('d1')).toEqual(['JAC00']);
  });

  it('TS-PS-F019-STORE-003 單一文件多筆列 → 全數保留，順序等同輸入順序', () => {
    const map = groupUsingDeptIds([
      { documentId: 'd1', orgCode: 'JAC00' },
      { documentId: 'd1', orgCode: 'JA000' },
      { documentId: 'd1', orgCode: '00000' },
    ]);
    expect(map.get('d1')).toEqual(['JAC00', 'JA000', '00000']);
  });

  it('TS-PS-F019-STORE-004 多份文件各自分組 → 不互相污染（交錯輸入）', () => {
    const map = groupUsingDeptIds([
      { documentId: 'd1', orgCode: 'JAC00' },
      { documentId: 'd2', orgCode: 'ZZ000' },
      { documentId: 'd1', orgCode: 'JA000' },
    ]);
    expect(map.get('d1')).toEqual(['JAC00', 'JA000']);
    expect(map.get('d2')).toEqual(['ZZ000']);
    expect(map.size).toBe(2);
  });

  it('TS-PS-F019-STORE-005 重複 (documentId, orgCode) 列 → 原樣呈現、不主動去重', () => {
    // 定案：DB 唯一索引 UQ_DOC_USING_DEPT_doc_org 已是唯一性防線；純函式不做防禦性去重，
    // 以免掩蓋資料異常（見 public-seams-test-design §8 OQ 之建議行為）。
    const map = groupUsingDeptIds([
      { documentId: 'd1', orgCode: 'JAC00' },
      { documentId: 'd1', orgCode: 'JAC00' },
    ]);
    expect(map.get('d1')).toEqual(['JAC00', 'JAC00']);
  });

  it('查無之 documentId → undefined（呼叫端以 ?? [] 收斂為空陣列）', () => {
    expect(groupUsingDeptIds([{ documentId: 'd1', orgCode: 'JAC00' }]).get('nope')).toBeUndefined();
  });
});
