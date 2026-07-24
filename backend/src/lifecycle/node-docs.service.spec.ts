import { NodeDocsService } from './node-docs.service';
import {
  NodeDocsStore,
  NodeInfo,
  DocRef,
  DocLite,
} from './node-docs.store';

class FakeStore implements NodeDocsStore {
  nodes: NodeInfo[] = [];
  docs: (DocRef & { lifecycleId: string })[] = [];
  setCalls: { docId: string; nodeId: string | null }[] = [];

  node(id: string, lifecycleId = 'lc1', name = id): NodeInfo {
    const n = { id, lifecycleId, name };
    this.nodes.push(n);
    return n;
  }
  doc(id: string, over: Partial<DocRef & { lifecycleId: string }> = {}): void {
    this.docs.push({ id, documentNumber: id, documentName: id, nodeId: null, lifecycleId: 'lc1', ...over });
  }

  getNode(lifecycleId: string, nodeId: string): Promise<NodeInfo | null> {
    return Promise.resolve(this.nodes.find((n) => n.id === nodeId && n.lifecycleId === lifecycleId) ?? null);
  }
  listLifecycleDocs(lifecycleId: string): Promise<DocRef[]> {
    return Promise.resolve(this.docs.filter((d) => d.lifecycleId === lifecycleId));
  }
  getDoc(docId: string): Promise<DocLite | null> {
    const d = this.docs.find((x) => x.id === docId);
    return Promise.resolve(d ? { id: d.id, lifecycleId: d.lifecycleId, nodeId: d.nodeId } : null);
  }
  setDocNode(docId: string, nodeId: string | null): Promise<void> {
    this.setCalls.push({ docId, nodeId });
    const d = this.docs.find((x) => x.id === docId);
    if (d) d.nodeId = nodeId;
    return Promise.resolve();
  }
  nodeNames(ids: string[]): Promise<Map<string, string | null>> {
    return Promise.resolve(new Map(this.nodes.filter((n) => ids.includes(n.id)).map((n) => [n.id, n.name])));
  }
  mountedElsewhere = 0;
  countDocsMountedInOtherLifecycles(): Promise<number> {
    return Promise.resolve(this.mountedElsewhere);
  }
}

describe('NodeDocsService（F009 節點抽屜）', () => {
  let store: FakeStore;
  let svc: NodeDocsService;
  beforeEach(() => {
    store = new FakeStore();
    svc = new NodeDocsService(store);
    store.node('n1');
    store.node('n2');
  });

  describe('getDrawer', () => {
    it('回節點名、已掛載、候選（含他節點名）', async () => {
      store.doc('D1', { nodeId: 'n1' }); // mounted on n1
      store.doc('D2', { nodeId: 'n2' }); // on other node
      store.doc('D3', { nodeId: null }); // unassigned
      const drawer = await svc.getDrawer('lc1', 'n1');
      expect(drawer.node.name).toBe('n1');
      expect(drawer.mounted.map((d) => d.id)).toEqual(['D1']);
      const cand = drawer.candidates;
      expect(cand.map((d) => d.id).sort()).toEqual(['D2', 'D3']);
      const d2 = cand.find((d) => d.id === 'D2')!;
      expect(d2.assignedNode?.name).toBe('n2');
      const d3 = cand.find((d) => d.id === 'D3')!;
      expect(d3.assignedNode).toBeNull();
    });
    it('節點不存在 → NODE_NOT_FOUND', async () => {
      await expect(svc.getDrawer('lc1', 'ghost')).rejects.toThrow('NODE_NOT_FOUND');
    });

    it('G-LC-015 excludedCount＝掛載於其他循環之文件數（候選過濾註記）', async () => {
      store.doc('D1', { nodeId: 'n1' });
      store.mountedElsewhere = 4;
      const drawer = await svc.getDrawer('lc1', 'n1');
      expect(drawer.excludedCount).toBe(4);
    });
  });

  describe('mount', () => {
    it('掛載未指派文件 → setDocNode(nodeId)', async () => {
      store.doc('D3', { nodeId: null });
      await svc.mount('lc1', 'n1', 'D3', false);
      expect(store.setCalls).toContainEqual({ docId: 'D3', nodeId: 'n1' });
    });
    it('他循環文件 → NODE_DOC_LIFECYCLE_MISMATCH', async () => {
      store.doc('DX', { lifecycleId: 'lcOther', nodeId: null });
      await expect(svc.mount('lc1', 'n1', 'DX', false)).rejects.toThrow('NODE_DOC_LIFECYCLE_MISMATCH');
    });
    it('已掛他節點且未確認 → NODE_DOC_ALREADY_ASSIGNED', async () => {
      store.doc('D2', { nodeId: 'n2' });
      await expect(svc.mount('lc1', 'n1', 'D2', false)).rejects.toThrow('NODE_DOC_ALREADY_ASSIGNED');
      expect(store.setCalls).toHaveLength(0);
    });
    it('已掛他節點且確認 → 改派（setDocNode(nodeId)）', async () => {
      store.doc('D2', { nodeId: 'n2' });
      await svc.mount('lc1', 'n1', 'D2', true);
      expect(store.setCalls).toContainEqual({ docId: 'D2', nodeId: 'n1' });
    });
    it('文件不存在 → DOCUMENT_NOT_FOUND', async () => {
      await expect(svc.mount('lc1', 'n1', 'nope', false)).rejects.toThrow('DOCUMENT_NOT_FOUND');
    });
    it('節點不存在 → NODE_NOT_FOUND', async () => {
      store.doc('D3', { nodeId: null });
      await expect(svc.mount('lc1', 'ghost', 'D3', false)).rejects.toThrow('NODE_NOT_FOUND');
    });
  });

  describe('unmount', () => {
    it('移除掛載 → setDocNode(null)', async () => {
      store.doc('D1', { nodeId: 'n1' });
      await svc.unmount('lc1', 'n1', 'D1');
      expect(store.setCalls).toContainEqual({ docId: 'D1', nodeId: null });
    });
  });
});
