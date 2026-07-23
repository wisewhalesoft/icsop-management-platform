import {
  buildTreeLayout,
  TREE_LAYOUT_CONST,
  TreeLayoutNode,
  TreeLayoutEdge,
} from './lifecycle-tree-layout';

const { MARGIN, HGAP, VGAP, NODE_H } = TREE_LAYOUT_CONST;

function n(id: string, over: Partial<TreeLayoutNode> = {}): TreeLayoutNode {
  return { id, name: id, docCount: 0, ...over };
}
function e(s: string, t: string): TreeLayoutEdge {
  return { sourceNodeId: s, targetNodeId: t };
}
const levelOf = (layout: ReturnType<typeof buildTreeLayout>, id: string) =>
  layout.nodes.find((x) => x.id === id)!.level;

describe('buildTreeLayout（F036 上到下分層佈局）', () => {
  it('空圖 → 無節點、版面僅邊界', () => {
    const l = buildTreeLayout([], []);
    expect(l.nodes).toHaveLength(0);
    expect(l.boardWidth).toBe(MARGIN * 2);
    expect(l.boardHeight).toBe(MARGIN * 2);
  });

  it('鏈 A→B→C：分層 0/1/2、y 遞增、版面高含各層', () => {
    const l = buildTreeLayout([n('A'), n('B'), n('C')], [e('A', 'B'), e('B', 'C')]);
    expect(levelOf(l, 'A')).toBe(0);
    expect(levelOf(l, 'B')).toBe(1);
    expect(levelOf(l, 'C')).toBe(2);
    const ys = ['A', 'B', 'C'].map((id) => l.nodes.find((x) => x.id === id)!.y);
    expect(ys).toEqual([MARGIN, MARGIN + VGAP, MARGIN + 2 * VGAP]);
    expect(l.boardHeight).toBe(MARGIN * 2 + 2 * VGAP + NODE_H);
  });

  it('多 child（A→B, A→C）：B/C 同層 1、版面寬含兩欄', () => {
    const l = buildTreeLayout([n('A'), n('B'), n('C')], [e('A', 'B'), e('A', 'C')]);
    expect(levelOf(l, 'B')).toBe(1);
    expect(levelOf(l, 'C')).toBe(1);
    expect(l.boardWidth).toBe(MARGIN * 2 + 2 * HGAP);
  });

  it('多 parent（A→D, B→D, 且 A→B）：D 落在最長路徑層（level 2）', () => {
    const l = buildTreeLayout(
      [n('A'), n('B'), n('D')],
      [e('A', 'B'), e('A', 'D'), e('B', 'D')],
    );
    expect(levelOf(l, 'D')).toBe(2);
  });

  it('輸出節點順序＝輸入順序（穩定可測），docCount 帶入', () => {
    const l = buildTreeLayout(
      [n('x', { docCount: 3 }), n('y'), n('z')],
      [e('x', 'y'), e('y', 'z')],
    );
    expect(l.nodes.map((x) => x.id)).toEqual(['x', 'y', 'z']);
    expect(l.nodes.find((x) => x.id === 'x')!.docCount).toBe(3);
  });

  it('過濾指向不存在節點之邊（防髒資料）', () => {
    const l = buildTreeLayout([n('A'), n('B')], [e('A', 'B'), e('A', 'ghost')]);
    expect(l.edges).toHaveLength(1);
    expect(l.edges[0]).toEqual(e('A', 'B'));
  });
});
