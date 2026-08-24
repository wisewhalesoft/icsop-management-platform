import {
  buildTreeLayout,
  descendants,
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

/**
 * F036 §抽屜擴為子樹 delta（2026-08-21 三項裁決第 2 項）—— `AC-T28`（架構決策 C1，
 * `architecture-spec.md` §12.1）：後端 `descendants(edges, startId): Set<string>` 之權威定義，
 * 以 5 組固定測試向量與前端版綁定（`frontend/src/pages/lifecycle-tree-layout.test.ts` 之同名區塊）。
 *
 * 🔴 本區塊為「本輪唯一必須做但沒有任何機制自動保證會做」之項目（system-architect 如實提報）：
 * 只在一端建立此向量測試，另一端的語意漂移不會被任何東西攔截。**兩端皆已擴充**（本檔＋前端對應檔）。
 *
 * ⚠ 對實作全盲：`descendants` 尚未在本檔（後端）匯出，本區塊預期一開始為紅
 * （§12.1「後端尚無子樹走訪能力」）。
 */
describe('descendants（AC-T28 · F1–F5 固定向量，跨執行環境綁定，權威＝architecture-spec.md §12.1）', () => {
  it('F1（鏈）A→B, B→C, C→D：descendants(A)/(C)/(D) 逐一相符', () => {
    const edges = [e('A', 'B'), e('B', 'C'), e('C', 'D')];
    expect(descendants(edges, 'A')).toEqual(new Set(['A', 'B', 'C', 'D']));
    expect(descendants(edges, 'C')).toEqual(new Set(['C', 'D']));
    expect(descendants(edges, 'D')).toEqual(new Set(['D']));
  });

  it('F2（菱形匯流）A→B, A→C, B→D, C→D：D 經兩路徑可達，計入一次', () => {
    const edges = [e('A', 'B'), e('A', 'C'), e('B', 'D'), e('C', 'D')];
    expect(descendants(edges, 'A')).toEqual(new Set(['A', 'B', 'C', 'D']));
  });

  it('F3（分支排除）A→B, A→C, B→D, C→E：descendants(B) 不含旁支 C／E', () => {
    const edges = [e('A', 'B'), e('A', 'C'), e('B', 'D'), e('C', 'E')];
    expect(descendants(edges, 'B')).toEqual(new Set(['B', 'D']));
  });

  it('F4（葉節點）A→B：descendants(B) 回最小集（僅自身，無出邊）', () => {
    const edges = [e('A', 'B')];
    expect(descendants(edges, 'B')).toEqual(new Set(['B']));
  });

  it('F5（重複邊防禦）A→B, A→B：不因重複邊而重複計入或無窮成長', () => {
    const edges = [e('A', 'B'), e('A', 'B')];
    expect(descendants(edges, 'A')).toEqual(new Set(['A', 'B']));
  });
});
