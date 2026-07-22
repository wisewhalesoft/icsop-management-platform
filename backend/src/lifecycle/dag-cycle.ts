/**
 * F008 DAG 成環防止（純演算法，無 IO）。
 * 新增邊 source→target 之判定：
 *   - source === target → 'self-loop'（DAG_SELF_LOOP）
 *   - 既有邊中 target 已可達 source（存在 target→…→source 路徑）→ 加邊會閉環 → 'cycle'（DAG_CYCLE_DETECTED）
 *   - 否則 'ok'
 * 由後端於交易內以此權威驗證，即使前端已預覽亦以後端為準。
 */
export interface Edge {
  sourceNodeId: string;
  targetNodeId: string;
}

/** 沿有向邊，from 是否可達 to（BFS）。from===to 視為可達（長度 0）。 */
export function isReachable(from: string, to: string, edges: Edge[]): boolean {
  if (from === to) return true;
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    const list = adj.get(e.sourceNodeId);
    if (list) list.push(e.targetNodeId);
    else adj.set(e.sourceNodeId, [e.targetNodeId]);
  }
  const seen = new Set<string>([from]);
  const stack = [from];
  while (stack.length > 0) {
    const n = stack.pop() as string;
    for (const m of adj.get(n) ?? []) {
      if (m === to) return true;
      if (!seen.has(m)) {
        seen.add(m);
        stack.push(m);
      }
    }
  }
  return false;
}

export type EdgeVerdict = 'ok' | 'self-loop' | 'cycle';

/** 判定新增邊 source→target。 */
export function classifyEdge(
  edges: Edge[],
  source: string,
  target: string,
): EdgeVerdict {
  if (source === target) return 'self-loop';
  // target 已可達 source → 加 source→target 會成環
  if (isReachable(target, source, edges)) return 'cycle';
  return 'ok';
}
