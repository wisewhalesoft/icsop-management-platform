import { DataSource, LessThan, SelectQueryBuilder } from 'typeorm';
import { LifecycleChangeLog } from '../database/entities/lifecycle-change-log.entity';
import {
  LifecycleChangeLogRow,
  LifecycleChangeLogStore,
} from './lifecycle-change-log.store';
import { LifecycleChangeFilters } from './lifecycle-change-query';
import { escapeLikeContains } from '../public/public-list';

/** `YYYY-MM-DD` → 當日 00:00:00（本地時間，與查詢層 `dayOf()` 之本地日界一致）。 */
function dayStart(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
}

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
      snapshotId: e.snapshotId ?? null,
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

  /** 匯出專用之 WHERE 建構——與 `filterLifecycleChanges()` 同一組條件，於 SQL 端下推。 */
  private static applyFilters(
    qb: SelectQueryBuilder<LifecycleChangeLog>,
    f: LifecycleChangeFilters,
  ): SelectQueryBuilder<LifecycleChangeLog> {
    if (f.lifecycleId) qb.andWhere('c.lifecycleId = :lifecycleId', { lifecycleId: f.lifecycleId });
    if (f.changeType) qb.andWhere('c.changeType = :changeType', { changeType: f.changeType });
    if (f.person) {
      const p = `%${escapeLikeContains(f.person)}%`;
      qb.andWhere('(c.actorName LIKE :p OR c.actorEmployeeNo LIKE :p)', { p });
    }
    if (f.from) qb.andWhere('c.occurredAt >= :from', { from: dayStart(f.from) });
    return qb;
  }

  /** 🔴 匯出之第一道：`COUNT(*)` 下推（超限即拒絕，完全不 SELECT 列）。 */
  async countByFilters(filters: LifecycleChangeFilters): Promise<number> {
    const ds = await this.init();
    const qb = ds.getRepository(LifecycleChangeLog).createQueryBuilder('c');
    return TypeOrmLifecycleChangeLogStore.applyFilters(qb, filters).getCount();
  }

  /** 🔴 匯出之第二道：同一組 WHERE ＋ `TOP take`（競態上界）。 */
  async listByFilters(
    filters: LifecycleChangeFilters,
    take: number,
  ): Promise<LifecycleChangeLogRow[]> {
    const ds = await this.init();
    const qb = ds
      .getRepository(LifecycleChangeLog)
      .createQueryBuilder('c')
      .orderBy('c.occurredAt', 'DESC')
      .take(take);
    const rows = await TypeOrmLifecycleChangeLogStore.applyFilters(qb, filters).getMany();
    return rows.map(TypeOrmLifecycleChangeLogStore.toRow);
  }

  async listByLifecycle(lifecycleId: string): Promise<LifecycleChangeLogRow[]> {
    const ds = await this.init();
    const rows = await ds
      .getRepository(LifecycleChangeLog)
      .find({ where: { lifecycleId }, order: { occurredAt: 'DESC' } });
    return rows.map(TypeOrmLifecycleChangeLogStore.toRow);
  }

  async findById(id: string): Promise<LifecycleChangeLogRow | null> {
    const ds = await this.init();
    const e = await ds.getRepository(LifecycleChangeLog).findOne({ where: { id } });
    return e ? TypeOrmLifecycleChangeLogStore.toRow(e) : null;
  }

  /** 取同 lifecycleId、occurredAt 嚴格早於 before 之最近一筆（§B 重建之「變更前」錨定）。 */
  async findPredecessor(
    lifecycleId: string,
    before: Date,
  ): Promise<LifecycleChangeLogRow | null> {
    const ds = await this.init();
    const e = await ds.getRepository(LifecycleChangeLog).findOne({
      where: { lifecycleId, occurredAt: LessThan(before) },
      order: { occurredAt: 'DESC' },
    });
    return e ? TypeOrmLifecycleChangeLogStore.toRow(e) : null;
  }
}
