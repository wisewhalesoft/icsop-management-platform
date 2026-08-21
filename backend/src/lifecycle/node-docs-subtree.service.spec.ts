import { NodeDocsService } from './node-docs.service';
import { NodeDocsStore, NodeInfo, NodeMountedDoc } from './node-docs.store';
import type { DagStore, NodeView, EdgeRow } from './dag.store';

/**
 * F036 §抽屜擴為子樹 delta（2026-08-21 三項裁決第 2 項）—— `AC-T10`／`AC-T11`(a)／`AC-T12`(a)／
 * `AC-T13`(a)／`AC-T25`（子樹抽屜之新端點：分組與排序改由後端做）。
 *
 * 權威＝`docs/specs/features/F036-lifecycle-tree-preview.md#subtree-drawer-delta`
 *      ＋ `docs/specs/architecture-spec.md` §12.1（決策 C1）／§12.2（決策 C2）。
 *
 * 🔴 DI 形狀為 test-generator 之命名決定（架構文件明文「確切檔名不綁死」）：`NodeDocsService`
 * 追加注入 `DagStore`（比照 `LifecycleTreePreviewService` 已示範之「多 store 同時注入單一 service」
 * 既有模式，見 `lifecycle-preview.service.spec.ts` 之 `fakeDag()`），方法名定為
 * `listSubtreeDocuments(lifecycleId, nodeId)`。若 tdd-implementation 之自然設計與此不同，
 * 請走 mailbox 向 test-generator 申訴，本檔可調整簽章而不需重寫語意斷言。
 *
 * ⚠ **建構子第 2 個位置已實測非空**（實跑 ts-jest 之型別錯誤揭露，非讀取實作原始碼決定斷言——
 * 屬呼叫慣例探測，見 test-generator 記憶 `constructor-expansion-and-symbol-discovery`）：
 * 現有 `NodeDocsService` 建構子第 2 參數型別為 `LifecycleChangePublisher`（既有能力，非本 delta
 * 範圍），故本檔新增之 `DagStore` 一律放在**第 3 個位置**，第 2 個位置傳 `undefined`。
 *
 * ⚠ 對實作全盲：本檔預期一開始為紅——`NodeDocsService.listSubtreeDocuments` 尚不存在，故以
 * `asSubtree()` cast helper 呼叫，使編譯期通過、於**執行期**個別測試各自紅（而非拖垮整檔收集）。
 */

/** `listSubtreeDocuments` 尚未存在於 `NodeDocsService` 之型別——以此介面 cast，換取逐案執行期紅而非整檔編譯紅。 */
interface SubtreeGroup {
  nodeId: string;
  nodeName: string | null;
  documents: NodeMountedDoc[];
}
interface SubtreeResult {
  nodeId: string;
  totalCount: number;
  groups: SubtreeGroup[];
}
interface HasSubtree {
  listSubtreeDocuments(lifecycleId: string, nodeId: string): Promise<SubtreeResult>;
}
function asSubtree(svc: NodeDocsService): HasSubtree {
  return svc as unknown as HasSubtree;
}

type Row = NodeMountedDoc & { nodeId: string | null; lifecycleId: string };

class FakeNodeDocsStore {
  nodes: NodeInfo[] = [];
  rows: Row[] = [];
  batchCalls = 0;
  singleCalls = 0;

  node(id: string, lifecycleId = 'lc1', name: string | null = id): void {
    this.nodes.push({ id, lifecycleId, name });
  }

  row(over: Partial<Row> & { id: string }): void {
    this.rows.push({
      documentNumber: over.id,
      documentName: `${over.id} 作業`,
      edition: '1.0',
      status: 'active',
      announcedDate: '2026-07-01T00:00:00.000Z',
      nodeId: null,
      lifecycleId: 'lc1',
      ...over,
    });
  }

  getNode(lifecycleId: string, nodeId: string): Promise<NodeInfo | null> {
    return Promise.resolve(
      this.nodes.find((n) => n.id === nodeId && n.lifecycleId === lifecycleId) ?? null,
    );
  }

  listNodeMountedDocs(lifecycleId: string, nodeId: string): Promise<NodeMountedDoc[]> {
    this.singleCalls++;
    return Promise.resolve(this.rowsFor(lifecycleId, [nodeId]).get(nodeId) ?? []);
  }

