/**
 * F043 UX16 delta — `resolveVisibleSubtreeDocumentIds()`（前台子樹篩選之解析層，
 * `AC-UX15` ④／`AC-UX27` ④，F019 delta 同一份重用實作）。
 *
 * 權威：docs/specs/features/F019-public-list-browsing.md#ux16-delta `AC-UX15`；
 * docs/specs/features/F043-business-function-category.md#ux16-delta `AC-UX27` ④；
 * docs/specs/architecture-spec.md §16.4（`ARCH-UX4`——本函式為既有
 * `PublicBusinessCategoryService.listSubtreeDocuments()` 內部運算之**重構抽出**，行為零改變）。
 *
 * ⚠ 對實作全盲：`./public-business-category-subtree` 尚不存在——import 失敗即本環之預期紅燈。
 *
 * 🔴 型別沿用既有 `public-business-category.store.ts`／`../rbac/viewer-scope.ts` 之既有匯出
 * （非新型別），語料形狀比照既有 `public-business-category.service.spec.ts` 之
 * `listSubtreeDocuments` 測試（n1→n2→n3 一條鏈 ＋ 子樹外之 n9）——因為本函式就是從那裡抽出來的，
 * 既有測試之期望值即本函式之行為契約。
 *
 * 🔴 §16.4 之縱深防禦：本函式回傳之 Set **已經**是「已公告 ＋ isDocVisibleToViewer」之子集，
 * `AC-B23`（既有）要求「此能力不得成為繞過 F041 限縮之側門」——即使呼叫端之第二層可見性過濾
 * 被誤刪，本函式自身仍是完整防線。
 */
import { UsingDeptRef, ViewerScope } from '../rbac/viewer-scope';
import {
  CategoryMountVisibilityRow,
  PublicCategoryEdgeInfo,
  PublicCategoryNodeInfo,
} from './public-business-category.store';
import { resolveVisibleSubtreeDocumentIds } from './public-business-category-subtree';

function viewer(over: Partial<ViewerScope>): ViewerScope {
  return { roleCode: 'User', userSubtype: 'business', orgCode: 'JAC00', companyCode: 'AS', ...over };
}
function depts(codes: string[], companyCode = 'AS'): UsingDeptRef[] {
  return codes.map((orgCode) => ({ companyCode, orgCode }));
}

// n1 → n2 → n3（一條鏈）＋ 與子樹無關之 n9（比照既有 service spec 之語料）。
const NODES: PublicCategoryNodeInfo[] = [
  { id: 'n1', name: '授信申請作業' },
  { id: 'n2', name: '風險評估作業' },
  { id: 'n3', name: '撥款作業' },
  { id: 'n9', name: '不相干作業' },
];
const EDGES: PublicCategoryEdgeInfo[] = [
  { id: 'e1', sourceNodeId: 'n1', targetNodeId: 'n2' },
  { id: 'e2', sourceNodeId: 'n2', targetNodeId: 'n3' },
];

const mount = (
  nodeId: string,
  documentId: string,
  announced: boolean,
  usingDepts: UsingDeptRef[],
): CategoryMountVisibilityRow => ({ nodeId, documentId, announced, usingDepts });

