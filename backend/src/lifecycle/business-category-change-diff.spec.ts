/**
 * F043 業務/功能類別管理 — business-category-change-diff（決策 E1／§14.1／§14.9）
 *
 * 權威：docs/specs/architecture-spec.md §14.1 反漂移處置表——`lifecycle-change-diff.ts` 之
 * `computeLifecycleDiff`（純函式部分，僅操作 SnapshotGraph 三分類、不讀 changeType）查證後
 * 確認零 LIFECYCLE 耦合，裁定**複製一份 ＋ 固定向量綁定**；`reconstructBeforeAfter`／
 * `selectPredecessor` 因與特定 store token 耦合，正常複製、不需綁定（見
 * business-category-change-history.service.spec.ts）。
 *
 * ⚠ 對實作全盲：`./business-category-change-diff` 尚不存在。
 */
import { computeLifecycleDiff } from './lifecycle-change-diff';
import { SnapshotGraph, SnapshotNode } from './lifecycle-snapshot-builder';
import {
  computeBusinessCategoryDiff,
  reconstructBusinessCategoryBeforeAfter,
  selectBusinessCategoryPredecessor,
  BusinessCategoryChangeLogNotFoundError,
} from './business-category-change-diff';
import {
  BusinessCategoryChangeLogRow,
  BusinessCategoryChangeLogStore,
} from '../change-history/business-category-change-log.store';
import {
  BusinessCategorySnapshotRecord,
  BusinessCategorySnapshotStore,
} from '../change-history/business-category-snapshot.store';

function sn(id: string, name: string, d: { id: string; documentNumber: string }[] = []): SnapshotNode {
  return { id, name, positionX: 0, positionY: 0, docs: d };
}
function ed(id: string, s: string, t: string) {
  return { id, sourceNodeId: s, targetNodeId: t };
}
function graph(nodes: SnapshotNode[], edges: { id: string; sourceNodeId: string; targetNodeId: string }[]): SnapshotGraph {
  return { nodes, edges };
}

