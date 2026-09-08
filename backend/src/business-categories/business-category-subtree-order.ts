import { buildTreeLayout } from '../lifecycle/lifecycle-tree-layout';

/**
 * F043 §丙／§己：業務/功能類別**子樹分組順序**之單一來源。
 *
 * 🔴 **後台（`AC-35`）與前台（F019 `AC-B20`）共用同一份排序**：兩處各寫一份是「同一棵樹在
 * 兩個頁面長出兩種順序」的溫床——使用者在後台預覽看到的分組次序，與他在前台樹狀圖雙擊同一個
 * 節點看到的次序，必須是同一個事實。可見性過濾（前台獨有）發生在**取用文件之後**，
 * 與節點排序完全正交，故排序本身可以、也應該只有一份。
 *
 * 📝 本模組之內容自 `business-category-docs.service.ts` 原地搬出（2026-09-08 delta），
 * 三層 tie-break 之規則一字未動。
 */

/** 子樹分組排序之最小節點身分。 */
export interface SubtreeNodeRef {
  nodeId: string;
  nodeName: string | null;
}

/** 排序所需之最小節點形狀（後台 `BusinessCategoryNodeView`／前台 `PublicCategoryNodeInfo` 皆滿足）。 */
export interface SubtreeOrderNode {
  id: string;
  name: string | null;
}

/** 排序所需之最小邊形狀。 */
export interface SubtreeOrderEdge {
  sourceNodeId: string;
  targetNodeId: string;
}

type NodePos = { x: number; y: number };

/**
 * `AC-35` 之三層 tie-break（逐字比照 F036 `AC-T11` 之既有規則）：① 本節點恆第一 →
 * ② `pos.y` 遞增（由上而下）→ ③ 同 y 則 `pos.x` 遞增 → ④ 皆同則以節點 id 字典序打破平手
 * （防禦性，確保無隨機性）。
 */
export function compareSubtreeNodes(
  a: string,
  b: string,
  rootId: string,
  pos: Map<string, NodePos>,
): number {
  if (a === rootId || b === rootId) return a === b ? 0 : a === rootId ? -1 : 1;
  const pa = pos.get(a) ?? { x: 0, y: 0 };
  const pb = pos.get(b) ?? { x: 0, y: 0 };
  if (pa.y !== pb.y) return pa.y - pb.y;
  if (pa.x !== pb.x) return pa.x - pb.x;
  return a.localeCompare(b);
}

/**
 * 子樹節點之分組順序。座標取自**同一次** `buildTreeLayout()` 呼叫（確定性純函式，決策 E2 之
 * 直接重用——前後端與 prototype 三方座標一致之既有理由對本功能同樣成立）。
 */
export function orderSubtreeNodes(
  nodes: SubtreeOrderNode[],
  edges: SubtreeOrderEdge[],
  subtree: Set<string>,
  rootId: string,
): SubtreeNodeRef[] {
  const layout = buildTreeLayout(
    nodes.map((n) => ({ id: n.id, name: n.name })),
    edges.map((e) => ({ sourceNodeId: e.sourceNodeId, targetNodeId: e.targetNodeId })),
  );
  const pos = new Map<string, NodePos>(layout.nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
  return nodes
    .filter((n) => subtree.has(n.id))
    .map((n) => ({ nodeId: n.id, nodeName: n.name }))
    .sort((a, b) => compareSubtreeNodes(a.nodeId, b.nodeId, rootId, pos));
}
