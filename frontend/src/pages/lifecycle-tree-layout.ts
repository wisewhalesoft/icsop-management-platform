import Dagre from '@dagrejs/dagre';
import type { DagEdge } from '../api/types';

/**
 * F036 循環樹狀圖檢視器之「上到下」分層佈局 ＋ 下游遍歷 — 純函式（無 React／無 DOM）。
 *
 * 節點座標交給 **dagre**（`@dagrejs/dagre`，與 F008 DAG 畫布「整理連結線」同一套演算法，
 * 全站 DAG 佈局一致；OQ-E03-09）。手刻的分層＋同層置中已移除——它每一列各自置中，父節點
 * 因而落在版面正中、橫桿得往左右掃兩千點去找子女（正式站真圖：父偏離子女中心平均 735pt）。
 * dagre 的座標指派會把父節點放在子女正上方（同圖平均 96pt，−87%），子樹連續性同樣保持。
 *
 * 🔴 **前後端與 prototype 三方必須算出同一組座標**（檢視器／PDF／原型畫出來要一樣），故
 * `@dagrejs/dagre` 在前後端 package.json 皆**釘死同一版本**（不得改回 `^`），並以本檔
 * 「dagre 固定座標向量」測試兩端各自斷言同一組期望值；版本漂移會在該測試當場現形。
 *  - 直角（orthogonal elbow）連線路徑於 buildEdgeRoutes 計算（車道分流／錨點分散／跨層通道）。
 *  - descendants：沿有向邊（parent→child）BFS 取某節點及其所有下游（DAG 無環保證終止）。
 * 後端另有一份對應實作（backend/src/lifecycle/lifecycle-tree-layout.ts），演算法一致。
 */

export const NODE_W = 176;
export const NODE_H = 62;
/** 同層相鄰節點之中心距（dagre nodesep = HGAP − NODE_W）。 */
export const HGAP = 210;
/** 相鄰層之中心距（dagre ranksep = VGAP − NODE_H）。 */
export const VGAP = 132;
export const MARGIN = 48;

export interface PositionedNode {
  id: string;
  name: string | null;
  docCount: number;
  x: number;
  y: number;
  level: number;
}

export interface TreeLayout {
  nodes: PositionedNode[];
  edges: DagEdge[];
  boardWidth: number;
  boardHeight: number;
}

/**
 * 以 dagre 做上到下（rankdir TB）佈局，回傳每節點座標、層級與整體版面尺寸。
 *
 * `level` 由實際 y 值去重排序而得（同一 rank 之節點高度相同 ⇒ y 相同），故仍是「第幾層」之語意，
 * 供連線繞線（走廊、車道、跨層通道）使用。空圖 → 版面僅含邊界。端點不存在之邊先濾掉，
 * 否則 dagre 會替它自動長出一個幽靈節點。
 */
/**
 * 佈局所需之**最小節點形狀**（本函式實際只讀 `id`／`name`／`docCount` 三個欄位）。
 *
 * 🔵 2026-09-02 F043（架構決策 E2／E7 之「共用的是渲染演算法、不是頁面元件」）：業務/功能類別
 * 樹狀圖與循環樹狀圖共用本佈局函式，但兩者之節點型別各帶自己的擁有者外鍵（`lifecycleId` vs
 * `businessCategoryId`）與各自的掛載計數欄名。故此處把參數型別由 `DagNode[]` **放寬為結構最小集**
 * ——`DagNode` 天然滿足它，既有呼叫端一行未改、**行為零變更**（純型別放寬）。
 * 🔒 刻意**不**改 `DagNode` 本身（`AC-49` 循環側零漣漪），也**不**要求呼叫端塞一個假的
 * `lifecycleId: ''` 進來——那會讓業務類別的節點在型別上宣稱自己屬於某個循環。
 */
export interface TreeLayoutInputNode {
  id: string;
  name: string | null;
  docCount?: number;
}

