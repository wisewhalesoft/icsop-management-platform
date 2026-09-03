import { DataSource, LessThan, SelectQueryBuilder } from 'typeorm';
import { BusinessCategoryChangeLog } from '../database/entities/business-category-change-log.entity';
import { BusinessCategoryChangeType } from '../business-categories/business-category-change-event';
import {
  BusinessCategoryChangeLogRow,
  BusinessCategoryChangeLogStore,
} from './business-category-change-log.store';
import { BusinessCategoryChangeFilters } from './business-category-change-query';
import { escapeLikeContains } from '../public/public-list';

/** `YYYY-MM-DD` → 當日 00:00:00（本地時間，與查詢層 `dayOf()` 之本地日界一致）。 */
function dayStart(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
}

/** `YYYY-MM-DD` → **隔日** 00:00:00（排他上界，使「含當日」語意與 `dayOf()` 一致）。 */
function nextDayStart(day: string): Date {
  const start = dayStart(day);
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1, 0, 0, 0, 0);
}

/**
 * `BUSINESS_CATEGORY_CHANGE_LOG` 之 TypeORM 實作（append-only）。
 * ⚠ 結構性不可竄改：僅 append／讀取，不暴露 update／delete。
 */
export class TypeOrmBusinessCategoryChangeLogStore implements BusinessCategoryChangeLogStore {
  constructor(private readonly ds: DataSource) {}

  private async init(): Promise<DataSource> {
    if (!this.ds.isInitialized) await this.ds.initialize();
    return this.ds;
  }

  private static toRow(e: BusinessCategoryChangeLog): BusinessCategoryChangeLogRow {
    return {
      id: e.id,
      businessCategoryId: e.businessCategoryId,
      changeType: e.changeType as BusinessCategoryChangeType,
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

  async append(row: BusinessCategoryChangeLogRow): Promise<void> {
    const ds = await this.init();
    // 🔴 逐欄顯式（非 `repo.create()`）：`create()` 會靜默丟掉非 entity property 名之鍵，
    // 而 append-only 表寫入一次就沒有第二次機會發現值人間蒸發。
    await ds.getRepository(BusinessCategoryChangeLog).insert({
      id: row.id,
      businessCategoryId: row.businessCategoryId,
      changeType: row.changeType,
      summary: row.summary,
      oldValue: row.oldValue,
      newValue: row.newValue,
      nodeId: row.nodeId,
      actorId: row.actorId,
      actorName: row.actorName,
      actorEmployeeNo: row.actorEmployeeNo,
      occurredAt: row.occurredAt,
      snapshotId: row.snapshotId ?? null,
    });
  }

  async listAll(): Promise<BusinessCategoryChangeLogRow[]> {
    const ds = await this.init();
    const rows = await ds
      .getRepository(BusinessCategoryChangeLog)
      .find({ order: { occurredAt: 'DESC' } });
    return rows.map(TypeOrmBusinessCategoryChangeLogStore.toRow);
  }

  /** 匯出專用之 WHERE 建構——與 `filterBusinessCategoryChanges()` 同一組條件，於 SQL 端下推。 */
  private static applyFilters(
    qb: SelectQueryBuilder<BusinessCategoryChangeLog>,
    f: BusinessCategoryChangeFilters,
  ): SelectQueryBuilder<BusinessCategoryChangeLog> {
    if (f.businessCategoryId) {
      qb.andWhere('c.businessCategoryId = :businessCategoryId', {
        businessCategoryId: f.businessCategoryId,
      });
    }
    if (f.changeType) qb.andWhere('c.changeType = :changeType', { changeType: f.changeType });
    if (f.person) {
      const p = `%${escapeLikeContains(f.person)}%`;
      qb.andWhere('(c.actorName LIKE :p OR c.actorEmployeeNo LIKE :p)', { p });
    }
    if (f.from) qb.andWhere('c.occurredAt >= :from', { from: dayStart(f.from) });
    // 🔴 上界以**隔日 00:00 排他**表達（非 `<= 當日 23:59:59`）——後者會漏掉當日最後一秒內之毫秒。
    if (f.to) qb.andWhere('c.occurredAt < :toExclusive', { toExclusive: nextDayStart(f.to) });
    return qb;
  }

  /** 🔴 匯出之第一道：`COUNT(*)` 下推（超限即拒絕，完全不 SELECT 列）。 */
  async countByFilters(filters: BusinessCategoryChangeFilters): Promise<number> {
    const ds = await this.init();
    const qb = ds.getRepository(BusinessCategoryChangeLog).createQueryBuilder('c');
    return TypeOrmBusinessCategoryChangeLogStore.applyFilters(qb, filters).getCount();
  }

  /** 🔴 匯出之第二道：同一組 WHERE ＋ `TOP take`（競態上界）。 */
  async listByFilters(
    filters: BusinessCategoryChangeFilters,
    take: number,
  ): Promise<BusinessCategoryChangeLogRow[]> {
    const ds = await this.init();
    const qb = ds
      .getRepository(BusinessCategoryChangeLog)
      .createQueryBuilder('c')
      .orderBy('c.occurredAt', 'DESC')
      .take(take);
    const rows = await TypeOrmBusinessCategoryChangeLogStore.applyFilters(qb, filters).getMany();
    return rows.map(TypeOrmBusinessCategoryChangeLogStore.toRow);
  }

  async listByBusinessCategory(
    businessCategoryId: string,
  ): Promise<BusinessCategoryChangeLogRow[]> {
    const ds = await this.init();
    const rows = await ds
      .getRepository(BusinessCategoryChangeLog)
      .find({ where: { businessCategoryId }, order: { occurredAt: 'DESC' } });
    return rows.map(TypeOrmBusinessCategoryChangeLogStore.toRow);
  }

  async findById(id: string): Promise<BusinessCategoryChangeLogRow | null> {
    const ds = await this.init();
    const e = await ds.getRepository(BusinessCategoryChangeLog).findOne({ where: { id } });
    return e ? TypeOrmBusinessCategoryChangeLogStore.toRow(e) : null;
  }

  /** 取同 `businessCategoryId`、`occurredAt` 嚴格早於 `before` 之最近一筆（`AC-41` 錨定）。 */
  async findPredecessor(
    businessCategoryId: string,
    before: Date,
  ): Promise<BusinessCategoryChangeLogRow | null> {
    const ds = await this.init();
    const e = await ds.getRepository(BusinessCategoryChangeLog).findOne({
      where: { businessCategoryId, occurredAt: LessThan(before) },
      order: { occurredAt: 'DESC' },
    });
    return e ? TypeOrmBusinessCategoryChangeLogStore.toRow(e) : null;
  }
}
