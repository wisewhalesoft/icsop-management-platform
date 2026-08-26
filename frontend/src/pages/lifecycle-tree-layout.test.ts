import { describe, it, expect } from 'vitest';
import {
  buildTreeLayout,
  descendants,
  buildEdgeRoutes,
  routePath,
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
    // dagre 之外框貼齊節點（不像格點模型在最右欄後面再留一個 nodesep）。
    expect(l.boardWidth).toBe(MARGIN * 2 + 2 * NODE_W + (HGAP - NODE_W));
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

/**
 * F036 §抽屜擴為子樹 delta（2026-08-21 三項裁決第 2 項）—— `AC-T28`（架構決策 C1，
 * `architecture-spec.md` §12.1）：與後端 `descendants` 之 5 組固定測試向量綁定
 * （`backend/src/lifecycle/lifecycle-tree-layout.spec.ts` 之同名區塊）。
 *
 * 🔴 本區塊為「本輪唯一必須做但沒有任何機制自動保證會做」之項目：只在一端建立此向量測試，
 * 另一端的語意漂移不會被任何東西攔截。**兩端皆已擴充**（本檔＋後端對應檔）。
 *
 * 📌 與上方既有「descendants（下游遍歷）」describe 並存、不重複——既有區塊之 a1–a5 拓樸
 * 涵蓋的行為場景與本區塊之 F1–F5 命名向量有重疊但非同一組 fixture，AC-T28 明文要求以
 * 這 5 組**具名**向量作為跨執行環境綁定之唯一權威，故另立區塊而非改寫既有測試。
 */
describe('descendants（AC-T28 · F1–F5 固定向量，跨執行環境綁定，權威＝architecture-spec.md §12.1）', () => {
  it('F1（鏈）A→B, B→C, C→D：descendants(A)/(C)/(D) 逐一相符', () => {
    const edges = [e('e1', 'A', 'B'), e('e2', 'B', 'C'), e('e3', 'C', 'D')];
    expect(descendants(edges, 'A')).toEqual(new Set(['A', 'B', 'C', 'D']));
    expect(descendants(edges, 'C')).toEqual(new Set(['C', 'D']));
    expect(descendants(edges, 'D')).toEqual(new Set(['D']));
  });

  it('F2（菱形匯流）A→B, A→C, B→D, C→D：D 經兩路徑可達，計入一次', () => {
    const edges = [e('e1', 'A', 'B'), e('e2', 'A', 'C'), e('e3', 'B', 'D'), e('e4', 'C', 'D')];
    expect(descendants(edges, 'A')).toEqual(new Set(['A', 'B', 'C', 'D']));
  });

  it('F3（分支排除）A→B, A→C, B→D, C→E：descendants(B) 不含旁支 C／E', () => {
    const edges = [e('e1', 'A', 'B'), e('e2', 'A', 'C'), e('e3', 'B', 'D'), e('e4', 'C', 'E')];
    expect(descendants(edges, 'B')).toEqual(new Set(['B', 'D']));
  });

  it('F4（葉節點）A→B：descendants(B) 回最小集（僅自身，無出邊）', () => {
    const edges = [e('e1', 'A', 'B')];
    expect(descendants(edges, 'B')).toEqual(new Set(['B']));
  });

  it('F5（重複邊防禦）A→B, A→B：不因重複邊而重複計入或無窮成長', () => {
    const edges = [e('e1', 'A', 'B'), e('e2', 'A', 'B')];
    expect(descendants(edges, 'A')).toEqual(new Set(['A', 'B']));
  });
});

const layoutOf = (ids: string[], es: Array<[string, string]>) =>
  buildTreeLayout(ids.map((id) => n(id)), es.map(([s, t], i) => e(`e${i}`, s, t)));

/**
 * 2026-08-26 樹狀圖連線缺陷修正之幾何不變式（三份實作同語意：prototypes/22、前端、後端）。
 *
 * 缺陷形狀（修正前皆可重現）：① **跨子樹**的兩條水平段共線重疊 → 畫面成「H」形、讀成相反的
 * 連線（同父扇出／同子扇入之重疊不在此列，那是刻意合併，見 collinearOverlaps 之註）；
 * ② 跨層邊之線段從中間層卡片穿進穿出 → 看起來像兄弟節點被橫線接起來；③ 跨層邊與主鏈完全
 * 重合 → 該條依賴在圖上整條隱形。故本區塊斷言的是**幾何**（線段彼此的關係），不是像素。
 */
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

describe('buildEdgeRoutes（連線繞線 · 幾何不變式）', () => {
  interface Seg {
    kind: 'H' | 'V';
    /** 水平段＝其 y；垂直段＝其 x。 */
    at: number;
    lo: number;
    hi: number;
    edge: string;
    src: string;
    tgt: string;
  }

  function segmentsOf(routes: ReturnType<typeof buildEdgeRoutes>): Seg[] {
    const segs: Seg[] = [];
    for (const r of routes) {
      const edge = `${r.sourceNodeId}→${r.targetNodeId}`;
      for (let i = 0; i + 1 < r.points.length; i += 1) {
        const a = r.points[i];
        const b = r.points[i + 1];
        const meta = { edge, src: r.sourceNodeId, tgt: r.targetNodeId };
        if (a.x === b.x) {
          segs.push({ kind: 'V', at: a.x, lo: Math.min(a.y, b.y), hi: Math.max(a.y, b.y), ...meta });
        } else {
          segs.push({ kind: 'H', at: a.y, lo: Math.min(a.x, b.x), hi: Math.max(a.x, b.x), ...meta });
        }
      }
    }
    return segs;
  }

  /**
   * ① 兩條**不同邊**之同向線段共線且區間重疊 → 視覺上黏成一條。
   *
   * 🔴 **同父扇出／同子扇入之重疊是刻意的、必須放行**（2026-08-26 使用者裁定）：一個節點的
   * 出邊自底邊同一點離開、入邊進頂邊同一點，同父者共用一條橫桿——它們「黏成一條」正是要的
   * 效果（到各自子節點前才分岔）。會誤導的是**跨子樹**的兩條線黏在一起，故只排除來源相同
   * 或目標相同的配對，其餘一律不得重疊。
   */
  function collinearOverlaps(segs: Seg[]): string[] {
    const out: string[] = [];
    for (let i = 0; i < segs.length; i += 1) {
      for (let j = i + 1; j < segs.length; j += 1) {
        const a = segs[i];
        const b = segs[j];
        if (a.edge === b.edge || a.kind !== b.kind || a.at !== b.at) continue;
        if (a.src === b.src || a.tgt === b.tgt) continue;
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

  it('進出口合併：同一父之三條出邊自底邊同一點出發、共用同一條橫桿，只在子節點前分岔', () => {
    const l = layoutOf(['P', 'A', 'B', 'C'], [['P', 'A'], ['P', 'B'], ['P', 'C']]);
    const routes = buildEdgeRoutes(l);
    const cx = (id: string): number => l.nodes.find((n) => n.id === id)!.x + NODE_W / 2;
    // 出發點同一個（＝父卡片底邊中點）
    expect([...new Set(routes.map((r) => r.points[0].x))]).toEqual([cx('P')]);
    // 同一條橫桿（三條邊的水平段同高度）
    expect(new Set(routes.map((r) => r.points[1].y)).size).toBe(1);
    // 到子節點前才分岔：末端各自落在自己卡片的中線
    expect(routes.map((r) => r.points[r.points.length - 1].x).sort((a, b) => a - b))
      .toEqual(['A', 'B', 'C'].map(cx).sort((a, b) => a - b));
  });

  it('進出口合併：同一子節點之兩條入邊自頂邊同一點進入', () => {
    const l = layoutOf(['P1', 'P2', 'C'], [['P1', 'C'], ['P2', 'C']]);
    const routes = buildEdgeRoutes(l);
    const c = l.nodes.find((n) => n.id === 'C')!;
    expect([...new Set(routes.map((r) => r.points[r.points.length - 1].x))]).toEqual([c.x + NODE_W / 2]);
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

  /**
   * ④ 跨線繞過（hop）。正式站真圖上不同子樹之線有 31 處十字交會——沒有顏色區隔時，
   * 十字路口無法判斷哪一條才是連續的那條，故由**水平段**以小半圓跳過垂直段（電路圖慣例）。
   * 🔴 同父扇出／同子扇入之交會**不得**加繞過：那是刻意合併的同一束線，不是兩條不同的線。
   */
  const HOP_FIXTURE: { ids: string[]; es: Array<[string, string]> } = {
    // 正式站真圖之最小重現子圖（貪婪縮減至 10 節點／9 邊）。dagre 把父節點置於子女正上方後，
    // 真圖 58 條邊只剩**一處**十字交會（換 dagre 前為 31 處）——就是這個形狀：F 的兩個子女
    // G、H 分居兩側，而 E→G 這條線得橫越過去，於 F 的下行線形成十字。手編的對稱拓樸在
    // dagre 下都不會交會，故此 fixture 只能從真圖萃取。
    ids: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'],
    es: [
      ['A', 'B'], ['A', 'C'], ['B', 'D'], ['D', 'F'], ['C', 'E'],
      ['F', 'G'], ['F', 'H'], ['E', 'G'], ['I', 'J'],
    ],
  };

  it('跨線繞過：不同子樹交會處有繞過，且每個落點都真的是別條線的垂直段', () => {
    const l = layoutOf(HOP_FIXTURE.ids, HOP_FIXTURE.es);
    const routes = buildEdgeRoutes(l);
    expect(routes.filter((r) => r.hops.some((h) => h.length)).length).toBeGreaterThan(0);
    for (const r of routes) {
      for (let i = 0; i < r.hops.length; i += 1) {
        for (const x of r.hops[i]) {
          const y = r.points[i].y;
          const crossed = routes.some(
            (o) =>
              o.sourceNodeId !== r.sourceNodeId &&
              o.targetNodeId !== r.targetNodeId &&
              o.points.some(
                (p, k) =>
                  k + 1 < o.points.length &&
                  p.x === o.points[k + 1].x &&
                  p.x === x &&
                  y > Math.min(p.y, o.points[k + 1].y) &&
                  y < Math.max(p.y, o.points[k + 1].y),
              ),
          );
          expect({ hop: `${r.sourceNodeId}→${r.targetNodeId}@${x}`, crossed }).toEqual({
            hop: `${r.sourceNodeId}→${r.targetNodeId}@${x}`,
            crossed: true,
          });
        }
      }
    }
  });

  it('跨線繞過：同一父之扇出彼此交會不加繞過（那是刻意合併的一束線）', () => {
    const l = layoutOf(['P', 'A', 'B', 'C'], [['P', 'A'], ['P', 'B'], ['P', 'C']]);
    expect(buildEdgeRoutes(l).every((r) => r.hops.every((h) => !h.length))).toBe(true);
  });

  it('跨線繞過：垂直段永遠不繞（採「水平跳垂直」之單一慣例，兩邊都繞會對不上）', () => {
    const l = layoutOf(HOP_FIXTURE.ids, HOP_FIXTURE.es);
    for (const r of buildEdgeRoutes(l)) {
      r.points.forEach((p, i) => {
        if (i + 1 < r.points.length && p.x === r.points[i + 1].x) expect(r.hops[i]).toEqual([]);
      });
    }
  });

  it('routePath：有繞過時以貝茲 C 畫半圓（凸向 −y），無繞過時只有 M／L', () => {
    const withHop = buildEdgeRoutes(layoutOf(HOP_FIXTURE.ids, HOP_FIXTURE.es))
      .find((r) => r.hops.some((h) => h.length))!;
    expect(routePath(withHop)).toContain(' C ');
    const plain = buildEdgeRoutes(layoutOf(['A', 'B'], [['A', 'B']]))[0];
    expect(routePath(plain)).not.toContain('C');
    expect(routePath(plain)).toMatch(/^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+)+$/);
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
    const withGhost = { ...l, edges: [...l.edges, e('gx', 'A', 'ghost')] };
    const routes = buildEdgeRoutes(withGhost);
    expect(routes).toHaveLength(2);
    expect(routes[1].points).toEqual([]);
  });
});

/**
 * 同層排序之**子樹連續性**（2026-08-26 以正式站真圖裁定）。
 *
 * 使用者回報：「該合併的線照原來的沒問題，只是不同的 subtree 應該要分開」。
 * 真圖（銷售及收款循環·消金，61 節點／58 邊、單層最寬 29 個）實測：加了往上掃之後，
 * 12 組同父子女有 4 組被別的子樹插隊（插入 16 個外人）、邊交叉 21 個；改為只往下掃，
 * 兩者同時歸零——因為同父者於往下掃取得相同鍵值，穩定排序即讓它們連成一段。
 *
 * 🔴 本區塊是「往上掃不得復活」的唯一防線：往上掃以子女平均位置重排整列，必然拆散同父子女。
 */
describe('buildTreeLayout（同層排序 · 子樹連續性）', () => {
  /** 回傳「同父子女被別的節點插隊」之群組描述；空陣列＝每個子樹各佔連續區段。 */
  function splitSiblingGroups(
    l: ReturnType<typeof buildTreeLayout>,
    es: Array<[string, string]>,
  ): string[] {
    const levelOfId = (id: string): number => l.nodes.find((n) => n.id === id)!.level;
    const kids = new Map<string, string[]>();
    for (const [s, t] of es) (kids.get(s) ?? kids.set(s, []).get(s)!).push(t);
    const out: string[] = [];
    for (const [p, cs] of kids) {
      const byLevel = new Map<number, string[]>();
      for (const c of cs) {
        const lv = levelOfId(c);
        (byLevel.get(lv) ?? byLevel.set(lv, []).get(lv)!).push(c);
      }
      for (const [lv, sameRow] of byLevel) {
        if (sameRow.length < 2) continue;
        const row = l.nodes
          .filter((n) => n.level === lv)
          .sort((a, b) => a.x - b.x)
          .map((n) => n.id);
        const idx = sameRow.map((c) => row.indexOf(c)).sort((a, b) => a - b);
        const intruders = row
          .slice(idx[0], idx[idx.length - 1] + 1)
          .filter((id) => !sameRow.includes(id));
        if (intruders.length) out.push(`${p} 的子女被 ${intruders.join('、')} 插隊`);
      }
    }
    return out;
  }

  /**
   * 正式站真圖之**最小重現子圖**（貪婪縮減至 9 節點／7 邊）：
   * A→B；B→D/C/E/F；G→H/I。往上掃時 B 依其四個子女之平均位置落到 H 與 I 中間，
   * G 的兩個子女就此被拆開——正是真圖上「進件作業／消金審查作業／撥款核准作業」被插隊的形狀。
   */
  const REAL_MIN: { ids: string[]; es: Array<[string, string]> } = {
    ids: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'],
    es: [['A', 'B'], ['B', 'D'], ['B', 'C'], ['B', 'E'], ['B', 'F'], ['G', 'H'], ['G', 'I']],
  };

  it('正式站真圖之最小重現子圖：G 的兩個子女相鄰，不被 B 插到中間', () => {
    const l = layoutOf(REAL_MIN.ids, REAL_MIN.es);
    expect(splitSiblingGroups(l, REAL_MIN.es)).toEqual([]);
    const lv = l.nodes.find((n) => n.id === 'H')!.level;
    const row = l.nodes.filter((n) => n.level === lv).sort((a, b) => a.x - b.x).map((n) => n.id);
    expect(Math.abs(row.indexOf('H') - row.indexOf('I'))).toBe(1);
  });

  it('七組拓樸：同父子女皆連續（每個子樹各佔一段）', () => {
    for (const g of TOPOLOGIES) {
      expect({ [g.t]: splitSiblingGroups(layoutOf(g.ids, g.es), g.es) }).toEqual({ [g.t]: [] });
    }
  });

  it('深層樹：孫輩仍依祖輩分段，不跨子樹交錯', () => {
    const ids = ['R', 'P1', 'P2', 'a1', 'a2', 'b1', 'b2', 'a1x', 'a1y', 'b2x', 'b2y'];
    const es: Array<[string, string]> = [
      ['R', 'P1'], ['R', 'P2'],
      ['P1', 'a1'], ['P1', 'a2'], ['P2', 'b1'], ['P2', 'b2'],
      ['a1', 'a1x'], ['a1', 'a1y'], ['b2', 'b2x'], ['b2', 'b2y'],
    ];
    const l = layoutOf(ids, es);
    expect(splitSiblingGroups(l, es)).toEqual([]);
    const x = (id: string): number => l.nodes.find((n) => n.id === id)!.x;
    // P1 之整個子樹恆在 P2 之整個子樹左側（兩段互不重疊）
    expect(Math.max(x('a1'), x('a2'))).toBeLessThan(Math.min(x('b1'), x('b2')));
    expect(Math.max(x('a1x'), x('a1y'))).toBeLessThan(Math.min(x('b2x'), x('b2y')));
  });
});

/**
 * dagre 固定座標向量 —— **跨端綁定**（架構決策 C1 之同一模式，比照 descendants F1–F5）。
 *
 * 前後端各自安裝 `@dagrejs/dagre`，兩份必須算出**同一組**座標：檢視器畫的線與下載／列印的
 * PDF 畫的線來自各自那一份，一旦版本或設定漂移，兩邊就會畫出不同的圖，而這種不一致**沒有
 * 任何自動機制會察覺**（各自的測試都會綠）。版本已於兩邊 package.json 釘死為 1.1.8；本組
 * 向量是漂移當場現形的地方——它紅了不要改期望值，先查兩邊裝的 dagre 是不是同一版。
 *
 * 期望值取自 @dagrejs/dagre 1.1.8、rankdir TB、nodesep 34（HGAP−NODE_W）、
 * ranksep 70（VGAP−NODE_H）、marginx/marginy 48。
 */
describe('buildTreeLayout（dagre 固定座標向量 · 跨端綁定）', () => {
  const VEC = {
    ids: ['R', 'A', 'B', 'C', 'a1', 'a2', 'b1'],
    es: [['R', 'A'], ['R', 'B'], ['R', 'C'], ['A', 'a1'], ['A', 'a2'], ['B', 'b1']] as Array<[string, string]>,
  };

  it('七節點三層：每個節點之 x／y／level 與版面尺寸逐一相符', () => {
    const l = layoutOf(VEC.ids, VEC.es);
    expect(l.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y, level: n.level }))).toEqual([
      { id: 'R', x: 468, y: 48, level: 0 },
      { id: 'A', x: 153, y: 180, level: 1 },
      { id: 'B', x: 468, y: 180, level: 1 },
      { id: 'C', x: 678, y: 180, level: 1 },
      { id: 'a1', x: 48, y: 312, level: 2 },
      { id: 'a2', x: 258, y: 312, level: 2 },
      { id: 'b1', x: 468, y: 312, level: 2 },
    ]);
    expect([l.boardWidth, l.boardHeight]).toEqual([902, 422]);
  });

  it('父節點落在子女正上方（換掉手刻佈局的唯一理由，此性質失守即失去意義）', () => {
    const l = layoutOf(VEC.ids, VEC.es);
    const cx = (id: string): number => l.nodes.find((n) => n.id === id)!.x + NODE_W / 2;
    expect(cx('A')).toBe((cx('a1') + cx('a2')) / 2);
    expect(cx('B')).toBe(cx('b1'));
  });

  it('層級由實際 y 去重推得：同層 y 相同、逐層遞增一個 VGAP', () => {
    const l = layoutOf(VEC.ids, VEC.es);
    const ys = [...new Set(l.nodes.map((n) => n.y))].sort((a, b) => a - b);
    expect(ys).toEqual([MARGIN, MARGIN + VGAP, MARGIN + 2 * VGAP]);
  });
});
