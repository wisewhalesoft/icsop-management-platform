import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * F038 循環樹狀圖變更日誌（LIFECYCLE_CHANGE_LOG）。**Append-only** DAG 結構變更事件日誌：
 * 每列＝一次原子結構變更（新增/刪除節點、改名、新增/刪除連線、文件掛載/改派/移除）。
 *  - 操作者身分為寫入當下快照；summary 為人類可讀摘要。
 *  - occurredAt 用 datetime2；id 由應用層 randomUUID() 明確給定。
 * 不可竄改：store/entity 不提供 update/delete 路徑；DB 層 REVOKE 於 migration（[integration]）。
 */
@Entity({ name: 'LIFECYCLE_CHANGE_LOG' })
@Index('IX_LC_CHANGE_LOG_lifecycleId', ['lifecycleId'])
@Index('IX_LC_CHANGE_LOG_occurredAt', ['occurredAt'])
@Index('IX_LC_CHANGE_LOG_lifecycle_occurredAt', ['lifecycleId', 'occurredAt'])
export class LifecycleChangeLog {
  @PrimaryColumn({ type: 'uniqueidentifier' })
  id!: string;

  @Column({ type: 'uniqueidentifier' })
  lifecycleId!: string;

  @Column({ type: 'varchar', length: 30 })
  changeType!: string;

  @Column({ type: 'nvarchar', length: 400 })
  summary!: string;

  @Column({ type: 'nvarchar', length: 400, nullable: true })
  oldValue!: string | null;

  @Column({ type: 'nvarchar', length: 400, nullable: true })
  newValue!: string | null;

  @Column({ type: 'uniqueidentifier', nullable: true })
  nodeId!: string | null;

  @Column({ type: 'uniqueidentifier', nullable: true })
  actorId!: string | null;

  @Column({ type: 'nvarchar', length: 30, nullable: true })
  actorName!: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  actorEmployeeNo!: string | null;

  @Column({ type: 'datetime2' })
  occurredAt!: Date;

  /** F038：1:1 回指之 LIFECYCLE_SNAPSHOT.id（同一交易內產生；ALTER ADD，NULLable，無 DB FK）。 */
  @Index('IX_LC_CHANGE_LOG_snapshotId', ['snapshotId'])
  @Column({ type: 'uniqueidentifier', nullable: true })
  snapshotId!: string | null;
}
