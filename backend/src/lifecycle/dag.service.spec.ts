import { DagService } from './dag.service';
import {
  DagStore,
  NodeView,
  EdgeRow,
  CreateNodeInput,
} from './dag.store';

class FakeDagStore implements DagStore {
  seq = 1;
  nodes: NodeView[] = [];
  edges: EdgeRow[] = [];

  node(id: string, lifecycleId = 'lc1'): NodeView {
    const n = { id, lifecycleId, name: id, positionX: 0, positionY: 0 };
    this.nodes.push(n);
    return n;
  }
  edge(s: string, t: string, lifecycleId = 'lc1'): EdgeRow {
    const e = { id: `e-${this.seq++}`, sourceNodeId: s, targetNodeId: t };
    this.edges.push(e);
    return e;
  }

  lifecycleExists(): Promise<boolean> {
    return Promise.resolve(true);
  }
  listNodes(lc: string): Promise<NodeView[]> {
    return Promise.resolve(this.nodes.filter((n) => n.lifecycleId === lc));
  }
  listEdges(): Promise<EdgeRow[]> {
    return Promise.resolve(this.edges);
  }
  nodeExists(lc: string, id: string): Promise<boolean> {
    return Promise.resolve(this.nodes.some((n) => n.lifecycleId === lc && n.id === id));
  }
  createNode(lc: string, input: CreateNodeInput): Promise<NodeView> {
    const n = { id: `n-${this.seq++}`, lifecycleId: lc, ...input };
    this.nodes.push(n);
    return Promise.resolve(n);
  }
  updateNode(id: string, patch: Partial<NodeView>): Promise<NodeView> {
    const n = this.nodes.find((x) => x.id === id)!;
    Object.assign(n, patch);
    return Promise.resolve(n);
  }
  deleteNodeWithEdges(id: string): Promise<void> {
    this.nodes = this.nodes.filter((n) => n.id !== id);
    this.edges = this.edges.filter((e) => e.sourceNodeId !== id && e.targetNodeId !== id);
    return Promise.resolve();
  }
  createEdge(_lc: string, s: string, t: string): Promise<EdgeRow> {
    return Promise.resolve(this.edge(s, t));
  }
  deleteEdge(id: string): Promise<void> {
    this.edges = this.edges.filter((e) => e.id !== id);
    return Promise.resolve();
  }
}

describe('DagService（F008）', () => {
  let store: FakeDagStore;
  let svc: DagService;
  beforeEach(() => {
    store = new FakeDagStore();
    svc = new DagService(store);
  });

  it('新增節點 → 建立於該循環', async () => {
    const n = await svc.addNode('lc1', { name: '進件' });
    expect(n.id).toMatch(/^n-/);
    expect(n.lifecycleId).toBe('lc1');
  });

  it('新增合法邊 → 建立', async () => {
    store.node('A');
    store.node('B');
    const e = await svc.addEdge('lc1', 'A', 'B');
    expect(e.sourceNodeId).toBe('A');
    expect(e.targetNodeId).toBe('B');
  });

  it('自我連線 → DAG_SELF_LOOP', async () => {
    store.node('A');
    await expect(svc.addEdge('lc1', 'A', 'A')).rejects.toThrow('DAG_SELF_LOOP');
  });

  it('A→B→C 存在，加 C→A → DAG_CYCLE_DETECTED', async () => {
    ['A', 'B', 'C'].forEach((id) => store.node(id));
    store.edge('A', 'B');
    store.edge('B', 'C');
    await expect(svc.addEdge('lc1', 'C', 'A')).rejects.toThrow('DAG_CYCLE_DETECTED');
  });

  it('A→B 存在，加 B→A → DAG_CYCLE_DETECTED（直接雙向環）', async () => {
    store.node('A');
    store.node('B');
    store.edge('A', 'B');
    await expect(svc.addEdge('lc1', 'B', 'A')).rejects.toThrow('DAG_CYCLE_DETECTED');
  });

  it('節點不存在 → NODE_NOT_FOUND', async () => {
    store.node('A');
    await expect(svc.addEdge('lc1', 'A', 'ghost')).rejects.toThrow('NODE_NOT_FOUND');
  });

  it('刪除節點 → 連動刪除其邊', async () => {
    store.node('A');
    store.node('B');
    store.edge('A', 'B');
    await svc.deleteNode('A');
    expect(store.nodes.find((n) => n.id === 'A')).toBeUndefined();
    expect(store.edges.length).toBe(0);
  });

  it('getGraph → 節點與邊', async () => {
    store.node('A');
    store.node('B');
    store.edge('A', 'B');
    const g = await svc.getGraph('lc1');
    expect(g.nodes).toHaveLength(2);
    expect(g.edges).toHaveLength(1);
  });
});
