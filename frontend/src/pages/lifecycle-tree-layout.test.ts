import { describe, it, expect } from 'vitest';
import {
  buildTreeLayout,
  descendants,
  edgePath,
  MARGIN,
  HGAP,
  VGAP,
  NODE_H,
  NODE_W,
} from './lifecycle-tree-layout';
import type { DagNode, DagEdge } from '../api/types';

function n(id: string, over: Partial<DagNode> = {}): DagNode {
  return { id, lifecycleId: 'lc', name: id, positionX: 0, positionY: 0, docCount: 0, ...over };
}
function e(id: string, s: string, t: string): DagEdge {
  return { id, sourceNodeId: s, targetNodeId: t };
}
const lv = (l: ReturnType<typeof buildTreeLayout>, id: string) =>
  l.nodes.find((x) => x.id === id)!.level;

describe('buildTreeLayout（F036 檢視器佈局）', () => {
  it('空圖 → 無節點、版面僅邊界', () => {
    const l = buildTreeLayout([], []);
    expect(l.nodes).toHaveLength(0);
    expect(l.boardWidth).toBe(MARGIN * 2);
    expect(l.boardHeight).toBe(MARGIN * 2);
  });

  it('鏈 A→B→C：分層 0/1/2、y 遞增', () => {
    const l = buildTreeLayout([n('A'), n('B'), n('C')], [e('e1', 'A', 'B'), e('e2', 'B', 'C')]);
    expect([lv(l, 'A'), lv(l, 'B'), lv(l, 'C')]).toEqual([0, 1, 2]);
    expect(l.boardHeight).toBe(MARGIN * 2 + 2 * VGAP + NODE_H);
  });

  it('多 child（A→B, A→C）：同層 1、版面寬含兩欄', () => {
    const l = buildTreeLayout([n('A'), n('B'), n('C')], [e('e1', 'A', 'B'), e('e2', 'A', 'C')]);
    expect(lv(l, 'B')).toBe(1);
    expect(lv(l, 'C')).toBe(1);
    expect(l.boardWidth).toBe(MARGIN * 2 + 2 * HGAP);
  });

  it('多 parent（A→D, B→D, A→B）：D 落於最長路徑層 2', () => {
    const l = buildTreeLayout(
      [n('A'), n('B'), n('D')],
      [e('e1', 'A', 'B'), e('e2', 'A', 'D'), e('e3', 'B', 'D')],
    );
    expect(lv(l, 'D')).toBe(2);
  });

  it('docCount 帶入、節點順序＝輸入序', () => {
    const l = buildTreeLayout([n('x', { docCount: 2 }), n('y')], [e('e1', 'x', 'y')]);
    expect(l.nodes.map((x) => x.id)).toEqual(['x', 'y']);
    expect(l.nodes[0].docCount).toBe(2);
  });
});

describe('descendants（下游遍歷）', () => {
  const edges = [
    e('e1', 'a1', 'a2'),
    e('e2', 'a1', 'a3'),
    e('e3', 'a2', 'a4'),
    e('e4', 'a3', 'a4'),
    e('e5', 'a4', 'a5'),
  ];

  it('根節點 a1 → 含全部下游', () => {
    const set = descendants(edges, 'a1');
    expect(set).toEqual(new Set(['a1', 'a2', 'a3', 'a4', 'a5']));
  });

  it('中段 a2 → 僅其下游（不含兄弟 a3）', () => {
    const set = descendants(edges, 'a2');
    expect(set).toEqual(new Set(['a2', 'a4', 'a5']));
    expect(set.has('a3')).toBe(false);
  });

  it('葉節點 a5 → 僅自身', () => {
    expect(descendants(edges, 'a5')).toEqual(new Set(['a5']));
  });

  it('多路徑匯流（菱形）不重複、可終止', () => {
    const set = descendants([e('e1', 'A', 'B'), e('e2', 'A', 'C'), e('e3', 'B', 'D'), e('e4', 'C', 'D')], 'A');
    expect(set).toEqual(new Set(['A', 'B', 'C', 'D']));
  });
});

describe('edgePath（直角連線）', () => {
  it('產生垂直→水平→垂直之 elbow path，起於 source 底、止於 target 頂', () => {
    const l = buildTreeLayout([n('A'), n('B')], [e('e1', 'A', 'B')]);
    const a = l.nodes.find((x) => x.id === 'A')!;
    const b = l.nodes.find((x) => x.id === 'B')!;
    const d = edgePath(a, b);
    expect(d).toContain(`M ${a.x + NODE_W / 2} ${a.y + NODE_H}`);
    expect(d).toContain(`L ${b.x + NODE_W / 2} ${b.y}`);
  });
});
