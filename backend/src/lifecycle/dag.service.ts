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
  LifecycleChangedEvent,
  LifecycleEmitContext,
  NoopLifecycleChangePublisher,
} from './lifecycle-change-event';
import { DagStructuralTx } from './lifecycle-structural-change';

const NODE_LABEL = (name: string | null): string => name ?? '未命名節點';

/** DAG 結構寫入/查詢之最小操作面（DagStore 與交易內 DagStructuralTx 皆滿足）。 */
type DagMutationOps = Omit<DagStructuralTx, 'recordStructuralChange'>;

/**
 * 循環 DAG 節點/邊維護（F008）。成環防止於後端權威驗證（classifyEdge）。
 * 功能面 RBAC 由 controller guard（循環管理 write＝ICSOPAdmin）落實。
 *
 * F038 交易一致性（architecture-spec §5.9）：每次成功之結構變更（新增/刪除節點、改名、新增/刪除連線）
 * 與其 LIFECYCLE_CHANGE_LOG 事件 ＋ LIFECYCLE_SNAPSHOT 快照於**同一 DB 交易**內提交（store 提供
 * `runStructuralChange` 時）；任一失敗整批回滾——不留與結構不同步之快照/日誌（保護新舊樹重建正確性）。
 * store 未提供交易能力（純單元 fake）→ 退化為「結構寫入 + publisher.publish」循序路徑（行為不變、無快照）。
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

  private buildEvent(
    lifecycleId: string,
    changeType: LifecycleChangeType,
    summary: string,
    extra: {
      oldValue?: string | null;
      newValue?: string | null;
      nodeId?: string | null;
      actor?: LifecycleActor;
    } = {},
  ): LifecycleChangedEvent {
    return {
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
    };
  }

  /**
   * 結構變更之統一執行框架。`op` 執行結構寫入並回傳結果＋（選填）變更事件；框架依 store 能力二選一：
   *  - 原子路徑（store.runStructuralChange 存在）：op 於交易內執行，事件經 tx.recordStructuralChange
   *    與結構寫入同交易落地（含快照）；
   *  - 循序路徑（fallback）：op 於 store 直接執行，事件經 publisher.publish 落地（無快照）。
   * op 中途拋錯（如成環驗證）→ 原子路徑整批回滾、循序路徑不 publish（皆不留半套變更）。
   */
  private async runChange<T>(
    op: (m: DagMutationOps) => Promise<{ result: T; event: LifecycleChangedEvent | null }>,
  ): Promise<T> {
    if (this.store.runStructuralChange) {
      return this.store.runStructuralChange(async (tx) => {
        const { result, event } = await op(tx);
        if (event) await tx.recordStructuralChange(event);
        return result;
      });
    }
    const { result, event } = await op(this.store);
    if (event) await this.publisher.publish(event);
    return result;
  }

  private async namesOf(
    m: DagMutationOps,
    lifecycleId: string,
  ): Promise<Map<string, string | null>> {
    const nodes = await m.listNodes(lifecycleId);
    return new Map(nodes.map((n) => [n.id, n.name]));
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
    return this.runChange(async (m) => {
      const node = await m.createNode(lifecycleId, {
        name: input.name ?? null,
        positionX: input.positionX ?? 0,
        positionY: input.positionY ?? 0,
      });
      return {
        result: node,
        event: this.buildEvent(lifecycleId, 'NODE_ADDED', `新增節點『${NODE_LABEL(node.name)}』`, {
          newValue: node.name,
          nodeId: node.id,
          actor,
        }),
      };
    });
  }

  async updateNode(
    nodeId: string,
    patch: { name?: string | null; positionX?: number; positionY?: number },
    ctx: LifecycleEmitContext = {},
  ): Promise<NodeView> {
    return this.runChange(async (m) => {
      // 改名偵測：僅當 patch 觸及 name 時預讀舊名（位置拖曳＝佈局，非結構變更，不記事件/不記快照）。
      let oldName: string | null = null;
      if (patch.name !== undefined && ctx.lifecycleId) {
        oldName = (await m.listNodes(ctx.lifecycleId)).find((n) => n.id === nodeId)?.name ?? null;
      }
      const updated = await m.updateNode(nodeId, patch);
      const event =
        patch.name !== undefined && oldName !== updated.name
          ? this.buildEvent(
              updated.lifecycleId,
              'NODE_RENAMED',
              `節點改名『${NODE_LABEL(oldName)}』→『${NODE_LABEL(updated.name)}』`,
              { oldValue: oldName, newValue: updated.name, nodeId, actor: ctx.actor },
            )
          : null;
      return { result: updated, event };
    });
  }

  /**
   * 刪除節點：**先解除其文件掛載、再刪節點與邊**，同一交易內完成。
   *
   * 🔴 `ICSOP_DOCUMENT.nodeId` 對 `LIFECYCLE_NODE` 無 FK，若不解除掛載，被刪節點的文件會留下懸空
   * nodeId（孤兒掛載）——文件自畫布與樹狀圖消失，卻仍在他節點抽屜被判為「已掛載於其他節點」，
   * 觸發節點名空白的改派警示。解除筆數寫入 NODE_REMOVED 摘要，使此連動於變更歷程可追。
   */
  async deleteNode(nodeId: string, ctx: LifecycleEmitContext = {}): Promise<void> {
    await this.runChange<void>(async (m) => {
      let name: string | null = null;
      if (ctx.lifecycleId) {
        name = (await m.listNodes(ctx.lifecycleId)).find((n) => n.id === nodeId)?.name ?? null;
      }
      // 選填能力；未提供之 fake → 0（store 之 deleteNodeWithEdges 仍為權威解除點）。
      const unmounted = m.unmountNodeDocs ? await m.unmountNodeDocs(nodeId) : 0;
      await m.deleteNodeWithEdges(nodeId);
      const summary =
        unmounted > 0
          ? `移除節點『${NODE_LABEL(name)}』（含其連線，並解除 ${unmounted} 份文件掛載）`
          : `移除節點『${NODE_LABEL(name)}』（含其連線）`;
      const event = ctx.lifecycleId
        ? this.buildEvent(ctx.lifecycleId, 'NODE_REMOVED', summary, {
            oldValue: name,
            nodeId,
            actor: ctx.actor,
          })
        : null;
      return { result: undefined, event };
    });
  }

  /** 新增有向邊 source→target（F008 防環）。 */
  async addEdge(
    lifecycleId: string,
    source: string,
    target: string,
    actor?: LifecycleActor,
  ): Promise<EdgeRow> {
    return this.runChange(async (m) => {
      const [srcOk, tgtOk] = await Promise.all([
        m.nodeExists(lifecycleId, source),
        m.nodeExists(lifecycleId, target),
      ]);
      if (!srcOk || !tgtOk) throw new NotFoundException('NODE_NOT_FOUND');

      const edges = await m.listEdges(lifecycleId);
      const verdict = classifyEdge(edges, source, target);
      if (verdict === 'self-loop') throw new ConflictException('DAG_SELF_LOOP');
      if (verdict === 'cycle') throw new ConflictException('DAG_CYCLE_DETECTED');

      const edge = await m.createEdge(lifecycleId, source, target);
      const names = await this.namesOf(m, lifecycleId);
      return {
        result: edge,
        event: this.buildEvent(
          lifecycleId,
          'EDGE_ADDED',
          `新增連線 ${NODE_LABEL(names.get(source) ?? null)} → ${NODE_LABEL(names.get(target) ?? null)}`,
          { newValue: `${source}→${target}`, actor },
        ),
      };
    });
  }

  async deleteEdge(edgeId: string, ctx: LifecycleEmitContext = {}): Promise<void> {
    await this.runChange<void>(async (m) => {
      let summary = '移除連線';
      let removed: EdgeRow | undefined;
      if (ctx.lifecycleId) {
        const edges = await m.listEdges(ctx.lifecycleId);
        removed = edges.find((e) => e.id === edgeId);
        if (removed) {
          const names = await this.namesOf(m, ctx.lifecycleId);
          summary = `移除連線 ${NODE_LABEL(names.get(removed.sourceNodeId) ?? null)} → ${NODE_LABEL(names.get(removed.targetNodeId) ?? null)}`;
        }
      }
      await m.deleteEdge(edgeId);
      const event = ctx.lifecycleId
        ? this.buildEvent(ctx.lifecycleId, 'EDGE_REMOVED', summary, {
            oldValue: removed ? `${removed.sourceNodeId}→${removed.targetNodeId}` : null,
            actor: ctx.actor,
          })
        : null;
      return { result: undefined, event };
    });
  }
}
