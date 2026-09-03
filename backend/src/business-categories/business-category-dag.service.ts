import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { classifyEdge } from '../lifecycle/dag-cycle';
import {
  BUSINESS_CATEGORY_DAG_STORE,
  BusinessCategoryDagStore,
  BusinessCategoryEdgeRow,
  BusinessCategoryGraph,
  BusinessCategoryNodeView,
} from './business-category-dag.store';
import {
  BUSINESS_CATEGORY_CHANGE_PUBLISHER,
  BusinessCategoryActor,
  BusinessCategoryChangePublisher,
  BusinessCategoryChangeType,
  BusinessCategoryChangedEvent,
  BusinessCategoryEmitContext,
  NoopBusinessCategoryChangePublisher,
} from './business-category-change-event';
import { BusinessCategoryDagStructuralTx } from './business-category-structural-change';

const NODE_LABEL = (name: string | null): string => name ?? '未命名節點';

/** 結構寫入／查詢之最小操作面（store 與交易內 Tx 皆滿足）。 */
type BusinessCategoryDagMutationOps = Omit<
  BusinessCategoryDagStructuralTx,
  'recordStructuralChange'
>;

/**
 * F043 §乙 業務/功能類別 DAG 節點／邊維護。
 *
 * 🔴 **決策 E2（`AC-16`）：共用的是演算法、不是錯誤碼**——防環判定直接呼叫既有
 * `../lifecycle/dag-cycle` 之 `classifyEdge`（**不複製第二份**），而 `classifyEdge` 回傳的是
 * **抽象判定結果**（`'ok'|'self-loop'|'cycle'`）、不是錯誤碼；`BUSINESS_CATEGORY_SELF_LOOP`／
 * `BUSINESS_CATEGORY_CYCLE_DETECTED` 之對映**完全在本服務內部**完成。
 * 🔴 **明文不得沿用** `DAG_SELF_LOOP`／`DAG_CYCLE_DETECTED`：該兩碼之使用者訊息含「此連線會造成
 * **循環結構**成環」——「循環」在本系統是 `LIFECYCLE` 已佔用之專有名詞，沿用會使本畫布上的錯誤
 * 訊息指向一個使用者根本沒在編輯的東西。
 *
 * `AC-17` 後端權威：即使前端已預覽為合法，仍於交易內以當下邊集合重新判定（防跨請求競態）。
 *
 * 交易一致性（§戊 `AC-38`）：store 提供 `runStructuralChange` 時走原子路徑（結構寫入 ＋
 * CHANGE_LOG ＋ SNAPSHOT 同交易）；未提供之 fake → 退化為「結構寫入 ＋ publisher.publish」。
 */
@Injectable()
export class BusinessCategoryDagService {
  private readonly publisher: BusinessCategoryChangePublisher;

  constructor(
    @Inject(BUSINESS_CATEGORY_DAG_STORE) private readonly store: BusinessCategoryDagStore,
    @Optional()
    @Inject(BUSINESS_CATEGORY_CHANGE_PUBLISHER)
    publisher?: BusinessCategoryChangePublisher,
    @Optional() private readonly clock: () => Date = () => new Date(),
  ) {
    this.publisher = publisher ?? new NoopBusinessCategoryChangePublisher();
  }

