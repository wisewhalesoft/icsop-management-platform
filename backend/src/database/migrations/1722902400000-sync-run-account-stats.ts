import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * F006 D7：SYNC_RUN 新增帳號異動細分三欄，供後台總覽 KPI
 * 「新增人員／更新（部門/職級）／離職停用」三張卡。
 *
 * 背景：既有 changeCount 為「組織 create/update ＋ 帳號 create/update/disable」之混合總數，
 * 無法還原三張卡之數字；引擎內部本已算出 SyncStats 之細分值，此處僅多落地三欄（無新增計算）。
 *
 * ⚠ 刻意 NULLable（不設 DEFAULT 回填）：本 migration 之前的歷史 SYNC_RUN 列並無此資訊，
 *   以 NULL 誠實表達「未知」而非偽造 0；KPI 加總以 COALESCE 視為 0，使歷史資料優雅降級而非報錯。
 *   本 migration 之後由 finishSyncRun 一律寫入實際值（失敗收尾寫 0）。
 */
export class SyncRunAccountStats1722902400000 implements MigrationInterface {
  name = 'SyncRunAccountStats1722902400000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE [SYNC_RUN] ADD [accountsCreated] int NULL`);
    await q.query(`ALTER TABLE [SYNC_RUN] ADD [accountsUpdated] int NULL`);
    await q.query(`ALTER TABLE [SYNC_RUN] ADD [accountsDisabled] int NULL`);
    // KPI 以 startedAt 之月份範圍加總 → 建索引避免全表掃描（NFR-001）。
    await q.query(`CREATE INDEX [IX_SYNC_RUN_startedAt] ON [SYNC_RUN] ([startedAt])`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX [IX_SYNC_RUN_startedAt] ON [SYNC_RUN]`);
    await q.query(`ALTER TABLE [SYNC_RUN] DROP COLUMN [accountsDisabled]`);
    await q.query(`ALTER TABLE [SYNC_RUN] DROP COLUMN [accountsUpdated]`);
    await q.query(`ALTER TABLE [SYNC_RUN] DROP COLUMN [accountsCreated]`);
  }
}