export function buildTreeLayout(nodes: TreeLayoutInputNode[], edges: DagEdge[]): TreeLayout {
  const idSet = new Set(nodes.map((n) => n.id));
  const kept = edges.filter((e) => idSet.has(e.sourceNodeId) && idSet.has(e.targetNodeId));
  if (!nodes.length) {
    return {
      nodes: [],
      edges: kept,
      boardWidth: MARGIN * 2,
      boardHeight: MARGIN * 2,
    };
  }

  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: 'TB',
    nodesep: HGAP - NODE_W,
    ranksep: VGAP - NODE_H,
    marginx: MARGIN,
    marginy: MARGIN,
  });
  nodes.forEach((n) => g.setNode(n.id, { width: NODE_W, height: NODE_H }));
  kept.forEach((e) => g.setEdge(e.sourceNodeId, e.targetNodeId));
  Dagre.layout(g);

  // dagre 回傳的是中心點；四捨五入為整數左上角座標（浮點殘差會讓兩端座標對不起來）。
  const placed = nodes.map((n) => {
    const p = g.node(n.id) as { x: number; y: number };
    return {
      id: n.id,
      name: n.name,
      docCount: n.docCount ?? 0,
      x: Math.round(p.x - NODE_W / 2),
      y: Math.round(p.y - NODE_H / 2),
    };
  });
  const rankY = [...new Set(placed.map((p) => p.y))].sort((a, b) => a - b);
  const laidOut: PositionedNode[] = placed.map((p) => ({ ...p, level: rankY.indexOf(p.y) }));

  return {
    nodes: laidOut,
    edges: kept,
    boardWidth: Math.max(...laidOut.map((n) => n.x + NODE_W)) + MARGIN,
    boardHeight: Math.max(...laidOut.map((n) => n.y + NODE_H)) + MARGIN,
  };
}
/**
 * 某節點及其所有下游（沿 parent→child 遞移可達的全部後代，含起點本身）。
 * DAG 禁止成環（F008）→ 遍歷保證終止；含 seen 守衛防資料異常無窮迴圈。
 */
export function descendants(edges: DagEdge[], startId: string): Set<string> {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    (adj.get(e.sourceNodeId) ?? adj.set(e.sourceNodeId, []).get(e.sourceNodeId)!).push(
      e.targetNodeId,
    );
  }
  const set = new Set<string>([startId]);
  const stack = [startId];
  while (stack.length) {
    const u = stack.pop() as string;
    for (const v of adj.get(u) ?? []) {
      if (!set.has(v)) {
        set.add(v);
        stack.push(v);
      }
    }
  }
  return set;
}

export interface RoutePoint {
  x: number;
  y: number;
}

/** 一條邊的完整折線；首點＝離開 source 底邊處、末點＝進入 target 頂邊處（箭頭畫在末點）。 */
export interface EdgeRoute {
  sourceNodeId: string;
  targetNodeId: string;
  points: RoutePoint[];
  /**
   * 跨線繞過（hop）之位置：`hops[i]` 對應線段 `points[i] → points[i+1]`，內容為該段上需要
   * 「跳過」別條線之 x 座標，且已依該段之行進方向排序。僅水平段會有值（採「水平跳垂直」之慣例）。
   */
  hops: number[][];
}

export const TREE_ROUTE_CONST = {
  /** 走廊可用車道數。 */
  LANES: 5,
  /** 車道使用順序：由中央往外 → 只用到一條時恰為走廊正中（＝維持既有外觀）。 */
  LANE_ORDER: [2, 1, 3, 0, 4],
  /** 相鄰車道之垂直間距；LANES=5 → 偏移 ±24，於 70px 走廊內仍留 11px 淨空。 */
  LANE_STEP: 12,
  /** 同車道兩段水平線之最小水平淨空（小於此值視為會黏成一條）。 */
  LANE_GAP: 16,
  /** 跨層邊之垂直通道與卡片之淨空。 */
  CHANNEL_CLEAR: 10,
  /** 同一通道內多條跨層邊之水平錯開間距。 */
  CHANNEL_STEP: 8,
  /** 跨線繞過之半徑（半圓凸起高度亦為此值）。 */
  HOP_R: 5,
} as const;

/** 第 i 條（共 k 條）相對中心之等距展開偏移；k<2 → 0（單條維持置中）。 */
function spreadOffset(i: number, k: number, step: number): number {
  return k < 2 ? 0 : (i - (k - 1) / 2) * step;
}

