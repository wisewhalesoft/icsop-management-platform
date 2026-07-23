import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { DAG_STORE, DagStore, NodeView, EdgeRow, DagGraph } from './dag.store';
import { classifyEdge } from './dag-cycle';
import {
  LIFECYCLE_CHANGE_PUBLISHER,
  LifecycleActor,
  LifecycleChangePublisher,
  LifecycleChangeType,
  LifecycleEmitContext,
  NoopLifecycleChangePublisher,
} from './lifecycle-change-event';

const NODE_LABEL = (name: string | null): string => name ?? '未命名節點';

/**
 * 循環 DAG 節點/邊維護（F008）。成環防止於後端權威驗證（classifyEdge）。
 * 功能面 RBAC 由 controller guard（循環管理 write＝ICSOPAdmin）落實。
 *
 * F038：每次成功之結構變更（新增/刪除節點、改名、新增/刪除連線）於持久化後發出 LifecycleChangedEvent；
 * 預設 no-op（seam），changehistory 併回後由真實 publisher 落地為 LIFECYCLE_CHANGE_LOG。
 */
@Injectable()
export class DagService {
  private readonly publisher: LifecycleChangePublisher;

  constructor(
    @Inject(DAG_STORE) private readonly store: DagStore,
    @Optional()
    @Inject(LIFECYCLE_CHANGE_PUBLISHER)
    publisher?: LifecycleChangePublisher,
    @Optional() private readonly clock: () => Date = () => new Date(),
  ) {
    this.publisher = publisher ?? new NoopLifecycleChangePublisher();
  }

  private async emit(
    lifecycleId: string,
    changeType: LifecycleChangeType,
    summary: string,
    extra: {
      oldValue?: string | null;
      newValue?: string | null;
      nodeId?: string | null;
      actor?: LifecycleActor;
    } = {},
  ): Promise<void> {
    await this.publisher.publish({
      lifecycleId,
      changeType,
      summary,
      oldValue: extra.oldValue ?? null,
      newValue: extra.newValue ?? null,
      nodeId: extra.nodeId ?? null,
      actorId: extra.actor?.accountId ?? null,
      actorName: extra.actor?.name ?? null,
      actorEmployeeNo: extra.actor?.employeeNo ?? null,
      occurredAt: this.clock(),
    });
  }

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

  async addNode(
    lifecycleId: string,
    input: { name?: string | null; positionX?: number; positionY?: number },
    actor?: LifecycleActor,
  ): Promise<NodeView> {
    const node = await this.store.createNode(lifecycleId, {
      name: input.name ?? null,
      positionX: input.positionX ?? 0,
      positionY: input.positionY ?? 0,
    });
    await this.emit(lifecycleId, 'NODE_ADDED', `新增節點『${NODE_LABEL(node.name)}』`, {
      newValue: node.name,
      nodeId: node.id,
      actor,
    });
    return node;
  }

  async updateNode(
    nodeId: string,
    patch: { name?: string | null; positionX?: number; positionY?: number },
    ctx: LifecycleEmitContext = {},
  ): Promise<NodeView> {
    // 改名偵測：僅當 patch 觸及 name 時預讀舊名（位置拖曳＝佈局，非結構變更，不記事件）。
    let oldName: string | null = null;
    if (patch.name !== undefined && ctx.lifecycleId) {
      const before = (await this.store.listNodes(ctx.lifecycleId)).find(
        (n) => n.id === nodeId,
      );
      oldName = before?.name ?? null;
    }
    const updated = await this.store.updateNode(nodeId, patch);
    if (patch.name !== undefined && oldName !== updated.name) {
      await this.emit(
        updated.lifecycleId,
        'NODE_RENAMED',
        `節點改名『${NODE_LABEL(oldName)}』→『${NODE_LABEL(updated.name)}』`,
        { oldValue: oldName, newValue: updated.name, nodeId, actor: ctx.actor },
      );
    }
    return updated;
  }

  async deleteNode(nodeId: string, ctx: LifecycleEmitContext = {}): Promise<void> {
    let name: string | null = null;
    if (ctx.lifecycleId) {
      name =
        (await this.store.listNodes(ctx.lifecycleId)).find((n) => n.id === nodeId)
          ?.name ?? null;
    }
    await this.store.deleteNodeWithEdges(nodeId);
    if (ctx.lifecycleId) {
      await this.emit(
        ctx.lifecycleId,
        'NODE_REMOVED',
        `移除節點『${NODE_LABEL(name)}』（含其連線）`,
        { oldValue: name, nodeId, actor: ctx.actor },
      );
    }
  }

  /** 新增有向邊 source→target（F008 防環）。 */
  async addEdge(
    lifecycleId: string,
    source: string,
    target: string,
    actor?: LifecycleActor,
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

    const edge = await this.store.createEdge(lifecycleId, source, target);
    const names = await this.nodeNameMap(lifecycleId);
    await this.emit(
      lifecycleId,
      'EDGE_ADDED',
      `新增連線 ${NODE_LABEL(names.get(source) ?? null)} → ${NODE_LABEL(names.get(target) ?? null)}`,
      { newValue: `${source}→${target}`, actor },
    );
    return edge;
  }

  async deleteEdge(edgeId: string, ctx: LifecycleEmitContext = {}): Promise<void> {
    let summary = '移除連線';
    let removed: EdgeRow | undefined;
    if (ctx.lifecycleId) {
      const edges = await this.store.listEdges(ctx.lifecycleId);
      removed = edges.find((e) => e.id === edgeId);
      if (removed) {
        const names = await this.nodeNameMap(ctx.lifecycleId);
        summary = `移除連線 ${NODE_LABEL(names.get(removed.sourceNodeId) ?? null)} → ${NODE_LABEL(names.get(removed.targetNodeId) ?? null)}`;
      }
    }
    await this.store.deleteEdge(edgeId);
    if (ctx.lifecycleId) {
      await this.emit(ctx.lifecycleId, 'EDGE_REMOVED', summary, {
        oldValue: removed ? `${removed.sourceNodeId}→${removed.targetNodeId}` : null,
        actor: ctx.actor,
      });
    }
  }

  private async nodeNameMap(lifecycleId: string): Promise<Map<string, string | null>> {
    const nodes = await this.store.listNodes(lifecycleId);
    return new Map(nodes.map((n) => [n.id, n.name]));
  }
}
