import { descendants } from '../lifecycle/lifecycle-tree-layout';
import { ViewerScope, isDocVisibleToViewer } from '../rbac/viewer-scope';
import {
  CategoryMountVisibilityRow,
  PublicCategoryEdgeInfo,
  PublicCategoryNodeInfo,
} from './public-business-category.store';

/**
 * 前台「節點子樹」之展開與可見性過濾——🟢 零 IO 純函式（architecture-spec §16.4 `ARCH-UX4`）。
 *
 * ## 本檔之由來
 * 原為 `PublicBusinessCategoryService.listSubtreeDocuments()` 內部之運算；F019 `AC-UX15` 之
 * 前台清單子樹篩選需要**同一個集合**（抽屜看到的那些文件 ≡ 導過去的清單所呈現的那些文件），
 * 故抽為單一定義點。🔒 **重構、行為零改變**——`AC-B20`／`AC-B21`／`AC-B23` 之既有測試期望值
 * 不改即應維持綠燈。
 *
 * ## 🔴 為何這件事必須只有一份實作（`AC-UX15` ④／`AC-B23`）
 * 子樹篩選**不得**成為繞過 [F041] 限縮之側門，且「抽屜可觸及之文件集合」與「導過去的清單可
 * 觸及之文件集合」必須**完全相同**。兩處各算一次就是「兩套判定各自宣稱一致」；共用同一支
 * 函式才是結構性保證。
 *
 * ## 🔴 縱深防禦（§16.4）
 * 本函式回傳之 `Set` **本身已經**是「已公告 ∧ `isDocVisibleToViewer`」之子集；呼叫端
 * （`buildPublicList`）再把它 AND 在自己的 `visible` 之後 ⇒ 兩層各自獨立計算、結果**只會更小**。
 * 即使其中一層被誤刪，另一層仍是完整防線。
 */

/**
 * 單一掛載列對該 viewer 是否可見＝**已公告 ∧ F041 使用部門可見**。
 *
 * 🔒 本函式是前台類別瀏覽**唯一**的可見性判定點——切換器、樹狀圖徽章、抽屜與清單子樹篩選
 * 皆呼叫它，故「切換器列得出的類別」與「抽屜列得出的文件」不可能採用不同的判準。
 * 🔴 `isDocVisibleToViewer` 與前台清單母體（`public-list.ts#visibleCandidates`）呼叫的是**同一個
 * 符號**，故兩邊的可見性口徑結構上保證一致。
 */
export function isMountVisible(
  row: CategoryMountVisibilityRow,
  viewer: ViewerScope,
): boolean {
  return row.announced && isDocVisibleToViewer(row.usingDepts, viewer);
}

/**
 * 子樹（本節點＋全部下游）內**對該 viewer 可見**之掛載，依節點分組。
 *
 * 🔴 子樹節點集合與「單擊醒目標示」之集合共用同一支既有純函式 `descendants()`，故
 * 「標示了 7 個節點、抽屜只列了 6 個節點的文件」這種分家不可能發生。
 * 🔒 子樹交集 `nodes` 之已知節點集合：`nodeId` 查無（或邊指向不存在的節點）⇒ 該節點不產生
 * 任何分組，**不拋例外**（呼叫端另行處理 404）。
 */
export function visibleSubtreeMountsByNode(
  nodes: readonly PublicCategoryNodeInfo[],
  edges: readonly PublicCategoryEdgeInfo[],
  mounts: readonly CategoryMountVisibilityRow[],
  nodeId: string,
  viewer: ViewerScope,
): Map<string, string[]> {
  const known = new Set(nodes.map((n) => n.id));
  const subtree = descendants([...edges], nodeId);
  const byNode = new Map<string, string[]>();
  for (const m of mounts) {
    if (!known.has(m.nodeId) || !subtree.has(m.nodeId)) continue;
    // 🔴 先過濾可見性、再由呼叫端取文件明細（而非先取再濾）：不可見者連一次查詢都不發出。
    if (!isMountVisible(m, viewer)) continue;
    const bucket = byNode.get(m.nodeId);
    if (bucket) bucket.push(m.documentId);
    else byNode.set(m.nodeId, [m.documentId]);
  }
  return byNode;
}

/**
 * 子樹內之**相異**可見文件 id 集合（`AC-UX15` ②／`AC-UX13` ② 之 `N`）。
 *
 * 🔴 **相異**，非畫面列數：同一份文件掛在子樹內多個節點時（M:N），抽屜**跨組不去重**故列數
 * 會較大——兩個數字不同是事實，不得互相對齊。
 */
export function resolveVisibleSubtreeDocumentIds(
  nodes: readonly PublicCategoryNodeInfo[],
  edges: readonly PublicCategoryEdgeInfo[],
  mounts: readonly CategoryMountVisibilityRow[],
  nodeId: string,
  viewer: ViewerScope,
): Set<string> {
  const out = new Set<string>();
  for (const ids of visibleSubtreeMountsByNode(nodes, edges, mounts, nodeId, viewer).values()) {
    for (const id of ids) out.add(id);
  }
  return out;
}
