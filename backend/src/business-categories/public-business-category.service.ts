import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ViewerScope, isDocVisibleToViewer } from '../rbac/viewer-scope';
import { businessCategoryDisplayName } from './business-category-subcategory';
import {
  PUBLIC_BUSINESS_CATEGORY_STORE,
  CategoryMountVisibilityRow,
  PublicBusinessCategoryStore,
  PublicCategoryEdgeInfo,
  PublicMountedDoc,
} from './public-business-category.store';

/**
 * 前台類別切換器之選項（`AC-B18`／`AC-34`：選項值＝`businessCategoryId`（**非名稱字串**——
 * 同名不同子分類之兩個類別必須可分別被選取）。
 *
 * ⚠ **同時帶 `name`／`subcategory` 與 `displayName`**：前者供前端自行以既有共用純函式組字
 * （與後台頁面同一份規則），後者供不需再組字之呼叫端；兩者恆一致（`displayName` 即
 * `businessCategoryDisplayName({name, subcategory})` 之輸出）。
 */
export interface PublicBusinessCategoryOption {
  id: string;
  name: string;
  subcategory: string | null;
  displayName: string;
}

/** 前台樹狀圖之節點（`visibleDocCount` 為**過濾後**之數字，`AC-B21`）。 */
export interface PublicCategoryGraphNode {
  id: string;
  businessCategoryId: string;
  name: string | null;
  positionX: number;
  positionY: number;
  /**
   * 🔴 `AC-B21`：對該 viewer **可見**之掛載文件數。
   * 顯示未過濾之總數等於揭露「存在幾份你看不到的文件」，與既有 deny-by-default 裁決直接牴觸。
   * 全部不可見 → `0`（語意上仍為 0，非「尚未掛載」之特殊值）。
   * 🔴 **屬性名刻意與後台之 `mountedDocCount` 不同**——兩者語意不同，共用同一個名字會讓某天
   * 有人把後台的未過濾數字接到前台而毫無徵兆。
   */
  visibleDocCount: number;
}

export interface PublicCategoryGraph {
  nodes: PublicCategoryGraphNode[];
  edges: PublicCategoryEdgeInfo[];
}

/**
 * F043 §己 前台業務/功能類別瀏覽服務（3 端點）。
 *
 * 🔴 **deny-by-default 之唯一施加點**（`AC-B22`／architecture-spec §14.7）：可見性過濾在**查詢層
 * 之後、回應組裝之前**於本服務完成，**不得**先取全量再由前端隱藏。
 * 🔴 **兩層過濾共用既有純函式，不另建一份**：
 *   ① 已公告過濾（`announced`，由 store 以既有規則算出）；
 *   ② F041 業務子分類使用部門過濾＝既有 `isDocVisibleToViewer(usingDepts, viewer)`（**零修改**）。
 * `AC-B23`（兩種瀏覽模式所能觸及之文件集合完全相同）由此**結構保證**——樹狀圖模式沒有另開一條
 * 可見性判定的空間。
 *
 * 🔴 **不得 N+1**（決策 E4）：每個端點之查詢次數與節點數無關。
 */
@Injectable()
export class PublicBusinessCategoryService {
  constructor(
    @Inject(PUBLIC_BUSINESS_CATEGORY_STORE)
    private readonly store: PublicBusinessCategoryStore,
  ) {}

  /**
   * `AC-B18`：僅列出 `active` **且**對該 viewer 至少有一份可見文件之類別。
   * 對該 viewer 全無可用類別 → 空陣列（**非錯誤**；空狀態由前端呈現）。
   */
  async listCategories(viewer: ViewerScope): Promise<PublicBusinessCategoryOption[]> {
    const actives = await this.store.listActiveCategories();
    const out: PublicBusinessCategoryOption[] = [];
    for (const c of actives) {
      const mounts = await this.store.listCategoryMountsForVisibility(c.id);
      if (mounts.some((m) => isMountVisible(m, viewer))) {
        out.push({
          id: c.id,
          name: c.name,
          subcategory: c.subcategory,
          displayName: businessCategoryDisplayName(c),
        });
      }
    }
    return out;
  }

