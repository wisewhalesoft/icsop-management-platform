import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * F043 §戊 業務/功能類別結構變更日誌（BUSINESS_CATEGORY_CHANGE_LOG）。**Append-only**。
 *
 * 決策 E1（architecture-spec §14.1，採乙案）：與 `LIFECYCLE_CHANGE_LOG` 逐一對稱之**獨立**表，
 * 不把既有表改為多型——理由是 append-only 稽核級表之參照完整性不可逆地被犧牲，且本表之
 * `changeType` 值域**恰 7 值**（`AC-39`，無 `DOCUMENT_REASSIGNED`）與循環側之 8 值不共通。
 *
 * 不可竄改：entity/store 不提供 update/delete 路徑；DB 層 REVOKE 於 migration（[integration]）。
 */
@Entity({ name: 'BUSINESS_CATEGORY_CHANGE_LOG' })
@Index('IX_BC_CHANGE_LOG_businessCategoryId', ['businessCategoryId'])
@Index('IX_BC_CHANGE_LOG_occurredAt', ['occurredAt'])
@Index('IX_BC_CHANGE_LOG_category_occurredAt', ['businessCategoryId', 'occurredAt'])
export class BusinessCategoryChangeLog {
  @PrimaryColumn({ type: 'uniqueidentifier' })
  id!: string;

  @Column({ type: 'uniqueidentifier' })
  businessCategoryId!: string;

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

  /** 1:1 回指之 BUSINESS_CATEGORY_SNAPSHOT.id（同一交易內產生；NULLable，無 DB FK）。 */
  @Index('IX_BC_CHANGE_LOG_snapshotId', ['snapshotId'])
  @Column({ type: 'uniqueidentifier', nullable: true })
  snapshotId!: string | null;
}
