import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * 同步執行紀錄（data-model.md §syncrun-entity）。同一時間至多一筆 running（互斥鎖，F004）。
 * errorCode 供前端區分「已中止（DISAPPEARED_RATIO_EXCEEDED）」與一般「失敗」（US-011 AC4）——
 * 概念層資料模型僅列 errorMessage，此欄為 architect 層之最小擴充（見實作日誌設計決策）。
 * watermark 記錄本次套用之最大 MTDT，供下次增量取回之水位（F004 Main Flow step 8）。
 */
@Entity({ name: 'SYNC_RUN' })
@Index('IX_SYNC_RUN_status', ['status'])
export class SyncRun {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 10 })
  triggerType!: string; // scheduled / manual

  @Column({ type: 'varchar', length: 10 })
  status!: string; // running / success / failed

  @Column({ type: 'int', default: 0 })
  changeCount!: number;

  @Column({ type: 'datetime' })
  startedAt!: Date;

  @Column({ type: 'datetime', nullable: true })
  endedAt!: Date | null;

  // watermark 承載上游 MTDT 衍生值 → datetime2（範圍 0001–9999），避免 datetime 溢位。
  @Column({ type: 'datetime2', nullable: true })
  watermark!: Date | null; // 本次套用之最大 MTDT 水位

  @Column({ type: 'varchar', length: 50, nullable: true })
  errorCode!: string | null;

  @Column({ type: 'nvarchar', length: 500, nullable: true })
  errorMessage!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  triggeredBy!: string | null; // 觸發者 loginId（手動時）
}
