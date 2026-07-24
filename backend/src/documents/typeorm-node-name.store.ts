import { DataSource } from 'typeorm';
import { LifecycleNode } from '../database/entities/lifecycle-node.entity';
import { NodeNameStore } from './node-name.store';

/**
 * NodeNameStore 之 TypeORM 實作：讀 LIFECYCLE_NODE.name（AppDataSource 單例、延遲初始化）。
 * 僅讀取單欄，不引入 lifecycle 模組（反循環）。
 */
export class TypeOrmNodeNameStore implements NodeNameStore {
  constructor(private readonly ds: DataSource) {}

  private async init(): Promise<DataSource> {
    if (!this.ds.isInitialized) await this.ds.initialize();
    return this.ds;
  }

  async findNameById(nodeId: string): Promise<string | null> {
    const ds = await this.init();
    const node = await ds
      .getRepository(LifecycleNode)
      .findOne({ where: { id: nodeId }, select: { id: true, name: true } });
    return node ? node.name : null;
  }
}
