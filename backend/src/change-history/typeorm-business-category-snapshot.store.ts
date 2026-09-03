import { DataSource } from 'typeorm';
import { BusinessCategorySnapshot } from '../database/entities/business-category-snapshot.entity';
import { SnapshotGraph } from '../lifecycle/lifecycle-snapshot-builder';
import {
  BusinessCategorySnapshotRecord,
  BusinessCategorySnapshotStore,
} from './business-category-snapshot.store';

/**
 * `BUSINESS_CATEGORY_SNAPSHOT` 之 TypeORM 實作（唯讀查詢；寫入於結構交易內以 `EntityManager`
 * 直接 insert）。`nodesJson`／`edgesJson` 反序列化為 `SnapshotGraph`。
 * 結構性不暴露 update／delete（append-only）。
 */
export class TypeOrmBusinessCategorySnapshotStore implements BusinessCategorySnapshotStore {
  constructor(private readonly ds: DataSource) {}

  private async init(): Promise<DataSource> {
    if (!this.ds.isInitialized) await this.ds.initialize();
    return this.ds;
  }

  private static toRecord(e: BusinessCategorySnapshot): BusinessCategorySnapshotRecord {
    const graph: SnapshotGraph = {
      nodes: JSON.parse(e.nodesJson),
      edges: JSON.parse(e.edgesJson),
    };
    return {
      id: e.id,
      businessCategoryId: e.businessCategoryId,
      changeLogId: e.changeLogId,
      graph,
      capturedAt: e.capturedAt,
    };
  }

  async findByChangeLogId(changeLogId: string): Promise<BusinessCategorySnapshotRecord | null> {
    const ds = await this.init();
    const e = await ds
      .getRepository(BusinessCategorySnapshot)
      .findOne({ where: { changeLogId } });
    return e ? TypeOrmBusinessCategorySnapshotStore.toRecord(e) : null;
  }

  async findById(id: string): Promise<BusinessCategorySnapshotRecord | null> {
    const ds = await this.init();
    const e = await ds.getRepository(BusinessCategorySnapshot).findOne({ where: { id } });
    return e ? TypeOrmBusinessCategorySnapshotStore.toRecord(e) : null;
  }
}