  private buildEvent(
    businessCategoryId: string,
    changeType: BusinessCategoryChangeType,
    summary: string,
    extra: {
      oldValue?: string | null;
      newValue?: string | null;
      nodeId?: string | null;
      actor?: BusinessCategoryActor;
    } = {},
  ): BusinessCategoryChangedEvent {
    return {
      businessCategoryId,
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
   * 結構變更之統一執行框架（比照既有 `DagService.runChange`）。`op` 於交易內或直接於 store 執行，
   * 中途拋錯（如成環驗證）→ 原子路徑整批回滾、循序路徑不 publish（皆不留半套變更）。
   */
  private async runChange<T>(
    op: (
      m: BusinessCategoryDagMutationOps,
    ) => Promise<{ result: T; event: BusinessCategoryChangedEvent | null }>,
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
    m: BusinessCategoryDagMutationOps,
    businessCategoryId: string,
  ): Promise<Map<string, string | null>> {
    const nodes = await m.listNodes(businessCategoryId);
    return new Map(nodes.map((n) => [n.id, n.name]));
  }

  async getGraph(businessCategoryId: string): Promise<BusinessCategoryGraph> {
    if (!(await this.store.businessCategoryExists(businessCategoryId))) {
      throw new NotFoundException('BUSINESS_CATEGORY_NOT_FOUND');
    }
    const [nodes, edges] = await Promise.all([
      this.store.listNodes(businessCategoryId),
      this.store.listEdges(businessCategoryId),
    ]);
    return { nodes, edges };
  }

  /** `AC-15`：新增節點（含座標；名稱可留白＝未命名節點）。 */
  async addNode(
    businessCategoryId: string,
    input: { name?: string | null; positionX?: number; positionY?: number },
    actor?: BusinessCategoryActor,
  ): Promise<BusinessCategoryNodeView> {
    return this.runChange(async (m) => {
      const node = await m.createNode(businessCategoryId, {
        name: input.name ?? null,
        positionX: input.positionX ?? 0,
        positionY: input.positionY ?? 0,
      });
      return {
        result: node,
        event: this.buildEvent(
          businessCategoryId,
          'NODE_ADDED',
          `新增節點『${NODE_LABEL(node.name)}』`,
          { newValue: node.name, nodeId: node.id, actor },
        ),
      };
    });
  }

  /** `AC-19`：節點改名（拖曳位置＝佈局，非結構變更 ⇒ 不記事件／不記快照）。 */
  async updateNode(
    nodeId: string,
    patch: { name?: string | null; positionX?: number; positionY?: number },
    ctx: BusinessCategoryEmitContext = {},
  ): Promise<BusinessCategoryNodeView> {
    return this.runChange(async (m) => {
      let oldName: string | null = null;
      if (patch.name !== undefined && ctx.businessCategoryId) {
        oldName =
          (await m.listNodes(ctx.businessCategoryId)).find((n) => n.id === nodeId)?.name ?? null;
      }
      const updated = await m.updateNode(nodeId, patch);
      const event =
        patch.name !== undefined && oldName !== updated.name
          ? this.buildEvent(
              updated.businessCategoryId,
              'NODE_RENAMED',
              `節點改名『${NODE_LABEL(oldName)}』→『${NODE_LABEL(updated.name)}』`,
              { oldValue: oldName, newValue: updated.name, nodeId, actor: ctx.actor },
            )
          : null;
      return { result: updated, event };
    });
  }

  /**
   * `AC-18` 之**刪除前**計數：「刪除後將一併移除 {N} 筆掛載關係」之來源。
   *
   * 🔴 這是一個**主動查詢**、不是事後比對——決策 E8 之所以在 `nodeId` 側不用 FK CASCADE，
   * 正是因為 FK 無法提供這個時序（二次確認必須發生在刪除之前）。
   */
  async countNodeMounts(nodeId: string): Promise<number> {
    return this.store.countNodeMounts(nodeId);
  }

  /**
   * `AC-18`：刪除節點——同一交易內刪除節點、其全部相關邊，**與其全部掛載列**
   * （後者由 store 之 TypeORM 實作於同交易內顯式 DELETE，決策 E8）。
   */
  async deleteNode(nodeId: string, ctx: BusinessCategoryEmitContext = {}): Promise<void> {
    await this.runChange<void>(async (m) => {
      let name: string | null = null;
      if (ctx.businessCategoryId) {
        name =
          (await m.listNodes(ctx.businessCategoryId)).find((n) => n.id === nodeId)?.name ?? null;
      }
      // 刪除前取得掛載數（供變更歷程摘要；與前端二次確認提示同一個數字來源）。
      const mounts = await m.countNodeMounts(nodeId);
      await m.deleteNodeWithEdges(nodeId);
      const summary =
        mounts > 0
          ? `移除節點『${NODE_LABEL(name)}』（含其連線，並移除 ${mounts} 筆掛載關係）`
          : `移除節點『${NODE_LABEL(name)}』（含其連線）`;
      const event = ctx.businessCategoryId
        ? this.buildEvent(ctx.businessCategoryId, 'NODE_REMOVED', summary, {
            oldValue: name,
            nodeId,
            actor: ctx.actor,
          })
        : null;
      return { result: undefined, event };
    });
  }

  /**
   * `AC-15`／`AC-16`／`AC-17`：新增有向邊 source→target。
   * 節點可有多個 parent／多個 child（DAG，非樹）——唯一被拒的是自我連線與成環。
   */
  async addEdge(
    businessCategoryId: string,
    source: string,
    target: string,
    actor?: BusinessCategoryActor,
  ): Promise<BusinessCategoryEdgeRow> {
    return this.runChange(async (m) => {
      const [srcOk, tgtOk] = await Promise.all([
        m.nodeExists(businessCategoryId, source),
        m.nodeExists(businessCategoryId, target),
      ]);
      if (!srcOk || !tgtOk) throw new NotFoundException('BUSINESS_CATEGORY_NODE_NOT_FOUND');

      const edges = await m.listEdges(businessCategoryId);
      // 🔴 決策 E2：共用既有純函式；對映在此完成（見檔頭）。
      const verdict = classifyEdge(edges, source, target);
      if (verdict === 'self-loop') throw new ConflictException('BUSINESS_CATEGORY_SELF_LOOP');
      if (verdict === 'cycle') throw new ConflictException('BUSINESS_CATEGORY_CYCLE_DETECTED');

      const edge = await m.createEdge(businessCategoryId, source, target);
      const names = await this.namesOf(m, businessCategoryId);
      return {
        result: edge,
        event: this.buildEvent(
          businessCategoryId,
          'EDGE_ADDED',
          `新增連線 ${NODE_LABEL(names.get(source) ?? null)} → ${NODE_LABEL(
            names.get(target) ?? null,
          )}`,
          { newValue: `${source}→${target}`, actor },
        ),
      };
    });
  }

  async deleteEdge(edgeId: string, ctx: BusinessCategoryEmitContext = {}): Promise<void> {
    await this.runChange<void>(async (m) => {
      let summary = '移除連線';
      let removed: BusinessCategoryEdgeRow | undefined;
      if (ctx.businessCategoryId) {
        const edges = await m.listEdges(ctx.businessCategoryId);
        removed = edges.find((e) => e.id === edgeId);
        if (removed) {
          const names = await this.namesOf(m, ctx.businessCategoryId);
          summary = `移除連線 ${NODE_LABEL(names.get(removed.sourceNodeId) ?? null)} → ${NODE_LABEL(
            names.get(removed.targetNodeId) ?? null,
          )}`;
        }
      }
      await m.deleteEdge(edgeId);
      const event = ctx.businessCategoryId
        ? this.buildEvent(ctx.businessCategoryId, 'EDGE_REMOVED', summary, {
            oldValue: removed ? `${removed.sourceNodeId}→${removed.targetNodeId}` : null,
            actor: ctx.actor,
          })
        : null;
      return { result: undefined, event };
    });
  }
}