  /** F036 subtree delta 新增之選填批次能力（§12.2）。 */
  listNodesMountedDocs(lifecycleId: string, nodeIds: string[]): Promise<Map<string, NodeMountedDoc[]>> {
    this.batchCalls++;
    return Promise.resolve(this.rowsFor(lifecycleId, nodeIds));
  }

  private rowsFor(lifecycleId: string, nodeIds: string[]): Map<string, NodeMountedDoc[]> {
    const set = new Set(nodeIds);
    const map = new Map<string, NodeMountedDoc[]>();
    for (const r of this.rows) {
      if (r.lifecycleId !== lifecycleId || r.nodeId === null || !set.has(r.nodeId)) continue;
      const { id, documentNumber, documentName, edition, status, announcedDate } = r;
      const list = map.get(r.nodeId) ?? [];
      list.push({ id, documentNumber, documentName, edition, status, announcedDate });
      map.set(r.nodeId, list);
    }
    return map;
  }

  asStore(): NodeDocsStore {
    return this as unknown as NodeDocsStore;
  }
}

function fakeDag(nodes: NodeView[], edges: EdgeRow[]): DagStore {
  return {
    listNodes: () => Promise.resolve(nodes),
    listEdges: () => Promise.resolve(edges),
  } as unknown as DagStore;
}

const nv = (id: string, name = id): NodeView => ({
  id, lifecycleId: 'lc1', name, positionX: 0, positionY: 0, docCount: 0,
});
const ev = (id: string, s: string, t: string): EdgeRow => ({ id, sourceNodeId: s, targetNodeId: t });

describe('NodeDocsService.listSubtreeDocuments（F036 AC-T10 子樹抽屜資料來源）', () => {
  let store: FakeNodeDocsStore;
  let svc: NodeDocsService;

  function setup(nodes: NodeView[], edges: EdgeRow[]): void {
    store = new FakeNodeDocsStore();
    for (const n of nodes) store.node(n.id, n.lifecycleId, n.name);
    svc = new NodeDocsService(store.asStore(), undefined, undefined, fakeDag(nodes, edges));
  }

  it('TS-T10-001 AC-T10 回傳 r 及其所有下游節點所掛載之全部程序書，依節點分組', async () => {
    setup([nv('r'), nv('c1'), nv('c2')], [ev('e1', 'r', 'c1'), ev('e2', 'r', 'c2')]);
    store.row({ id: 'D1', nodeId: 'r' });
    store.row({ id: 'D2', nodeId: 'c1' });
    store.row({ id: 'D3', nodeId: 'c2' });

    const res = await asSubtree(svc).listSubtreeDocuments('lc1', 'r');

    expect(res.nodeId).toBe('r');
    expect(res.totalCount).toBe(3);
    expect(res.groups.map((g) => g.nodeId).sort()).toEqual(['c1', 'c2', 'r']);
  });

  it('TS-T10-002 節點不存在 → NODE_NOT_FOUND（沿用既有錯誤碼慣例）', async () => {
    setup([nv('r')], []);
    await expect(asSubtree(svc).listSubtreeDocuments('lc1', 'ghost')).rejects.toThrow('NODE_NOT_FOUND');
  });

  it('TS-T10-003 他循環之同名節點文件不得混入子樹', async () => {
    setup([nv('r'), nv('c1')], [ev('e1', 'r', 'c1')]);
    store.node('c1', 'lcOther', 'c1'); // 他循環同名節點
    store.row({ id: 'DX', nodeId: 'c1', lifecycleId: 'lcOther' });
    store.row({ id: 'D1', nodeId: 'c1', lifecycleId: 'lc1' });

    const res = await asSubtree(svc).listSubtreeDocuments('lc1', 'r');
    expect(res.totalCount).toBe(1);
    expect(res.groups.find((g) => g.nodeId === 'c1')!.documents.map((d) => d.id)).toEqual(['D1']);
  });

  it('TS-T10-004 §12.4 #5：批次查詢無 N+1——listNodesMountedDocs 恰 1 次，不逐節點呼叫 listNodeMountedDocs', async () => {
    setup([nv('r'), nv('c1'), nv('c2')], [ev('e1', 'r', 'c1'), ev('e2', 'r', 'c2')]);
    store.row({ id: 'D1', nodeId: 'r' });
    store.row({ id: 'D2', nodeId: 'c1' });

    await asSubtree(svc).listSubtreeDocuments('lc1', 'r');

    expect(store.batchCalls).toBe(1);
    expect(store.singleCalls).toBe(0);
  });
});

