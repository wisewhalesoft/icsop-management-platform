import { DocumentsService } from './documents.service';
import { DocumentStore, DocumentListItem, DocumentListFilters, DocSecondaryChiefRef } from './documents.store';
import type { DagStore, NodeView, EdgeRow } from '../lifecycle/dag.store';
import type { LifecycleStore, LifecycleView } from '../lifecycle/lifecycle.store';

/**
 * F017 §節點子樹篩選（deep link）delta（2026-08-21 三項裁決第 3 項）—— `DocumentsService.listDocuments`
 * 層級之整合：`AC-T40` ④⑤（子樹走訪歸屬與同一次解析呼叫）／`AC-T41`（四種殘缺情形之靜默 no-op）／
 * `AC-T45`（`subtreeFilter` 描述子契約，含 `lifecycleName` ＝ `lifecycleDisplayName()` 輸出）。
 *
 * 權威＝`docs/specs/features/F017-backend-document-list.md#subtree-filter-delta`
 *      ＋ `docs/specs/architecture-spec.md` §12.3（決策 C3）／§12.1（決策 C1）。
 *
 * 🔴 DI 形狀為 test-generator 之命名決定（架構文件明文「確切檔名不綁死」，命名與檔案組織留給
 * tdd-implementation）：`DocumentsService` 追加注入 `LifecycleStore`（第 7 個建構子參數）與
 * `DagStore`（第 8 個），沿用既有 `lifecycle.store.ts`／`dag.store.ts` 之既有介面（比照
 * `lifecycle-preview.service.spec.ts` 之 `fakeLifecycles()`／`fakeDag()` 既有慣例）。
 * `svc.listDocuments(filters)` 之 `filters` 物件本身直接攜帶 `lifecycleId`／`nodeSubtreeId`
 * 兩個新增選填鍵。若 tdd-implementation 之實際簽章不同，請走 mailbox 申訴——本檔僅需調整
 * `new DocumentsService(...)` 呼叫處與 filters 物件鍵名，語意斷言不需重寫。
 *
 * ⚠ 對實作全盲：本檔預期一開始為紅——`DocumentsService.listDocuments` 尚不認得
 * `lifecycleId`／`nodeSubtreeId`，回應亦無 `subtreeFilter` 欄位。
 */

class FakeStore implements Partial<DocumentStore> {
  docs: DocumentListItem[] = [];
  seq = 1;

  seedDoc(over: Partial<DocumentListItem>): DocumentListItem {
    const d: DocumentListItem = {
      id: `doc-${this.seq++}`, status: 'active', documentNumber: 'N', documentName: '書名',
      lifecycleId: 'lc1', lifecycleName: null, nodeId: null,
      draftingCompanyId: null, draftingDeptId: null, draftingSectionId: null,
      draftingCompanyName: null, draftingDeptName: null, draftingSectionName: null,
      primaryChiefId: null, primaryChiefName: null,
      secondaryChiefCount: 0, secondaryChiefNames: [], secondaryChiefIds: [], hasOjt: false,
      edition: null, announcedDate: null, contentSummary: null,
      icsopPdfBlobPath: null, icsopPdfFileName: null, links: [],
      ...over,
    };
    this.docs.push(d);
    return d;
  }

  list(f: DocumentListFilters): Promise<{
    items: DocumentListItem[]; total: number; page: number; pageSize: number; hasNext: boolean;
  }> {
    // 最小可行實作：僅實作本檔所需之 nodeIdIn 篩選（真正之 applyDocumentQuery 由既有
    // document-list-query.subtreeFilter.spec.ts 獨立驗證，本檔只驗 service 層之接線）。
    let rows = this.docs;
    if (f.nodeIdIn && f.nodeIdIn.length > 0) {
      const set = new Set(f.nodeIdIn);
      rows = rows.filter((d) => d.nodeId !== null && set.has(d.nodeId));
    }
    return Promise.resolve({ items: rows, total: rows.length, page: 1, pageSize: 2000, hasNext: false });
  }

