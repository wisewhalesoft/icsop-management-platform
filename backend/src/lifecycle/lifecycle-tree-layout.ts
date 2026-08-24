/**
 * F036 循環樹狀圖「上到下」分層佈局 — 純演算法（無 IO）。
 *
 * 忠實移植 prototypes/22-lifecycle-tree-preview.html 之 buildGraph：
 *  - 以最長路徑分層（BFS，支援多 parent／多 child）；同層水平置中排列。
 *  - 供伺服器端 PDF 匯出（LifecycleTreePdfRenderer）計算節點座標與直角連線路徑。
 * 前端檢視器另有一份對應實作（frontend/src/pages/lifecycle-tree-layout.ts），演算法一致。
 */

export interface TreeLayoutNode {
  id: string;
  name: string | null;
  docCount?: number;
}
export interface TreeLayoutEdge {
  sourceNodeId: string;
  targetNodeId: string;
}

export interface LaidOutNode {
  id: string;
  name: string | null;
  docCount: number;
  x: number;
  y: number;
  level: number;
}

export interface TreeLayout {
  nodes: LaidOutNode[];
  edges: TreeLayoutEdge[];
  boardWidth: number;
  boardHeight: number;
  /** 節點卡尺寸（供連線錨點計算）。 */
  nodeWidth: number;
  nodeHeight: number;
}

export const TREE_LAYOUT_CONST = {
  NODE_W: 176,
  NODE_H: 62,
  HGAP: 210,
  VGAP: 132,
  MARGIN: 48,
} as const;

/**
 * 依有向邊做上到下最長路徑分層佈局，回傳每節點座標與整體版面尺寸。
 * 空節點 → boardWidth/Height 僅含邊界。含環時（理論上 F008 已禁）以已達層級為準、不無窮迴圈。
 */
export function buildTreeLayout(
  nodes: TreeLayoutNode[],
  edges: TreeLayoutEdge[],
): TreeLayout {
  const { NODE_W, NODE_H, HGAP, VGAP, MARGIN } = TREE_LAYOUT_CONST;
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

  // Kahn + 最長路徑分層（level[v] = max(level[u]+1)）。
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
  const laidOut: LaidOutNode[] = [];
  for (const [lv, rowIds] of levels) {
    const count = rowIds.length;
    const rowW = count * HGAP;
    const startX = MARGIN + (maxCols * HGAP - rowW) / 2;
    rowIds.forEach((id, i) => {
      const n = byId.get(id)!;
      laidOut.push({
        id,
        name: n.name,
        docCount: n.docCount ?? 0,
        x: startX + i * HGAP + (HGAP - NODE_W) / 2,
        y: MARGIN + lv * VGAP,
        level: lv,
      });
    });
  }
  // 依原節點順序輸出，穩定可測。
  laidOut.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));

  return {
    nodes: laidOut,
    edges: edges.filter((e) => idSet.has(e.sourceNodeId) && idSet.has(e.targetNodeId)),
    boardWidth: ids.length ? MARGIN * 2 + maxCols * HGAP : MARGIN * 2,
    boardHeight: ids.length ? MARGIN * 2 + (numLv - 1) * VGAP + NODE_H : MARGIN * 2,
    nodeWidth: NODE_W,
    nodeHeight: NODE_H,
  };
}

/**
 * 某節點及其所有下游（沿 parent→child 遞移可達的全部後代，含起點本身）。
 *
 * 架構決策 C1（architecture-spec.md §12.1）之後端權威實作：與前端
 * `frontend/src/pages/lifecycle-tree-layout.ts` 之同名函式**同語意**（monorepo 無共用 package，
 * 兩份並存為既定架構），以 F1–F5 五組固定測試向量兩端各自斷言相同期望值而綁定。
 *
 * 語意契約：① 恆含起點自身（葉節點回 `{startId}`）；② 僅沿 sourceNodeId→targetNodeId，反向邊不追隨；
 * ③ 回傳 `Set`，多路徑可達之節點僅計入並展開一次；④ 重複邊不影響結果；
 * ⑤ 自環／異常資料以 `set.has()` 守衛為第二道防線，不無窮迴圈亦不拋錯；⑥ **走訪順序不綁定**（僅約束最終集合成員）。
 */
export function descendants(edges: TreeLayoutEdge[], startId: string): Set<string> {
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
