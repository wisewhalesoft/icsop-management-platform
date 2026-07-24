import { randomUUID } from 'crypto';
import { DagService } from './dag.service';
import { CreateNodeInput, DagStore, EdgeRow, NodeView } from './dag.store';
import { NodeDocsService } from './node-docs.service';
import { DocLite, DocRef, NodeDocsStore, NodeInfo } from './node-docs.store';
import {
  DagStructuralTx,
  NodeDocsStructuralTx,
} from './lifecycle-structural-change';
import { LifecycleChangedEvent } from './lifecycle-change-event';
import { buildSnapshotGraph, SnapshotDocRef, SnapshotGraph } from './lifecycle-snapshot-builder';

/**
 * §A.4 交易一致性行為契約（TS-LCC-A-005~011）。以「可模擬交易 commit/rollback 之假體」驗證核心不變量：
 * 「結構寫入 + 快照插入 + 變更日誌插入」三者同進退（任一失敗其餘不得殘留）。不綁定 store 確切實作手法。
 */

interface LogRow {
  id: string;
  snapshotId: string;
  changeType: string;
  summary: string;
}
interface SnapRow {
  id: string;
  changeLogId: string;
  lifecycleId: string;
  graph: SnapshotGraph;
}

/** 以「暫存區 + commit/rollback」模擬單一交易之 DagStore。 */
class FakeTransactionalDagStore implements DagStore {
  committed: { nodes: NodeView[]; edges: EdgeRow[] } = { nodes: [], edges: [] };
  changeLogRows: LogRow[] = [];
  snapshotRows: SnapRow[] = [];
  failRecord = false;
  private seq = 0;

  async lifecycleExists(): Promise<boolean> {
    return true;
  }
  async listNodes(lc: string): Promise<NodeView[]> {
    return this.committed.nodes.filter((n) => n.lifecycleId === lc);
  }
  async listEdges(): Promise<EdgeRow[]> {
    return this.committed.edges;
  }
  async nodeExists(lc: string, id: string): Promise<boolean> {
    return this.committed.nodes.some((n) => n.lifecycleId === lc && n.id === id);
  }
  async createNode(lc: string, input: CreateNodeInput): Promise<NodeView> {
    const n: NodeView = { id: `n${++this.seq}`, lifecycleId: lc, ...input };
    this.committed.nodes.push(n);
    return n;
  }
  async updateNode(id: string, patch: Partial<NodeView>): Promise<NodeView> {
    const n = this.committed.nodes.find((x) => x.id === id)!;
    Object.assign(n, patch);
    return { ...n };
  }
  async deleteNodeWithEdges(id: string): Promise<void> {
    this.committed.nodes = this.committed.nodes.filter((n) => n.id !== id);
    this.committed.edges = this.committed.edges.filter(
      (e) => e.sourceNodeId !== id && e.targetNodeId !== id,
    );
  }
  async createEdge(_lc: string, s: string, t: string): Promise<EdgeRow> {
    const e: EdgeRow = { id: `e${++this.seq}`, sourceNodeId: s, targetNodeId: t };
    this.committed.edges.push(e);
    return e;
  }
  async deleteEdge(id: string): Promise<void> {
    this.committed.edges = this.committed.edges.filter((e) => e.id !== id);
  }

  async runStructuralChange<T>(work: (tx: DagStructuralTx) => Promise<T>): Promise<T> {
    // 暫存區＝目前已提交狀態之深拷貝；work 內之寫入僅動暫存區。
    const staged = {
      nodes: this.committed.nodes.map((n) => ({ ...n })),
      edges: this.committed.edges.map((e) => ({ ...e })),
    };
    const stagedLog: LogRow[] = [];
    const stagedSnap: SnapRow[] = [];
    const tx: DagStructuralTx = {
      createNode: async (lc, input) => {
        const n: NodeView = { id: `n${++this.seq}`, lifecycleId: lc, ...input };
        staged.nodes.push(n);
        return n;
      },
      updateNode: async (id, patch) => {
        const n = staged.nodes.find((x) => x.id === id)!;
        Object.assign(n, patch);
        return { ...n };
      },
      deleteNodeWithEdges: async (id) => {
        staged.nodes = staged.nodes.filter((n) => n.id !== id);
        staged.edges = staged.edges.filter((e) => e.sourceNodeId !== id && e.targetNodeId !== id);
      },
      createEdge: async (_lc, s, t) => {
        const e: EdgeRow = { id: `e${++this.seq}`, sourceNodeId: s, targetNodeId: t };
        staged.edges.push(e);
        return e;
      },
      deleteEdge: async (id) => {
        staged.edges = staged.edges.filter((e) => e.id !== id);
      },
      listNodes: async (lc) => staged.nodes.filter((n) => n.lifecycleId === lc),
      listEdges: async () => staged.edges,
      nodeExists: async (lc, id) => staged.nodes.some((n) => n.lifecycleId === lc && n.id === id),
      recordStructuralChange: async (event: LifecycleChangedEvent) => {
        if (this.failRecord) throw new Error('DB down（模擬快照/日誌寫入失敗）');
        const changeLogId = randomUUID();
        const snapshotId = randomUUID();
        const graph = buildSnapshotGraph(
          staged.nodes.filter((n) => n.lifecycleId === event.lifecycleId),
          staged.edges,
          new Map(),
        );
        stagedLog.push({ id: changeLogId, snapshotId, changeType: event.changeType, summary: event.summary });
        stagedSnap.push({ id: snapshotId, changeLogId, lifecycleId: event.lifecycleId, graph });
        return { changeLogId, snapshotId };
      },
    };
    // work 拋錯 → 不提交暫存區（rollback）；成功 → 一次性提交。
    const result = await work(tx);
    this.committed = staged;
    this.changeLogRows.push(...stagedLog);
    this.snapshotRows.push(...stagedSnap);
    return result;
  }
}