/**
 * F036 連線繞線：把佈局後的邊轉成「不會視覺上異常相連」的直角折線。
 *
 * 修掉三個幾何缺陷（2026-08-26 裁決；prototypes/22 與前端同步改）：
 *  ① **水平段共線重疊** → 走廊車道分流：同一走廊內 x 區間相交的水平段配到不同車道。
 *  ② **同父扇出被畫成好幾條平行線** → 進出口合併：同節點的出邊自底邊同一點離開、入邊進
 *     頂邊同一點，同父者共用一條橫桿，到各自子節點前才分岔。
 *  ③ **跨層邊穿過中間層卡片** → 垂直通道：跨層邊於「來源下方走廊」轉入一條掃描出來的無卡片
 *     x 通道垂直下行，到「目標上方走廊」再轉進目標；不再從卡片中間穿過，也不會與主鏈完全
 *     重合而整條隱形。
 *
 * 決定性：僅由座標與 `layout.edges` 之順序決定，無亂數／無時間相依。回傳與 `layout.edges`
 * 索引一一對應。後端另有一份對應實作（backend/src/lifecycle/lifecycle-tree-layout.ts），演算法一致。
 */
export function buildEdgeRoutes(layout: TreeLayout): EdgeRoute[] {
  const { LANES, LANE_ORDER, LANE_STEP, LANE_GAP, CHANNEL_CLEAR, CHANNEL_STEP, HOP_R } =
    TREE_ROUTE_CONST;
  const pos = new Map(layout.nodes.map((n) => [n.id, n]));
  /** 走廊＝第 lv 列上方之列間空隙中線。相鄰層時與舊式 (sy+ty)/2 同值 → 既有外觀不變。 */
  const corridorY = (lv: number): number => MARGIN + lv * VGAP - (VGAP - NODE_H) / 2;

  interface Work {
    idx: number;
    s: PositionedNode;
    t: PositionedNode;
    span: number;
    sx: number;
    tx: number;
    cx: number;
    gapLo: number;
    gapHi: number;
    yA: number;
    yB: number;
  }
  const work: Work[] = [];
  layout.edges.forEach((e, idx) => {
    const s = pos.get(e.sourceNodeId);
    const t = pos.get(e.targetNodeId);
    if (!s || !t) return;
    work.push({
      idx,
      s,
      t,
      span: t.level - s.level,
      sx: 0,
      tx: 0,
      cx: 0,
      gapLo: 0,
      gapHi: 0,
      yA: 0,
      yB: 0,
    });
  });

  // ② 進出口合併：一個節點的所有出邊自**底邊同一點**離開、所有入邊進**頂邊同一點**——
  //    同父的線於走廊上合成一條橫桿，直到各自的子節點前才分岔（org chart 的畫法）。
  //    📝 已作廢：OLD> 出入邊沿卡片邊等距分散成多個錨點。錨點分散雖能區分個別連線，但把
  //    「本來就該是一束」的同父扇出畫成好幾條平行線，56 節點的真圖看起來像電路板
  //    （2026-08-26 使用者裁定：該合併的合併，跨子樹才要分開）。
  for (const w of work) {
    w.sx = w.s.x + NODE_W / 2;
    w.tx = w.t.x + NODE_W / 2;
  }

  // ③ 跨層邊之垂直通道：掃出中間各層卡片以外的 x 空隙，取夾住目標 x 後最近者。
  const longs = work.filter((w) => w.span >= 2);
  for (const w of longs) {
    const blocks = layout.nodes
      .filter((n) => n.level > w.s.level && n.level < w.t.level)
      .map((n): [number, number] => [n.x - CHANNEL_CLEAR, n.x + NODE_W + CHANNEL_CLEAR])
      .sort((a, b) => a[0] - b[0]);
    const gaps: Array<[number, number]> = [];
    let cursor = 0;
    for (const [lo, hi] of blocks) {
      if (lo - cursor > CHANNEL_CLEAR * 2) gaps.push([cursor, lo]);
      cursor = Math.max(cursor, hi);
    }
    if (layout.boardWidth - cursor > CHANNEL_CLEAR * 2) gaps.push([cursor, layout.boardWidth]);
    if (!gaps.length) {
      // 中間層滿版無空隙（理論上不會發生）→ 退化為原地下行，至少不改變既有行為。
      w.cx = w.tx;
      w.gapLo = w.tx;
      w.gapHi = w.tx;
      continue;
    }
    const clampTo = (g: [number, number]): number => Math.min(Math.max(w.tx, g[0] + 2), g[1] - 2);
    let best = gaps[0];
    for (const g of gaps) {
      if (Math.abs(clampTo(g) - w.tx) < Math.abs(clampTo(best) - w.tx)) best = g;
    }
    w.cx = clampTo(best);
    w.gapLo = best[0];
    w.gapHi = best[1];
  }
  // 同一空隙有多條跨層邊 → 水平錯開，避免兩條通道完全重合。
  const channelGroups = new Map<number, Work[]>();
  for (const w of longs) {
    (channelGroups.get(w.gapLo) ?? channelGroups.set(w.gapLo, []).get(w.gapLo)!).push(w);
  }
  for (const group of channelGroups.values()) {
    group.forEach((w, i) => {
      w.cx = Math.min(
        Math.max(w.cx + spreadOffset(i, group.length, CHANNEL_STEP), w.gapLo + 2),
        w.gapHi - 2,
      );
    });
  }

  // ① 車道分流：**以「同一父節點的整組扇出」為一個單位**配道（同組共用一條橫桿，才會在
  //    視覺上合成一條線）；不同父之 x 區間相交時才落到不同車道。走廊只用到一條車道時
  //    恰為正中，與修正前外觀一致。跨層邊自成一組（它另有垂直通道，不併入任何扇出）。
  interface LaneGroup {
    slot: 'A' | 'B';
    lo: number;
    hi: number;
    idx: number;
    ws: Work[];
  }
  const corridors = new Map<number, Map<string, LaneGroup>>();
  const push = (lv: number, key: string, slot: 'A' | 'B', lo: number, hi: number, w: Work): void => {
    const byKey = corridors.get(lv) ?? corridors.set(lv, new Map()).get(lv)!;
    const g = byKey.get(key);
    if (!g) {
      byKey.set(key, { slot, lo, hi, idx: w.idx, ws: [w] });
      return;
    }
    g.lo = Math.min(g.lo, lo);
    g.hi = Math.max(g.hi, hi);
    g.idx = Math.min(g.idx, w.idx);
    g.ws.push(w);
  };
  for (const w of work) {
    if (w.span >= 2) {
      push(w.s.level + 1, `A${w.idx}`, 'A', Math.min(w.sx, w.cx), Math.max(w.sx, w.cx), w);
      push(w.t.level, `B${w.idx}`, 'B', Math.min(w.cx, w.tx), Math.max(w.cx, w.tx), w);
    } else {
      push(w.t.level, `S${w.s.id}`, 'B', Math.min(w.sx, w.tx), Math.max(w.sx, w.tx), w);
    }
  }
  for (const [lv, byKey] of corridors) {
    const lastHi = new Array<number>(LANES).fill(Number.NEGATIVE_INFINITY);
    [...byKey.values()]
      .sort((a, b) => a.lo - b.lo || a.hi - b.hi || a.idx - b.idx)
      .forEach((g) => {
        let lane = LANE_ORDER.find((l) => lastHi[l] + LANE_GAP <= g.lo);
        if (lane === undefined) {
          lane = LANE_ORDER.reduce((best, l) => (lastHi[l] < lastHi[best] ? l : best), LANE_ORDER[0]);
        }
        lastHi[lane] = g.hi;
        const y = corridorY(lv) + (lane - (LANES - 1) / 2) * LANE_STEP;
        for (const w of g.ws) {
          if (g.slot === 'A') w.yA = y;
          else w.yB = y;
        }
      });
  }

  const pointsOf = new Map<number, RoutePoint[]>();
  for (const w of work) {
    const sBottom = w.s.y + NODE_H;
    const tTop = w.t.y;
    pointsOf.set(
      w.idx,
      w.span >= 2
        ? [
            { x: w.sx, y: sBottom },
            { x: w.sx, y: w.yA },
            { x: w.cx, y: w.yA },
            { x: w.cx, y: w.yB },
            { x: w.tx, y: w.yB },
            { x: w.tx, y: tTop },
          ]
        : [
            { x: w.sx, y: sBottom },
            { x: w.sx, y: w.yB },
            { x: w.tx, y: w.yB },
            { x: w.tx, y: tTop },
          ],
    );
  }

  // ④ 跨線繞過（hop）：不同子樹之線交會時，由**水平段**以小半圓跳過垂直段。
  //    沒有顏色區隔時，十字交會無法分辨哪一條才是連續的那條；繞過是電路圖／流程圖的既有慣例。
  //    🔴 同父扇出／同子扇入之交會**不畫繞過**——那是刻意合併的同一束線，不是兩條不同的線。
  interface VSeg {
    x: number;
    lo: number;
    hi: number;
    s: string;
    t: string;
  }
  const verticals: VSeg[] = [];
  for (const w of work) {
    const pts = pointsOf.get(w.idx) as RoutePoint[];
    for (let i = 0; i + 1 < pts.length; i += 1) {
      if (pts[i].x !== pts[i + 1].x) continue;
      verticals.push({
        x: pts[i].x,
        lo: Math.min(pts[i].y, pts[i + 1].y),
        hi: Math.max(pts[i].y, pts[i + 1].y),
        s: w.s.id,
        t: w.t.id,
      });
    }
  }
  const byIdx = new Map<number, EdgeRoute>();
  for (const w of work) {
    const pts = pointsOf.get(w.idx) as RoutePoint[];
    const hops: number[][] = [];
    for (let i = 0; i + 1 < pts.length; i += 1) {
      const a = pts[i];
      const b = pts[i + 1];
      if (a.y !== b.y) {
        hops.push([]);
        continue;
      }
      const lo = Math.min(a.x, b.x);
      const hi = Math.max(a.x, b.x);
      const xs = verticals
        .filter(
          (v) =>
            v.s !== w.s.id &&
            v.t !== w.t.id &&
            v.x > lo + HOP_R &&
            v.x < hi - HOP_R &&
            a.y > v.lo + 0.5 &&
            a.y < v.hi - 0.5,
        )
        .map((v) => v.x)
        .sort((p, q) => p - q);
      // 太靠近的交會併成一個繞過，免得畫成一排鋸齒。
      const merged: number[] = [];
      for (const x of xs) if (!merged.length || x - merged[merged.length - 1] > HOP_R * 2) merged.push(x);
      hops.push(a.x <= b.x ? merged : merged.reverse());
    }
    byIdx.set(w.idx, { sourceNodeId: w.s.id, targetNodeId: w.t.id, points: pts, hops });
  }
  return layout.edges.map(
    (e, i) =>
      byIdx.get(i) ?? {
        sourceNodeId: e.sourceNodeId,
        targetNodeId: e.targetNodeId,
        points: [],
        hops: [],
      },
  );
}

/**
 * 折線 → SVG path d（`<path d>` 與 PDF `drawSvgPath` 共用同一份字串，兩邊畫出來必然一致）。
 * 繞過以三次貝茲近似半圓（控制點取 4/3·r，兩端切線垂直）——`C` 指令 SVG 與 pdf-lib 皆支援，
 * 圓弧 `A` 則不保證，故不用。凸起方向為 −y（版面座標 y 向下 ⇒ 視覺上往上凸）。
 */
export function routePath(route: EdgeRoute): string {
  const { HOP_R } = TREE_ROUTE_CONST;
  const pts = route.points;
  if (!pts.length) return '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i + 1 < pts.length; i += 1) {
    const a = pts[i];
    const b = pts[i + 1];
    const dir = b.x >= a.x ? 1 : -1;
    const bulge = a.y - (HOP_R * 4) / 3;
    for (const x of route.hops[i] ?? []) {
      d += ` L ${x - HOP_R * dir} ${a.y}`;
      d += ` C ${x - HOP_R * dir} ${bulge} ${x + HOP_R * dir} ${bulge} ${x + HOP_R * dir} ${a.y}`;
    }
    d += ` L ${b.x} ${b.y}`;
  }
  return d;
}