describe('resolveVisibleSubtreeDocumentIds — 子樹展開（本節點與全部下游，不含子樹外節點）', () => {
  it('回傳本節點與其下游（n1,n2,n3）之相異可見文件 id 集合；子樹外之 n9 不得混入', () => {
    const v = viewer({ orgCode: 'JAC00' });
    const mounts = [
      mount('n1', 'd1', true, depts(['JAC00'])),
      mount('n2', 'd2', true, depts(['JAC00'])),
      mount('n3', 'd3', true, depts(['JAC00'])),
      mount('n9', 'd9', true, depts(['JAC00'])), // 子樹外——不得出現
    ];
    const result = resolveVisibleSubtreeDocumentIds(NODES, EDGES, mounts, 'n1', v);
    expect([...result].sort()).toEqual(['d1', 'd2', 'd3']);
    expect(result.has('d9')).toBe(false);
  });

  it('自任一中段節點出發（n2）→ 只涵蓋該節點與其下游（n2,n3），不含上游 n1', () => {
    const v = viewer({ orgCode: 'JAC00' });
    const mounts = [
      mount('n1', 'd1', true, depts(['JAC00'])),
      mount('n2', 'd2', true, depts(['JAC00'])),
      mount('n3', 'd3', true, depts(['JAC00'])),
    ];
    const result = resolveVisibleSubtreeDocumentIds(NODES, EDGES, mounts, 'n2', v);
    expect([...result].sort()).toEqual(['d2', 'd3']);
    expect(result.has('d1')).toBe(false);
  });

  it('M:N 跨組不去重之相異數：同一份文件掛在子樹內兩個節點 → Set 仍只出現一次', () => {
    const v = viewer({ orgCode: 'JAC00' });
    const mounts = [mount('n1', 'd1', true, depts(['JAC00'])), mount('n2', 'd1', true, depts(['JAC00']))];
    const result = resolveVisibleSubtreeDocumentIds(NODES, EDGES, mounts, 'n1', v);
    expect([...result]).toEqual(['d1']);
  });
});

describe('resolveVisibleSubtreeDocumentIds — 可見性過濾（§16.4 之縱深防禦第一層）', () => {
  /**
   * 🔴 可測形狀（`AC-UX15` ④ 明訂）：一位業務子分類使用者，語料含一份「掛在該子樹節點上但
   * 使用部門不相符」之已公告文件 ⇒ 該文件不得出現在 Set 內——這正是本函式對抗「子樹篩選淪為
   * F041 側門」之全部防線所在。
   */
  it('🔴 使用部門不相符之已公告文件——不得出現（F041 限縮之核心防線）', () => {
    const v = viewer({ roleCode: 'User', userSubtype: 'business', orgCode: 'JAC00' });
    const mounts = [
      mount('n1', 'd1', true, depts(['JAC00'])), // 可見
      mount('n2', 'd2', true, depts(['JZZ00'])), // 部門不符——不可見
    ];
    const result = resolveVisibleSubtreeDocumentIds(NODES, EDGES, mounts, 'n1', v);
    expect(result.has('d1')).toBe(true);
    expect(result.has('d2')).toBe(false);
  });

  it('未公告之文件——不得出現（縱使部門相符）', () => {
    const v = viewer({ orgCode: 'JAC00' });
    const mounts = [mount('n1', 'd1', false, depts(['JAC00']))];
    const result = resolveVisibleSubtreeDocumentIds(NODES, EDGES, mounts, 'n1', v);
    expect(result.size).toBe(0);
  });

  it('整個子樹皆不可見 → 回傳空 Set（非錯誤）', () => {
    const v = viewer({ orgCode: 'JAC00' });
    const mounts = [mount('n1', 'd1', true, depts(['JZZ00']))];
    const result = resolveVisibleSubtreeDocumentIds(NODES, EDGES, mounts, 'n1', v);
    expect(result.size).toBe(0);
  });
});

describe('resolveVisibleSubtreeDocumentIds — 零 IO 純函式契約', () => {
  it('相同輸入多次呼叫，回傳內容相同（不依賴外部狀態、不快取跨呼叫之副作用）', () => {
    const v = viewer({ orgCode: 'JAC00' });
    const mounts = [mount('n1', 'd1', true, depts(['JAC00']))];
    const first = resolveVisibleSubtreeDocumentIds(NODES, EDGES, mounts, 'n1', v);
    const second = resolveVisibleSubtreeDocumentIds(NODES, EDGES, mounts, 'n1', v);
    expect([...first]).toEqual([...second]);
  });

  it('nodeId 查無（不存在於 nodes/edges）→ 回傳空 Set，不得拋出例外（呼叫端另行處理 404）', () => {
    const v = viewer({ orgCode: 'JAC00' });
    const result = resolveVisibleSubtreeDocumentIds(NODES, EDGES, [], 'ghost-node', v);
    expect(result.size).toBe(0);
  });
});
