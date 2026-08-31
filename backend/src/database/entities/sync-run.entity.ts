import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * 同步執行紀錄（data-model.md §syncrun-entity）。同一時間至多一筆 running（互斥鎖，F004）。
 * errorCode 供前端區分「已中止（DISAPPEARED_RATIO_EXCEEDED）」與一般「失敗」（US-011 AC4）——
 * 概念層資料模型僅列 errorMessage，此欄為 architect 層之最小擴充（見實作日誌設計決策）。
 * watermark 記錄本次套用之最大 MTDT，供下次增量取回之水位（F004 Main Flow step 8）。
 */
@Entity({ name: 'SYNC_RUN' })
@Index('IX_SYNC_RUN_status', ['status'])
@Index('IX_SYNC_RUN_compid_status', ['compid', 'status'])
@Index('IX_SYNC_RUN_compid_endedAt', ['compid', 'endedAt'])
export class SyncRun {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // B 階段（開放多公司）新增：互斥鎖與水位查詢改為 per-company（見該 migration JSDoc）。
  @Column({ type: 'varchar', length: 10 })
  compid!: string;

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

  // --- F006 D7：帳號異動細分（後台總覽 KPI「新增人員／更新（部門/職級）／離職停用」之來源）。
  //     changeCount 為組織＋帳號之混合總數，無法還原三張卡；此三欄僅多落地引擎已算出之數字。
  //     nullable：本次 migration 之前的歷史列為 NULL，KPI 加總以 COALESCE 視為 0（優雅降級）。
  @Column({ type: 'int', nullable: true })
  accountsCreated!: number | null;

  @Column({ type: 'int', nullable: true })
  accountsUpdated!: number | null;

  @Column({ type: 'int', nullable: true })
  accountsDisabled!: number | null;

  // --- 2026-08-31 delta：角色推導是否因變更量超過閾值而**整批未套用**。
  //     落地理由見 migration 1725148800000：常態是每日 02:00 排程，跳過時無人在看畫面，
  //     只留在 SyncResult 等同於沒人知道。三欄同為「多落地已算出之 stats」，不新增計算。
  @Column({ type: 'bit', default: false })
  roleDerivationSkipped!: boolean;

  /** 本次會被寫入之角色/子分類變更數（分子）。 */
  @Column({ type: 'int', nullable: true })
  roleChangeCount!: number | null;

  /** 本次納入推導之帳號數（分母，roleSource='derived'）。 */
  @Column({ type: 'int', nullable: true })
  roleDerivationBase!: number | null;
}
