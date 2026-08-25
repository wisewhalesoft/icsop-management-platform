import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `SYNC_RUN.compid` —— 多公司同步之根因修正（B 階段，開放 AD／AE／AJ）。
 *
 * 🔴 **在此之前，`SYNC_RUN` 完全沒有公司欄位**，`hasRunningSyncRun()`／`getAccountWatermark()`
 * 皆為**全域**查詢（後者甚至參數簽章有 `compid` 卻從未使用，見 `typeorm-org-sync.store.ts`
 * 舊版 `getAccountWatermark(_compid)`）。單一公司（AS）時這不構成問題；一旦新增第二家公司
 * 同步，會導致：
 *  - **新公司首次同步繼承舊公司之全域水位** ⇒ 增量查詢誤判為「無異動」⇒ 該公司帳號幾乎
 *    全數不會被寫入，且同步回報成功、不報錯（靜默資料遺失）。
 *  - **互斥鎖跨公司誤擋**：A 公司同步中會使 B 公司的手動觸發／排程誤判為 `SYNC_IN_PROGRESS`。
 *
 * 本 migration 新增 `compid` 欄位（NOT NULL），既有列（全部皆為 AS，本系統上線以來僅同步過
 * 該公司）**backfill 為 `'AS'`**。新增索引供 `hasRunningSyncRun(compid)`／
 * `getAccountWatermark(compid)` 之 per-company 查詢。
 */
export class SyncRunCompid1724284800000 implements MigrationInterface {
  name = 'SyncRunCompid1724284800000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE [SYNC_RUN] ADD [compid] varchar(10) NULL`,
    );
    await q.query(`UPDATE [SYNC_RUN] SET [compid] = 'AS' WHERE [compid] IS NULL`);
    await q.query(
      `ALTER TABLE [SYNC_RUN] ALTER COLUMN [compid] varchar(10) NOT NULL`,
    );
    await q.query(
      `CREATE INDEX [IX_SYNC_RUN_compid_status] ON [SYNC_RUN] ([compid], [status])`,
    );
    await q.query(
      `CREATE INDEX [IX_SYNC_RUN_compid_endedAt] ON [SYNC_RUN] ([compid], [endedAt])`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX [IX_SYNC_RUN_compid_endedAt] ON [SYNC_RUN]`);
    await q.query(`DROP INDEX [IX_SYNC_RUN_compid_status] ON [SYNC_RUN]`);
    await q.query(`ALTER TABLE [SYNC_RUN] DROP COLUMN [compid]`);
  }
}
