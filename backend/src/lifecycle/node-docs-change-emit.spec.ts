import { NodeDocsService } from './node-docs.service';
import { DocLite, DocRef, NodeDocsStore, NodeInfo } from './node-docs.store';
import {
  LifecycleChangePublisher,
  LifecycleChangedEvent,
} from './lifecycle-change-event';

class FakeStore implements NodeDocsStore {
  nodes: NodeInfo[] = [
    { id: 'nA', lifecycleId: 'lc1', name: '進件作業' },
    { id: 'nB', lifecycleId: 'lc1', name: '簽約對保作業' },
  ];
  docs: (DocRef & { lifecycleId: string })[] = [
    { id: 'd1', documentNumber: 'ICSOP-SRC-101', documentName: '車輛分期進件作業', nodeId: null, lifecycleId: 'lc1' },
  ];
  async getNode(lifecycleId: string, nodeId: string): Promise<NodeInfo | null> {
    return this.nodes.find((n) => n.lifecycleId === lifecycleId && n.id === nodeId) ?? null;
  }
  async listLifecycleDocs(lifecycleId: string): Promise<DocRef[]> {
    return this.docs.filter((d) => d.lifecycleId === lifecycleId);
  }
  async getDoc(docId: string): Promise<DocLite | null> {
    const d = this.docs.find((x) => x.id === docId);
    return d ? { id: d.id, lifecycleId: d.lifecycleId, nodeId: d.nodeId } : null;
  }
  async setDocNode(docId: string, nodeId: string | null): Promise<void> {
    const d = this.docs.find((x) => x.id === docId)!;
    d.nodeId = nodeId;
  }
  async nodeNames(ids: string[]): Promise<Map<string, string | null>> {
    return new Map(this.nodes.filter((n) => ids.includes(n.id)).map((n) => [n.id, n.name]));
  }
}

class FakePublisher implements LifecycleChangePublisher {
  events: LifecycleChangedEvent[] = [];
  async publish(e: LifecycleChangedEvent): Promise<void> {
    this.events.push(e);
  }
}

const actor = { accountId: 'acc-1', name: '李慧玲', employeeNo: '20233' };

describe('NodeDocsService F038 掛載事件發射', () => {
  let store: FakeStore;
  let pub: FakePublisher;
  let svc: NodeDocsService;
  beforeEach(() => {
    store = new FakeStore();
    pub = new FakePublisher();
    svc = new NodeDocsService(store, pub, () => new Date('2026-07-16T00:00:00Z'));
  });

  it('mount 未掛載文件 → DOCUMENT_MOUNTED', async () => {
    await svc.mount('lc1', 'nA', 'd1', false, actor);
    expect(pub.events).toHaveLength(1);
    expect(pub.events[0]).toMatchObject({
      lifecycleId: 'lc1',
      changeType: 'DOCUMENT_MOUNTED',
      nodeId: 'nA',
      actorId: 'acc-1',
    });
    expect(pub.events[0].summary).toContain('車輛分期進件作業');
  });

  it('mount 已掛他節點 + confirm → DOCUMENT_REASSIGNED', async () => {
    store.docs[0].nodeId = 'nB';
    await svc.mount('lc1', 'nA', 'd1', true, actor);
    expect(pub.events[0]).toMatchObject({ changeType: 'DOCUMENT_REASSIGNED', nodeId: 'nA' });
  });

  it('mount 已在本節點 → no-op，不發事件', async () => {
    store.docs[0].nodeId = 'nA';
    await svc.mount('lc1', 'nA', 'd1', false, actor);
    expect(pub.events).toHaveLength(0);
  });

  it('unmount → DOCUMENT_UNMOUNTED', async () => {
    store.docs[0].nodeId = 'nA';
    await svc.unmount('lc1', 'nA', 'd1', actor);
    expect(pub.events).toHaveLength(1);
    expect(pub.events[0]).toMatchObject({ changeType: 'DOCUMENT_UNMOUNTED', nodeId: 'nA' });
  });
});
