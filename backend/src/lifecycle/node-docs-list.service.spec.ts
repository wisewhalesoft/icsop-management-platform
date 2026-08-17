import { NodeDocsService } from './node-docs.service';
import { NodeDocsStore, NodeInfo, NodeMountedDoc } from './node-docs.store';

/**
 * L6 · F036 `AC-D2`／`AC-D4`／`AC-D7`／`AC-D8` — 樹狀圖節點雙擊之**唯讀**文件清單（缺失 delta 第 8 項）。
 *
 * 權威＝`docs/specs/features/F036-lifecycle-tree-preview.md` §節點雙擊顯示文件清單 delta
 *      ＋ `docs/specs/architecture-spec.md` §10.5（決策 A5）。
 *
 * 🔴 §10.5 明確**否決**重用 `GET .../drawer`（F009 節點抽屜）：
 *   (1) 它回傳 `candidates`（該循環中可被掛載之其他文件），對唯讀抽屜是多餘的資訊暴露，
 *       會讓「純唯讀」（`AC-D4`）在 DOM 之外被實質破壞；
 *   (2) 其 `mounted` 只有 `{id, documentNumber, documentName}`，**缺 `AC-D2` 之 版次／狀態／公告日期**。
 *   ⇒ 新端點 `GET /admin/lifecycles/:lifecycleId/nodes/:nodeId/documents`，回傳**扁平陣列**。
 *
 * 🔴 狀態徽章之衍生（§10.5「N+1 風險：無」段）：後端回**原始 `status` ＋ `announcedDate`**，
 *   前端以同一份 `display-status` 邏輯渲染 ⇒ 前後台顯示規則不可能分歧。
 *   本層**不得**回傳已衍生之中文徽章字串。
 */
type Row = NodeMountedDoc & { nodeId: string | null; lifecycleId: string };

class FakeNodeDocsStore {
  nodes: NodeInfo[] = [];
  rows: Row[] = [];

  node(id: string, lifecycleId = 'lc1', name = id): void {
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

  /** F036 delta 新增：單表查詢，五欄全落在 ICSOP_DOCUMENT（§10.5「N+1 風險：無」）。 */
  listNodeMountedDocs(lifecycleId: string, nodeId: string): Promise<NodeMountedDoc[]> {
    return Promise.resolve(
      this.rows
        .filter((r) => r.lifecycleId === lifecycleId && r.nodeId === nodeId)
        .map(({ id, documentNumber, documentName, edition, status, announcedDate }) => ({
          id,
          documentNumber,
          documentName,
          edition,
          status,
          announcedDate,
        })),
    );
  }

  asStore(): NodeDocsStore {
    return this as unknown as NodeDocsStore;
  }
}

describe('NodeDocsService.listNodeDocuments（F036 節點文件清單，唯讀）', () => {
  let store: FakeNodeDocsStore;
  let svc: NodeDocsService;

  beforeEach(() => {
    store = new FakeNodeDocsStore();
    svc = new NodeDocsService(store.asStore());
    store.node('n1');
    store.node('n2');
  });

  it('TS-D8-001 AC-D2 回傳該節點掛載之全部程序書，每筆恰含五欄＋id', async () => {
    store.row({ id: 'D1', nodeId: 'n1', documentNumber: 'ICSOP-SRC-101-1-01', documentName: '車輛分期進件作業', edition: '2.1', status: 'active', announcedDate: '2026-06-01T00:00:00.000Z' });
    store.row({ id: 'D2', nodeId: 'n1' });

    const docs = await svc.listNodeDocuments('lc1', 'n1');

    expect(docs.map((d) => d.id)).toEqual(['D1', 'D2']);
    expect(docs[0]).toEqual({
      id: 'D1',
      documentNumber: 'ICSOP-SRC-101-1-01',
      documentName: '車輛分期進件作業',
      edition: '2.1',
      status: 'active',
      announcedDate: '2026-06-01T00:00:00.000Z',
    });
    expect(Object.keys(docs[0]).sort()).toEqual(
      ['announcedDate', 'documentName', 'documentNumber', 'edition', 'id', 'status'].sort(),
    );
  });

  it('TS-D8-002 🔒 AC-D4 回傳值為扁平陣列，**不含 candidates**（不得重用 F009 drawer 之寫入路徑契約）', async () => {
    store.row({ id: 'D1', nodeId: 'n1' });
    store.row({ id: 'D2', nodeId: 'n2' }); // 他節點：於 drawer 為 candidate，於本端點必須不可見
    store.row({ id: 'D3', nodeId: null }); // 未指派：同上

    const docs = await svc.listNodeDocuments('lc1', 'n1');

    expect(Array.isArray(docs)).toBe(true);
    expect(docs.map((d) => d.id)).toEqual(['D1']);
    expect((docs as unknown as { candidates?: unknown }).candidates).toBeUndefined();
  });

  it('TS-D8-003 他循環之同名節點文件不得混入', async () => {
    store.node('n1', 'lcOther', 'n1');
    store.row({ id: 'DX', nodeId: 'n1', lifecycleId: 'lcOther' });
    store.row({ id: 'D1', nodeId: 'n1', lifecycleId: 'lc1' });

    expect((await svc.listNodeDocuments('lc1', 'n1')).map((d) => d.id)).toEqual(['D1']);
  });

  it('TS-D8-004 AC-D7 節點掛載數為 0 → 回空陣列（非錯誤）', async () => {
    await expect(svc.listNodeDocuments('lc1', 'n2')).resolves.toEqual([]);
  });

  it('TS-D8-005 節點不存在 → NODE_NOT_FOUND（沿用本 service 之既有錯誤碼慣例）', async () => {
    await expect(svc.listNodeDocuments('lc1', 'ghost')).rejects.toThrow('NODE_NOT_FOUND');
  });

  it('TS-D8-006 回原始 status／announcedDate，不回已衍生之中文徽章字串（§10.5）', async () => {
    store.row({ id: 'D1', nodeId: 'n1', status: 'inactive', announcedDate: null });
    const [doc] = await svc.listNodeDocuments('lc1', 'n1');
    expect(doc.status).toBe('inactive');
    expect(doc.announcedDate).toBeNull();
    expect(JSON.stringify(doc)).not.toMatch(/已公告|進度中|失效|作廢/);
  });
});