describe('F036 AC-T11(a) 分組順序（後端 unit：三層 tie-break，無隨機性）', () => {
  it('TS-T11-001 ① 第一個分組恆為本節點（data-node-group-self 之後端半：nodeId===請求之 nodeId）', async () => {
    const store = new FakeNodeDocsStore();
    store.node('r'); store.node('c1');
    const svc = new NodeDocsService(
      store.asStore(),
      undefined,
      undefined,
      fakeDag([nv('r'), nv('c1')], [ev('e1', 'r', 'c1')]),
    );
    store.row({ id: 'D1', nodeId: 'r' });
    store.row({ id: 'D2', nodeId: 'c1' });

    const res = await asSubtree(svc).listSubtreeDocuments('lc1', 'r');
    expect(res.groups[0].nodeId).toBe('r');
  });

  /**
   * ③ 同層兩節點（y 同、x 異）依 pos.x 遞增排序——以「同一 parent 之兩個 child」構造，
   * buildTreeLayout 對同層 siblings 依輸入陣列序分配遞增 x 欄位（既有 buildTreeLayout 測試
   * 已確認「節點順序＝輸入序」，本條沿用同一假設；若 tdd-implementation 之實際欄位分配順序
   * 與輸入序不同，請走 mailbox 申訴，本條斷言之期望陣列可隨之調整）。
   */
  it('TS-T11-002 ③ 同層兩節點（pos.y 相同）依 pos.x 遞增排序（siblings 依輸入序分配欄位）', async () => {
    const store = new FakeNodeDocsStore();
    store.node('r'); store.node('cLeft'); store.node('cRight');
    const svc = new NodeDocsService(
      store.asStore(),
      undefined,
      undefined,
      fakeDag(
        [nv('r'), nv('cLeft'), nv('cRight')],
        [ev('e1', 'r', 'cLeft'), ev('e2', 'r', 'cRight')],
      ),
    );
    store.row({ id: 'D1', nodeId: 'cLeft' });
    store.row({ id: 'D2', nodeId: 'cRight' });

    const res = await asSubtree(svc).listSubtreeDocuments('lc1', 'r');
    // r 恰 0 份 ⇒ 依 AC-T12 不產生分組；僅 cLeft／cRight 依輸入序（欄位遞增）排列。
    expect(res.groups.map((g) => g.nodeId)).toEqual(['cLeft', 'cRight']);
  });

  it('TS-T11-003 不同層之節點依 pos.y 遞增（由上而下）排序', async () => {
    const store = new FakeNodeDocsStore();
    store.node('r'); store.node('c1'); store.node('g1');
    const svc = new NodeDocsService(
      store.asStore(),
      undefined,
      undefined,
      fakeDag(
        [nv('r'), nv('c1'), nv('g1')],
        [ev('e1', 'r', 'c1'), ev('e2', 'c1', 'g1')],
      ),
    );
    store.row({ id: 'D0', nodeId: 'r' });
    store.row({ id: 'D1', nodeId: 'c1' });
    store.row({ id: 'D2', nodeId: 'g1' });

    const res = await asSubtree(svc).listSubtreeDocuments('lc1', 'r');
    expect(res.groups.map((g) => g.nodeId)).toEqual(['r', 'c1', 'g1']);
  });

  /**
   * 📌 第③層 tie-break（x／y 皆相同時以節點 id 字典序打破平手）為防禦性保障，本輪未獨立以
   * fixture 覆蓋——構造兩個「真正同 x 同 y」之節點需仰賴 buildTreeLayout 內部欄位分配演算法
   * 之確切細節，而該演算法屬 production 原始碼（本 agent 對實作全盲，不得讀取以決定 fixture
   * 座標）。已登錄 risks-and-gaps.md（見 §T3 AC-T11 第三層 tie-break）。
   */
});

describe('F036 AC-T12(a) 掛載 0 份之節點不產生分組（後端）', () => {
  it('TS-T12-001 子樹含 0 份節點 → groups 不含該 nodeId，分組數可小於子樹節點數', async () => {
    const store = new FakeNodeDocsStore();
    store.node('r'); store.node('c1'); store.node('c2'); store.node('c3'); store.node('c4');
    const svc = new NodeDocsService(
      store.asStore(),
      undefined,
      undefined,
      fakeDag(
        [nv('r'), nv('c1'), nv('c2'), nv('c3'), nv('c4')],
        [ev('e1', 'r', 'c1'), ev('e2', 'r', 'c2'), ev('e3', 'r', 'c3'), ev('e4', 'r', 'c4')],
      ),
    );
    store.row({ id: 'D1', nodeId: 'c2' }); // 僅 c2 有文件；r/c1/c3/c4 皆 0 份

    const res = await asSubtree(svc).listSubtreeDocuments('lc1', 'r');
    expect(res.groups).toHaveLength(1);
    expect(res.groups[0].nodeId).toBe('c2');
  });
});

