import * as Dagre from '@dagrejs/dagre';
import type { DagGraph } from '../api/types';

/** DAG 節點卡估算尺寸（供自動排列計算層距；與畫布卡片實際寬高相近即可）。 */
export const NODE_W = 184;
export const NODE_H = 76;

/**
 * DagGraph（後端）↔ React Flow 節點/邊之轉換與錯誤碼訊息。
 * 邊一律 type='step'（直角 elbow，OQ-E03-09 全站一致）。
 */
export interface FlowNodeData {
  label: string;
  hasName: boolean;
  docCount: number;
  // React Flow 之 Node data 需符合 Record<string, unknown> 約束。
  [key: string]: unknown;
}
export interface FlowNode {
  id: string;
  type: 'dagNode';
  position: { x: number; y: number };
  data: FlowNodeData;
}
export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  type: 'step';
}

export function graphToFlow(graph: DagGraph): {
  nodes: FlowNode[];
  edges: FlowEdge[];
} {
  return {
    nodes: graph.nodes.map((n) => ({
      id: n.id,
      type: 'dagNode',
      position: { x: n.positionX, y: n.positionY },
      data: { label: n.name ?? '未命名節點', hasName: !!n.name, docCount: n.docCount ?? 0 },
    })),
    edges: graph.edges.map((e) => ({
      id: e.id,
      source: e.sourceNodeId,
      target: e.targetNodeId,
      type: 'step',
    })),
  };
}

/**
 * 自動排列（整理連結線）：以 dagre 依有向邊做「上到下」分層佈局，回傳套用新座標的節點。
 * 純函式（不動狀態/不打 API）；呼叫端負責 setNodes、fitView 與座標持久化。
 * 對 edge a→b 保證 b 在 a 下方（rankdir TB），故 step elbow 連線一致向下、不再交錯凌亂。
 */
export function layoutDag<N extends { id: string; position: { x: number; y: number } }>(
  nodes: N[],
  edges: { source: string; target: string }[],
): N[] {
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 90, marginx: 40, marginy: 40 });
  nodes.forEach((n) => g.setNode(n.id, { width: NODE_W, height: NODE_H }));
  edges.forEach((e) => {
    if (e.source && e.target) g.setEdge(e.source, e.target);
  });
  Dagre.layout(g);
  return nodes.map((n) => {
    const p = g.node(n.id);
    return p
      ? { ...n, position: { x: Math.round(p.x - NODE_W / 2), y: Math.round(p.y - NODE_H / 2) } }
      : n;
  });
}

const DAG_ERR: Record<string, string> = {
  DAG_SELF_LOOP: '節點不可連向自己',
  DAG_CYCLE_DETECTED: '此連線會造成循環結構成環，請重新確認流程方向',
  NODE_NOT_FOUND: '找不到節點',
  LIFECYCLE_NOT_FOUND: '找不到此循環',
};

export function dagErrorMessage(code: string): string {
  return DAG_ERR[code] ?? code;
}

/**
 * 刪除節點之確認文案（純函式，供 DagCanvasPage 之確認對話框）。
 *
 * 刪節點會連動刪除其連線，並解除其上全部文件掛載（後端 DagService.deleteNode 於同一交易內執行，
 * 因 ICSOP_DOCUMENT.nodeId 對 LIFECYCLE_NODE 無 FK，不解除即成孤兒掛載）。掛載數 > 0 屬破壞性副作用，
 * 必須事前讓使用者知情——文件本身不會被刪除，只回到「未掛載」。
 */
export function deleteNodeConfirm(
  label: string,
  docCount: number,
): { title: string; body: string } {
  return {
    title: `確認刪除節點「${label}」？`,
    body:
      docCount > 0
        ? `此節點掛有 ${docCount} 份文件，刪除後將一併解除掛載（文件本身保留，回到未掛載狀態），並移除其所有連線。此操作無法復原。`
        : '刪除後將一併移除其所有連線。此操作無法復原。',
  };
}
