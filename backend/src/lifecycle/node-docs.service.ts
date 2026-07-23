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
  NoopLifecycleChangePublisher,
} from './lifecycle-change-event';

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
}

/**
 * F009 節點抽屜：文件掛載至節點（＝設 ICSOP_DOCUMENT.nodeId；一份文件僅屬一節點）。
 * 候選文件過濾為當前循環（後端）；已掛他節點須二次確認改派（NODE_DOC_ALREADY_ASSIGNED）。
 * 功能面 RBAC（循環管理 write＝ICSOPAdmin）由 controller guard 落實。
 *
 * F038：掛載/改派/移除文件於持久化後發出結構變更事件（DOCUMENT_MOUNTED／DOCUMENT_REASSIGNED／
 * DOCUMENT_UNMOUNTED）；預設 no-op（seam），changehistory 併回後落地為 LIFECYCLE_CHANGE_LOG。
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

  private async emit(
    lifecycleId: string,
    changeType: LifecycleChangeType,
    summary: string,
    nodeId: string | null,
    actor?: LifecycleActor,
  ): Promise<void> {
    await this.publisher.publish({
      lifecycleId,
      changeType,
      summary,
      nodeId,
      actorId: actor?.accountId ?? null,
      actorName: actor?.name ?? null,
      actorEmployeeNo: actor?.employeeNo ?? null,
      occurredAt: this.clock(),
    });
  }

  async getDrawer(lifecycleId: string, nodeId: string): Promise<DrawerData> {
    const node = await this.store.getNode(lifecycleId, nodeId);
    if (!node) throw new NotFoundException('NODE_NOT_FOUND');

    const docs = await this.store.listLifecycleDocs(lifecycleId);
    const mounted = docs.filter((d) => d.nodeId === nodeId);
    const candDocs = docs.filter((d) => d.nodeId !== nodeId);

    const otherNodeIds = [...new Set(candDocs.map((d) => d.nodeId).filter((v): v is string => !!v))];
    const names = await this.store.nodeNames(otherNodeIds);

    return {
      node: { id: node.id, name: node.name },
      mounted: mounted.map((d) => ({ id: d.id, documentNumber: d.documentNumber, documentName: d.documentName })),
      candidates: candDocs.map((d) => ({
        id: d.id,
        documentNumber: d.documentNumber,
        documentName: d.documentName,
        assignedNode: d.nodeId ? { id: d.nodeId, name: names.get(d.nodeId) ?? null } : null,
      })),
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
    const node = await this.store.getNode(lifecycleId, nodeId);
    if (!node) throw new NotFoundException('NODE_NOT_FOUND');
    const doc = await this.store.getDoc(docId);
    if (!doc) throw new NotFoundException('DOCUMENT_NOT_FOUND');
    if (doc.lifecycleId !== lifecycleId) {
      throw new ConflictException('NODE_DOC_LIFECYCLE_MISMATCH');
    }
    if (doc.nodeId === nodeId) return; // 已在本節點，no-op
    const reassigned = !!doc.nodeId;
    if (reassigned && !confirm) {
      throw new ConflictException('NODE_DOC_ALREADY_ASSIGNED');
    }
    await this.store.setDocNode(docId, nodeId);

    const label = await this.docLabel(lifecycleId, docId);
    if (reassigned) {
      await this.emit(
        lifecycleId,
        'DOCUMENT_REASSIGNED',
        `文件改派至節點『${node.name ?? '未命名節點'}』：${label}`,
        nodeId,
        actor,
      );
    } else {
      await this.emit(
        lifecycleId,
        'DOCUMENT_MOUNTED',
        `文件掛載至節點『${node.name ?? '未命名節點'}』：${label}`,
        nodeId,
        actor,
      );
    }
  }

  /** 移除掛載（該文件 nodeId 設為 null）。 */
  async unmount(
    lifecycleId: string,
    nodeId: string,
    docId: string,
    actor?: LifecycleActor,
  ): Promise<void> {
    const node = await this.store.getNode(lifecycleId, nodeId);
    if (!node) throw new NotFoundException('NODE_NOT_FOUND');
    const label = await this.docLabel(lifecycleId, docId);
    await this.store.setDocNode(docId, null);
    await this.emit(
      lifecycleId,
      'DOCUMENT_UNMOUNTED',
      `文件自節點『${node.name ?? '未命名節點'}』移除掛載：${label}`,
      nodeId,
      actor,
    );
  }

  /** 文件顯示標籤（編號 書名）；查無則回文件 id（不阻斷主流程）。 */
  private async docLabel(lifecycleId: string, docId: string): Promise<string> {
    const d = (await this.store.listLifecycleDocs(lifecycleId)).find((x) => x.id === docId);
    return d ? `${d.documentNumber} ${d.documentName}` : docId;
  }
}