describe('computeBusinessCategoryDiff（F043 決策 E1：複製＋固定向量綁定）', () => {
  it('新增節點並改接連線（同構於 computeLifecycleDiff 之三分類）', () => {
    const before = graph([sn('a1', '授信申請'), sn('a2', '風險評估')], [ed('e1', 'a1', 'a2')]);
    const after = graph(
      [sn('a1', '授信申請'), sn('a2', '風險評估'), sn('a3', '核准撥款')],
      [ed('e1', 'a1', 'a2'), ed('e2', 'a2', 'a3')],
    );
    const d = computeBusinessCategoryDiff(before, after);
    expect(d.addNodes).toEqual(['a3']);
    expect(d.addEdges).toEqual([['a2', 'a3']]);
    expect(d.rmNodes).toEqual([]);
    expect(d.amberNodes).toEqual([]);
  });

  it('節點改名 → amberNodes', () => {
    const before = graph([sn('a4', '撥款核准')], []);
    const after = graph([sn('a4', '撥款核准作業')], []);
    const d = computeBusinessCategoryDiff(before, after);
    expect(d.amberNodes).toEqual(['a4']);
  });

  it('文件掛載數變化（1→2 份）→ amberNodes', () => {
    const before = graph([sn('b4', '費用請款作業', [{ id: 'd1', documentNumber: 'N1' }])], []);
    const after = graph(
      [sn('b4', '費用請款作業', [{ id: 'd1', documentNumber: 'N1' }, { id: 'd2', documentNumber: 'N2' }])],
      [],
    );
    const d = computeBusinessCategoryDiff(before, after);
    expect(d.amberNodes).toEqual(['b4']);
  });

  it('移除節點（含其連線）→ rmNodes + rmEdges', () => {
    const before = graph([sn('b5', '付款核准'), sn('b6', '付款執行')], [ed('e1', 'b5', 'b6')]);
    const after = graph([sn('b5', '付款核准')], []);
    const d = computeBusinessCategoryDiff(before, after);
    expect(d.rmNodes).toEqual(['b6']);
    expect(d.rmEdges).toEqual([['b5', 'b6']]);
  });

  it('before/after 完全相同 → 五個陣列皆空', () => {
    const g = graph([sn('a1', '授信申請', [{ id: 'd1', documentNumber: 'N1' }])], []);
    const d = computeBusinessCategoryDiff(g, g);
    expect(d).toEqual({ addNodes: [], rmNodes: [], amberNodes: [], addEdges: [], rmEdges: [] });
  });

  it('before 為空圖（該類別第一筆事件）→ after 全部判為 add', () => {
    const before = graph([], []);
    const after = graph([sn('a1', '授信申請'), sn('a2', '風險評估')], [ed('e1', 'a1', 'a2')]);
    const d = computeBusinessCategoryDiff(before, after);
    expect(d.addNodes).toEqual(['a1', 'a2']);
    expect(d.addEdges).toEqual([['a1', 'a2']]);
  });

  describe('🔴 跨檔固定向量綁定：與既有 computeLifecycleDiff 對同一組泛型輸入逐位元組相等', () => {
    const VB = graph(
      [sn('v1', '節點一', [{ id: 'vd1', documentNumber: 'N-1' }]), sn('v2', '節點二')],
      [ed('ve1', 'v1', 'v2')],
    );
    const VA = graph(
      [
        sn('v1', '節點一（改名）', [{ id: 'vd1', documentNumber: 'N-1' }, { id: 'vd2', documentNumber: 'N-2' }]),
        sn('v3', '新節點三'),
      ],
      [ed('ve2', 'v1', 'v3')],
    );

    it('固定向量：兩函式輸出逐位元組相等', () => {
      const fromLifecycle = computeLifecycleDiff(VB, VA);
      const fromBusinessCategory = computeBusinessCategoryDiff(VB, VA);
      expect(fromBusinessCategory).toEqual(fromLifecycle);
    });

    it('🔒 自證：固定向量之 diff 結果非全空（否則恆真、無鑑別力）', () => {
      const out = computeLifecycleDiff(VB, VA);
      const nonEmptyBuckets = [out.addNodes, out.rmNodes, out.amberNodes, out.addEdges, out.rmEdges].filter(
        (b) => b.length > 0,
      );
      expect(nonEmptyBuckets.length).toBeGreaterThan(1); // 涵蓋不只一種分類，鑑別力更強
    });
  });
});

// ── AC-41：selectBusinessCategoryPredecessor／reconstructBusinessCategoryBeforeAfter ──
// 決策 E1：與特定 store token 耦合，正常複製（不需固定向量綁定，正確性由下方 Fake store 保證）。

