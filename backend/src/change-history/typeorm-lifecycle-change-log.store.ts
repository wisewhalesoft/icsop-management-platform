import { DataSource } from 'typeorm';
import { LifecycleChangeLog } from '../database/entities/lifecycle-change-log.entity';
import {
  LifecycleChangeLogRow,
  LifecycleChangeLogStore,
} from './lifecycle-change-log.store';

/**
 * LIFECYCLE_CHANGE_LOG 之 TypeORM 實作（append-only）。
 * ⚠ 結構性不可竄改：僅 append/listAll/listByLifecycle。
 */
export class TypeOrmLifecycleChangeLogStore implements LifecycleChangeLogStore {
  constructor(private readonly ds: DataSource) {}

  private async init(): Promise<DataSource> {
    if (!this.ds.isInitialized) await this.ds.initialize();
    return this.ds;
  }

  private static toRow(e: LifecycleChangeLog): LifecycleChangeLogRow {
    return {
      id: e.id,
      lifecycleId: e.lifecycleId,
      changeType: e.changeType,
      summary: e.summary,
      oldValue: e.oldValue,
      newValue: e.newValue,
      nodeId: e.nodeId,
      actorId: e.actorId,
      actorName: e.actorName,
      actorEmployeeNo: e.actorEmployeeNo,
      occurredAt: e.occurredAt,
    };
  }

  async append(row: LifecycleChangeLogRow): Promise<void> {
    const ds = await this.init();
    await ds.getRepository(LifecycleChangeLog).insert({ ...row });
  }

  async listAll(): Promise<LifecycleChangeLogRow[]> {
    const ds = await this.init();
    const rows = await ds
      .getRepository(LifecycleChangeLog)
      .find({ order: { occurredAt: 'DESC' } });
    return rows.map(TypeOrmLifecycleChangeLogStore.toRow);
  }

  async listByLifecycle(lifecycleId: string): Promise<LifecycleChangeLogRow[]> {
    const ds = await this.init();
    const rows = await ds
      .getRepository(LifecycleChangeLog)
      .find({ where: { lifecycleId }, order: { occurredAt: 'DESC' } });
    return rows.map(TypeOrmLifecycleChangeLogStore.toRow);
  }
}
