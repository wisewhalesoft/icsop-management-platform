import { DataSource, EntityManager, In } from 'typeorm';
import { IcsopDocument } from '../database/entities/icsop-document.entity';
import { LifecycleNode } from '../database/entities/lifecycle-node.entity';
import { NodeDocsStore, NodeInfo, DocRef, DocLite, NodeMountedDoc } from './node-docs.store';
import { NodeDocsStructuralTx } from './lifecycle-structural-change';
import { recordStructuralChange } from './lifecycle-structural-recorder';

/** F009 節點抽屜 store 之 TypeORM 實作（跨 LIFECYCLE_NODE / ICSOP_DOCUMENT）。 */
export class TypeOrmNodeDocsStore implements NodeDocsStore {
  constructor(private readonly ds: DataSource) {}

  private async init(): Promise<DataSource> {
    if (!this.ds.isInitialized) await this.ds.initialize();
    return this.ds;
  }

  private async getNodeWith(
    m: EntityManager,
    lifecycleId: string,
    nodeId: string,
  ): Promise<NodeInfo | null> {
    const n = await m.getRepository(LifecycleNode).findOne({ where: { id: nodeId, lifecycleId } });
    return n ? { id: n.id, lifecycleId: n.lifecycleId, name: n.name } : null;
  }

  async getNode(lifecycleId: string, nodeId: string): Promise<NodeInfo | null> {
    const ds = await this.init();
    return this.getNodeWith(ds.manager, lifecycleId, nodeId);
  }

  private async listLifecycleDocsWith(m: EntityManager, lifecycleId: string): Promise<DocRef[]> {
    const rows = await m.getRepository(IcsopDocument).find({
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

  async listLifecycleDocs(lifecycleId: string): Promise<DocRef[]> {
    const ds = await this.init();
    return this.listLifecycleDocsWith(ds.manager, lifecycleId);
  }

  /** F036 節點文件清單：五欄全在 ICSOP_DOCUMENT 單表，一次查詢取全（§10.5 無 N+1）。 */
  async listNodeMountedDocs(lifecycleId: string, nodeId: string): Promise<NodeMountedDoc[]> {
    const ds = await this.init();
    const rows = await ds.manager.getRepository(IcsopDocument).find({
      where: { lifecycleId, nodeId },
      select: {
        id: true,
        documentNumber: true,
        documentName: true,
        edition: true,
        status: true,
        announcedDate: true,
      },
      order: { documentNumber: 'ASC' },
    });
    return rows.map((d) => ({
      id: d.id,
      documentNumber: d.documentNumber,
      documentName: d.documentName,
      edition: d.edition,
      status: d.status,
      announcedDate: d.announcedDate ? d.announcedDate.toISOString() : null,
    }));
  }

  /**
   * F036 子樹抽屜（架構決策 C2）：`listNodeMountedDocs` 之批次版——單次
   * `WHERE lifecycleId = :lc AND nodeId IN (:...ids)`（僅由 `=` 換 `IN`），非 N+1。
   * 空 ids → 直接回空 Map（不發查詢，亦避免 `IN ()` 之非法 SQL）。
   */
  async listNodesMountedDocs(
    lifecycleId: string,
    nodeIds: string[],
  ): Promise<Map<string, NodeMountedDoc[]>> {
    const map = new Map<string, NodeMountedDoc[]>();
    if (nodeIds.length === 0) return map;
    const ds = await this.init();
    const rows = await ds.manager.getRepository(IcsopDocument).find({
      where: { lifecycleId, nodeId: In(nodeIds) },
      select: {
        id: true,
        documentNumber: true,
        documentName: true,
        edition: true,
        status: true,
        announcedDate: true,
        nodeId: true,
      },
      order: { documentNumber: 'ASC' },
    });
    for (const d of rows) {
      if (!d.nodeId) continue;
      const list = map.get(d.nodeId) ?? [];
      list.push({
        id: d.id,
        documentNumber: d.documentNumber,
        documentName: d.documentName,
        edition: d.edition,
        status: d.status,
        announcedDate: d.announcedDate ? d.announcedDate.toISOString() : null,
      });
      map.set(d.nodeId, list);
    }
    return map;
  }

  private async getDocWith(m: EntityManager, docId: string): Promise<DocLite | null> {
    const d = await m.getRepository(IcsopDocument).findOne({
      where: { id: docId },
      select: { id: true, lifecycleId: true, nodeId: true },
    });
    return d ? { id: d.id, lifecycleId: d.lifecycleId, nodeId: d.nodeId } : null;
  }

  async getDoc(docId: string): Promise<DocLite | null> {
    const ds = await this.init();
    return this.getDocWith(ds.manager, docId);
  }

  private async setDocNodeWith(
    m: EntityManager,
    docId: string,
    nodeId: string | null,
  ): Promise<void> {
    await m.getRepository(IcsopDocument).update({ id: docId }, { nodeId, updatedAt: new Date() });
  }

  async setDocNode(docId: string, nodeId: string | null): Promise<void> {
    const ds = await this.init();
    await this.setDocNodeWith(ds.manager, docId, nodeId);
  }

  async nodeNames(nodeIds: string[]): Promise<Map<string, string | null>> {
    if (nodeIds.length === 0) return new Map();
    const ds = await this.init();
    const rows = await ds
      .getRepository(LifecycleNode)
      .find({ where: { id: In(nodeIds) }, select: { id: true, name: true } });
    return new Map(rows.map((n) => [n.id, n.name]));
  }

  /** G-LC-015：掛載於其他循環（nodeId 非空且 lifecycleId≠本循環）之文件數。 */
  async countDocsMountedInOtherLifecycles(lifecycleId: string): Promise<number> {
    const ds = await this.init();
    const cnt = await ds
      .getRepository(IcsopDocument)
      .createQueryBuilder('d')
      .where('d.nodeId IS NOT NULL')
      .andWhere('d.lifecycleId <> :lc', { lc: lifecycleId })
      .getCount();
    return cnt;
  }

  /**
   * F038 交易一致性：於單一 DB 交易內執行掛載/改派/移除 ＋ recordStructuralChange（LIFECYCLE_CHANGE_LOG
   * ＋ LIFECYCLE_SNAPSHOT）。work 拋錯 → 交易回滾（ICSOP_DOCUMENT.nodeId 變更亦不留）。
   */
  async runStructuralChange<T>(work: (tx: NodeDocsStructuralTx) => Promise<T>): Promise<T> {
    const ds = await this.init();
    return ds.transaction(async (m) => {
      const tx: NodeDocsStructuralTx = {
        getNode: (lc, id) => this.getNodeWith(m, lc, id),
        getDoc: (id) => this.getDocWith(m, id),
        listLifecycleDocs: (lc) => this.listLifecycleDocsWith(m, lc),
        setDocNode: (id, nodeId) => this.setDocNodeWith(m, id, nodeId),
        recordStructuralChange: (event) => recordStructuralChange(m, event),
      };
      return work(tx);
    });
  }
}