describe('F036 AC-T13(a) 去重、組內排序與合計自洽（後端）', () => {
  it('TS-T13-001 ① 去重鍵為 documentNumber，首次出現者（依分組順序）勝', async () => {
    const store = new FakeNodeDocsStore();
    store.node('r'); store.node('c1');
    const svc = new NodeDocsService(
      store.asStore(),
      undefined,
      undefined,
      fakeDag([nv('r'), nv('c1')], [ev('e1', 'r', 'c1')]),
    );
    // 同一 documentNumber 對應兩筆不同 id 之文件列（OQ-E04-01b：失效文件之編號可被重新使用）
    store.row({ id: 'D-old', documentNumber: 'ICSOP-SRC-1', nodeId: 'r' });
    store.row({ id: 'D-new', documentNumber: 'ICSOP-SRC-1', nodeId: 'c1' });

    const res = await asSubtree(svc).listSubtreeDocuments('lc1', 'r');
    expect(res.totalCount).toBe(1);
    // r 為第一分組 ⇒ r 內之 D-old 勝出，c1 分組不應含同編號之第二筆
    expect(res.groups[0].nodeId).toBe('r');
    expect(res.groups[0].documents.map((d) => d.id)).toEqual(['D-old']);
    expect(res.groups.find((g) => g.nodeId === 'c1')).toBeUndefined();
  });

  it('TS-T13-002 ② 組內依 documentNumber 遞增排序', async () => {
    const store = new FakeNodeDocsStore();
    store.node('r');
    const svc = new NodeDocsService(store.asStore(), undefined, undefined, fakeDag([nv('r')], []));
    store.row({ id: 'D1', documentNumber: 'ICSOP-B', nodeId: 'r' });
    store.row({ id: 'D2', documentNumber: 'ICSOP-A', nodeId: 'r' });

    const res = await asSubtree(svc).listSubtreeDocuments('lc1', 'r');
    expect(res.groups[0].documents.map((d) => d.documentNumber)).toEqual(['ICSOP-A', 'ICSOP-B']);
  });

  it('TS-T13-003 ③ totalCount 恆等於全部分組 documents 數之總和', async () => {
    const store = new FakeNodeDocsStore();
    store.node('r'); store.node('c1');
    const svc = new NodeDocsService(
      store.asStore(),
      undefined,
      undefined,
      fakeDag([nv('r'), nv('c1')], [ev('e1', 'r', 'c1')]),
    );
    store.row({ id: 'D1', nodeId: 'r' });
    store.row({ id: 'D2', nodeId: 'r' });
    store.row({ id: 'D3', nodeId: 'c1' });

    const res = await asSubtree(svc).listSubtreeDocuments('lc1', 'r');
    const sum = res.groups.reduce((s, g) => s + g.documents.length, 0);
    expect(res.totalCount).toBe(sum);
    expect(res.totalCount).toBe(3);
  });
});

describe('F036 AC-T25 ②③ 資料來源之結構性保證與 404', () => {
  it('TS-T25-001 ② 子樹全部節點必屬同一循環——他循環之邊/節點不可能被納入走訪（結構性保證）', async () => {
    const store = new FakeNodeDocsStore();
    store.node('r', 'lc1');
    // dagStore 僅回傳 lc1 範圍內之 nodes/edges（listNodes/listEdges 本即以 lifecycleId 限定）
    const svc = new NodeDocsService(store.asStore(), undefined, undefined, fakeDag([nv('r')], []));
    const res = await asSubtree(svc).listSubtreeDocuments('lc1', 'r');
    expect(res.groups.every((g) => ['r'].includes(g.nodeId))).toBe(true);
  });

  it('TS-T25-002 節點不存在（他循環查詢）→ NODE_NOT_FOUND', async () => {
    const store = new FakeNodeDocsStore();
    store.node('r', 'lc1');
    const svc = new NodeDocsService(store.asStore(), undefined, undefined, fakeDag([nv('r')], []));
    await expect(asSubtree(svc).listSubtreeDocuments('lcOther', 'r')).rejects.toThrow('NODE_NOT_FOUND');
  });
});
