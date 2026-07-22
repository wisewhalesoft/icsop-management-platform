import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NODE_DOCS_STORE, NodeDocsStore } from './node-docs.store';

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
 */
@Injectable()
export class NodeDocsService {
  constructor(@Inject(NODE_DOCS_STORE) private readonly store: NodeDocsStore) {}

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
  ): Promise<void> {
    const node = await this.store.getNode(lifecycleId, nodeId);
    if (!node) throw new NotFoundException('NODE_NOT_FOUND');
    const doc = await this.store.getDoc(docId);
    if (!doc) throw new NotFoundException('DOCUMENT_NOT_FOUND');
    if (doc.lifecycleId !== lifecycleId) {
      throw new ConflictException('NODE_DOC_LIFECYCLE_MISMATCH');
    }
    if (doc.nodeId === nodeId) return; // 已在本節點，no-op
    if (doc.nodeId && !confirm) {
      throw new ConflictException('NODE_DOC_ALREADY_ASSIGNED');
    }
    await this.store.setDocNode(docId, nodeId);
  }

  /** 移除掛載（該文件 nodeId 設為 null）。 */
  async unmount(lifecycleId: string, nodeId: string, docId: string): Promise<void> {
    const node = await this.store.getNode(lifecycleId, nodeId);
    if (!node) throw new NotFoundException('NODE_NOT_FOUND');
    await this.store.setDocNode(docId, null);
  }
}
