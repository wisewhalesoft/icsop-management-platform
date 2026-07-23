import { DataSource } from 'typeorm';
import { AuditOutbox } from '../database/entities/audit-outbox.entity';
import { AuditOutboxRecord, AuditOutboxStore, AuditRow } from './audit.types';

/**
 * AUDIT_LOG_OUTBOX 之 TypeORM 實作（補償佇列）。
 *  - enqueue：以 row.id 為 PK 插入 pending（payload＝AuditRow JSON）；重複 id 視為已入列（冪等）。
 *  - listPending：回 status='pending'。
 *  - markDone：刪除該筆（搬遷成功即出列；亦可改為 UPDATE status='done' 保留軌跡）。
 * 內部表非 append-only，允許 DELETE/UPDATE（僅 AUDIT_LOG 本體不可竄改）。
 */
export class TypeOrmAuditOutboxStore implements AuditOutboxStore {
  constructor(private readonly ds: DataSource) {}

  private async init(): Promise<DataSource> {
    if (!this.ds.isInitialized) await this.ds.initialize();
    return this.ds;
  }

  async enqueue(row: AuditRow): Promise<void> {
    const ds = await this.init();
    const repo = ds.getRepository(AuditOutbox);
    const existing = await repo.findOne({ where: { id: row.id }, select: { id: true } });
    if (existing) return; // 冪等
    await repo.insert({
      id: row.id,
      payload: JSON.stringify(row),
      status: 'pending',
      attempts: 0,
      createdAt: new Date(),
    });
  }

  async listPending(): Promise<AuditOutboxRecord[]> {
    const ds = await this.init();
    const rows = await ds.getRepository(AuditOutbox).find({ where: { status: 'pending' } });
    return rows.map((e) => {
      const parsed = JSON.parse(e.payload) as AuditRow;
      // JSON 還原 occurredAt → Date（序列化為 ISO 字串）。
      parsed.occurredAt = new Date(parsed.occurredAt);
      return { id: e.id, row: parsed, status: 'pending', attempts: e.attempts };
    });
  }

  async markDone(id: string): Promise<void> {
    const ds = await this.init();
    await ds.getRepository(AuditOutbox).delete({ id });
  }
}