  // 管線接線：DocumentsService.listDocuments() 之既有富化步驟（次要室長）需要此方法存在；
  // 本檔不驗證富化本身（已由既有 documents.service.spec.ts 覆蓋），固定回空集合即可。
  findSecondaryChiefsByDocumentIds(): Promise<DocSecondaryChiefRef[]> {
    return Promise.resolve([]);
  }
}

function fakeDag(nodes: NodeView[], edges: EdgeRow[]): DagStore {
  return { listNodes: () => Promise.resolve(nodes), listEdges: () => Promise.resolve(edges) } as unknown as DagStore;
}
function fakeLifecycles(rows: LifecycleView[]): LifecycleStore {
  return { findById: (id: string) => Promise.resolve(rows.find((r) => r.id === id) ?? null) } as unknown as LifecycleStore;
}

const nv = (id: string, name = id): NodeView => ({
  id, lifecycleId: 'lc1', name, positionX: 0, positionY: 0, docCount: 0,
});
const ev = (id: string, s: string, t: string): EdgeRow => ({ id, sourceNodeId: s, targetNodeId: t });

const LC1 = { id: 'lc1', name: '銷售及收款循環', subcategory: '消金', description: null, status: 'active', nodeCount: 2, updatedAt: new Date() } as unknown as LifecycleView;

function buildSvc(nodes: NodeView[], edges: EdgeRow[], lifecycles: LifecycleView[] = [LC1]) {
  const store = new FakeStore();
  const svc = new DocumentsService(
    store as unknown as DocumentStore,
    undefined, undefined, undefined, undefined, undefined,
    fakeLifecycles(lifecycles),
    fakeDag(nodes, edges),
  );
  return { store, svc };
}

describe('DocumentsService.listDocuments — F017 AC-T40 子樹篩選之解析與下推', () => {
  it('TS-T40-S01 lifecycleId+nodeSubtreeId 皆可解析 → 僅回傳子樹內文件（子樹＝r 及其下游 c1）', async () => {
    const { store, svc } = buildSvc([nv('r'), nv('c1'), nv('other')], [ev('e1', 'r', 'c1')]);
    store.seedDoc({ id: 'A', nodeId: 'r' });
    store.seedDoc({ id: 'B', nodeId: 'c1' });
    store.seedDoc({ id: 'C', nodeId: 'other' });

    const page = await svc.listDocuments({ lifecycleId: 'lc1', nodeSubtreeId: 'r' });

    expect(page.items.map((i) => i.id).sort()).toEqual(['A', 'B']);
  });

  it('TS-T40-S02 ⑤ 篩選生效時 subtreeFilter 必同時 !== null（同一次解析呼叫）', async () => {
    const { store, svc } = buildSvc([nv('r')], []);
    store.seedDoc({ id: 'A', nodeId: 'r' });
    const page = await svc.listDocuments({ lifecycleId: 'lc1', nodeSubtreeId: 'r' });
    expect(page.items.map((i) => i.id)).toEqual(['A']);
    expect(page.subtreeFilter).not.toBeNull();
  });
});

