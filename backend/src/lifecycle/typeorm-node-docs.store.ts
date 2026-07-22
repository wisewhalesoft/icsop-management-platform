import { DataSource, In } from 'typeorm';
import { IcsopDocument } from '../database/entities/icsop-document.entity';
import { LifecycleNode } from '../database/entities/lifecycle-node.entity';
import { NodeDocsStore, NodeInfo, DocRef, DocLite } from './node-docs.store';

/** F009 節點抽屜 store 之 TypeORM 實作（跨 LIFECYCLE_NODE / ICSOP_DOCUMENT）。 */
export class TypeOrmNodeDocsStore implements NodeDocsStore {
  constructor(private readonly ds: DataSource) {}

  private async init(): Promise<DataSource> {
    if (!this.ds.isInitialized) await this.ds.initialize();
    return this.ds;
  }

  async getNode(lifecycleId: string, nodeId: string): Promise<NodeInfo | null> {
    const ds = await this.init();
    const n = await ds
      .getRepository(LifecycleNode)
      .findOne({ where: { id: nodeId, lifecycleId } });
    return n ? { id: n.id, lifecycleId: n.lifecycleId, name: n.name } : null;
  }

  async listLifecycleDocs(lifecycleId: string): Promise<DocRef[]> {
    const ds = await this.init();
    const rows = await ds.getRepository(IcsopDocument).find({
      where: { lifecycleId },
      select: { id: true, documentNumber: true, documentName: true, nodeId: true },
      order: { documentNumber: 'ASC' },
    });
    return rows.map((d) => ({
      id: d.id,
      documentNumber: d.documentNumber,
      documentName: d.documentName,
      nodeId: d.nodeId,
    }));
  }

  async getDoc(docId: string): Promise<DocLite | null> {
    const ds = await this.init();
    const d = await ds.getRepository(IcsopDocument).findOne({
      where: { id: docId },
      select: { id: true, lifecycleId: true, nodeId: true },
    });
    return d ? { id: d.id, lifecycleId: d.lifecycleId, nodeId: d.nodeId } : null;
  }

  async setDocNode(docId: string, nodeId: string | null): Promise<void> {
    const ds = await this.init();
    await ds
      .getRepository(IcsopDocument)
      .update({ id: docId }, { nodeId, updatedAt: new Date() });
  }

  async nodeNames(nodeIds: string[]): Promise<Map<string, string | null>> {
    if (nodeIds.length === 0) return new Map();
    const ds = await this.init();
    const rows = await ds
      .getRepository(LifecycleNode)
      .find({ where: { id: In(nodeIds) }, select: { id: true, name: true } });
    return new Map(rows.map((n) => [n.id, n.name]));
  }
}
