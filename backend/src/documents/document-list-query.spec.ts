import { applyDocumentQuery, matchesStatusFilter } from './document-list-query';
import { DocumentListItem } from './documents.store';
import { DocumentStatus } from './document-status';

/** 建立最小清單項（僅測試關注之欄位，其餘補 null）。 */
function item(over: Partial<DocumentListItem>): DocumentListItem {
  return {
    id: 'id',
    status: 'active' as DocumentStatus,
    documentNumber: 'N',
    documentName: '書名',
    lifecycleId: 'lc',
    lifecycleName: null,
    nodeId: null,
    draftingCompanyId: null,
    draftingDeptId: null,
    draftingSectionId: null,
    draftingCompanyName: null,
    draftingDeptName: null,
    draftingSectionName: null,
    primaryChiefId: null,
    primaryChiefName: null,
    edition: null,
    announcedDate: null,
    contentSummary: null,
    ...over,
  };
}

const TODAY = new Date('2026-07-23T00:00:00Z');

describe('matchesStatusFilter（F017 狀態篩選：原始值 vs 衍生顯示值）', () => {
  it('原始值 active → 依儲存值比對（含公告未到者）', () => {
    const announced = item({ status: 'active', announcedDate: '2026-01-01T00:00:00Z' });
    const inProgress = item({ status: 'active', announcedDate: '2026-12-31T00:00:00Z' });
    expect(matchesStatusFilter(announced, 'active', TODAY)).toBe(true);
    expect(matchesStatusFilter(inProgress, 'active', TODAY)).toBe(true);
  });

  it('衍生值 已公告 → 有效且公告日期 ≤ 今日', () => {
    const announced = item({ status: 'active', announcedDate: '2026-01-01T00:00:00Z' });
    const inProgress = item({ status: 'active', announcedDate: '2026-12-31T00:00:00Z' });
    expect(matchesStatusFilter(announced, '已公告', TODAY)).toBe(true);
    expect(matchesStatusFilter(inProgress, '已公告', TODAY)).toBe(false);
  });

  it('衍生值 進度中 → 有效且公告日期 > 今日 或未填', () => {
    const inProgress = item({ status: 'active', announcedDate: '2026-12-31T00:00:00Z' });
    const noDate = item({ status: 'active', announcedDate: null });
    const announced = item({ status: 'active', announcedDate: '2026-01-01T00:00:00Z' });
    expect(matchesStatusFilter(inProgress, '進度中', TODAY)).toBe(true);
    expect(matchesStatusFilter(noDate, '進度中', TODAY)).toBe(true);
    expect(matchesStatusFilter(announced, '進度中', TODAY)).toBe(false);
  });

  it('衍生值 失效/作廢 → 對應原始 inactive/void', () => {
    expect(matchesStatusFilter(item({ status: 'inactive' }), '失效', TODAY)).toBe(true);
    expect(matchesStatusFilter(item({ status: 'void' }), '作廢', TODAY)).toBe(true);
    expect(matchesStatusFilter(item({ status: 'active' }), '失效', TODAY)).toBe(false);
  });
});

