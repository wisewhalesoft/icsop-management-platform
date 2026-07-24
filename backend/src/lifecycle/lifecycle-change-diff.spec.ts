import {
  computeLifecycleDiff,
  reconstructBeforeAfter,
  reconstructBeforeAfterForGroup,
  selectPredecessor,
  LifecycleChangeLogNotFoundError,
} from './lifecycle-change-diff';
import {
  SnapshotGraph,
  SnapshotNode,
  SnapshotDocRef,
} from './lifecycle-snapshot-builder';
import {
  LifecycleChangeLogRow,
  LifecycleChangeLogStore,
} from '../change-history/lifecycle-change-log.store';
import {
  LifecycleSnapshotRecord,
  LifecycleSnapshotStore,
} from '../change-history/lifecycle-snapshot.store';

// ── 快照 fixture helpers ──
function docs(...ids: string[]): SnapshotDocRef[] {
  return ids.map((id) => ({ id, documentNumber: id }));
}
function sn(
  id: string,
  name: string,
  d: SnapshotDocRef[] = [],
  pos: { x: number; y: number } = { x: 0, y: 0 },
): SnapshotNode {
  return { id, name, positionX: pos.x, positionY: pos.y, docs: d };
}
function ed(id: string, s: string, t: string) {
  return { id, sourceNodeId: s, targetNodeId: t };
}
function graph(nodes: SnapshotNode[], edges: { id: string; sourceNodeId: string; targetNodeId: string }[]): SnapshotGraph {
  return { nodes, edges };
}

// ── §B.3 computeLifecycleDiff ──
describe('computeLifecycleDiff（F038 §B.2；忠實移植 prototype 23 renderMiniDag 三分類）', () => {
  it('TS-LCC-B-001 新增節點並改接連線（prototype lc1 fixture）', () => {
    const before = graph(
      [sn('a1', '進件作業'), sn('a2', '簽約對保作業'), sn('a3', '擔保設定作業'), sn('a5', '案件執行作業')],
      [ed('e1', 'a1', 'a2'), ed('e2', 'a1', 'a3'), ed('e3', 'a2', 'a5'), ed('e4', 'a3', 'a5')],
    );
    const after = graph(
      [sn('a1', '進件作業'), sn('a2', '簽約對保作業'), sn('a3', '擔保設定作業'), sn('a4', '撥款核准作業'), sn('a5', '案件執行作業')],
      [ed('e1', 'a1', 'a2'), ed('e2', 'a1', 'a3'), ed('e5', 'a2', 'a4'), ed('e6', 'a3', 'a4'), ed('e7', 'a4', 'a5')],
    );
    const d = computeLifecycleDiff(before, after);
    expect(d.addNodes).toEqual(['a4']);
    expect(d.rmNodes).toEqual([]);
    expect(d.amberNodes).toEqual([]);
    expect(d.addEdges).toEqual(expect.arrayContaining([['a2', 'a4'], ['a3', 'a4'], ['a4', 'a5']]));
    expect(d.addEdges).toHaveLength(3);
    expect(d.rmEdges).toEqual(expect.arrayContaining([['a2', 'a5'], ['a3', 'a5']]));
    expect(d.rmEdges).toHaveLength(2);
  });

  it('TS-LCC-B-002 節點改名（僅名稱變更）→ amberNodes（prototype lc3）', () => {
    const before = graph([sn('a4', '撥款核准')], []);
    const after = graph([sn('a4', '撥款核准作業')], []);
    const d = computeLifecycleDiff(before, after);
    expect(d.amberNodes).toEqual(['a4']);
    expect(d.addNodes).toEqual([]);
    expect(d.rmNodes).toEqual([]);
    expect(d.addEdges).toEqual([]);
    expect(d.rmEdges).toEqual([]);
  });

  it('TS-LCC-B-003 文件掛載數變化（1→2 份）→ amberNodes（prototype lc4）', () => {
    const before = graph([sn('b4', '費用請款作業', docs('d1'))], []);
    const after = graph([sn('b4', '費用請款作業', docs('d1', 'd2'))], []);
    const d = computeLifecycleDiff(before, after);
    expect(d.amberNodes).toEqual(['b4']);
    expect(d.addNodes).toEqual([]);
  });

  it('TS-LCC-B-004 移除節點（含其連線）→ rmNodes + rmEdges（prototype lc5）', () => {
    const before = graph(
      [sn('b5', '付款核准作業'), sn('b6', '付款執行作業')],
      [ed('e1', 'b5', 'b6')],
    );
    const after = graph([sn('b5', '付款核准作業')], []);
    const d = computeLifecycleDiff(before, after);
    expect(d.rmNodes).toEqual(['b6']);
    expect(d.rmEdges).toEqual([['b5', 'b6']]);
    expect(d.addNodes).toEqual([]);
    expect(after.nodes.find((n) => n.id === 'b6')).toBeUndefined();
  });

  it('TS-LCC-B-005 僅新增連線（節點不變）→ 僅 addEdges（prototype lc2）', () => {
    const before = graph([sn('a1', '進件作業'), sn('a3', '擔保設定作業')], []);
    const after = graph([sn('a1', '進件作業'), sn('a3', '擔保設定作業')], [ed('e1', 'a1', 'a3')]);
    const d = computeLifecycleDiff(before, after);
    expect(d.addEdges).toEqual([['a1', 'a3']]);
    expect(d.addNodes).toEqual([]);
    expect(d.rmNodes).toEqual([]);
    expect(d.amberNodes).toEqual([]);
    expect(d.rmEdges).toEqual([]);
  });

  it('TS-LCC-B-006 節點位置變更（僅 x/y）→ 不計入 amberNodes（佈局非結構）', () => {
    const before = graph([sn('a1', '進件作業', docs('d1'), { x: 0, y: 0 })], []);
    const after = graph([sn('a1', '進件作業', docs('d1'), { x: 999, y: 888 })], []);
    const d = computeLifecycleDiff(before, after);
    expect(d.amberNodes).toEqual([]);
  });

  it('TS-LCC-B-007 before/after 完全相同 → 五個陣列皆空', () => {
    const g = graph([sn('a1', '進件作業', docs('d1'))], [ed('e1', 'a1', 'a1')]);
    const d = computeLifecycleDiff(g, g);
    expect(d).toEqual({ addNodes: [], rmNodes: [], amberNodes: [], addEdges: [], rmEdges: [] });
  });

  it('TS-LCC-B-008 before 為空圖（循環第一筆）→ after 全部判為 add', () => {
    const before = graph([], []);
    const after = graph([sn('a1', '進件作業'), sn('a2', '簽約對保作業')], [ed('e1', 'a1', 'a2')]);
    const d = computeLifecycleDiff(before, after);
    expect(d.addNodes).toEqual(['a1', 'a2']);
    expect(d.addEdges).toEqual([['a1', 'a2']]);
    expect(d.rmNodes).toEqual([]);
  });

  it('TS-LCC-B-016 docs 集合語意（順序不影響）→ 同集合不同順序 → 不計入 amberNodes', () => {
    const before = graph([sn('a1', '進件作業', docs('d1', 'd2'))], []);
    const after = graph([sn('a1', '進件作業', docs('d2', 'd1'))], []);
    const d = computeLifecycleDiff(before, after);
    expect(d.amberNodes).toEqual([]);
  });
});

