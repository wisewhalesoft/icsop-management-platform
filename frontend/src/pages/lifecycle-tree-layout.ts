import type { DagNode, DagEdge } from '../api/types';

/**
 * F036 循環樹狀圖檢視器之「上到下」分層佈局 ＋ 下游遍歷 — 純函式（無 React／無 DOM）。
 *
 * 忠實移植 prototypes/22-lifecycle-tree-preview.html 之 buildGraph / descendants：
 *  - 最長路徑分層（BFS，支援多 parent／多 child）；同層水平置中。
 *  - 直角（orthogonal elbow）連線路徑於 edgePath 計算。
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

/** 直角（elbow）連線路徑：垂直→水平→垂直（child 端朝下）。供 SVG path d。 */
export function edgePath(source: PositionedNode, target: PositionedNode): string {
  const sx = source.x + NODE_W / 2;
  const sy = source.y + NODE_H;
  const tx = target.x + NODE_W / 2;
  const ty = target.y;
  const midY = sy + (ty - sy) / 2;
  return `M ${sx} ${sy} L ${sx} ${midY} L ${tx} ${midY} L ${tx} ${ty}`;
}
