/**
 * F038 循環樹狀圖變更快照建構 — 純函式（無 IO）。
 *
 * 依 data-model.md LIFECYCLE_SNAPSHOT.nodesJson 定義：每筆結構變更事件於同一交易內落地一份「當下完整
 * DAG 結構快照」（self-contained：節點含其掛載文件之 id+documentNumber，供新舊樹重建時不再回查來源表——
 * 來源循環後續若刪除節點/文件，歷史快照仍可正確重建）。
 *
 * 呼叫端（recordStructuralChange，交易內）以 manager 重新查詢 LIFECYCLE_NODE/LIFECYCLE_EDGE/ICSOP_DOCUMENT
 * 之當下狀態，組出 docsByNode 後呼叫本純函式；序列化為 nodesJson/edgesJson 落地。
 */

export interface SnapshotDocRef {
  id: string;
  documentNumber: string;
}

export interface SnapshotNode {
  id: string;
  name: string | null;
  positionX: number;
  positionY: number;
  /** 掛載於此節點之文件清單（id + documentNumber），非僅計數；無掛載＝[]（非 undefined）。 */
  docs: SnapshotDocRef[];
}

export interface SnapshotEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
}

export interface SnapshotGraph {
  nodes: SnapshotNode[];
  edges: SnapshotEdge[];
}

/** 空 DAG 快照（循環第一筆事件之「變更前」端點；見 §B.1 重建演算法步驟 4）。 */
export const EMPTY_SNAPSHOT_GRAPH: SnapshotGraph = { nodes: [], edges: [] };

/** 節點原始欄位（座標/名稱）之最小結構，避免耦合 TypeORM entity 或 DagStore.NodeView。 */
interface RawNode {
  id: string;
  name: string | null;
  positionX: number;
  positionY: number;
}
interface RawEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
}

/**
 * 由當下節點/邊 ＋ 各節點掛載文件 map 組出自足快照。節點無掛載（docsByNode 未含其 key）→ docs 為 []
 * （防禦性，不拋錯）。
 */
export function buildSnapshotGraph(
  nodes: RawNode[],
  edges: RawEdge[],
  docsByNode: Map<string, SnapshotDocRef[]>,
): SnapshotGraph {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      name: n.name,
      positionX: n.positionX,
      positionY: n.positionY,
      docs: (docsByNode.get(n.id) ?? []).map((d) => ({
        id: d.id,
        documentNumber: d.documentNumber,
      })),
    })),
    edges: edges.map((e) => ({
      id: e.id,
      sourceNodeId: e.sourceNodeId,
      targetNodeId: e.targetNodeId,
    })),
  };
}
