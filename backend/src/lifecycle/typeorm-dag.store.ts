import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Lifecycle } from '../database/entities/lifecycle.entity';
import { LifecycleNode } from '../database/entities/lifecycle-node.entity';
import { LifecycleEdge } from '../database/entities/lifecycle-edge.entity';
import {
  DagStore,
  NodeView,
  EdgeRow,
  CreateNodeInput,
} from './dag.store';
import { classifyEdge } from './dag-cycle';

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

  async listNodes(lifecycleId: string): Promise<NodeView[]> {
    const ds = await this.init();
    const rows = await ds.getRepository(LifecycleNode).find({ where: { lifecycleId } });
    return rows.map(TypeOrmDagStore.toNode);
  }

  async listEdges(lifecycleId: string): Promise<EdgeRow[]> {
    const ds = await this.init();
    const rows = await ds.getRepository(LifecycleEdge).find({ where: { lifecycleId } });
    return rows.map((e) => ({
      id: e.id,
      sourceNodeId: e.sourceNodeId,
      targetNodeId: e.targetNodeId,
    }));
  }

  async nodeExists(lifecycleId: string, nodeId: string): Promise<boolean> {
    const ds = await this.init();
    return (
      (await ds
        .getRepository(LifecycleNode)
        .count({ where: { id: nodeId, lifecycleId } })) > 0
    );
  }

  async createNode(lifecycleId: string, input: CreateNodeInput): Promise<NodeView> {
    const ds = await this.init();
    const repo = ds.getRepository(LifecycleNode);
    const saved = await repo.save(repo.create({ lifecycleId, ...input }));
    return TypeOrmDagStore.toNode(saved);
  }

  async updateNode(
    nodeId: string,
    patch: { name?: string | null; positionX?: number; positionY?: number },
  ): Promise<NodeView> {
    const ds = await this.init();
    await ds.getRepository(LifecycleNode).update({ id: nodeId }, patch);
    const n = await ds.getRepository(LifecycleNode).findOneOrFail({ where: { id: nodeId } });
    return TypeOrmDagStore.toNode(n);
  }

  async deleteNodeWithEdges(nodeId: string): Promise<void> {
    const ds = await this.init();
    await ds.transaction(async (m) => {
      await m
        .getRepository(LifecycleEdge)
        .createQueryBuilder()
        .delete()
        .where('sourceNodeId = :id OR targetNodeId = :id', { id: nodeId })
        .execute();
      await m.getRepository(LifecycleNode).delete({ id: nodeId });
    });
  }

  async createEdge(
    lifecycleId: string,
    source: string,
    target: string,
  ): Promise<EdgeRow> {
    const ds = await this.init();
    return ds.transaction(async (m) => {
      const existing = await m
        .getRepository(LifecycleEdge)
        .find({ where: { lifecycleId } });
      const verdict = classifyEdge(
        existing.map((e) => ({ sourceNodeId: e.sourceNodeId, targetNodeId: e.targetNodeId })),
        source,
        target,
      );
      if (verdict === 'self-loop') throw new ConflictException('DAG_SELF_LOOP');
      if (verdict === 'cycle') throw new ConflictException('DAG_CYCLE_DETECTED');
      const repo = m.getRepository(LifecycleEdge);
      const saved = await repo.save(
        repo.create({ lifecycleId, sourceNodeId: source, targetNodeId: target }),
      );
      return {
        id: saved.id,
        sourceNodeId: saved.sourceNodeId,
        targetNodeId: saved.targetNodeId,
      };
    });
  }

  async deleteEdge(edgeId: string): Promise<void> {
    const ds = await this.init();
    await ds.getRepository(LifecycleEdge).delete({ id: edgeId });
  }
}
