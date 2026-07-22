import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DAG_STORE, DagStore, NodeView, EdgeRow, DagGraph } from './dag.store';
import { classifyEdge } from './dag-cycle';

/**
 * 循環 DAG 節點/邊維護（F008）。成環防止於後端權威驗證（classifyEdge）。
 * 功能面 RBAC 由 controller guard（循環管理 write＝ICSOPAdmin）落實。
 */
@Injectable()
export class DagService {
  constructor(@Inject(DAG_STORE) private readonly store: DagStore) {}

  async getGraph(lifecycleId: string): Promise<DagGraph> {
    if (!(await this.store.lifecycleExists(lifecycleId))) {
      throw new NotFoundException('LIFECYCLE_NOT_FOUND');
    }
    const [nodes, edges] = await Promise.all([
      this.store.listNodes(lifecycleId),
      this.store.listEdges(lifecycleId),
    ]);
    return { nodes, edges };
  }

  addNode(
    lifecycleId: string,
    input: { name?: string | null; positionX?: number; positionY?: number },
  ): Promise<NodeView> {
    return this.store.createNode(lifecycleId, {
      name: input.name ?? null,
      positionX: input.positionX ?? 0,
      positionY: input.positionY ?? 0,
    });
  }

  updateNode(
    nodeId: string,
    patch: { name?: string | null; positionX?: number; positionY?: number },
  ): Promise<NodeView> {
    return this.store.updateNode(nodeId, patch);
  }

  deleteNode(nodeId: string): Promise<void> {
    return this.store.deleteNodeWithEdges(nodeId);
  }

  /** 新增有向邊 source→target（F008 防環）。 */
  async addEdge(
    lifecycleId: string,
    source: string,
    target: string,
  ): Promise<EdgeRow> {
    const [srcOk, tgtOk] = await Promise.all([
      this.store.nodeExists(lifecycleId, source),
      this.store.nodeExists(lifecycleId, target),
    ]);
    if (!srcOk || !tgtOk) throw new NotFoundException('NODE_NOT_FOUND');

    const edges = await this.store.listEdges(lifecycleId);
    const verdict = classifyEdge(edges, source, target);
    if (verdict === 'self-loop') throw new ConflictException('DAG_SELF_LOOP');
    if (verdict === 'cycle') throw new ConflictException('DAG_CYCLE_DETECTED');

    return this.store.createEdge(lifecycleId, source, target);
  }

  deleteEdge(edgeId: string): Promise<void> {
    return this.store.deleteEdge(edgeId);
  }
}