describe('DocumentsService.listDocuments — F017 AC-T41 四種殘缺／無法解析情形 → 靜默 no-op', () => {
  it('TS-T41-S01 ① 只帶 lifecycleId → no-op：完整清單、subtreeFilter===null', async () => {
    const { store, svc } = buildSvc([nv('r')], []);
    store.seedDoc({ id: 'A', nodeId: 'r' });
    store.seedDoc({ id: 'B', nodeId: null });
    const page = await svc.listDocuments({ lifecycleId: 'lc1' });
    expect(page.items.map((i) => i.id).sort()).toEqual(['A', 'B']);
    expect(page.subtreeFilter).toBeNull();
  });

  it('TS-T41-S02 ② 只帶 nodeSubtreeId → no-op：完整清單、subtreeFilter===null', async () => {
    const { store, svc } = buildSvc([nv('r')], []);
    store.seedDoc({ id: 'A', nodeId: 'r' });
    const page = await svc.listDocuments({ nodeSubtreeId: 'r' });
    expect(page.items.map((i) => i.id)).toEqual(['A']);
    expect(page.subtreeFilter).toBeNull();
  });

  it('TS-T41-S03 ③ lifecycleId 不存在（查無此循環）→ no-op，非錯誤（不得 throw／不得回空集合）', async () => {
    const { store, svc } = buildSvc([nv('r')], []);
    store.seedDoc({ id: 'A', nodeId: 'r' });
    const page = await svc.listDocuments({ lifecycleId: 'lcGhost', nodeSubtreeId: 'r' });
    expect(page.items.map((i) => i.id)).toEqual(['A']);
    expect(page.subtreeFilter).toBeNull();
  });

  it('TS-T41-S04 ④ nodeSubtreeId 不屬於該 lifecycleId 之節點集合 → no-op（回傳未篩選之完整清單，非空結果）', async () => {
    const { store, svc } = buildSvc([nv('r')], []);
    store.seedDoc({ id: 'A', nodeId: 'r' });
    store.seedDoc({ id: 'B', nodeId: null });
    const page = await svc.listDocuments({ lifecycleId: 'lc1', nodeSubtreeId: 'ghost-node' });
    // ⚠ no-op ≠ 回 0 筆——期望是回傳未篩選之完整清單。
    expect(page.items.map((i) => i.id).sort()).toEqual(['A', 'B']);
    expect(page.subtreeFilter).toBeNull();
  });

  it('TS-T41-S05 未帶任一參數（既有行為）→ subtreeFilter 為顯式 null key（不省略）', async () => {
    const { svc } = buildSvc([nv('r')], []);
    const page = await svc.listDocuments({});
    expect('subtreeFilter' in page).toBe(true);
    expect(page.subtreeFilter).toBeNull();
  });
});

describe('DocumentsService.listDocuments — F017 AC-T45 subtreeFilter 描述子契約', () => {
  it('TS-T45-S01 描述子四欄逐字：lifecycleId／lifecycleName(=lifecycleDisplayName含子分類)／nodeId／nodeName', async () => {
    const { store, svc } = buildSvc([nv('r', '進件作業')], []);
    store.seedDoc({ id: 'A', nodeId: 'r' });
    const page = await svc.listDocuments({ lifecycleId: 'lc1', nodeSubtreeId: 'r' });
    expect(page.subtreeFilter).toEqual({
      lifecycleId: 'lc1',
      lifecycleName: '銷售及收款循環（消金）', // lifecycleDisplayName() 輸出，含子分類
      nodeId: 'r',
      nodeName: '進件作業',
    });
  });

  it('TS-T45-S02 nodeName 為 null 時如實延續（不代入任何字面，該由前端決定顯示規則）', async () => {
    const { store, svc } = buildSvc([nv('r', null as unknown as string)], []);
    store.seedDoc({ id: 'A', nodeId: 'r' });
    const page = await svc.listDocuments({ lifecycleId: 'lc1', nodeSubtreeId: 'r' });
    expect(page.subtreeFilter?.nodeName).toBeNull();
  });
});

describe('DocumentsService.listDocuments — F017 AC-T48 ⑥ 回應形狀回歸鎖定', () => {
  it('TS-T48-S01 既有五個頂層欄位逐字不變，subtreeFilter 為 additive 第 6 欄', async () => {
    const { svc } = buildSvc([nv('r')], []);
    const page = await svc.listDocuments({});
    expect(Object.keys(page).sort()).toEqual(
      ['hasNext', 'items', 'page', 'pageSize', 'subtreeFilter', 'total'].sort(),
    );
  });
});