describe('selectBusinessCategoryPredecessor（F043 AC-41 重建之前一筆錨定）', () => {
  const T1 = new Date('2026-09-01T00:00:00Z');
  const T2 = new Date('2026-09-02T00:00:00Z');
  const T3 = new Date('2026-09-03T00:00:00Z');
  const row = (id: string, bc: string, at: Date): BusinessCategoryChangeLogRow => ({
    id,
    businessCategoryId: bc,
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

  it('取最近一筆早於目標時間；無更早紀錄回 null', () => {
    const rows = [row('r1', 'bc1', T1), row('r2', 'bc1', T2), row('r3', 'bc1', T3)];
    expect(selectBusinessCategoryPredecessor(rows, 'bc1', T3)?.id).toBe('r2');
    expect(selectBusinessCategoryPredecessor(rows, 'bc1', T1)).toBeNull();
  });

  it('跨類別隔離：不同 businessCategoryId 之更早列不得被誤取', () => {
    const rows = [row('x1', 'bc2', T1), row('t3', 'bc1', T3)];
    expect(selectBusinessCategoryPredecessor(rows, 'bc1', T3)).toBeNull();
  });
});

class FakeLogStore implements BusinessCategoryChangeLogStore {
  rows: BusinessCategoryChangeLogRow[] = [];
  async append(row: BusinessCategoryChangeLogRow): Promise<void> {
    this.rows.push(row);
  }
  async listAll(): Promise<BusinessCategoryChangeLogRow[]> {
    return this.rows;
  }
  async listByBusinessCategory(id: string): Promise<BusinessCategoryChangeLogRow[]> {
    return this.rows.filter((r) => r.businessCategoryId === id);
  }
  async findById(id: string): Promise<BusinessCategoryChangeLogRow | null> {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async findPredecessor(businessCategoryId: string, before: Date): Promise<BusinessCategoryChangeLogRow | null> {
    return selectBusinessCategoryPredecessor(this.rows, businessCategoryId, before);
  }
}
class FakeSnapStore implements BusinessCategorySnapshotStore {
  records: BusinessCategorySnapshotRecord[] = [];
  async findByChangeLogId(changeLogId: string): Promise<BusinessCategorySnapshotRecord | null> {
    return this.records.find((r) => r.changeLogId === changeLogId) ?? null;
  }
  async findById(id: string): Promise<BusinessCategorySnapshotRecord | null> {
    return this.records.find((r) => r.id === id) ?? null;
  }
}
function logRow(id: string, bc: string, at: string, snapshotId: string | null): BusinessCategoryChangeLogRow {
  return {
    id,
    businessCategoryId: bc,
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
function snapRec(id: string, bc: string, changeLogId: string, g: SnapshotGraph): BusinessCategorySnapshotRecord {
  return { id, businessCategoryId: bc, changeLogId, graph: g, capturedAt: new Date() };
}

describe('reconstructBusinessCategoryBeforeAfter（F043 AC-41）', () => {
  let logs: FakeLogStore;
  let snaps: FakeSnapStore;
  const g1 = graph([sn('a1', '節點1')], []);
  const g2 = graph([sn('a1', '節點1'), sn('a2', '節點2')], [ed('e1', 'a1', 'a2')]);

  beforeEach(() => {
    logs = new FakeLogStore();
    snaps = new FakeSnapStore();
    logs.rows = [
      logRow('cl1', 'bc1', '2026-09-01T00:00:00Z', 'sp1'),
      logRow('cl2', 'bc1', '2026-09-02T00:00:00Z', 'sp2'),
    ];
    snaps.records = [snapRec('sp1', 'bc1', 'cl1', g1), snapRec('sp2', 'bc1', 'cl2', g2)];
  });

  it('一般案例 → before=前一筆快照、after=本筆快照', async () => {
    const { before, after } = await reconstructBusinessCategoryBeforeAfter(logs, snaps, 'bc1', 'cl2');
    expect(before).toEqual(g1);
    expect(after).toEqual(g2);
  });

  it('該類別第一筆事件 → before 為空圖（不拋錯，比照 F043 §戊 條文 3）', async () => {
    const { before, after } = await reconstructBusinessCategoryBeforeAfter(logs, snaps, 'bc1', 'cl1');
    expect(before).toEqual({ nodes: [], edges: [] });
    expect(after).toEqual(g1);
  });

  it('changeLogId 不存在 → 拋 BUSINESS_CATEGORY_CHANGE_LOG_NOT_FOUND', async () => {
    await expect(reconstructBusinessCategoryBeforeAfter(logs, snaps, 'bc1', 'nope')).rejects.toThrow(
      'BUSINESS_CATEGORY_CHANGE_LOG_NOT_FOUND',
    );
    await expect(reconstructBusinessCategoryBeforeAfter(logs, snaps, 'bc1', 'nope')).rejects.toBeInstanceOf(
      BusinessCategoryChangeLogNotFoundError,
    );
  });

  it('changeLogId 屬另一類別（businessCategoryId 不符）→ 亦拋 NOT_FOUND（不洩漏存在）', async () => {
    await expect(reconstructBusinessCategoryBeforeAfter(logs, snaps, 'bcOTHER', 'cl2')).rejects.toThrow(
      'BUSINESS_CATEGORY_CHANGE_LOG_NOT_FOUND',
    );
  });
});