const actor = { accountId: 'acc-1', name: '李慧玲', employeeNo: '20233' };

describe('DagService F038 交易一致性（§A.4）', () => {
  let store: FakeTransactionalDagStore;
  let svc: DagService;
  beforeEach(() => {
    store = new FakeTransactionalDagStore();
    svc = new DagService(store, undefined, () => new Date('2026-07-16T00:00:00Z'));
  });

  it('TS-LCC-A-005 成功：addNode → 結構列+快照列+日誌列三者皆落地，snapshotId/changeLogId 互相交叉引用', async () => {
    await svc.addNode('lc1', { name: '進件作業' }, actor);
    expect(store.changeLogRows).toHaveLength(1);
    expect(store.snapshotRows).toHaveLength(1);
    expect(store.changeLogRows[0].snapshotId).toBe(store.snapshotRows[0].id);
    expect(store.snapshotRows[0].changeLogId).toBe(store.changeLogRows[0].id);
    // 快照含剛建立之節點。
    expect(store.snapshotRows[0].graph.nodes.map((n) => n.name)).toEqual(['進件作業']);
  });

  it('TS-LCC-A-006 快照/日誌寫入失敗 → 結構列亦回滾（節點不得殘留）', async () => {
    store.failRecord = true;
    await expect(svc.addNode('lc1', { name: 'X' }, actor)).rejects.toThrow('DB down');
    const graph = await svc.getGraph('lc1');
    expect(graph.nodes).toHaveLength(0); // 結構寫入亦回滾
    expect(store.changeLogRows).toHaveLength(0);
    expect(store.snapshotRows).toHaveLength(0);
  });

  it('TS-LCC-A-007 結構驗證擋下（addEdge 成環）→ 完全不產生快照/日誌列', async () => {
    const a = await svc.addNode('lc1', { name: 'A' }, actor);
    const b = await svc.addNode('lc1', { name: 'B' }, actor);
    await svc.addEdge('lc1', a.id, b.id, actor);
    const logsBefore = store.changeLogRows.length;
    await expect(svc.addEdge('lc1', b.id, a.id, actor)).rejects.toThrow('DAG_CYCLE_DETECTED');
    expect(store.changeLogRows).toHaveLength(logsBefore); // 未新增
    expect(store.changeLogRows.length).toBe(store.snapshotRows.length);
  });

  it('TS-LCC-A-008 deleteNode（連動刪其邊）→ 快照反映刪除後之淨結構', async () => {
    const a = await svc.addNode('lc1', { name: 'A' }, actor);
    const b = await svc.addNode('lc1', { name: 'B' }, actor);
    await svc.addEdge('lc1', a.id, b.id, actor);
    await svc.deleteNode(a.id, { lifecycleId: 'lc1', actor });
    const last = store.snapshotRows[store.snapshotRows.length - 1];
    expect(last.graph.nodes).toHaveLength(1); // 不含被刪節點
    expect(last.graph.edges).toHaveLength(0); // 該邊連動刪除
  });

  it('TS-LCC-A-011 連續 3 個原子操作 → 3 筆獨立快照列（不聚合）', async () => {
    const a = await svc.addNode('lc1', { name: 'A' }, actor);
    const b = await svc.addNode('lc1', { name: 'B' }, actor);
    await svc.addEdge('lc1', a.id, b.id, actor);
    expect(store.snapshotRows).toHaveLength(3);
    expect(store.changeLogRows).toHaveLength(3);
  });
});

// ── NodeDocs 交易一致性（A-009/A-010）──
class FakeTransactionalNodeDocsStore implements NodeDocsStore {
  committed = {
    nodes: [
      { id: 'nA', lifecycleId: 'lc1', name: '進件作業', positionX: 0, positionY: 0 },
      { id: 'nB', lifecycleId: 'lc1', name: '簽約對保作業', positionX: 0, positionY: 0 },
    ],
    docs: [
      {
        id: 'd1',
        lifecycleId: 'lc1',
        nodeId: null as string | null,
        documentNumber: 'ICSOP-SRC-101',
        documentName: '車輛分期進件作業',
      },
    ],
  };
  changeLogRows: LogRow[] = [];
  snapshotRows: SnapRow[] = [];
  private seq = 0;

