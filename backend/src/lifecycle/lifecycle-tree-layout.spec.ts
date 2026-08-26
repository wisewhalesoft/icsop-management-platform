import {
  buildEdgeRoutes,
  buildTreeLayout,
  descendants,
  TREE_LAYOUT_CONST,
  TreeLayoutNode,
  TreeLayoutEdge,
} from './lifecycle-tree-layout';

const { MARGIN, HGAP, VGAP, NODE_H, NODE_W } = TREE_LAYOUT_CONST;

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

const layoutOf = (ids: string[], es: Array<[string, string]>) =>
  buildTreeLayout(ids.map((id) => n(id)), es.map(([s, t]) => e(s, t)));

/**
 * 2026-08-26 樹狀圖連線缺陷修正之幾何不變式（三份實作同語意：prototypes/22、前端、後端）。
 *
 * 缺陷形狀（修正前皆可重現）：① 同走廊兩條水平段共線重疊 → 畫面成「H」形、讀成相反的連線；
 * ② 跨層邊之線段從中間層卡片穿進穿出 → 看起來像兄弟節點被橫線接起來；③ 跨層邊與主鏈完全
 * 重合 → 該條依賴在圖上整條隱形。故本區塊斷言的是**幾何**（線段彼此的關係），不是像素。
 */
