import { DataSource, SelectQueryBuilder } from 'typeorm';
import { DocumentChangeLog } from '../database/entities/document-change-log.entity';
import {
  DocumentChangeLogRow,
  DocumentChangeLogStore,
} from './document-change-log.store';
import { DocumentChangeFilters } from './document-change-query';
import { escapeLikeContains } from '../public/public-list';

/** `YYYY-MM-DD` → 當日 00:00:00（本地時間，與查詢層 `dayOf()` 之本地日界一致）。 */
function dayStart(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
}

/** `YYYY-MM-DD` → 次日 00:00:00（半開區間右端，使「含當日」成立）。 */
function dayAfter(day: string): Date {
  const t = dayStart(day);
  t.setDate(t.getDate() + 1);
  return t;
}

/**
 * DOCUMENT_CHANGE_LOG 之 TypeORM 實作（append-only）。
 * ⚠ 結構性不可竄改：僅 append/listAll/listByDocument，不暴露 update/delete/save；
 *   DB 層 REVOKE 為第二層（migration，[integration]）。
 */
export class TypeOrmDocumentChangeLogStore implements DocumentChangeLogStore {
  constructor(private readonly ds: DataSource) {}

  private async init(): Promise<DataSource> {
    if (!this.ds.isInitialized) await this.ds.initialize();
    return this.ds;
  }

  private static toRow(e: DocumentChangeLog): DocumentChangeLogRow {
    return {
      id: e.id,
      documentId: e.documentId,
      documentNumber: e.documentNumber,
      changeType: e.changeType,
      field: e.field,
      oldValue: e.oldValue,
      newValue: e.newValue,
      actorId: e.actorId,
      actorName: e.actorName,
      actorEmployeeNo: e.actorEmployeeNo,
      reason: e.reason,
      occurredAt: e.occurredAt,
    };
  }

  async append(rows: DocumentChangeLogRow[]): Promise<void> {
    if (rows.length === 0) return;
    const ds = await this.init();
    // insert（非 save）：純新增，無更新語意（append-only）。
    await ds.getRepository(DocumentChangeLog).insert(rows.map((r) => ({ ...r })));
  }

  async listAll(): Promise<DocumentChangeLogRow[]> {
    const ds = await this.init();
    const rows = await ds
      .getRepository(DocumentChangeLog)
      .find({ order: { occurredAt: 'DESC' } });
    return rows.map(TypeOrmDocumentChangeLogStore.toRow);
  }

  /**
   * 匯出專用之 WHERE 建構——**與 `filterDocumentChanges()` 同一組條件**，於 SQL 端下推。
   * `from`／`to` 為 `YYYY-MM-DD`（含當日），以本地日界之半開區間 `[from 00:00, to+1 00:00)` 表達，
   * 避免對 datetime 欄做字串截斷而喪失索引。
   */
  private static applyFilters(
    qb: SelectQueryBuilder<DocumentChangeLog>,
    f: DocumentChangeFilters,
  ): SelectQueryBuilder<DocumentChangeLog> {
    if (f.doc) {
      qb.andWhere('c.documentNumber LIKE :doc', { doc: `%${escapeLikeContains(f.doc)}%` });
    }
    if (f.field) {
      qb.andWhere('c.field LIKE :field', { field: `%${escapeLikeContains(f.field)}%` });
    }
    if (f.person) {
      const p = `%${escapeLikeContains(f.person)}%`;
      qb.andWhere('(c.actorName LIKE :p OR c.actorEmployeeNo LIKE :p)', { p });
    }
    if (f.from) qb.andWhere('c.occurredAt >= :from', { from: dayStart(f.from) });
    if (f.to) qb.andWhere('c.occurredAt < :to', { to: dayAfter(f.to) });
    return qb;
  }

  /** 🔴 匯出之第一道：`COUNT(*)` 下推（超限即拒絕，完全不 SELECT 列）。 */
  async countByFilters(filters: DocumentChangeFilters): Promise<number> {
    const ds = await this.init();
    const qb = ds.getRepository(DocumentChangeLog).createQueryBuilder('c');
    return TypeOrmDocumentChangeLogStore.applyFilters(qb, filters).getCount();
  }

  /** 🔴 匯出之第二道：同一組 WHERE ＋ `TOP take`（競態上界）。 */
  async listByFilters(
    filters: DocumentChangeFilters,
    take: number,
  ): Promise<DocumentChangeLogRow[]> {
    const ds = await this.init();
    const qb = ds
      .getRepository(DocumentChangeLog)
      .createQueryBuilder('c')
      .orderBy('c.occurredAt', 'DESC')
      .take(take);
    const rows = await TypeOrmDocumentChangeLogStore.applyFilters(qb, filters).getMany();
    return rows.map(TypeOrmDocumentChangeLogStore.toRow);
  }

  async listByDocument(documentId: string): Promise<DocumentChangeLogRow[]> {
    const ds = await this.init();
    const rows = await ds
      .getRepository(DocumentChangeLog)
      .find({ where: { documentId }, order: { occurredAt: 'DESC' } });
    return rows.map(TypeOrmDocumentChangeLogStore.toRow);
  }
}
