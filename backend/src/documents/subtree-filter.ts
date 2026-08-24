import { descendants } from '../lifecycle/lifecycle-tree-layout';
import { lifecycleDisplayName } from '../lifecycle/lifecycle-subcategory';
import { SubtreeFilterDescriptor } from './documents.store';

/**
 * F017 §節點子樹篩選（deep link）delta — 架構決策 C3（`architecture-spec.md` §12.3）。
 *
 * 🔴 **單一函式同時產出 SQL 篩選條件與回應描述子**（`AC-T40` ⑤）：成功 ⇒ 兩者同時取得；
 * 失敗 ⇒ 回 `null`，兩者同時不設定。**不得**存在兩條各自判斷「這個 `nodeSubtreeId` 解析得出來嗎」
 * 的路徑——那正是「篩選生效但描述子算錯」與「描述子有值但篩選沒施加」兩種分岔的來源。
 *
 * 子樹走訪逐字重用後端唯一之 `descendants()`（決策 C1，語意由 F036 `AC-T28` 之 F1–F5 向量釘死），
 * 不另寫第二份走訪；圖走訪為純記憶體演算法，刻意**不**混入 store 之 SQL 組建職責。
 */

/** 循環身分查詢（結構相容於既有 `LifecycleStore`；本函式只用得到 `findById`）。 */
export interface SubtreeLifecycleLookup {
  findById(id: string): Promise<{ name: string; subcategory?: string | null } | null>;
}

/** 節點/邊查詢（結構相容於既有 `DagStore`；兩者本即以 `lifecycleId` 限定，跨循環之邊不可能被納入）。 */
export interface SubtreeGraphLookup {
  listNodes(lifecycleId: string): Promise<{ id: string; name: string | null }[]>;
  listEdges(lifecycleId: string): Promise<{ sourceNodeId: string; targetNodeId: string }[]>;
}

export interface ResolvedSubtreeFilter {
  /** 已展開之子樹節點 id（含根節點自身），供 `DocumentListFilters.nodeIdIn` 之單一 SQL `IN` 下推。 */
  nodeIds: string[];
  /** 回應之 `subtreeFilter` 欄（`AC-T45`）。 */
  descriptor: SubtreeFilterDescriptor;
}

/**
 * 解析子樹篩選。下列任一情形回 `null`（`AC-T41` 之靜默 no-op，**非**錯誤、**非**空結果）：
 * ① 只帶 `lifecycleId`；② 只帶 `nodeSubtreeId`；③ 該 `lifecycleId` 查無此循環；
 * ④ `nodeSubtreeId` 不屬於該循環之節點集合；（另：查詢能力未注入時亦優雅降級為 `null`）。
 */
export async function resolveSubtreeFilter(
  lifecycleId: string | undefined,
  nodeSubtreeId: string | undefined,
  lifecycles: SubtreeLifecycleLookup | undefined,
  graph: SubtreeGraphLookup | undefined,
): Promise<ResolvedSubtreeFilter | null> {
  if (!lifecycleId || !nodeSubtreeId) return null; // ①②
  if (!lifecycles || !graph) return null;

  const lc = await lifecycles.findById(lifecycleId);
  if (!lc) return null; // ③

  const node = (await graph.listNodes(lifecycleId)).find((n) => n.id === nodeSubtreeId);
  if (!node) return null; // ④

  const edges = await graph.listEdges(lifecycleId);
  return {
    nodeIds: [...descendants(edges, nodeSubtreeId)],
    descriptor: {
      lifecycleId,
      lifecycleName: lifecycleDisplayName(lc),
      nodeId: nodeSubtreeId,
      nodeName: node.name,
    },
  };
}
