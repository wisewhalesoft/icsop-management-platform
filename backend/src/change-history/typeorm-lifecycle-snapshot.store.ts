import { DataSource } from 'typeorm';
import { LifecycleSnapshot } from '../database/entities/lifecycle-snapshot.entity';
import { SnapshotGraph } from '../lifecycle/lifecycle-snapshot-builder';
import {
  LifecycleSnapshotRecord,
  LifecycleSnapshotStore,
} from './lifecycle-snapshot.store';

/**
 * LIFECYCLE_SNAPSHOT 之 TypeORM 實作（唯讀查詢；寫入於結構交易內以 EntityManager 直接 insert）。
 * nodesJson/edgesJson 反序列化為 SnapshotGraph。結構性不暴露 update/delete（append-only）。
 */
export class TypeOrmLifecycleSnapshotStore implements LifecycleSnapshotStore {
  constructor(private readonly ds: DataSource) {}

  private async init(): Promise<DataSource> {
    if (!this.ds.isInitialized) await this.ds.initialize();
    return this.ds;
  }

  private static toRecord(e: LifecycleSnapshot): LifecycleSnapshotRecord {
    const graph: SnapshotGraph = {
      nodes: JSON.parse(e.nodesJson),
      edges: JSON.parse(e.edgesJson),
    };
    return {
      id: e.id,
      lifecycleId: e.lifecycleId,
      changeLogId: e.changeLogId,
      graph,
      capturedAt: e.capturedAt,
    };
  }

  async findByChangeLogId(changeLogId: string): Promise<LifecycleSnapshotRecord | null> {
    const ds = await this.init();
    const e = await ds.getRepository(LifecycleSnapshot).findOne({ where: { changeLogId } });
    return e ? TypeOrmLifecycleSnapshotStore.toRecord(e) : null;
  }

  async findById(id: string): Promise<LifecycleSnapshotRecord | null> {
    const ds = await this.init();
    const e = await ds.getRepository(LifecycleSnapshot).findOne({ where: { id } });
    return e ? TypeOrmLifecycleSnapshotStore.toRecord(e) : null;
  }
}
