import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * F038 循環樹狀圖變更歷程 · 完整新舊快照重建：新建 LIFECYCLE_SNAPSHOT（append-only 結構快照）＋
 * LIFECYCLE_CHANGE_LOG 新增 1:1 回指欄 snapshotId。
 *
 *  - 每筆 LIFECYCLE_CHANGE_LOG 於同一交易內產生一份自足快照（nodesJson/edgesJson，含各節點掛載文件
 *    id+documentNumber）；changeLogId 1:1 回指（唯一索引）。
 *  - 兩表互相 1:1 回指：LIFECYCLE_CHANGE_LOG.snapshotId → LIFECYCLE_SNAPSHOT.id 且
 *    LIFECYCLE_SNAPSHOT.changeLogId → LIFECYCLE_CHANGE_LOG.id。**皆不加 DB FK，僅索引**（比照既有
 *    LIFECYCLE_CHANGE_LOG.lifecycleId 無 FK 慣例；MSSQL 無延遲約束，雙向 FK 會互卡插入順序——因兩 PK
 *    皆應用層 randomUUID() 預生，任一插入順序皆可，完整性由應用層＋同交易兩列皆到位把關）。
 *  - snapshotId 設 NULLable（既有表 ALTER ADD，無正式資料回填）；應用層每筆新寫入之列於交易提交前恆補上。
 *  - 不可竄改 DB 層強制（縱深防禦第二層）：best-effort REVOKE UPDATE/DELETE（比照 LIFECYCLE_CHANGE_LOG）。
 *
 * 時間戳 1723161600000 保留給本軌（避開既有最高值 1723075200000，且不撞兄弟軌 1723248000000）。
 */
export class LifecycleSnapshot1723161600000 implements MigrationInterface {
  name = 'LifecycleSnapshot1723161600000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE [LIFECYCLE_SNAPSHOT] (
        [id] uniqueidentifier NOT NULL,
        [lifecycleId] uniqueidentifier NOT NULL,
        [changeLogId] uniqueidentifier NOT NULL,
        [nodesJson] nvarchar(max) NOT NULL,
        [edgesJson] nvarchar(max) NOT NULL,
        [capturedAt] datetime2 NOT NULL,
        CONSTRAINT [PK_LIFECYCLE_SNAPSHOT] PRIMARY KEY ([id])
      )`);
    await q.query(
      `CREATE UNIQUE INDEX [UQ_LIFECYCLE_SNAPSHOT_changeLogId] ON [LIFECYCLE_SNAPSHOT] ([changeLogId])`,
    );
    await q.query(
      `CREATE INDEX [IX_LIFECYCLE_SNAPSHOT_lifecycleId] ON [LIFECYCLE_SNAPSHOT] ([lifecycleId])`,
    );

    await q.query(`ALTER TABLE [LIFECYCLE_CHANGE_LOG] ADD [snapshotId] uniqueidentifier NULL`);
    await q.query(
      `CREATE INDEX [IX_LC_CHANGE_LOG_snapshotId] ON [LIFECYCLE_CHANGE_LOG] ([snapshotId])`,
    );

    const appUser = process.env.APP_MSSQL_USER;
    if (appUser && /^[A-Za-z0-9_@.\-\\]+$/.test(appUser)) {
      try {
        await q.query(`REVOKE UPDATE, DELETE ON [LIFECYCLE_SNAPSHOT] TO [${appUser}]`);
      } catch {
        // best-effort：整合階段確認 principal。
      }
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX [IX_LC_CHANGE_LOG_snapshotId] ON [LIFECYCLE_CHANGE_LOG]`);
    await q.query(`ALTER TABLE [LIFECYCLE_CHANGE_LOG] DROP COLUMN [snapshotId]`);
    await q.query(`DROP TABLE [LIFECYCLE_SNAPSHOT]`);
  }
}
