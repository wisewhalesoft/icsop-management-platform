import { ConflictException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { BusinessCategory } from '../database/entities/business-category.entity';
import { BusinessCategoryNode } from '../database/entities/business-category-node.entity';
import { BusinessCategoryEdge } from '../database/entities/business-category-edge.entity';
import { BusinessCategoryDoc } from '../database/entities/business-category-doc.entity';
import { classifyEdge } from '../lifecycle/dag-cycle';
import {
  BusinessCategoryDagStore,
  BusinessCategoryEdgeRow,
  BusinessCategoryNodeView,
  CreateBusinessCategoryNodeInput,
} from './business-category-dag.store';
import { BusinessCategoryDagStructuralTx } from './business-category-structural-change';
import { recordBusinessCategoryStructuralChange } from './business-category-structural-recorder';

/**
 * §乙 DAG store 之 TypeORM 實作。成環驗證於**交易內**（權威，防跨請求競態，`AC-17`）。
 *
 * 🔴 決策 E8：`deleteNodeWithEdges` 於**同一交易內**額外刪除該節點之全部 `BUSINESS_CATEGORY_DOC`
 * 列——`nodeId` 側刻意不建 FK CASCADE（`AC-18` 需要刪除**前**之計數驅動二次確認，FK 無法提供
 * 這個時序；且顯式 SQL 在交易邊界之可見性與可測試性優於隱式觸發）。
 */
export class TypeOrmBusinessCategoryDagStore implements BusinessCategoryDagStore {
  constructor(private readonly ds: DataSource) {}

  private async init(): Promise<DataSource> {
    if (!this.ds.isInitialized) await this.ds.initialize();
    return this.ds;
  }

  private static toNode(n: BusinessCategoryNode): BusinessCategoryNodeView {
    return {
      id: n.id,
      businessCategoryId: n.businessCategoryId,
      name: n.name,
      positionX: n.positionX,
      positionY: n.positionY,
    };
  }

  async businessCategoryExists(businessCategoryId: string): Promise<boolean> {
    const ds = await this.init();
    return (
      (await ds.getRepository(BusinessCategory).count({ where: { id: businessCategoryId } })) > 0
    );
  }

  // ── 讀取（manager-bound 版供交易內重複查詢；公開版走 ds.manager）──

  private async listNodesWith(
    m: EntityManager,
    businessCategoryId: string,
  ): Promise<BusinessCategoryNodeView[]> {
    const rows = await m.getRepository(BusinessCategoryNode).find({ where: { businessCategoryId } });
    const counts = await this.docCountsByNode(m, businessCategoryId);
    return rows.map((n) => ({
      ...TypeOrmBusinessCategoryDagStore.toNode(n),
      docCount: counts.get(n.id) ?? 0,
    }));
  }

  async listNodes(businessCategoryId: string): Promise<BusinessCategoryNodeView[]> {
    const ds = await this.init();
    return this.listNodesWith(ds.manager, businessCategoryId);
  }

  /** 各節點之**相異**掛載文件數（單次 GROUP BY；來源表未建 → 空 Map）。 */
  private async docCountsByNode(
    m: EntityManager,
    businessCategoryId: string,
  ): Promise<Map<string, number>> {
    try {
      const raw = await m.query(
        `SELECT d.[nodeId] AS nodeId, COUNT(DISTINCT d.[documentId]) AS cnt
           FROM [BUSINESS_CATEGORY_DOC] d
           JOIN [BUSINESS_CATEGORY_NODE] n ON n.[id] = d.[nodeId]
          WHERE n.[businessCategoryId] = @0
          GROUP BY d.[nodeId]`,
        [businessCategoryId],
      );
      return new Map(
        (raw as { nodeId: string; cnt: string | number }[]).map((r) => [r.nodeId, Number(r.cnt)]),
      );
    } catch {
      return new Map();
    }
  }

  private async listEdgesWith(
    m: EntityManager,
    businessCategoryId: string,
  ): Promise<BusinessCategoryEdgeRow[]> {
    const rows = await m.getRepository(BusinessCategoryEdge).find({ where: { businessCategoryId } });
    return rows.map((e) => ({
      id: e.id,
      sourceNodeId: e.sourceNodeId,
      targetNodeId: e.targetNodeId,
    }));
  }

  async listEdges(businessCategoryId: string): Promise<BusinessCategoryEdgeRow[]> {
    const ds = await this.init();
    return this.listEdgesWith(ds.manager, businessCategoryId);
  }

  private async nodeExistsWith(
    m: EntityManager,
    businessCategoryId: string,
    nodeId: string,
  ): Promise<boolean> {
    return (
      (await m
        .getRepository(BusinessCategoryNode)
        .count({ where: { id: nodeId, businessCategoryId } })) > 0
    );
  }

  async nodeExists(businessCategoryId: string, nodeId: string): Promise<boolean> {
    const ds = await this.init();
    return this.nodeExistsWith(ds.manager, businessCategoryId, nodeId);
  }

  private async countNodeMountsWith(m: EntityManager, nodeId: string): Promise<number> {
    try {
      const rows = await m.query(
        `SELECT COUNT(*) AS cnt FROM [BUSINESS_CATEGORY_DOC] WHERE [nodeId] = @0`,
        [nodeId],
      );
      return Number(rows?.[0]?.cnt ?? 0);
    } catch {
      return 0;
    }
  }

  /** `AC-18`：刪除**前**之「將移除 N 筆掛載關係」計數（單次 COUNT，非事後比對）。 */
  async countNodeMounts(nodeId: string): Promise<number> {
    const ds = await this.init();
    return this.countNodeMountsWith(ds.manager, nodeId);
  }

  // ── 寫入（manager-bound 版供交易內；公開版走 ds.manager / 自帶交易）──

  private async createNodeWith(
    m: EntityManager,
    businessCategoryId: string,
    input: CreateBusinessCategoryNodeInput,
  ): Promise<BusinessCategoryNodeView> {
    const repo = m.getRepository(BusinessCategoryNode);
    // 🔴 白名單逐欄對帳（§14.4）：`businessCategoryId`／`name`／`positionX`／`positionY`。
    const saved = await repo.save(
      repo.create({
        businessCategoryId,
        name: input.name,
        positionX: input.positionX,
        positionY: input.positionY,
      }),
    );
    return TypeOrmBusinessCategoryDagStore.toNode(saved);
  }

  async createNode(
    businessCategoryId: string,
    input: CreateBusinessCategoryNodeInput,
  ): Promise<BusinessCategoryNodeView> {
    const ds = await this.init();
    return this.createNodeWith(ds.manager, businessCategoryId, input);
  }

  private async updateNodeWith(
    m: EntityManager,
    nodeId: string,
    patch: { name?: string | null; positionX?: number; positionY?: number },
  ): Promise<BusinessCategoryNodeView> {
    await m.getRepository(BusinessCategoryNode).update({ id: nodeId }, patch);
    const n = await m.getRepository(BusinessCategoryNode).findOneOrFail({ where: { id: nodeId } });
    return TypeOrmBusinessCategoryDagStore.toNode(n);
  }

  async updateNode(
    nodeId: string,
    patch: { name?: string | null; positionX?: number; positionY?: number },
  ): Promise<BusinessCategoryNodeView> {
    const ds = await this.init();
    return this.updateNodeWith(ds.manager, nodeId, patch);
  }

  /**
   * 🔴 不變式：節點消失前**先刪除其掛載列**，否則 `BUSINESS_CATEGORY_DOC.nodeId` 成懸空值
   * （孤兒掛載——該列在畫布與樹狀圖上完全看不見，卻仍被 `countMountedDocuments` 計入，
   * 使該類別從此刪不掉且沒有任何介面可解除它）。三個 DELETE 於**同一交易**內完成。
   */
  private async deleteNodeWithEdgesWith(m: EntityManager, nodeId: string): Promise<void> {
    await m.getRepository(BusinessCategoryDoc).delete({ nodeId });
    await m
      .getRepository(BusinessCategoryEdge)
      .createQueryBuilder()
      .delete()
      .where('sourceNodeId = :id OR targetNodeId = :id', { id: nodeId })
      .execute();
    await m.getRepository(BusinessCategoryNode).delete({ id: nodeId });
  }

  async deleteNodeWithEdges(nodeId: string): Promise<void> {
    const ds = await this.init();
    await ds.transaction((m) => this.deleteNodeWithEdgesWith(m, nodeId));
  }

  private async createEdgeWith(
    m: EntityManager,
    businessCategoryId: string,
    source: string,
    target: string,
  ): Promise<BusinessCategoryEdgeRow> {
    // `AC-17`：交易內再驗成環（權威，防跨請求競態）。錯誤碼為本功能專屬（`AC-16`）。
    const existing = await m.getRepository(BusinessCategoryEdge).find({ where: { businessCategoryId } });
    const verdict = classifyEdge(
      existing.map((e) => ({ sourceNodeId: e.sourceNodeId, targetNodeId: e.targetNodeId })),
      source,
      target,
    );
    if (verdict === 'self-loop') throw new ConflictException('BUSINESS_CATEGORY_SELF_LOOP');
    if (verdict === 'cycle') throw new ConflictException('BUSINESS_CATEGORY_CYCLE_DETECTED');
    const repo = m.getRepository(BusinessCategoryEdge);
    // 🔴 白名單逐欄對帳（§14.4）：`businessCategoryId`／`sourceNodeId`／`targetNodeId`。
    const saved = await repo.save(
      repo.create({ businessCategoryId, sourceNodeId: source, targetNodeId: target }),
    );
    return { id: saved.id, sourceNodeId: saved.sourceNodeId, targetNodeId: saved.targetNodeId };
  }

  async createEdge(
    businessCategoryId: string,
    source: string,
    target: string,
  ): Promise<BusinessCategoryEdgeRow> {
    const ds = await this.init();
    return ds.transaction((m) => this.createEdgeWith(m, businessCategoryId, source, target));
  }

  private async deleteEdgeWith(m: EntityManager, edgeId: string): Promise<void> {
    await m.getRepository(BusinessCategoryEdge).delete({ id: edgeId });
  }

  async deleteEdge(edgeId: string): Promise<void> {
    const ds = await this.init();
    await this.deleteEdgeWith(ds.manager, edgeId);
  }

  /**
   * `AC-38` 交易一致性：於單一 DB 交易內執行結構寫入 ＋ `recordStructuralChange`
   * （`BUSINESS_CATEGORY_CHANGE_LOG` ＋ `BUSINESS_CATEGORY_SNAPSHOT`）。
   * `work` 拋錯 → 交易回滾（結構列亦不留）。
   */
  async runStructuralChange<T>(
    work: (tx: BusinessCategoryDagStructuralTx) => Promise<T>,
  ): Promise<T> {
    const ds = await this.init();
    return ds.transaction(async (m) => {
      const tx: BusinessCategoryDagStructuralTx = {
        createNode: (bc, input) => this.createNodeWith(m, bc, input),
        updateNode: (id, patch) => this.updateNodeWith(m, id, patch),
        deleteNodeWithEdges: (id) => this.deleteNodeWithEdgesWith(m, id),
        countNodeMounts: (id) => this.countNodeMountsWith(m, id),
        createEdge: (bc, s, t) => this.createEdgeWith(m, bc, s, t),
        deleteEdge: (id) => this.deleteEdgeWith(m, id),
        listNodes: (bc) => this.listNodesWith(m, bc),
        listEdges: (bc) => this.listEdgesWith(m, bc),
        nodeExists: (bc, id) => this.nodeExistsWith(m, bc, id),
        recordStructuralChange: (event) => recordBusinessCategoryStructuralChange(m, event),
      };
      return work(tx);
    });
  }
}