describe('applyDocumentQuery（F017 篩選/排序/分頁純函式）', () => {
  it('TS-F017-004 依制定部門精確篩選', () => {
    const rows = [item({ id: 'A', draftingDeptId: 'deptX' }), item({ id: 'B', draftingDeptId: 'deptY' })];
    const r = applyDocumentQuery(rows, { draftingDeptId: 'deptX' }, TODAY);
    expect(r.items.map((x) => x.id)).toEqual(['A']);
  });

  it('TS-F017-005 依制定室別精確篩選', () => {
    const rows = [item({ id: 'A', draftingSectionId: 'secX' }), item({ id: 'B', draftingSectionId: 'secY' })];
    expect(applyDocumentQuery(rows, { draftingSectionId: 'secX' }, TODAY).items.map((x) => x.id)).toEqual(['A']);
  });

  it('TS-F017-006 依制定公司精確篩選', () => {
    const rows = [item({ id: 'A', draftingCompanyId: 'coX' }), item({ id: 'B', draftingCompanyId: 'coY' })];
    expect(applyDocumentQuery(rows, { draftingCompanyId: 'coX' }, TODAY).items.map((x) => x.id)).toEqual(['A']);
  });

  it('TS-F017-007 依當責室長 primaryChiefId 精確篩選', () => {
    const rows = [item({ id: 'A', primaryChiefId: 'E12345' }), item({ id: 'B', primaryChiefId: 'E67890' })];
    expect(applyDocumentQuery(rows, { primaryChiefId: 'E12345' }, TODAY).items.map((x) => x.id)).toEqual(['A']);
  });

  it('TS-F017-009 依程序書編號精確選取（區別於 keyword 模糊）', () => {
    const rows = [
      item({ id: 'A', documentNumber: 'ICSOP-SRC-101-1-01' }),
      item({ id: 'B', documentNumber: 'ICSOP-SRC-101-1-02' }),
    ];
    const exact = applyDocumentQuery(rows, { documentNumber: 'ICSOP-SRC-101-1-01' }, TODAY);
    expect(exact.items.map((x) => x.id)).toEqual(['A']);
    const fuzzy = applyDocumentQuery(rows, { keyword: 'ICSOP-SRC-101-1' }, TODAY);
    expect(fuzzy.items.map((x) => x.id).sort()).toEqual(['A', 'B']);
  });

  it('TS-F017-010 依程序書書名精確選取', () => {
    const rows = [item({ id: 'A', documentName: '車輛分期進件作業' }), item({ id: 'B', documentName: '車輛分期進件作業補充' })];
    expect(applyDocumentQuery(rows, { documentName: '車輛分期進件作業' }, TODAY).items.map((x) => x.id)).toEqual(['A']);
  });

  it('TS-F017-011/012 依衍生狀態 已公告 / 進度中 篩選', () => {
    const rows = [
      item({ id: 'A', status: 'active', announcedDate: '2026-01-01T00:00:00Z' }),
      item({ id: 'B', status: 'active', announcedDate: '2026-12-31T00:00:00Z' }),
      item({ id: 'C', status: 'inactive' }),
    ];
    expect(applyDocumentQuery(rows, { status: '已公告' }, TODAY).items.map((x) => x.id)).toEqual(['A']);
    expect(applyDocumentQuery(rows, { status: '進度中' }, TODAY).items.map((x) => x.id)).toEqual(['B']);
  });

  it('TS-F017-013 依衍生狀態 失效 / 作廢 篩選', () => {
    const rows = [item({ id: 'C', status: 'inactive' }), item({ id: 'D', status: 'void' })];
    expect(applyDocumentQuery(rows, { status: '失效' }, TODAY).items.map((x) => x.id)).toEqual(['C']);
    expect(applyDocumentQuery(rows, { status: '作廢' }, TODAY).items.map((x) => x.id)).toEqual(['D']);
  });

  it('TS-F017-014 複合篩選（制定部門 + 狀態）取交集', () => {
    const rows = [
      item({ id: 'A', draftingDeptId: 'deptX', status: 'active' }),
      item({ id: 'B', draftingDeptId: 'deptX', status: 'inactive' }),
      item({ id: 'C', draftingDeptId: 'deptY', status: 'active' }),
    ];
    const r = applyDocumentQuery(rows, { draftingDeptId: 'deptX', status: 'active' }, TODAY);
    expect(r.items.map((x) => x.id)).toEqual(['A']);
  });

  it('TS-F017-015 依程序書編號排序（遞增）', () => {
    const rows = [item({ id: '3', documentNumber: 'N-3' }), item({ id: '1', documentNumber: 'N-1' }), item({ id: '2', documentNumber: 'N-2' })];
    const r = applyDocumentQuery(rows, { sortBy: 'documentNumber', sortDir: 'asc' }, TODAY);
    expect(r.items.map((x) => x.documentNumber)).toEqual(['N-1', 'N-2', 'N-3']);
  });

  it('TS-F017-016 依公告日期排序（遞增）', () => {
    const rows = [
      item({ id: '3', announcedDate: '2026-03-01T00:00:00Z' }),
      item({ id: '1', announcedDate: '2026-01-01T00:00:00Z' }),
      item({ id: '2', announcedDate: '2026-02-01T00:00:00Z' }),
    ];
    const r = applyDocumentQuery(rows, { sortBy: 'announcedDate', sortDir: 'asc' }, TODAY);
    expect(r.items.map((x) => x.id)).toEqual(['1', '2', '3']);
  });

  it('TS-F017-017 announcedDate=null 排序不拋錯、筆數不短少（null 排最後）', () => {
    const rows = [
      item({ id: '2', announcedDate: '2026-02-01T00:00:00Z' }),
      item({ id: 'null', announcedDate: null }),
      item({ id: '1', announcedDate: '2026-01-01T00:00:00Z' }),
    ];
    const r = applyDocumentQuery(rows, { sortBy: 'announcedDate', sortDir: 'asc' }, TODAY);
    expect(r.items).toHaveLength(3);
    expect(r.items[r.items.length - 1].id).toBe('null');
  });

  it('TS-F017-018 未指定排序 → 保留輸入順序（既有 updatedAt DESC 由 store 提供）', () => {
    const rows = [item({ id: 'x' }), item({ id: 'y' }), item({ id: 'z' })];
    const r = applyDocumentQuery(rows, {}, TODAY);
    expect(r.items.map((x) => x.id)).toEqual(['x', 'y', 'z']);
  });

  it('TS-F017-019 分頁：page/pageSize 取對應區段', () => {
    const rows = ['1', '2', '3', '4', '5'].map((id) => item({ id }));
    const r = applyDocumentQuery(rows, { page: 2, pageSize: 2 }, TODAY);
    expect(r.items.map((x) => x.id)).toEqual(['3', '4']);
    expect(r.total).toBe(5);
    expect(r.hasNext).toBe(true);
  });

  it('TS-F017-020 分頁邊界：整數倍時末頁不多出空頁', () => {
    const rows = ['1', '2', '3', '4'].map((id) => item({ id }));
    const r = applyDocumentQuery(rows, { page: 2, pageSize: 2 }, TODAY);
    expect(r.items.map((x) => x.id)).toEqual(['3', '4']);
    expect(r.hasNext).toBe(false);
  });

  it('TS-F017-021 分頁超出總頁數 → 空陣列非錯誤', () => {
    const rows = ['1', '2'].map((id) => item({ id }));
    const r = applyDocumentQuery(rows, { page: 5, pageSize: 10 }, TODAY);
    expect(r.items).toEqual([]);
    expect(r.total).toBe(2);
    expect(r.hasNext).toBe(false);
  });

  it('TS-F017-022 分頁與篩選共同作用 → 先篩選/排序再切片', () => {
    const rows = [
      item({ id: 'a', status: 'active' }),
      item({ id: 'b', status: 'inactive' }),
      item({ id: 'c', status: 'active' }),
      item({ id: 'd', status: 'active' }),
      item({ id: 'e', status: 'inactive' }),
    ];
    const r = applyDocumentQuery(rows, { status: 'active', page: 1, pageSize: 2 }, TODAY);
    expect(r.total).toBe(3);
    expect(r.items.map((x) => x.id)).toEqual(['a', 'c']);
    expect(r.hasNext).toBe(true);
  });

  it('TS-F017-025 篩選後無結果 → 空陣列（非錯誤）', () => {
    const rows = [item({ id: 'a', status: 'active' })];
    const r = applyDocumentQuery(rows, { status: '作廢' }, TODAY);
    expect(r.items).toEqual([]);
    expect(r.total).toBe(0);
  });

  it('既有 keyword 模糊比對（不分大小寫）仍運作', () => {
    const rows = [item({ id: 'a', documentName: '車輛分期' }), item({ id: 'b', documentName: '房屋貸款' })];
    expect(applyDocumentQuery(rows, { keyword: '車輛' }, TODAY).items.map((x) => x.id)).toEqual(['a']);
  });
});
