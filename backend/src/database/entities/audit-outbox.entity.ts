import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * 稽核補償佇列（Outbox）——內部暫存表（data-model.md 標註「非對外實體」而未列 schema，
 * 本結構為 architect 層最小落地，須於 impl log flag）。
 *  - id＝對應 AUDIT_LOG.id（冪等鍵；搬遷成功後標記 done／或清除，避免重複補寫，§5.6）。
 *  - payload＝AuditRow 之 JSON 快照（整列，供 processOutboxRetry 忠實搬遷）。
 *  - 非 append-only（可 UPDATE status／DELETE 已完成）——僅 AUDIT_LOG 本體不可竄改。
 */
@Entity({ name: 'AUDIT_LOG_OUTBOX' })
@Index('IX_AUDIT_LOG_OUTBOX_status', ['status'])
export class AuditOutbox {
  @PrimaryColumn({ type: 'uniqueidentifier' })
  id!: string;

  @Column({ type: 'nvarchar', length: 'MAX' })
  payload!: string; // JSON(AuditRow)

  @Column({ type: 'varchar', length: 10, default: 'pending' })
  status!: string; // pending / done

  @Column({ type: 'int', default: 0 })
  attempts!: number;

  @Column({ type: 'datetime2', default: () => 'SYSUTCDATETIME()' })
  createdAt!: Date;
}