// ── §A.4 selectPredecessor 純函式（TS-LCC-A-012/013）──
describe('selectPredecessor（F038 §B 重建之前一筆錨定）', () => {
  const T1 = new Date('2026-07-14T00:00:00Z');
  const T2 = new Date('2026-07-15T00:00:00Z');
  const T3 = new Date('2026-07-16T00:00:00Z');
  const row = (id: string, lc: string, at: Date): LifecycleChangeLogRow => ({
    id,
    lifecycleId: lc,
    changeType: 'NODE_ADDED',
    summary: 's',
    oldValue: null,
    newValue: null,
    nodeId: null,
    actorId: null,
    actorName: null,
    actorEmployeeNo: null,
    occurredAt: at,
    snapshotId: `snap-${id}`,
  });

  it('TS-LCC-A-012 取最近一筆早於目標時間；無更早紀錄回 null', () => {
    const rows = [row('r1', 'lc1', T1), row('r2', 'lc1', T2), row('r3', 'lc1', T3)];
    expect(selectPredecessor(rows, 'lc1', T3)?.id).toBe('r2');
    expect(selectPredecessor(rows, 'lc1', T1)).toBeNull();
  });

  it('TS-LCC-A-013 跨循環隔離：不同 lifecycleId 之更早列不得被誤取', () => {
    const rows = [row('x1', 'lc2', T1), row('t3', 'lc1', T3)];
    expect(selectPredecessor(rows, 'lc1', T3)).toBeNull();
  });
});

