import type { DagGraph } from '../api/types';

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

const DAG_ERR: Record<string, string> = {
  DAG_SELF_LOOP: '節點不可連向自己',
  DAG_CYCLE_DETECTED: '此連線會造成循環結構成環，請重新確認流程方向',
  NODE_NOT_FOUND: '找不到節點',
  LIFECYCLE_NOT_FOUND: '找不到此循環',
};

export function dagErrorMessage(code: string): string {
  return DAG_ERR[code] ?? code;
}
