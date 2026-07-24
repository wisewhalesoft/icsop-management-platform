import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { NODE_DOCS_STORE, NodeDocsStore } from './node-docs.store';
import {
  LIFECYCLE_CHANGE_PUBLISHER,
  LifecycleActor,
  LifecycleChangePublisher,
  LifecycleChangeType,
  LifecycleChangedEvent,
  NoopLifecycleChangePublisher,
} from './lifecycle-change-event';
import { NodeDocsStructuralTx } from './lifecycle-structural-change';

export interface DrawerDoc {
  id: string;
  documentNumber: string;
  documentName: string;
}
export interface DrawerCandidate extends DrawerDoc {
  assignedNode: { id: string; name: string | null } | null;
}
export interface DrawerData {
  node: { id: string; name: string | null };
  mounted: DrawerDoc[];
  candidates: DrawerCandidate[];
  /** G-LC-015 掛載於其他循環而排除於候選之文件數（候選過濾註記）。 */
  excludedCount: number;
}

/** 掛載/改派/移除之最小操作面（NodeDocsStore 與交易內 NodeDocsStructuralTx 皆滿足）。 */
type NodeDocsMutationOps = Omit<NodeDocsStructuralTx, 'recordStructuralChange'>;

/**
 * F009 節點抽屜：文件掛載至節點（＝設 ICSOP_DOCUMENT.nodeId；一份文件僅屬一節點）。
 * 候選文件過濾為當前循環（後端）；已掛他節點須二次確認改派（NODE_DOC_ALREADY_ASSIGNED）。
 * 功能面 RBAC（循環管理 write＝ICSOPAdmin）由 controller guard 落實。
 *
 * F038 交易一致性（architecture-spec §5.9）：掛載/改派/移除文件與其結構變更事件（DOCUMENT_MOUNTED／
 * DOCUMENT_REASSIGNED／DOCUMENT_UNMOUNTED）＋ LIFECYCLE_SNAPSHOT 於**同一 DB 交易**內提交（store 提供
 * runStructuralChange 時）；未提供之 fake → 退化循序路徑（行為不變、無快照）。
 */
@Injectable()
export class NodeDocsService {
  private readonly publisher: LifecycleChangePublisher;

  constructor(
    @Inject(NODE_DOCS_STORE) private readonly store: NodeDocsStore,
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
    nodeId: string | null,
    actor?: LifecycleActor,
  ): LifecycleChangedEvent {
    return {
      lifecycleId,
      changeType,
      summary,
      nodeId,
      actorId: actor?.accountId ?? null,
      actorName: actor?.name ?? null,
      actorEmployeeNo: actor?.employeeNo ?? null,
      occurredAt: this.clock(),
    };
  }

  /** 見 DagService.runChange：原子（交易＋快照）或循序（publisher）二選一。 */
  private async runChange<T>(
    op: (m: NodeDocsMutationOps) => Promise<{ result: T; event: LifecycleChangedEvent | null }>,
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

  async getDrawer(lifecycleId: string, nodeId: string): Promise<DrawerData> {
    const node = await this.store.getNode(lifecycleId, nodeId);
    if (!node) throw new NotFoundException('NODE_NOT_FOUND');

    const docs = await this.store.listLifecycleDocs(lifecycleId);
    const mounted = docs.filter((d) => d.nodeId === nodeId);
    const candDocs = docs.filter((d) => d.nodeId !== nodeId);

    const otherNodeIds = [...new Set(candDocs.map((d) => d.nodeId).filter((v): v is string => !!v))];
    const names = await this.store.nodeNames(otherNodeIds);

    // G-LC-015：掛載於其他循環而排除之文件數（選填能力；未提供之 fake → 0）。
    const excludedCount = this.store.countDocsMountedInOtherLifecycles
      ? await this.store.countDocsMountedInOtherLifecycles(lifecycleId)
      : 0;

    return {
      node: { id: node.id, name: node.name },
      mounted: mounted.map((d) => ({ id: d.id, documentNumber: d.documentNumber, documentName: d.documentName })),
      candidates: candDocs.map((d) => ({
        id: d.id,
        documentNumber: d.documentNumber,
        documentName: d.documentName,
        assignedNode: d.nodeId ? { id: d.nodeId, name: names.get(d.nodeId) ?? null } : null,
      })),
      excludedCount,
    };
  }

  /** 掛載文件至節點。confirm=true 允許自他節點改派。 */
  async mount(
    lifecycleId: string,
    nodeId: string,
    docId: string,
    confirm: boolean,
    actor?: LifecycleActor,
  ): Promise<void> {
    await this.runChange<void>(async (m) => {
      const node = await m.getNode(lifecycleId, nodeId);
      if (!node) throw new NotFoundException('NODE_NOT_FOUND');
      const doc = await m.getDoc(docId);
      if (!doc) throw new NotFoundException('DOCUMENT_NOT_FOUND');
      if (doc.lifecycleId !== lifecycleId) {
        throw new ConflictException('NODE_DOC_LIFECYCLE_MISMATCH');
      }
      if (doc.nodeId === nodeId) return { result: undefined, event: null }; // 已在本節點，no-op
      const reassigned = !!doc.nodeId;
      if (reassigned && !confirm) {
        throw new ConflictException('NODE_DOC_ALREADY_ASSIGNED');
      }
      await m.setDocNode(docId, nodeId);

      const label = await this.docLabel(m, lifecycleId, docId);
      const event = reassigned
        ? this.buildEvent(
            lifecycleId,
            'DOCUMENT_REASSIGNED',
            `文件改派至節點『${node.name ?? '未命名節點'}』：${label}`,
            nodeId,
            actor,
          )
        : this.buildEvent(
            lifecycleId,
            'DOCUMENT_MOUNTED',
            `文件掛載至節點『${node.name ?? '未命名節點'}』：${label}`,
            nodeId,
            actor,
          );
      return { result: undefined, event };
    });
  }

  /** 移除掛載（該文件 nodeId 設為 null）。 */
  async unmount(
    lifecycleId: string,
    nodeId: string,
    docId: string,
    actor?: LifecycleActor,
  ): Promise<void> {
    await this.runChange<void>(async (m) => {
      const node = await m.getNode(lifecycleId, nodeId);
      if (!node) throw new NotFoundException('NODE_NOT_FOUND');
      const label = await this.docLabel(m, lifecycleId, docId);
      await m.setDocNode(docId, null);
      const event = this.buildEvent(
        lifecycleId,
        'DOCUMENT_UNMOUNTED',
        `文件自節點『${node.name ?? '未命名節點'}』移除掛載：${label}`,
        nodeId,
        actor,
      );
      return { result: undefined, event };
    });
  }

  /** 文件顯示標籤（編號 書名）；查無則回文件 id（不阻斷主流程）。 */
  private async docLabel(
    m: NodeDocsMutationOps,
    lifecycleId: string,
    docId: string,
  ): Promise<string> {
    const d = (await m.listLifecycleDocs(lifecycleId)).find((x) => x.id === docId);
    return d ? `${d.documentNumber} ${d.documentName}` : docId;
  }
}