  /**
   * 取單一類別之身分（供前台頁首標題；查無 → 404，不洩漏存在性）。
   * 🔴 回**原始** `name` ＋獨立 `subcategory`（前端會再組一次顯示名）。
   */
  async getCategory(businessCategoryId: string): Promise<PublicBusinessCategoryOption> {
    const found = (await this.store.listActiveCategories()).find(
      (c) => c.id === businessCategoryId,
    );
    if (!found) throw new NotFoundException('BUSINESS_CATEGORY_NOT_FOUND');
    return {
      id: found.id,
      name: found.name,
      subcategory: found.subcategory,
      displayName: businessCategoryDisplayName(found),
    };
  }

  /** `AC-B21`：節點與邊 ＋ 各節點之**過濾後**掛載數（決策 E4：單一批次查詢，記憶體計數）。 */
  async getGraph(businessCategoryId: string, viewer: ViewerScope): Promise<PublicCategoryGraph> {
    await this.requireCategory(businessCategoryId);
    const [nodes, mounts, edges] = await Promise.all([
      this.store.listNodes(businessCategoryId),
      this.store.listCategoryMountsForVisibility(businessCategoryId),
      this.store.listEdges
        ? this.store.listEdges(businessCategoryId)
        : Promise.resolve([] as PublicCategoryEdgeInfo[]),
    ]);

    const visibleByNode = new Map<string, number>();
    for (const m of mounts) {
      if (!isMountVisible(m, viewer)) continue;
      visibleByNode.set(m.nodeId, (visibleByNode.get(m.nodeId) ?? 0) + 1);
    }
    return {
      nodes: nodes.map((n) => ({
        id: n.id,
        businessCategoryId,
        name: n.name,
        positionX: n.positionX ?? 0,
        positionY: n.positionY ?? 0,
        visibleDocCount: visibleByNode.get(n.id) ?? 0,
      })),
      edges,
    };
  }

  /**
   * `AC-B20`／`AC-B22`：節點雙擊抽屜之文件清單——**僅含對該 viewer 可見者**。
   * 🔴 不可見文件之**任何欄位**（編號／書名）皆不得出現於回應之任一處——故對不可見之
   * `documentId` 連查都不查，而非查了再過濾。
   */
  async listNodeDocuments(
    businessCategoryId: string,
    nodeId: string,
    viewer: ViewerScope,
  ): Promise<PublicMountedDoc[]> {
    await this.requireCategory(businessCategoryId);
    const mounts = await this.store.listCategoryMountsForVisibility(businessCategoryId);
    const visibleIds = mounts
      .filter((m) => m.nodeId === nodeId && isMountVisible(m, viewer))
      .map((m) => m.documentId);

    const out: PublicMountedDoc[] = [];
    for (const id of visibleIds) {
      const doc = await this.store.getMountedDoc(id);
      if (doc) out.push(doc);
    }
    return out;
  }

  /** 類別不存在 → 404（不洩漏存在性；比照全站「查無視為 404」）。 */
  private async requireCategory(businessCategoryId: string): Promise<void> {
    if (!(await this.store.categoryExists(businessCategoryId))) {
      throw new NotFoundException('BUSINESS_CATEGORY_NOT_FOUND');
    }
  }
}

/**
 * 單一掛載列對該 viewer 是否可見＝**已公告 ∧ F041 使用部門可見**。
 *
 * 🔒 本函式是本服務內**唯一**的可見性判定點——兩個端點與清單過濾皆呼叫它，
 * 故「切換器列得出的類別」與「抽屜列得出的文件」不可能採用不同的判準。
 */
function isMountVisible(row: CategoryMountVisibilityRow, viewer: ViewerScope): boolean {
  return row.announced && isDocVisibleToViewer(row.usingDepts, viewer);
}