  async getNode(lc: string, id: string): Promise<NodeInfo | null> {
    const n = this.committed.nodes.find((x) => x.id === id && x.lifecycleId === lc);
    return n ? { id: n.id, lifecycleId: n.lifecycleId, name: n.name } : null;
  }
  async listLifecycleDocs(lc: string): Promise<DocRef[]> {
    return this.committed.docs
      .filter((d) => d.lifecycleId === lc)
      .map((d) => ({ id: d.id, documentNumber: d.documentNumber, documentName: d.documentName, nodeId: d.nodeId }));
  }
  async getDoc(id: string): Promise<DocLite | null> {
    const d = this.committed.docs.find((x) => x.id === id);
    return d ? { id: d.id, lifecycleId: d.lifecycleId, nodeId: d.nodeId } : null;
  }
  async setDocNode(id: string, nodeId: string | null): Promise<void> {
    this.committed.docs.find((x) => x.id === id)!.nodeId = nodeId;
  }
  async nodeNames(ids: string[]): Promise<Map<string, string | null>> {
    return new Map(this.committed.nodes.filter((n) => ids.includes(n.id)).map((n) => [n.id, n.name]));
  }

  async runStructuralChange<T>(work: (tx: NodeDocsStructuralTx) => Promise<T>): Promise<T> {
    const staged = {
      nodes: this.committed.nodes.map((n) => ({ ...n })),
      docs: this.committed.docs.map((d) => ({ ...d })),
    };
    const stagedLog: LogRow[] = [];
    const stagedSnap: SnapRow[] = [];
    const tx: NodeDocsStructuralTx = {
      getNode: async (lc, id) => {
        const n = staged.nodes.find((x) => x.id === id && x.lifecycleId === lc);
        return n ? { id: n.id, lifecycleId: n.lifecycleId, name: n.name } : null;
      },
      getDoc: async (id) => {
        const d = staged.docs.find((x) => x.id === id);
        return d ? { id: d.id, lifecycleId: d.lifecycleId, nodeId: d.nodeId } : null;
      },
      listLifecycleDocs: async (lc) =>
        staged.docs
          .filter((d) => d.lifecycleId === lc)
          .map((d) => ({ id: d.id, documentNumber: d.documentNumber, documentName: d.documentName, nodeId: d.nodeId })),
      setDocNode: async (id, nodeId) => {
        staged.docs.find((x) => x.id === id)!.nodeId = nodeId;
      },
      recordStructuralChange: async (event: LifecycleChangedEvent) => {
        const changeLogId = randomUUID();
        const snapshotId = randomUUID();
        const docsByNode = new Map<string, SnapshotDocRef[]>();
        for (const d of staged.docs.filter((x) => x.lifecycleId === event.lifecycleId && x.nodeId)) {
          const arr = docsByNode.get(d.nodeId!) ?? docsByNode.set(d.nodeId!, []).get(d.nodeId!)!;
          arr.push({ id: d.id, documentNumber: d.documentNumber });
        }
        const graph = buildSnapshotGraph(
          staged.nodes.filter((n) => n.lifecycleId === event.lifecycleId),
          [],
          docsByNode,
        );
        stagedLog.push({ id: changeLogId, snapshotId, changeType: event.changeType, summary: event.summary });
        stagedSnap.push({ id: snapshotId, changeLogId, lifecycleId: event.lifecycleId, graph });
        return { changeLogId, snapshotId };
      },
    };
    const result = await work(tx);
    this.committed = staged;
    this.changeLogRows.push(...stagedLog);
    this.snapshotRows.push(...stagedSnap);
    return result;
  }
}

describe('NodeDocsService F038 交易一致性（§A.4）', () => {
  let store: FakeTransactionalNodeDocsStore;
  let svc: NodeDocsService;
  beforeEach(() => {
    store = new FakeTransactionalNodeDocsStore();
    svc = new NodeDocsService(store, undefined, () => new Date('2026-07-16T00:00:00Z'));
  });

  it('TS-LCC-A-009 mount → 快照該節點 docs 含新掛載文件（id+documentNumber）', async () => {
    await svc.mount('lc1', 'nA', 'd1', false, actor);
    expect(store.snapshotRows).toHaveLength(1);
    const nA = store.snapshotRows[0].graph.nodes.find((n) => n.id === 'nA')!;
    expect(nA.docs).toEqual([{ id: 'd1', documentNumber: 'ICSOP-SRC-101' }]);
  });

  it('TS-LCC-A-010 unmount → 快照該節點 docs 不再含該文件', async () => {
    store.committed.docs[0].nodeId = 'nA';
    await svc.unmount('lc1', 'nA', 'd1', actor);
    expect(store.snapshotRows).toHaveLength(1);
    const nA = store.snapshotRows[0].graph.nodes.find((n) => n.id === 'nA')!;
    expect(nA.docs).toEqual([]);
  });
});
