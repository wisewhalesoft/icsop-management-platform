/**
 * F017 delta `AC-B3`／`AC-B7` ⚠ ＋ architecture-spec.md §14.6.4（決策 E5）——
 * 第 16 欄／CSV 第 15 欄之「依 businessCategoryId 去重」核心邏輯，純函式化以供防 N+1 之
 * `BusinessCategoryDocsStore.listCategoriesByDocumentIds()` 與畫面/CSV 富化共用。
 *
 * 權威：
 *  - `docs/specs/features/F017-backend-document-list.md#business-category-column-delta` `AC-B3`
 *    （🔴 去重規則：同一份文件掛在**同一類別之多個節點**，該類別只呈現一顆 pill；
 *     N 為**相異類別數**，非掛載列數）
 *  - `docs/specs/architecture-spec.md` §14.6.4（`listCategoriesByDocumentIds()` 取回後
 *    「於 JS 依 (documentId, businessCategoryId) 去重…並排序」）
 *
 * 📌 **本環所訂之契約**：`backend/src/documents/business-category-grouping.ts` 匯出
 *    `groupBusinessCategoriesByDocument(rows) => Map<documentId, {id,displayName}[]>`，
 *    輸入為「掛載列 join 節點/類別後」之扁平列（比照 store 之單一 JOIN 查詢回傳形狀）。
 *    ⚠ 若實作採不同檔名/函式名，請走 mailbox 申訴。
 *
 * ⚠ 對實作全盲：該檔於本環撰寫時尚不存在。
 */
type Row = { documentId: string; nodeId: string; businessCategoryId: string; businessCategoryDisplayName: string };
type GroupFn = (rows: Row[]) => Map<string, { id: string; displayName: string }[]>;

function loadFn(): GroupFn | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const mod = require('./business-category-grouping') as { groupBusinessCategoriesByDocument?: GroupFn };
    return mod.groupBusinessCategoriesByDocument;
  } catch {
    return undefined;
  }
}

describe('AC-B3 groupBusinessCategoriesByDocument（依 businessCategoryId 去重，N=相異類別數非列數）', () => {
  it('模組存在', () => {
    expect(typeof loadFn()).toBe('function');
  });

  it('🔴🔴 語料鑑別力核心案：D1 掛在 授信 之 2 個節點 ＋ 風險管理 之 1 個節點（共 3 筆掛載列，2 個相異類別）→ N=2', () => {
    const fn = loadFn() as GroupFn;
    const rows: Row[] = [
      { documentId: 'D1', nodeId: 'n1', businessCategoryId: 'bc-credit', businessCategoryDisplayName: '授信' },
      { documentId: 'D1', nodeId: 'n2', businessCategoryId: 'bc-credit', businessCategoryDisplayName: '授信' }, // 同類別另一節點
      { documentId: 'D1', nodeId: 'n3', businessCategoryId: 'bc-risk', businessCategoryDisplayName: '風險管理' },
    ];
    const out = fn(rows);
    const d1 = out.get('D1') ?? [];
    expect(d1).toHaveLength(2); // 🔴 非 3（若只按列數計算，恆為 3，本斷言會抓到）
    expect(d1.map((c) => c.id).sort()).toEqual(['bc-credit', 'bc-risk']);
  });

  it('對照組：若語料僅「一類別一節點」，列數與類別數恆相等，本測試不足以區分是否真的去重——因此本檔另以上一案作為主要鑑別案', () => {
    const fn = loadFn() as GroupFn;
    const rows: Row[] = [{ documentId: 'D2', nodeId: 'n1', businessCategoryId: 'bc-credit', businessCategoryDisplayName: '授信' }];
    const out = fn(rows);
    expect(out.get('D2')).toHaveLength(1);
  });

  it('未掛載任何類別之文件不出現於 Map 中（或對應空陣列——呼叫端以 `?? []` 取值）', () => {
    const fn = loadFn() as GroupFn;
    const out = fn([]);
    expect(out.get('D-none')).toBeUndefined();
  });

  it('跨文件正確分組：D1、D2 各自之類別集合互不污染', () => {
    const fn = loadFn() as GroupFn;
    const rows: Row[] = [
      { documentId: 'D1', nodeId: 'n1', businessCategoryId: 'bc-credit', businessCategoryDisplayName: '授信' },
      { documentId: 'D2', nodeId: 'n2', businessCategoryId: 'bc-risk', businessCategoryDisplayName: '風險管理' },
    ];
    const out = fn(rows);
    expect(out.get('D1')!.map((c) => c.id)).toEqual(['bc-credit']);
    expect(out.get('D2')!.map((c) => c.id)).toEqual(['bc-risk']);
  });

  it('跨類別（同文件掛在兩個不同類別）亦視為兩個相異元素（AC-22 情境延伸）', () => {
    const fn = loadFn() as GroupFn;
    const rows: Row[] = [
      { documentId: 'D1', nodeId: 'n1', businessCategoryId: 'bc-credit', businessCategoryDisplayName: '授信' },
      { documentId: 'D1', nodeId: 'm1', businessCategoryId: 'bc-risk', businessCategoryDisplayName: '風險管理' },
    ];
    const out = fn(rows);
    expect(out.get('D1')).toHaveLength(2);
  });

  it('每個元素之 displayName 逐字為 businessCategoryDisplayName 之值（非裸 id）', () => {
    const fn = loadFn() as GroupFn;
    const rows: Row[] = [{ documentId: 'D1', nodeId: 'n1', businessCategoryId: 'bc-credit', businessCategoryDisplayName: '授信（消金）' }];
    const out = fn(rows);
    expect(out.get('D1')![0]).toEqual({ id: 'bc-credit', displayName: '授信（消金）' });
  });
});
