import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * F043 §戊 業務/功能類別結構快照（BUSINESS_CATEGORY_SNAPSHOT）。每筆 CHANGE_LOG 於同一交易內
 * 產生一份自足結構快照（1:1，`changeLogId` 回指）：`nodesJson`／`edgesJson` 為序列化之當下完整
 * DAG（節點含掛載文件 id+documentNumber），供新舊樹重建時不再回查來源表。
 *
 *  - id / changeLogId 由應用層 `randomUUID()` 明確給定，避免雙向 1:1 之插入順序死結；
 *    故 `changeLogId` 不加 DB FK，僅唯一索引（比照 LIFECYCLE_SNAPSHOT）。
 *  - Append-only：entity/store 不提供 update/delete；DB 層 REVOKE 於 migration。
 */
@Entity({ name: 'BUSINESS_CATEGORY_SNAPSHOT' })
@Index('IX_BUSINESS_CATEGORY_SNAPSHOT_businessCategoryId', ['businessCategoryId'])
export class BusinessCategorySnapshot {
  @PrimaryColumn({ type: 'uniqueidentifier' })
  id!: string;

  @Column({ type: 'uniqueidentifier' })
  businessCategoryId!: string;

  /** 1:1 回指之 BUSINESS_CATEGORY_CHANGE_LOG.id（無 DB FK，唯一索引把關）。 */
  @Index('UQ_BUSINESS_CATEGORY_SNAPSHOT_changeLogId', { unique: true })
  @Column({ type: 'uniqueidentifier' })
  changeLogId!: string;

  @Column({ type: 'nvarchar', length: 'max' })
  nodesJson!: string;

  @Column({ type: 'nvarchar', length: 'max' })
  edgesJson!: string;

  @Column({ type: 'datetime2' })
  capturedAt!: Date;
}
