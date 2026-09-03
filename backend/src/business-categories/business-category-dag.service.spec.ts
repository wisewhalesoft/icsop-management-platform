/**
 * F043 業務/功能類別管理 — BusinessCategoryDagService（§乙 DAG 節點與邊）
 *
 * 權威：docs/specs/features/F043-business-function-category.md AC-15～AC-19
 *      ＋ docs/specs/architecture-spec.md §14.3（BusinessCategoryDagStore 介面草案）
 *      ＋ §14.6.1（決策 E2：防環演算法直接重用 ../lifecycle/dag-cycle，不複製）
 *      ＋ §14.6.7（決策 E8：nodeId 側刪除採同交易顯式刪除 BUSINESS_CATEGORY_DOC，非 FK CASCADE）。
 *
 * 🔴 AC-16 立條理由：本功能刻意使用 BUSINESS_CATEGORY_SELF_LOOP／_CYCLE_DETECTED，
 * 不沿用 DAG_SELF_LOOP／DAG_CYCLE_DETECTED（「循環」在本系統為 LIFECYCLE 之專有名詞）。
 * 📌 AC-16「共用的是演算法、不是錯誤碼」——本檔以 jest.spyOn 驗證服務層確實呼叫
 * ../lifecycle/dag-cycle 之既有 classifyEdge（而非另建一份複製品），對映邏輯則在服務層完成。
 *
 * ⚠ 對實作全盲：`./business-category-dag.service` 與 `./business-category-dag.store` 尚不存在。
 */
import * as dagCycle from '../lifecycle/dag-cycle';
import { BusinessCategoryDagService } from './business-category-dag.service';
import {
  BusinessCategoryDagStore,
  BusinessCategoryNodeView,
  BusinessCategoryEdgeRow,
} from './business-category-dag.store';

class FakeStore implements BusinessCategoryDagStore {
  seq = 1;
  nodes: BusinessCategoryNodeView[] = [];
  edges: BusinessCategoryEdgeRow[] = [];
  mountedDocs = new Map<string, number>();
  ops: string[] = [];

  node(id: string, businessCategoryId = 'bc1', name: string | null = id): BusinessCategoryNodeView {
    const n = { id, businessCategoryId, name, positionX: 0, positionY: 0 };
    this.nodes.push(n);
    return n;
  }
  edge(s: string, t: string, businessCategoryId = 'bc1'): BusinessCategoryEdgeRow {
    const e = { id: `e-${this.seq++}`, sourceNodeId: s, targetNodeId: t };
    this.edges.push(e);
    // 供 businessCategoryId 隔離測試查詢用（雖介面 EdgeRow 未帶該欄，此處僅內部記錄）。
    void businessCategoryId;
    return e;
  }

  businessCategoryExists(): Promise<boolean> {
    return Promise.resolve(true);
  }
  listNodes(businessCategoryId: string): Promise<BusinessCategoryNodeView[]> {
    return Promise.resolve(this.nodes.filter((n) => n.businessCategoryId === businessCategoryId));
  }
  listEdges(): Promise<BusinessCategoryEdgeRow[]> {
    return Promise.resolve(this.edges);
  }
  nodeExists(businessCategoryId: string, nodeId: string): Promise<boolean> {
    return Promise.resolve(this.nodes.some((n) => n.businessCategoryId === businessCategoryId && n.id === nodeId));
  }
  createNode(businessCategoryId: string, input: { name: string | null; positionX: number; positionY: number }): Promise<BusinessCategoryNodeView> {
    const n = { id: `n-${this.seq++}`, businessCategoryId, ...input };
    this.nodes.push(n);
    return Promise.resolve(n);
  }
  updateNode(id: string, patch: Partial<BusinessCategoryNodeView>): Promise<BusinessCategoryNodeView> {
    const n = this.nodes.find((x) => x.id === id)!;
    Object.assign(n, patch);
    return Promise.resolve(n);
  }
  deleteNodeWithEdges(id: string): Promise<void> {
    this.ops.push(`delete:${id}`);
    this.nodes = this.nodes.filter((n) => n.id !== id);
    this.edges = this.edges.filter((e) => e.sourceNodeId !== id && e.targetNodeId !== id);
    this.mountedDocs.set(id, 0);
    return Promise.resolve();
  }
  countNodeMounts(id: string): Promise<number> {
    this.ops.push(`countMounts:${id}`);
    return Promise.resolve(this.mountedDocs.get(id) ?? 0);
  }
  createEdge(_businessCategoryId: string, s: string, t: string): Promise<BusinessCategoryEdgeRow> {
    return Promise.resolve(this.edge(s, t));
  }
  deleteEdge(id: string): Promise<void> {
    this.edges = this.edges.filter((e) => e.id !== id);
    return Promise.resolve();
  }
}