// ── §B.3 reconstructBeforeAfter（Fake stores）──
class FakeLogStore implements LifecycleChangeLogStore {
  rows: LifecycleChangeLogRow[] = [];
  async append(row: LifecycleChangeLogRow): Promise<void> {
    this.rows.push(row);
  }
  async listAll(): Promise<LifecycleChangeLogRow[]> {
    return this.rows;
  }
  async listByLifecycle(id: string): Promise<LifecycleChangeLogRow[]> {
    return this.rows.filter((r) => r.lifecycleId === id);
  }
  async findById(id: string): Promise<LifecycleChangeLogRow | null> {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async findPredecessor(lifecycleId: string, before: Date): Promise<LifecycleChangeLogRow | null> {
    return selectPredecessor(this.rows, lifecycleId, before);
  }
}
class FakeSnapStore implements LifecycleSnapshotStore {
  records: LifecycleSnapshotRecord[] = [];
  async findByChangeLogId(changeLogId: string): Promise<LifecycleSnapshotRecord | null> {
    return this.records.find((r) => r.changeLogId === changeLogId) ?? null;
  }
  async findById(id: string): Promise<LifecycleSnapshotRecord | null> {
    return this.records.find((r) => r.id === id) ?? null;
  }
}

function logRow(id: string, lc: string, at: string, snapshotId: string | null): LifecycleChangeLogRow {
  return {
    id,
    lifecycleId: lc,
    changeType: 'NODE_ADDED',
    summary: 's',
    oldValue: null,
    newValue: null,
    nodeId: null,
    actorId: null,
    actorName: null,
    actorEmployeeNo: null,
    occurredAt: new Date(at),
    snapshotId,
  };
}
function snapRec(id: string, lc: string, changeLogId: string, g: SnapshotGraph): LifecycleSnapshotRecord {
  return { id, lifecycleId: lc, changeLogId, graph: g, capturedAt: new Date() };
}

describe('reconstructBeforeAfter（F038 §B.1 演算法）', () => {
  let logs: FakeLogStore;
  let snaps: FakeSnapStore;
  const g1 = graph([sn('a1', '節點1')], []);
  const g2 = graph([sn('a1', '節點1'), sn('a2', '節點2')], [ed('e1', 'a1', 'a2')]);
  const g3 = graph([sn('a1', '節點1'), sn('a2', '節點2改名')], [ed('e1', 'a1', 'a2')]);

  beforeEach(() => {
    logs = new FakeLogStore();
    snaps = new FakeSnapStore();
    logs.rows = [
      logRow('cl1', 'lc1', '2026-07-14T00:00:00Z', 'sp1'),
      logRow('cl2', 'lc1', '2026-07-15T00:00:00Z', 'sp2'),
      logRow('cl3', 'lc1', '2026-07-16T00:00:00Z', 'sp3'),
    ];
    snaps.records = [
      snapRec('sp1', 'lc1', 'cl1', g1),
      snapRec('sp2', 'lc1', 'cl2', g2),
      snapRec('sp3', 'lc1', 'cl3', g3),
    ];
  });

  it('TS-LCC-B-009 一般案例 → before=前一筆快照、after=本筆快照', async () => {
    const { before, after } = await reconstructBeforeAfter(logs, snaps, 'lc1', 'cl2');
    expect(before).toEqual(g1);
    expect(after).toEqual(g2);
  });

  it('TS-LCC-B-010 循環第一筆事件 → before 為空圖（不拋錯）', async () => {
    const { before, after } = await reconstructBeforeAfter(logs, snaps, 'lc1', 'cl1');
    expect(before).toEqual({ nodes: [], edges: [] });
    expect(after).toEqual(g1);
  });

  it('TS-LCC-B-011 predecessor 存在但 snapshotId 為 null（遺留舊列）→ before 降級空圖', async () => {
    logs.rows[0] = logRow('cl1', 'lc1', '2026-07-14T00:00:00Z', null);
    const { before, after } = await reconstructBeforeAfter(logs, snaps, 'lc1', 'cl2');
    expect(before).toEqual({ nodes: [], edges: [] });
    expect(after).toEqual(g2);
  });

  it('TS-LCC-A-014 findByChangeLogId 契約：查得回該列、查無回 null', async () => {
    expect((await snaps.findByChangeLogId('cl2'))?.id).toBe('sp2');
    expect(await snaps.findByChangeLogId('不存在')).toBeNull();
  });

  it('TS-LCC-B-012 changeLogId 不存在 → 拋 LIFECYCLE_CHANGE_LOG_NOT_FOUND', async () => {
    await expect(reconstructBeforeAfter(logs, snaps, 'lc1', 'nope')).rejects.toThrow(
      'LIFECYCLE_CHANGE_LOG_NOT_FOUND',
    );
    await expect(reconstructBeforeAfter(logs, snaps, 'lc1', 'nope')).rejects.toBeInstanceOf(
      LifecycleChangeLogNotFoundError,
    );
  });

  it('TS-LCC-B-013 changeLogId 屬另一循環（lifecycleId 不符）→ 亦拋 NOT_FOUND（不洩漏存在）', async () => {
    await expect(reconstructBeforeAfter(logs, snaps, 'lcOTHER', 'cl2')).rejects.toThrow(
      'LIFECYCLE_CHANGE_LOG_NOT_FOUND',
    );
  });

  it('TS-LCC-B-014 group 模式 → before=first 之 predecessor 快照、after=last 自身快照（跳過中間）', async () => {
    const { before, after } = await reconstructBeforeAfterForGroup(logs, snaps, 'lc1', 'cl2', 'cl3');
    expect(before).toEqual(g1); // cl2 之 predecessor = cl1
    expect(after).toEqual(g3); // cl3 自身
  });

  it('TS-LCC-B-015 group 模式 firstId===lastId → 與單事件模式一致', async () => {
    const grp = await reconstructBeforeAfterForGroup(logs, snaps, 'lc1', 'cl2', 'cl2');
    const single = await reconstructBeforeAfter(logs, snaps, 'lc1', 'cl2');
    expect(grp).toEqual(single);
  });
});
