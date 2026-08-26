import type { DagNode, DagEdge } from '../api/types';

/**
 * F036 循環樹狀圖檢視器之「上到下」分層佈局 ＋ 下游遍歷 — 純函式（無 React／無 DOM）。
 *
 * 忠實移植 prototypes/22-lifecycle-tree-preview.html 之 buildGraph / descendants：
 *  - 最長路徑分層（BFS，支援多 parent／多 child）；同層水平置中。
 *  - 直角（orthogonal elbow）連線路徑於 buildEdgeRoutes 計算（車道分流／錨點分散／跨層通道）。
 *  - descendants：沿有向邊（parent→child）BFS 取某節點及其所有下游（DAG 無環保證終止）。
 * 後端另有一份對應實作（backend/src/lifecycle/lifecycle-tree-layout.ts），演算法一致。
 */

export const NODE_W = 176;
export const NODE_H = 62;
export const HGAP = 210;
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

export function buildTreeLayout(nodes: DagNode[], edges: DagEdge[]): TreeLayout {
  const ids = nodes.map((n) => n.id);
  const idSet = new Set(ids);

  const adj = new Map<string, string[]>();
  const indeg = new Map<string, number>();
  ids.forEach((id) => {
    adj.set(id, []);
    indeg.set(id, 0);
  });
  for (const e of edges) {
    if (!idSet.has(e.sourceNodeId) || !idSet.has(e.targetNodeId)) continue;
    adj.get(e.sourceNodeId)!.push(e.targetNodeId);
    indeg.set(e.targetNodeId, (indeg.get(e.targetNodeId) ?? 0) + 1);
  }

  const level = new Map<string, number>();
  const deg = new Map<string, number>();
  ids.forEach((id) => {
    level.set(id, 0);
    deg.set(id, indeg.get(id) ?? 0);
  });
  const queue = ids.filter((id) => (indeg.get(id) ?? 0) === 0);
  const seen = new Set<string>(queue);
  while (queue.length) {
    const u = queue.shift() as string;
    for (const v of adj.get(u) ?? []) {
      level.set(v, Math.max(level.get(v) ?? 0, (level.get(u) ?? 0) + 1));
      deg.set(v, (deg.get(v) ?? 0) - 1);
      if ((deg.get(v) ?? 0) === 0 && !seen.has(v)) {
        seen.add(v);
        queue.push(v);
      }
    }
  }

  const levels = new Map<number, string[]>();
  ids.forEach((id) => {
    const lv = level.get(id) ?? 0;
    (levels.get(lv) ?? levels.set(lv, []).get(lv)!).push(id);
  });

  const numLv = ids.length ? Math.max(...ids.map((id) => level.get(id) ?? 0)) + 1 : 0;
  const maxCols = levels.size ? Math.max(...[...levels.values()].map((r) => r.length)) : 0;

  // 同層欄位順序：barycenter 掃描降低交叉（見 orderRowsByBarycenter）。
  const parents = new Map<string, string[]>();
  ids.forEach((id) => parents.set(id, []));
  for (const e of edges) {
    if (!idSet.has(e.sourceNodeId) || !idSet.has(e.targetNodeId)) continue;
    parents.get(e.targetNodeId)!.push(e.sourceNodeId);
  }
  orderRowsByBarycenter(levels, numLv, level, adj, parents);

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const positioned: PositionedNode[] = [];
  for (const [lv, rowIds] of levels) {
    const count = rowIds.length;
    const rowW = count * HGAP;
    const startX = MARGIN + (maxCols * HGAP - rowW) / 2;
    rowIds.forEach((id, i) => {
      const n = byId.get(id)!;
      positioned.push({
        id,
        name: n.name,
        docCount: n.docCount ?? 0,
        x: startX + i * HGAP + (HGAP - NODE_W) / 2,
        y: MARGIN + lv * VGAP,
        level: lv,
      });
    });
  }
  positioned.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));

  return {
    nodes: positioned,
    edges: edges.filter((e) => idSet.has(e.sourceNodeId) && idSet.has(e.targetNodeId)),
    boardWidth: ids.length ? MARGIN * 2 + maxCols * HGAP : MARGIN * 2,
    boardHeight: ids.length ? MARGIN * 2 + (numLv - 1) * VGAP + NODE_H : MARGIN * 2,
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

/**
 * 同層欄位順序：barycenter 掃描（Sugiyama 第二階段之經典作法），就地重排 `levels` 各列。
 *
 * 為何需要：原本同層順序＝節點建立順序，父子交錯（P1→C2、P2→C1）時兩條邊的水平段會落在
 * 同一條走廊線上、且 x 區間完全重疊 → 畫面成「H」形，讀起來與真實連線相反。依父（或子）之
 * 平均欄位重排後，這類交錯多數會自然消失。
 *
 * 決定性：固定 4 趟（下、上、下、上）；無鄰居之節點以「當前索引」為鍵（不被拉走），鍵相同
 * 時以當前索引 tie-break（穩定）→ 同一輸入恆得同一輸出，可測。已無交叉之圖（多數樹）鍵值
 * 即等於原索引 → 順序不變，維持與 prototype 一致的既有外觀。
 */
function orderRowsByBarycenter(
  levels: Map<number, string[]>,
  numLv: number,
  level: Map<string, number>,
  children: Map<string, string[]>,
  parents: Map<string, string[]>,
): void {
  if (numLv < 2) return;
  const sweep = (lv: number, refLv: number, neighbors: Map<string, string[]>): void => {
    const row = levels.get(lv);
    const ref = levels.get(refLv);
    if (!row || !ref || row.length < 2) return;
    const refIdx = new Map(ref.map((id, i) => [id, i]));
    const keyed = row.map((id, i) => {
      const xs = (neighbors.get(id) ?? [])
        .filter((v) => (level.get(v) ?? -1) === refLv)
        .map((v) => refIdx.get(v) as number);
      return { id, i, key: xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : i };
    });
    keyed.sort((a, b) => a.key - b.key || a.i - b.i);
    levels.set(
      lv,
      keyed.map((k) => k.id),
    );
  };
  for (let pass = 0; pass < 4; pass += 1) {
    if (pass % 2 === 0) {
      for (let lv = 1; lv < numLv; lv += 1) sweep(lv, lv - 1, parents);
    } else {
      for (let lv = numLv - 2; lv >= 0; lv -= 1) sweep(lv, lv + 1, children);
    }
  }
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
  /** 同一節點多條邊之錨點間距上限。 */
  ANCHOR_STEP: 18,
  /** 錨點分散總寬上限（卡片寬左右各留 20px）。 */
  ANCHOR_SPAN: 136,
  /** 跨層邊之垂直通道與卡片之淨空。 */
  CHANNEL_CLEAR: 10,
  /** 同一通道內多條跨層邊之水平錯開間距。 */
  CHANNEL_STEP: 8,
} as const;

/** 第 i 條（共 k 條）相對中心之等距展開偏移；k<2 → 0（單條維持置中）。 */
function spreadOffset(i: number, k: number, step: number): number {
  return k < 2 ? 0 : (i - (k - 1) / 2) * step;
}

/** 錨點偏移：條數多時自動縮距，總寬不超過 ANCHOR_SPAN。 */
function anchorOffset(i: number, k: number): number {
  const { ANCHOR_STEP, ANCHOR_SPAN } = TREE_ROUTE_CONST;
  return spreadOffset(i, k, k < 2 ? 0 : Math.min(ANCHOR_STEP, ANCHOR_SPAN / (k - 1)));
}

/**
 * F036 連線繞線：把佈局後的邊轉成「不會視覺上異常相連」的直角折線。
 *
 * 修掉三個幾何缺陷（2026-08-26 裁決；prototypes/22 與前端同步改）：
 *  ① **水平段共線重疊** → 走廊車道分流：同一走廊內 x 區間相交的水平段配到不同車道。
 *  ② **同一點進出** → 錨點分散：同節點的多條出邊沿底邊、多條入邊沿頂邊等距展開。
 *  ③ **跨層邊穿過中間層卡片** → 垂直通道：跨層邊於「來源下方走廊」轉入一條掃描出來的無卡片
 *     x 通道垂直下行，到「目標上方走廊」再轉進目標；不再從卡片中間穿過，也不會與主鏈完全
 *     重合而整條隱形。
 *
 * 決定性：僅由座標與 `layout.edges` 之順序決定，無亂數／無時間相依。回傳與 `layout.edges`
 * 索引一一對應。後端另有一份對應實作（backend/src/lifecycle/lifecycle-tree-layout.ts），演算法一致。
 */
export function buildEdgeRoutes(layout: TreeLayout): EdgeRoute[] {
  const { LANES, LANE_ORDER, LANE_STEP, LANE_GAP, CHANNEL_CLEAR, CHANNEL_STEP } = TREE_ROUTE_CONST;
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

  // ② 錨點分散：出邊依目標 x、入邊依來源 x 由左至右配位（同節點的線不自我交叉）。
  const grouped = (key: (w: Work) => string): Work[][] => {
    const m = new Map<string, Work[]>();
    for (const w of work) {
      const k = key(w);
      (m.get(k) ?? m.set(k, []).get(k)!).push(w);
    }
    return [...m.values()];
  };
  for (const group of grouped((w) => w.s.id)) {
    [...group]
      .sort((a, b) => a.t.x - b.t.x || a.t.y - b.t.y || a.t.id.localeCompare(b.t.id))
      .forEach((w, i) => {
        w.sx = w.s.x + NODE_W / 2 + anchorOffset(i, group.length);
      });
  }
  for (const group of grouped((w) => w.t.id)) {
    [...group]
      .sort((a, b) => a.s.x - b.s.x || a.s.y - b.s.y || a.s.id.localeCompare(b.s.id))
      .forEach((w, i) => {
        w.tx = w.t.x + NODE_W / 2 + anchorOffset(i, group.length);
      });
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

  // ① 車道分流：以水平段之 x 區間做貪婪配道（中央優先），同走廊重疊者必落不同車道。
  interface LaneItem {
    w: Work;
    slot: 'A' | 'B';
    lo: number;
    hi: number;
  }
  const corridors = new Map<number, LaneItem[]>();
  const push = (lv: number, item: LaneItem): void => {
    (corridors.get(lv) ?? corridors.set(lv, []).get(lv)!).push(item);
  };
  for (const w of work) {
    if (w.span >= 2) {
      push(w.s.level + 1, { w, slot: 'A', lo: Math.min(w.sx, w.cx), hi: Math.max(w.sx, w.cx) });
      push(w.t.level, { w, slot: 'B', lo: Math.min(w.cx, w.tx), hi: Math.max(w.cx, w.tx) });
    } else {
      push(w.t.level, { w, slot: 'B', lo: Math.min(w.sx, w.tx), hi: Math.max(w.sx, w.tx) });
    }
  }
  for (const [lv, items] of corridors) {
    const lastHi = new Array<number>(LANES).fill(Number.NEGATIVE_INFINITY);
    [...items]
      .sort((a, b) => a.lo - b.lo || a.hi - b.hi || a.w.idx - b.w.idx)
      .forEach((it) => {
        let lane = LANE_ORDER.find((l) => lastHi[l] + LANE_GAP <= it.lo);
        if (lane === undefined) {
          lane = LANE_ORDER.reduce((best, l) => (lastHi[l] < lastHi[best] ? l : best), LANE_ORDER[0]);
        }
        lastHi[lane] = it.hi;
        const y = corridorY(lv) + (lane - (LANES - 1) / 2) * LANE_STEP;
        if (it.slot === 'A') it.w.yA = y;
        else it.w.yB = y;
      });
  }

  const byIdx = new Map<number, EdgeRoute>();
  for (const w of work) {
    const sBottom = w.s.y + NODE_H;
    const tTop = w.t.y;
    byIdx.set(w.idx, {
      sourceNodeId: w.s.id,
      targetNodeId: w.t.id,
      points:
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
    });
  }
  return layout.edges.map(
    (e, i) =>
      byIdx.get(i) ?? { sourceNodeId: e.sourceNodeId, targetNodeId: e.targetNodeId, points: [] },
  );
}

/** 折線 → SVG path d（供 <path d>／PDF 逐段連線共用同一組點）。 */
export function routePath(route: EdgeRoute): string {
  if (!route.points.length) return '';
  return route.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
}