describe('buildEdgeRoutes（連線繞線 · 幾何不變式）', () => {
  interface Seg {
    kind: 'H' | 'V';
    /** 水平段＝其 y；垂直段＝其 x。 */
    at: number;
    lo: number;
    hi: number;
    edge: string;
  }

  function segmentsOf(routes: ReturnType<typeof buildEdgeRoutes>): Seg[] {
    const segs: Seg[] = [];
    for (const r of routes) {
      const edge = `${r.sourceNodeId}→${r.targetNodeId}`;
      for (let i = 0; i + 1 < r.points.length; i += 1) {
        const a = r.points[i];
        const b = r.points[i + 1];
        if (a.x === b.x) {
          segs.push({ kind: 'V', at: a.x, lo: Math.min(a.y, b.y), hi: Math.max(a.y, b.y), edge });
        } else {
          segs.push({ kind: 'H', at: a.y, lo: Math.min(a.x, b.x), hi: Math.max(a.x, b.x), edge });
        }
      }
    }
    return segs;
  }

  /** ① 兩條**不同邊**之同向線段共線且區間重疊 → 視覺上黏成一條。 */
  function collinearOverlaps(segs: Seg[]): string[] {
    const out: string[] = [];
    for (let i = 0; i < segs.length; i += 1) {
      for (let j = i + 1; j < segs.length; j += 1) {
        const a = segs[i];
        const b = segs[j];
        if (a.edge === b.edge || a.kind !== b.kind || a.at !== b.at) continue;
        if (Math.min(a.hi, b.hi) - Math.max(a.lo, b.lo) > 0.5) {
          out.push(`${a.edge} 與 ${b.edge} 於 ${a.kind}@${a.at} 重疊`);
        }
      }
    }
    return out;
  }

  /** ②③ 線段穿過「非本邊端點」之節點卡。 */
  function cardCrossings(layout: ReturnType<typeof buildTreeLayout>, segs: Seg[]): string[] {
    const out: string[] = [];
    for (const s of segs) {
      for (const n of layout.nodes) {
        if (s.edge.split('→').includes(n.id)) continue;
        const [x0, x1, y0, y1] = [n.x, n.x + NODE_W, n.y, n.y + NODE_H];
        const hit =
          s.kind === 'H'
            ? s.at > y0 && s.at < y1 && s.hi > x0 && s.lo < x1
            : s.at > x0 && s.at < x1 && s.hi > y0 && s.lo < y1;
        if (hit) out.push(`${s.edge} 之 ${s.kind} 段穿過卡片 ${n.id}`);
      }
    }
    return out;
  }

  /** 具名拓樸：每一組都是修正前會踩到 ①②③ 其中之一的真實形狀。 */
  const TOPOLOGIES: Array<{ t: string; ids: string[]; es: Array<[string, string]> }> = [
    { t: 'G1 同層互換', ids: ['P1', 'P2', 'C1', 'C2'], es: [['P1', 'C2'], ['P2', 'C1']] },
    {
      t: 'G2 跨層邊（中間層兩張卡）',
      ids: ['受理', '註記', '初審', '複審', '核准', '撥款'],
      es: [['受理', '初審'], ['註記', '複審'], ['初審', '核准'], ['複審', '撥款'], ['受理', '撥款']],
    },
    {
      t: 'G3 跨層邊同欄',
      ids: ['受理', '補件', '審查', '退件', '核准'],
      es: [['受理', '補件'], ['受理', '審查'], ['受理', '退件'], ['審查', '核准'], ['受理', '核准']],
    },
    {
      t: 'G4 三欄部分重疊',
      ids: ['P1', 'P2', 'P3', 'C1', 'C2', 'C3'],
      es: [['P1', 'C3'], ['P2', 'C1'], ['P3', 'C2']],
    },
    {
      t: 'G5 兩父各兩子交錯',
      ids: ['P1', 'P2', 'C1', 'C2', 'C3', 'C4'],
      es: [['P1', 'C1'], ['P1', 'C3'], ['P2', 'C2'], ['P2', 'C4']],
    },
    {
      t: 'G6 實務型（補件回路＋跨層直達）',
      ids: ['受理', '審查', '核准', '撥款', '補件'],
      es: [
        ['受理', '審查'],
        ['審查', '核准'],
        ['核准', '撥款'],
        ['受理', '補件'],
        ['補件', '審查'],
        ['受理', '核准'],
      ],
    },
    { t: 'G7 菱形', ids: ['A', 'B', 'C', 'D'], es: [['A', 'B'], ['A', 'C'], ['B', 'D'], ['C', 'D']] },
  ];

  it('①「兩條邊黏成一條」：七組拓樸皆無同向共線重疊', () => {
    for (const g of TOPOLOGIES) {
      const l = layoutOf(g.ids, g.es);
      expect({ [g.t]: collinearOverlaps(segmentsOf(buildEdgeRoutes(l))) }).toEqual({ [g.t]: [] });
    }
  });

  it('②③「線從卡片穿進穿出／整條隱形」：七組拓樸皆無線段穿過非端點卡片', () => {
    for (const g of TOPOLOGIES) {
      const l = layoutOf(g.ids, g.es);
      expect({ [g.t]: cardCrossings(l, segmentsOf(buildEdgeRoutes(l))) }).toEqual({ [g.t]: [] });
    }
  });

  it('跨層邊改走垂直通道：中段之 x 不落在任一中間層卡片上（G3 受理→核准）', () => {
    const g = TOPOLOGIES[2];
    const l = layoutOf(g.ids, g.es);
    const route = buildEdgeRoutes(l).find(
      (r) => r.sourceNodeId === '受理' && r.targetNodeId === '核准',
    )!;
    expect(route.points).toHaveLength(6); // 下→橫→下（通道）→橫→下
    const channelX = route.points[2].x;
    const mid = l.nodes.filter((n) => n.level === 1);
    expect(mid.length).toBeGreaterThan(0);
    for (const n of mid) {
      expect(channelX < n.x || channelX > n.x + NODE_W).toBe(true);
    }
  });

  it('同層互換之交錯由 barycenter 消除：C2 排到 C1 左邊（G1）', () => {
    const l = layoutOf(TOPOLOGIES[0].ids, TOPOLOGIES[0].es);
    const x = (id: string): number => l.nodes.find((n) => n.id === id)!.x;
    expect(x('C2')).toBeLessThan(x('C1'));
  });

  it('錨點分散：同一父之三條出邊自底邊不同 x 出發（且仍以卡片中線為中心）', () => {
    const l = layoutOf(['P', 'A', 'B', 'C'], [['P', 'A'], ['P', 'B'], ['P', 'C']]);
    const xs = buildEdgeRoutes(l).map((r) => r.points[0].x);
    expect(new Set(xs).size).toBe(3);
    const p = l.nodes.find((n) => n.id === 'P')!;
    expect(xs.reduce((a, b) => a + b, 0) / xs.length).toBeCloseTo(p.x + NODE_W / 2, 6);
  });

  it('單一邊維持既有外觀：與修正前之 elbow 同座標（走廊正中、卡片中線）', () => {
    const l = layoutOf(['A', 'B'], [['A', 'B']]);
    const a = l.nodes.find((n) => n.id === 'A')!;
    const b = l.nodes.find((n) => n.id === 'B')!;
    const cx = a.x + NODE_W / 2;
    const sy = a.y + NODE_H;
    const midY = sy + (b.y - sy) / 2;
    expect(buildEdgeRoutes(l)[0].points).toEqual([
      { x: cx, y: sy },
      { x: cx, y: midY },
      { x: cx, y: midY },
      { x: cx, y: b.y },
    ]);
  });

  it('決定性：同一輸入兩次呼叫產生完全相同之折線', () => {
    const g = TOPOLOGIES[5];
    const once = JSON.stringify(buildEdgeRoutes(layoutOf(g.ids, g.es)));
    const twice = JSON.stringify(buildEdgeRoutes(layoutOf(g.ids, g.es)));
    expect(once).toBe(twice);
  });

  it('折線首末點恆為 source 底邊與 target 頂邊（箭頭落點），且末段為垂直', () => {
    for (const g of TOPOLOGIES) {
      const l = layoutOf(g.ids, g.es);
      for (const r of buildEdgeRoutes(l)) {
        const s = l.nodes.find((n) => n.id === r.sourceNodeId)!;
        const t = l.nodes.find((n) => n.id === r.targetNodeId)!;
        const first = r.points[0];
        const last = r.points[r.points.length - 1];
        expect(first.y).toBe(s.y + NODE_H);
        expect(last.y).toBe(t.y);
        expect(r.points[r.points.length - 2].x).toBe(last.x);
      }
    }
  });

  it('端點查無節點之邊：仍與 edges 索引一一對應（points 為空、不會少一條）', () => {
    const l = layoutOf(['A', 'B'], [['A', 'B']]);
    const withGhost = { ...l, edges: [...l.edges, e('A', 'ghost')] };
    const routes = buildEdgeRoutes(withGhost);
    expect(routes).toHaveLength(2);
    expect(routes[1].points).toEqual([]);
  });
});
