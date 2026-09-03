/**
 * F043 業務/功能類別管理 — business-category-snapshot-builder（決策 E1／§14.1／§14.9）
 *
 * 權威：docs/specs/architecture-spec.md §14.1 反漂移處置表——`lifecycle-snapshot-builder.ts` 之
 * `buildSnapshotGraph` 查證後確認零 LIFECYCLE 專屬耦合，裁定**複製一份 ＋ 固定向量綁定**
 * （沿用本 repo 既有「兩份逐字相同＋同一組固定向量」模式，不做結構抽取）。
 *
 * 🔴 落點刻意在 `backend/src/lifecycle/`（與被綁定對象同目錄，§14.2 理由：便於維護者一次看到
 * 兩份必須維持逐位元組相等的檔案）。
 *
 * ⚠ 對實作全盲：`./business-category-snapshot-builder` 尚不存在。
 */
import { buildSnapshotGraph, SnapshotDocRef } from './lifecycle-snapshot-builder';
import {
  buildBusinessCategorySnapshotGraph,
  EMPTY_BUSINESS_CATEGORY_SNAPSHOT_GRAPH,
} from './business-category-snapshot-builder';

describe('buildBusinessCategorySnapshotGraph（F043 決策 E1：複製＋固定向量綁定）', () => {
  const nodes = [
    { id: 'a1', name: '授信申請作業', positionX: 10, positionY: 20 },
    { id: 'a2', name: '風險評估作業', positionX: 30, positionY: 40 },
  ];
  const edges = [{ id: 'e1', sourceNodeId: 'a1', targetNodeId: 'a2' }];

  it('節點+邊+掛載文件 → 正確序列化（與 buildSnapshotGraph 同構）', () => {
    const docsByNode = new Map<string, SnapshotDocRef[]>([
      ['a1', [{ id: 'd1', documentNumber: 'ICSOP-SRC-101' }, { id: 'd2', documentNumber: 'ICSOP-SRC-102' }]],
    ]);
    const g = buildBusinessCategorySnapshotGraph(nodes, edges, docsByNode);
    expect(g.nodes[0]).toEqual({
      id: 'a1',
      name: '授信申請作業',
      positionX: 10,
      positionY: 20,
      docs: [{ id: 'd1', documentNumber: 'ICSOP-SRC-101' }, { id: 'd2', documentNumber: 'ICSOP-SRC-102' }],
    });
    expect(g.nodes[1].docs).toEqual([]);
    expect(g.edges).toEqual([{ id: 'e1', sourceNodeId: 'a1', targetNodeId: 'a2' }]);
  });

  it('空類別（無節點無邊）→ {nodes:[], edges:[]}', () => {
    const g = buildBusinessCategorySnapshotGraph([], [], new Map());
    expect(g).toEqual({ nodes: [], edges: [] });
    expect(EMPTY_BUSINESS_CATEGORY_SNAPSHOT_GRAPH).toEqual({ nodes: [], edges: [] });
  });

  it('🔴 M:N 差異（data-model.md 明文）：同一份文件可出現在多個節點之清單中，不得去重', () => {
    const docsByNode = new Map<string, SnapshotDocRef[]>([
      ['a1', [{ id: 'd1', documentNumber: 'ICSOP-SRC-101' }]],
      ['a2', [{ id: 'd1', documentNumber: 'ICSOP-SRC-101' }]], // 同一份文件同時掛在 a1、a2
    ]);
    const g = buildBusinessCategorySnapshotGraph(nodes, edges, docsByNode);
    expect(g.nodes.find((n) => n.id === 'a1')!.docs).toEqual([{ id: 'd1', documentNumber: 'ICSOP-SRC-101' }]);
    expect(g.nodes.find((n) => n.id === 'a2')!.docs).toEqual([{ id: 'd1', documentNumber: 'ICSOP-SRC-101' }]);
  });

  it('序列化結果 JSON round-trip 與輸入結構一致', () => {
    const docsByNode = new Map<string, SnapshotDocRef[]>([['a2', [{ id: 'd9', documentNumber: 'ICSOP-PUC-201' }]]]);
    const g = buildBusinessCategorySnapshotGraph(nodes, edges, docsByNode);
    const roundTrip = JSON.parse(JSON.stringify(g));
    expect(roundTrip).toEqual(g);
  });

  describe('🔴 跨檔固定向量綁定（決策 E1 反漂移核心）：與既有 buildSnapshotGraph 對同一組泛型輸入逐位元組相等', () => {
    const VECTOR_NODES = [
      { id: 'v1', name: '節點一', positionX: 1, positionY: 2 },
      { id: 'v2', name: '節點二', positionX: 3, positionY: 4 },
      { id: 'v3', name: '節點三（無掛載）', positionX: 5, positionY: 6 },
    ];
    const VECTOR_EDGES = [
      { id: 've1', sourceNodeId: 'v1', targetNodeId: 'v2' },
      { id: 've2', sourceNodeId: 'v1', targetNodeId: 'v3' },
    ];
    const VECTOR_DOCS = new Map<string, SnapshotDocRef[]>([
      ['v1', [{ id: 'vd1', documentNumber: 'N-1' }, { id: 'vd2', documentNumber: 'N-2' }]],
      ['v2', [{ id: 'vd1', documentNumber: 'N-1' }]], // 同一文件重複出現於不同節點——M:N 語料
    ]);

    it('固定向量：兩函式輸出逐位元組相等', () => {
      const fromLifecycle = buildSnapshotGraph(VECTOR_NODES, VECTOR_EDGES, VECTOR_DOCS);
      const fromBusinessCategory = buildBusinessCategorySnapshotGraph(VECTOR_NODES, VECTOR_EDGES, VECTOR_DOCS);
      expect(fromBusinessCategory).toEqual(fromLifecycle);
    });

    it('🔒 自證：固定向量非空狀態（否則「兩份皆為 {nodes:[],edges:[]}」會恆真通過，無鑑別力）', () => {
      const out = buildSnapshotGraph(VECTOR_NODES, VECTOR_EDGES, VECTOR_DOCS);
      expect(out.nodes.length).toBeGreaterThan(0);
      expect(out.edges.length).toBeGreaterThan(0);
      expect(out.nodes.some((n) => n.docs.length > 0)).toBe(true);
    });
  });
});
