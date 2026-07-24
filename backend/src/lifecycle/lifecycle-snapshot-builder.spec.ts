import {
  buildSnapshotGraph,
  EMPTY_SNAPSHOT_GRAPH,
  SnapshotDocRef,
} from './lifecycle-snapshot-builder';

/**
 * §A.3 快照建構純函式測試（TS-LCC-A-001~004）。
 * 忠實對應 data-model.md LIFECYCLE_SNAPSHOT.nodesJson 定義（節點含 id+name+座標+掛載文件 id+編號）。
 */
describe('buildSnapshotGraph（F038 §A.2 快照建構純函式）', () => {
  const nodes = [
    { id: 'a1', name: '進件作業', positionX: 10, positionY: 20 },
    { id: 'a2', name: '簽約對保作業', positionX: 30, positionY: 40 },
  ];
  const edges = [{ id: 'e1', sourceNodeId: 'a1', targetNodeId: 'a2' }];

  it('TS-LCC-A-001 節點+邊+掛載文件 → 正確序列化 SnapshotGraph', () => {
    const docsByNode = new Map<string, SnapshotDocRef[]>([
      [
        'a1',
        [
          { id: 'd1', documentNumber: 'ICSOP-SRC-101' },
          { id: 'd2', documentNumber: 'ICSOP-SRC-102' },
        ],
      ],
    ]);
    const g = buildSnapshotGraph(nodes, edges, docsByNode);
    expect(g.nodes[0]).toEqual({
      id: 'a1',
      name: '進件作業',
      positionX: 10,
      positionY: 20,
      docs: [
        { id: 'd1', documentNumber: 'ICSOP-SRC-101' },
        { id: 'd2', documentNumber: 'ICSOP-SRC-102' },
      ],
    });
    // 無掛載節點 → docs 為 []（非 undefined）
    expect(g.nodes[1].docs).toEqual([]);
    expect(g.edges).toEqual([{ id: 'e1', sourceNodeId: 'a1', targetNodeId: 'a2' }]);
  });

  it('TS-LCC-A-002 空循環（無節點無邊）→ {nodes:[], edges:[]}', () => {
    const g = buildSnapshotGraph([], [], new Map());
    expect(g).toEqual({ nodes: [], edges: [] });
    expect(EMPTY_SNAPSHOT_GRAPH).toEqual({ nodes: [], edges: [] });
  });

  it('TS-LCC-A-003 節點無掛載（docsByNode 未含該節點 key）→ docs 為 []（防禦性，非拋錯）', () => {
    const g = buildSnapshotGraph(nodes, edges, new Map());
    expect(g.nodes.every((n) => Array.isArray(n.docs) && n.docs.length === 0)).toBe(true);
  });

  it('TS-LCC-A-004 序列化結果 JSON.parse 還原與輸入結構一致（round-trip）', () => {
    const docsByNode = new Map<string, SnapshotDocRef[]>([
      ['a2', [{ id: 'd9', documentNumber: 'ICSOP-PUC-201' }]],
    ]);
    const g = buildSnapshotGraph(nodes, edges, docsByNode);
    const roundTrip = JSON.parse(JSON.stringify(g));
    expect(roundTrip).toEqual(g);
    expect(roundTrip.nodes[1].docs).toEqual([{ id: 'd9', documentNumber: 'ICSOP-PUC-201' }]);
  });
});