describe('BusinessCategoryDagService（F043 §乙）', () => {
  let store: FakeStore;
  let svc: BusinessCategoryDagService;
  beforeEach(() => {
    store = new FakeStore();
    svc = new BusinessCategoryDagService(store);
    jest.restoreAllMocks();
  });

  describe('AC-15 新增節點／邊', () => {
    it('新增節點 → 建立於該類別，含座標', async () => {
      const n = await svc.addNode('bc1', { name: '進件' });
      expect(n.id).toMatch(/^n-/);
      expect(n.businessCategoryId).toBe('bc1');
    });

    it('新增合法邊 → 建立方向正確之 A→B', async () => {
      store.node('A');
      store.node('B');
      const e = await svc.addEdge('bc1', 'A', 'B');
      expect(e.sourceNodeId).toBe('A');
      expect(e.targetNodeId).toBe('B');
    });

    it('節點 C 已有多個 parent → 允許再連入一節點', async () => {
      ['A', 'B', 'C'].forEach((id) => store.node(id));
      store.edge('A', 'C');
      const e = await svc.addEdge('bc1', 'B', 'C');
      expect(e.sourceNodeId).toBe('B');
      expect(e.targetNodeId).toBe('C');
    });
  });

  describe('AC-16 §防環（🔴 專屬錯誤碼，明文禁止沿用 DAG_*）', () => {
    it('自我連線 → BUSINESS_CATEGORY_SELF_LOOP（非 DAG_SELF_LOOP）', async () => {
      store.node('A');
      await expect(svc.addEdge('bc1', 'A', 'A')).rejects.toThrow('BUSINESS_CATEGORY_SELF_LOOP');
      await expect(svc.addEdge('bc1', 'A', 'A')).rejects.not.toThrow('DAG_SELF_LOOP');
    });

    it('A→B→C 存在，加 C→A → BUSINESS_CATEGORY_CYCLE_DETECTED（非 DAG_CYCLE_DETECTED）', async () => {
      ['A', 'B', 'C'].forEach((id) => store.node(id));
      store.edge('A', 'B');
      store.edge('B', 'C');
      await expect(svc.addEdge('bc1', 'C', 'A')).rejects.toThrow('BUSINESS_CATEGORY_CYCLE_DETECTED');
    });

    it('A→B 存在，加 B→A → BUSINESS_CATEGORY_CYCLE_DETECTED（直接雙向環）', async () => {
      store.node('A');
      store.node('B');
      store.edge('A', 'B');
      await expect(svc.addEdge('bc1', 'B', 'A')).rejects.toThrow('BUSINESS_CATEGORY_CYCLE_DETECTED');
    });

    it('合法不成環之連線 → 成功建立、不受阻擋', async () => {
      store.node('A');
      store.node('B');
      const e = await svc.addEdge('bc1', 'A', 'B');
      expect(e).toBeDefined();
    });

    it('節點不存在 → BUSINESS_CATEGORY_NODE_NOT_FOUND', async () => {
      store.node('A');
      await expect(svc.addEdge('bc1', 'A', 'ghost')).rejects.toThrow('BUSINESS_CATEGORY_NODE_NOT_FOUND');
    });

    /**
     * 📌 決策 E2：演算法共用而非複製——以 jest.spyOn 證明服務層確實呼叫既有
     * ../lifecycle/dag-cycle 之 classifyEdge，而非另建一份行為雷同之複製品。
     * 若實作改採 isReachable 手刻對映（未經由 classifyEdge），本測試會忠實轉紅，
     * 屬合理申訴點——test-generator 將依申訴重新核對 §14.6.1 之裁定範圍。
     */
    it('🔴 決策 E2：addEdge 之防環判定確實呼叫既有 dag-cycle.classifyEdge（演算法共用，非另建複製品）', async () => {
      const spy = jest.spyOn(dagCycle, 'classifyEdge');
      store.node('A');
      store.node('B');
      await svc.addEdge('bc1', 'A', 'B');
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('AC-17 後端權威（不僅信任前端）', () => {
    it('即使前端已預覽為合法，後端仍於交易內做權威驗證；因他分頁已建立而實際成環 → 仍正確拒絕', async () => {
      ['A', 'B', 'C'].forEach((id) => store.node(id));
      store.edge('A', 'B');
      store.edge('B', 'C');
      // 模擬「他分頁已建立 C→A」之既存狀態，本次送出 A→C 之新請求仍應被權威判定攔下。
      store.edge('C', 'A');
      await expect(svc.addEdge('bc1', 'A', 'C')).rejects.toThrow('BUSINESS_CATEGORY_CYCLE_DETECTED');
    });
  });

  describe('AC-18 §刪除節點之連動與確認（countNodeMounts 供前端確認提示）', () => {
    it('節點已掛載 N≥1 份文件 → countNodeMounts 回傳正確之 N（供前端組出確認文案）', async () => {
      store.node('A');
      store.mountedDocs.set('A', 3);
      const n = await svc.countNodeMounts('A');
      expect(n).toBe(3);
    });

    it('確認後刪除 → 同一交易內刪除節點、其全部相關邊與其全部掛載列', async () => {
      store.node('A');
      store.node('B');
      store.edge('A', 'B');
      store.mountedDocs.set('A', 3);
      await svc.deleteNode('A');
      expect(store.nodes.find((n) => n.id === 'A')).toBeUndefined();
      expect(store.edges).toHaveLength(0);
      expect(store.mountedDocs.get('A')).toBe(0);
    });

    it('無掛載（N=0）之節點刪除 → 亦正常刪除（0 非特殊情況）', async () => {
      store.node('A');
      await svc.deleteNode('A');
      expect(store.nodes.find((n) => n.id === 'A')).toBeUndefined();
    });

    it('刪除節點 → 連動刪除其相關邊', async () => {
      store.node('A');
      store.node('B');
      store.edge('A', 'B');
      await svc.deleteNode('A');
      expect(store.edges).toHaveLength(0);
    });
  });

  describe('getGraph', () => {
    it('回節點與邊', async () => {
      store.node('A');
      store.node('B');
      store.edge('A', 'B');
      const g = await svc.getGraph('bc1');
      expect(g.nodes).toHaveLength(2);
      expect(g.edges).toHaveLength(1);
    });
  });

  describe('AC-48／AC-49 §結構性回歸鎖定：本服務不依賴任何 LIFECYCLE 側 store token', () => {
    it('BusinessCategoryDagService 建構子依賴不含任何名為 DagStore（循環側）之型別（僅接受 BusinessCategoryDagStore）', () => {
      const deps = (Reflect.getMetadata('design:paramtypes', BusinessCategoryDagService) ?? []) as {
        name?: string;
      }[];
      expect(deps.some((d) => d?.name === 'DagStore')).toBe(false);
    });
  });
});
