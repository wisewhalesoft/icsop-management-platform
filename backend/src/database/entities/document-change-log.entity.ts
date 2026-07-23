import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * F037 文件變更日誌（DOCUMENT_CHANGE_LOG）。**Append-only** 欄位層事件日誌：
 * 每列＝一次某文件某欄位之 before/after 變更（誰、何時、哪欄、由何值改為何值）。
 *  - 操作者身分（actorId/actorName/actorEmployeeNo）為寫入當下快照。
 *  - oldValue/newValue 為字串化欄位值（可長）→ nvarchar(max)。
 *  - occurredAt 用 datetime2（避免 datetime 溢位，比照 AUDIT_LOG）。
 *  - id 由應用層 randomUUID() 明確給定。
 * 不可竄改：store/entity 不提供 update/delete 路徑（第一層）；DB 層 REVOKE 於 migration（[integration]）。
 */
@Entity({ name: 'DOCUMENT_CHANGE_LOG' })
@Index('IX_DOC_CHANGE_LOG_documentId', ['documentId'])
@Index('IX_DOC_CHANGE_LOG_occurredAt', ['occurredAt'])
@Index('IX_DOC_CHANGE_LOG_document_occurredAt', ['documentId', 'occurredAt'])
export class DocumentChangeLog {
  @PrimaryColumn({ type: 'uniqueidentifier' })
  id!: string;

  @Column({ type: 'uniqueidentifier' })
  documentId!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  documentNumber!: string | null;

  @Column({ type: 'varchar', length: 20 })
  changeType!: string;

  @Column({ type: 'varchar', length: 100 })
  field!: string;

  @Column({ type: 'nvarchar', length: 'MAX', nullable: true })
  oldValue!: string | null;

  @Column({ type: 'nvarchar', length: 'MAX', nullable: true })
  newValue!: string | null;

  @Column({ type: 'uniqueidentifier', nullable: true })
  actorId!: string | null;

  @Column({ type: 'nvarchar', length: 30, nullable: true })
  actorName!: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  actorEmployeeNo!: string | null;

  @Column({ type: 'datetime2' })
  occurredAt!: Date;
}
