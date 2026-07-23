import { DagService } from './dag.service';
import {
  CreateNodeInput,
  DagStore,
  EdgeRow,
  NodeView,
} from './dag.store';
import {
  LifecycleChangePublisher,
  LifecycleChangedEvent,
} from './lifecycle-change-event';

/** 記憶體 DagStore（供 F038 結構事件發射測試）。 */
class FakeDag implements DagStore {
  nodes: NodeView[] = [];
  edges: EdgeRow[] = [];
  private seq = 0;
  async lifecycleExists(): Promise<boolean> {
    return true;
  }
  async listNodes(lifecycleId: string): Promise<NodeView[]> {
    return this.nodes.filter((n) => n.lifecycleId === lifecycleId);
  }
  async listEdges(): Promise<EdgeRow[]> {
    return this.edges;
  }
  async nodeExists(lifecycleId: string, nodeId: string): Promise<boolean> {
    return this.nodes.some((n) => n.lifecycleId === lifecycleId && n.id === nodeId);
  }
  async createNode(lifecycleId: string, input: CreateNodeInput): Promise<NodeView> {
    const n: NodeView = { id: `n${++this.seq}`, lifecycleId, ...input };
    this.nodes.push(n);
    return n;
  }
  async updateNode(nodeId: string, patch: Partial<NodeView>): Promise<NodeView> {
    const n = this.nodes.find((x) => x.id === nodeId)!;
    Object.assign(n, patch);
    return { ...n };
  }
  async deleteNodeWithEdges(nodeId: string): Promise<void> {
    this.nodes = this.nodes.filter((n) => n.id !== nodeId);
    this.edges = this.edges.filter((e) => e.sourceNodeId !== nodeId && e.targetNodeId !== nodeId);
  }
  async createEdge(_lc: string, source: string, target: string): Promise<EdgeRow> {
    const e: EdgeRow = { id: `e${++this.seq}`, sourceNodeId: source, targetNodeId: target };
    this.edges.push(e);
    return e;
  }
  async deleteEdge(edgeId: string): Promise<void> {
    this.edges = this.edges.filter((e) => e.id !== edgeId);
  }
}

class FakePublisher implements LifecycleChangePublisher {
  events: LifecycleChangedEvent[] = [];
  async publish(e: LifecycleChangedEvent): Promise<void> {
    this.events.push(e);
  }
}

const actor = { accountId: 'acc-1', name: '李慧玲', employeeNo: '20233' };

describe('DagService F038 結構事件發射', () => {
  let store: FakeDag;
  let pub: FakePublisher;
  let svc: DagService;
  beforeEach(() => {
    store = new FakeDag();
    pub = new FakePublisher();
    svc = new DagService(store, pub, () => new Date('2026-07-16T00:00:00Z'));
  });

  it('addNode → NODE_ADDED（帶新名/nodeId/操作者）', async () => {
    const n = await svc.addNode('lc1', { name: '進件作業' }, actor);
    expect(pub.events).toHaveLength(1);
    expect(pub.events[0]).toMatchObject({
      lifecycleId: 'lc1',
      changeType: 'NODE_ADDED',
      summary: '新增節點『進件作業』',
      newValue: '進件作業',
      nodeId: n.id,
      actorId: 'acc-1',
      actorName: '李慧玲',
      actorEmployeeNo: '20233',
    });
  });

  it('updateNode 改名 → NODE_RENAMED（帶前後名）；位置變更 → 不發事件', async () => {
    const n = await svc.addNode('lc1', { name: '撥款核准' }, actor);
    pub.events = [];
    await svc.updateNode(n.id, { name: '撥款核准作業' }, { lifecycleId: 'lc1', actor });
    expect(pub.events).toHaveLength(1);
    expect(pub.events[0]).toMatchObject({
      changeType: 'NODE_RENAMED',
      oldValue: '撥款核准',
      newValue: '撥款核准作業',
      summary: '節點改名『撥款核准』→『撥款核准作業』',
    });

    pub.events = [];
    await svc.updateNode(n.id, { positionX: 99 }, { lifecycleId: 'lc1', actor });
    expect(pub.events).toHaveLength(0); // 位置＝佈局，非結構變更
  });

  it('deleteNode → NODE_REMOVED（帶舊名）', async () => {
    const n = await svc.addNode('lc1', { name: '付款執行作業' }, actor);
    pub.events = [];
    await svc.deleteNode(n.id, { lifecycleId: 'lc1', actor });
    expect(pub.events).toHaveLength(1);
    expect(pub.events[0]).toMatchObject({
      changeType: 'NODE_REMOVED',
      oldValue: '付款執行作業',
      summary: '移除節點『付款執行作業』（含其連線）',
    });
  });

  it('addEdge → EDGE_ADDED（摘要含節點名）', async () => {
    const a = await svc.addNode('lc1', { name: '進件作業' }, actor);
    const b = await svc.addNode('lc1', { name: '簽約對保作業' }, actor);
    pub.events = [];
    await svc.addEdge('lc1', a.id, b.id, actor);
    expect(pub.events).toHaveLength(1);
    expect(pub.events[0]).toMatchObject({
      changeType: 'EDGE_ADDED',
      summary: '新增連線 進件作業 → 簽約對保作業',
    });
  });

  it('deleteEdge → EDGE_REMOVED（摘要含節點名）', async () => {
    const a = await svc.addNode('lc1', { name: '進件作業' }, actor);
    const b = await svc.addNode('lc1', { name: '簽約對保作業' }, actor);
    const e = await svc.addEdge('lc1', a.id, b.id, actor);
    pub.events = [];
    await svc.deleteEdge(e.id, { lifecycleId: 'lc1', actor });
    expect(pub.events).toHaveLength(1);
    expect(pub.events[0]).toMatchObject({
      changeType: 'EDGE_REMOVED',
      summary: '移除連線 進件作業 → 簽約對保作業',
    });
  });

  it('無 publisher（純建構）→ 不擲例外（graceful noop）', async () => {
    const bare = new DagService(store);
    await expect(bare.addNode('lc1', { name: 'X' })).resolves.toBeDefined();
  });
});
