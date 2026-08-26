import { ConflictException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { Lifecycle } from '../database/entities/lifecycle.entity';
import { LifecycleNode } from '../database/entities/lifecycle-node.entity';
import { LifecycleEdge } from '../database/entities/lifecycle-edge.entity';
import { IcsopDocument } from '../database/entities/icsop-document.entity';
import {
  DagStore,
  NodeView,
  EdgeRow,
  CreateNodeInput,
} from './dag.store';
import { classifyEdge } from './dag-cycle';
import { DagStructuralTx } from './lifecycle-structural-change';
import { recordStructuralChange } from './lifecycle-structural-recorder';

/** DAG store 之 TypeORM 實作。成環驗證於交易內（權威，防跨請求競態，F008）。 */
export class TypeOrmDagStore implements DagStore {
  constructor(private readonly ds: DataSource) {}

  private async init(): Promise<DataSource> {
    if (!this.ds.isInitialized) await this.ds.initialize();
    return this.ds;
  }

  private static toNode(n: LifecycleNode): NodeView {
    return {
      id: n.id,
      lifecycleId: n.lifecycleId,
      name: n.name,
      positionX: n.positionX,
      positionY: n.positionY,
    };
  }

  async lifecycleExists(lifecycleId: string): Promise<boolean> {
    const ds = await this.init();
    return (await ds.getRepository(Lifecycle).count({ where: { id: lifecycleId } })) > 0;
  }

  // ── 讀取（manager-bound 版供交易內重複查詢；公開版走 ds.manager）──

  private async listNodesWith(m: EntityManager, lifecycleId: string): Promise<NodeView[]> {
    const rows = await m.getRepository(LifecycleNode).find({ where: { lifecycleId } });
    const counts = await this.docCountsByNode(m, lifecycleId);
    return rows.map((n) => ({ ...TypeOrmDagStore.toNode(n), docCount: counts.get(n.id) ?? 0 }));
  }

  async listNodes(lifecycleId: string): Promise<NodeView[]> {
    const ds = await this.init();
    return this.listNodesWith(ds.manager, lifecycleId);
  }

  private async docCountsByNode(
    m: EntityManager,
    lifecycleId: string,
  ): Promise<Map<string, number>> {
    try {
      const raw = await m.query(
        `SELECT [nodeId] AS nodeId, COUNT(*) AS cnt FROM [ICSOP_DOCUMENT]
         WHERE [lifecycleId] = @0 AND [nodeId] IS NOT NULL GROUP BY [nodeId]`,
        [lifecycleId],
      );
      return new Map(
        (raw as { nodeId: string; cnt: string | number }[]).map((r) => [r.nodeId, Number(r.cnt)]),
      );
    } catch {
      return new Map();
    }
  }

  private async listEdgesWith(m: EntityManager, lifecycleId: string): Promise<EdgeRow[]> {
    const rows = await m.getRepository(LifecycleEdge).find({ where: { lifecycleId } });
    return rows.map((e) => ({ id: e.id, sourceNodeId: e.sourceNodeId, targetNodeId: e.targetNodeId }));
  }

  async listEdges(lifecycleId: string): Promise<EdgeRow[]> {
    const ds = await this.init();
    return this.listEdgesWith(ds.manager, lifecycleId);
  }

  private async nodeExistsWith(
    m: EntityManager,
    lifecycleId: string,
    nodeId: string,
  ): Promise<boolean> {
    return (await m.getRepository(LifecycleNode).count({ where: { id: nodeId, lifecycleId } })) > 0;
  }

  async nodeExists(lifecycleId: string, nodeId: string): Promise<boolean> {
    const ds = await this.init();
    return this.nodeExistsWith(ds.manager, lifecycleId, nodeId);
  }

  // ── 寫入（manager-bound 版供交易內；公開版走 ds.manager / 自帶交易）──

  private async createNodeWith(
    m: EntityManager,
    lifecycleId: string,
    input: CreateNodeInput,
  ): Promise<NodeView> {
    const repo = m.getRepository(LifecycleNode);
    const saved = await repo.save(repo.create({ lifecycleId, ...input }));
    return TypeOrmDagStore.toNode(saved);
  }

  async createNode(lifecycleId: string, input: CreateNodeInput): Promise<NodeView> {
    const ds = await this.init();
    return this.createNodeWith(ds.manager, lifecycleId, input);
  }

  private async updateNodeWith(
    m: EntityManager,
    nodeId: string,
    patch: { name?: string | null; positionX?: number; positionY?: number },
  ): Promise<NodeView> {
    await m.getRepository(LifecycleNode).update({ id: nodeId }, patch);
    const n = await m.getRepository(LifecycleNode).findOneOrFail({ where: { id: nodeId } });
    return TypeOrmDagStore.toNode(n);
  }

  async updateNode(
    nodeId: string,
    patch: { name?: string | null; positionX?: number; positionY?: number },
  ): Promise<NodeView> {
    const ds = await this.init();
    return this.updateNodeWith(ds.manager, nodeId, patch);
  }

  /**
   * 解除掛載於該節點之全部文件（nodeId → NULL），回傳受影響筆數。
   * `ICSOP_DOCUMENT.nodeId` 無 FK 到 `LIFECYCLE_NODE`，故此清除必須由應用層負責（見 dag.store.ts）。
   * `updatedAt` 一併更新，與單筆掛載寫入（TypeOrmNodeDocsStore.setDocNode）之語意一致。
   */
  private async unmountNodeDocsWith(m: EntityManager, nodeId: string): Promise<number> {
    const res = await m
      .getRepository(IcsopDocument)
      .createQueryBuilder()
      .update()
      .set({ nodeId: null, updatedAt: new Date() })
      .where('nodeId = :id', { id: nodeId })
      .execute();
    return res.affected ?? 0;
  }

  async unmountNodeDocs(nodeId: string): Promise<number> {
    const ds = await this.init();
    return this.unmountNodeDocsWith(ds.manager, nodeId);
  }

  private async deleteNodeWithEdgesWith(m: EntityManager, nodeId: string): Promise<void> {
    // 🔴 不變式：節點消失前先解除其文件掛載，否則 ICSOP_DOCUMENT.nodeId 成懸空值（孤兒掛載）。
    // 置於刪節點之前且同交易內，服務層是否已先呼叫 unmountNodeDocs 皆冪等（第二次影響 0 列）。
    await this.unmountNodeDocsWith(m, nodeId);
    await m
      .getRepository(LifecycleEdge)
      .createQueryBuilder()
      .delete()
      .where('sourceNodeId = :id OR targetNodeId = :id', { id: nodeId })
      .execute();
    await m.getRepository(LifecycleNode).delete({ id: nodeId });
  }

  async deleteNodeWithEdges(nodeId: string): Promise<void> {
    const ds = await this.init();
    await ds.transaction((m) => this.deleteNodeWithEdgesWith(m, nodeId));
  }

  private async createEdgeWith(
    m: EntityManager,
    lifecycleId: string,
    source: string,
    target: string,
  ): Promise<EdgeRow> {
    // 交易內再驗成環（權威，防跨請求競態）。
    const existing = await m.getRepository(LifecycleEdge).find({ where: { lifecycleId } });
    const verdict = classifyEdge(
      existing.map((e) => ({ sourceNodeId: e.sourceNodeId, targetNodeId: e.targetNodeId })),
      source,
      target,
    );
    if (verdict === 'self-loop') throw new ConflictException('DAG_SELF_LOOP');
    if (verdict === 'cycle') throw new ConflictException('DAG_CYCLE_DETECTED');
    const repo = m.getRepository(LifecycleEdge);
    const saved = await repo.save(repo.create({ lifecycleId, sourceNodeId: source, targetNodeId: target }));
    return { id: saved.id, sourceNodeId: saved.sourceNodeId, targetNodeId: saved.targetNodeId };
  }

  async createEdge(lifecycleId: string, source: string, target: string): Promise<EdgeRow> {
    const ds = await this.init();
    return ds.transaction((m) => this.createEdgeWith(m, lifecycleId, source, target));
  }

  private async deleteEdgeWith(m: EntityManager, edgeId: string): Promise<void> {
    await m.getRepository(LifecycleEdge).delete({ id: edgeId });
  }

  async deleteEdge(edgeId: string): Promise<void> {
    const ds = await this.init();
    await this.deleteEdgeWith(ds.manager, edgeId);
  }

  /**
   * F038 交易一致性：於單一 DB 交易內執行結構寫入 ＋ recordStructuralChange（LIFECYCLE_CHANGE_LOG ＋
   * LIFECYCLE_SNAPSHOT）。work 拋錯 → 交易回滾（結構列亦不留）。
   */
  async runStructuralChange<T>(work: (tx: DagStructuralTx) => Promise<T>): Promise<T> {
    const ds = await this.init();
    return ds.transaction(async (m) => {
      const tx: DagStructuralTx = {
        createNode: (lc, input) => this.createNodeWith(m, lc, input),
        updateNode: (id, patch) => this.updateNodeWith(m, id, patch),
        deleteNodeWithEdges: (id) => this.deleteNodeWithEdgesWith(m, id),
        unmountNodeDocs: (id) => this.unmountNodeDocsWith(m, id),
        createEdge: (lc, s, t) => this.createEdgeWith(m, lc, s, t),
        deleteEdge: (id) => this.deleteEdgeWith(m, id),
        listNodes: (lc) => this.listNodesWith(m, lc),
        listEdges: (lc) => this.listEdgesWith(m, lc),
        nodeExists: (lc, id) => this.nodeExistsWith(m, lc, id),
        recordStructuralChange: (event) => recordStructuralChange(m, event),
      };
      return work(tx);
    });
  }
}
