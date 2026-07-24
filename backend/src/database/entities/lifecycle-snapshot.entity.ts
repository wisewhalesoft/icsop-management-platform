import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * F038 循環樹狀圖變更快照（LIFECYCLE_SNAPSHOT）。每筆 LIFECYCLE_CHANGE_LOG 於同一交易內產生一份自足
 * 結構快照（1:1，changeLogId 回指）：nodesJson/edgesJson 為序列化之當下完整 DAG（節點含掛載文件
 * id+documentNumber），供新舊樹重建時不再回查來源表。
 *
 *  - id / changeLogId 由應用層 randomUUID() 明確給定（非 DB NEWSEQUENTIALID），避免雙向 1:1 之插入
 *    順序死結（兩 UUID 皆於寫入前算好、任一插入順序皆可）；故 changeLogId 不加 DB FK，僅唯一索引。
 *  - Append-only（比照 LIFECYCLE_CHANGE_LOG）：entity/store 不提供 update/delete；DB 層 REVOKE 於 migration。
 */
@Entity({ name: 'LIFECYCLE_SNAPSHOT' })
@Index('IX_LIFECYCLE_SNAPSHOT_lifecycleId', ['lifecycleId'])
export class LifecycleSnapshot {
  @PrimaryColumn({ type: 'uniqueidentifier' })
  id!: string;

  @Column({ type: 'uniqueidentifier' })
  lifecycleId!: string;

  /** 1:1 回指之 LIFECYCLE_CHANGE_LOG.id（無 DB FK，唯一索引把關）。 */
  @Index('UQ_LIFECYCLE_SNAPSHOT_changeLogId', { unique: true })
  @Column({ type: 'uniqueidentifier' })
  changeLogId!: string;

  /** 序列化之節點清單（含各節點掛載文件 id+documentNumber）。 */
  @Column({ type: 'nvarchar', length: 'max' })
  nodesJson!: string;

  /** 序列化之邊清單。 */
  @Column({ type: 'nvarchar', length: 'max' })
  edgesJson!: string;

  @Column({ type: 'datetime2' })
  capturedAt!: Date;
}
