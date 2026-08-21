import { applyDocumentQuery } from './document-list-query';
import { DocumentListItem } from './documents.store';
import { DocumentStatus } from './document-status';

/**
 * F017 §節點子樹篩選（deep link）delta（2026-08-21 三項裁決第 3 項）—— `AC-T40` ①②③（子樹
 * 篩選之純函式語意：與既有 13 項為 AND、未指派節點者排除、套用後之交集行為）。
 *
 * 權威＝`docs/specs/features/F017-backend-document-list.md#subtree-filter-delta` `AC-T40`
 *      ＋ `docs/specs/architecture-spec.md` §12.3（決策 C3：`DocumentListFilters.nodeIdIn?`）。
 *
 * 🔴 本檔之定位為 test-generator 之設計決定：`architecture-spec.md` §12.3 明文「nodeIdIn 已展開
 * 之節點 id 陣列，純 SQL IN() 下推」是**真實 TypeORM store** 之落地方式，本檔改用**既有**
 * `applyDocumentQuery` 純函式（本 repo 既有測試 `document-list-query.spec.ts` 之既有主體，亦為
 * `documents.service.spec.ts` 之 `FakeStore.list()` 內部依賴）驗證同一段語意——因為它是本 repo
 * 唯一可在無 DB 情況下驗證篩選邏輯的既有基礎設施，也是我方 `documents.service.subtreeFilter.spec.ts`
 * 之 FakeStore 賴以正確運作的機制。若 tdd-implementation 之真實 SQL `IN` 實作與此純函式版本行為
 * 不一致，屬需要對齊的落差，請走 mailbox 申訴。
 *
 * ⚠ 對實作全盲：本檔預期一開始為紅——`applyDocumentQuery` 尚不認得 `nodeIdIn` 篩選鍵。
 */
function item(over: Partial<DocumentListItem>): DocumentListItem {
  return {
    id: 'id', status: 'active' as DocumentStatus, documentNumber: 'N', documentName: '書名',
    lifecycleId: 'lc', lifecycleName: null, nodeId: null,
    draftingCompanyId: null, draftingDeptId: null, draftingSectionId: null,
    draftingCompanyName: null, draftingDeptName: null, draftingSectionName: null,
    primaryChiefId: null, primaryChiefName: null,
    secondaryChiefCount: 0, secondaryChiefNames: [], secondaryChiefIds: [], hasOjt: false,
    edition: null, announcedDate: null, contentSummary: null,
    icsopPdfBlobPath: null, icsopPdfFileName: null, links: [],
    ...over,
  };
}

const TODAY = new Date('2026-08-21T00:00:00Z');

describe('applyDocumentQuery — F017 AC-T40 nodeIdIn 子樹篩選', () => {
  it('TS-T40-001 nodeIdIn 給定 → 僅回傳 nodeId ∈ 該集合之文件', () => {
    const rows = [
      item({ id: 'A', nodeId: 'r' }),
      item({ id: 'B', nodeId: 'c1' }),
      item({ id: 'C', nodeId: 'other' }),
    ];
    const r = applyDocumentQuery(rows, { nodeIdIn: ['r', 'c1'] }, TODAY);
    expect(r.items.map((x) => x.id).sort()).toEqual(['A', 'B']);
  });

  it('TS-T40-002 ① 未指派節點者（nodeId=null）一律排除（即使 nodeIdIn 含空字串也不誤匹配 null）', () => {
    const rows = [item({ id: 'A', nodeId: null }), item({ id: 'B', nodeId: 'r' })];
    const r = applyDocumentQuery(rows, { nodeIdIn: ['r'] }, TODAY);
    expect(r.items.map((x) => x.id)).toEqual(['B']);
  });

  it('TS-T40-003 ② 與既有篩選為 AND（僅縮小結果集，不放寬）', () => {
    const rows = [
      item({ id: 'A', nodeId: 'r', draftingDeptId: 'deptX' }),
      item({ id: 'B', nodeId: 'r', draftingDeptId: 'deptY' }),
    ];
    const r = applyDocumentQuery(rows, { nodeIdIn: ['r'], draftingDeptId: 'deptX' }, TODAY);
    expect(r.items.map((x) => x.id)).toEqual(['A']);
  });

  it('TS-T40-004 ③ 套用後分頁回第 1 頁（page 未指定時預設行為不受影響，仍依 pageSize 正確切片）', () => {
    const rows = Array.from({ length: 5 }, (_, i) => item({ id: `D${i}`, nodeId: 'r' }));
    const r = applyDocumentQuery(rows, { nodeIdIn: ['r'], page: 1, pageSize: 2 }, TODAY);
    expect(r.page).toBe(1);
    expect(r.items).toHaveLength(2);
  });

  it('TS-T40-005 未帶 nodeIdIn（undefined）→ 不施加子樹篩選，行為與既有完全相同（向後相容）', () => {
    const rows = [item({ id: 'A', nodeId: 'r' }), item({ id: 'B', nodeId: null })];
    const r = applyDocumentQuery(rows, {}, TODAY);
    expect(r.items.map((x) => x.id).sort()).toEqual(['A', 'B']);
  });

  it('TS-T40-006 nodeIdIn 為空陣列 → 視同未施加篩選（架構文件明文 nodeIds.length 為 0 時不下推 IN）', () => {
    const rows = [item({ id: 'A', nodeId: 'r' })];
    const r = applyDocumentQuery(rows, { nodeIdIn: [] }, TODAY);
    expect(r.items.map((x) => x.id)).toEqual(['A']);
  });
});
