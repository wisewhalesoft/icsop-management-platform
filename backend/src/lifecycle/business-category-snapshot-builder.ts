import { SnapshotDocRef, SnapshotGraph } from './lifecycle-snapshot-builder';

/**
 * F043 §戊 業務/功能類別結構變更快照建構 — 純函式（無 IO）。
 *
 * 🔴 **決策 E1（architecture-spec §14.1）：本檔為 `lifecycle-snapshot-builder.ts` 之
 * 逐字複製（僅識別字重命名）＋固定向量綁定**——沿用本 repo 既有之「兩份逐字相同 ＋ 同一組固定
 * 向量」反漂移模式，**不創新模式**（lead 明確指示）。
 * 綁定之可觀測不變式：給定同一組泛型 `(nodes, edges, docsByNode)`，本函式與
 * `buildSnapshotGraph()` 之輸出**逐位元組相等**（見 `business-category-snapshot-builder.spec.ts`
 * 與 `lifecycle-snapshot-builder.spec.ts` 之跨檔綁定 case）。
 *
 * 🔴 **落點刻意在 `lifecycle/`**（§14.2）：與被綁定之對象**同目錄**，便於維護者一次看到兩份
 * 必須維持逐位元組相等的檔案；純函式檔不掛 `@Module`，故不產生任何 import 方向問題。
 *
 * 🔴 **M:N 差異（data-model 明文）**：同一份文件可出現在多個節點之 `docs` 清單中，**不得去重**
 * ——那是 `BUSINESS_CATEGORY_DOC` 之語意（`AC-21`），去重會讓歷史快照謊稱該文件只掛過一處。
 * ⚠ 此差異落在**呼叫端組出的 `docsByNode`**，本純函式對它一無所知（故兩函式仍可逐位元組相等）。
 */

/** 空 DAG 快照（該類別第一筆事件之「變更前」端點）。 */
export const EMPTY_BUSINESS_CATEGORY_SNAPSHOT_GRAPH: SnapshotGraph = { nodes: [], edges: [] };

/** 節點原始欄位之最小結構，避免耦合 TypeORM entity 或 `BusinessCategoryDagStore.NodeView`。 */
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
 * 由當下節點／邊 ＋ 各節點掛載文件 map 組出自足快照。節點無掛載（`docsByNode` 未含其 key）→
 * `docs` 為 `[]`（防禦性，不拋錯）。
 */
export function buildBusinessCategorySnapshotGraph(
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
