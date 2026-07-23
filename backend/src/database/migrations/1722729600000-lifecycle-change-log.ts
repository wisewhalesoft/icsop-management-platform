import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * F038 循環樹狀圖變更歷程：新建 LIFECYCLE_CHANGE_LOG（append-only DAG 結構變更事件日誌）。
 *
 *  - 每列＝一次原子結構變更（NODE_ADDED/NODE_REMOVED/NODE_RENAMED/EDGE_ADDED/EDGE_REMOVED/
 *    DOCUMENT_MOUNTED/DOCUMENT_REASSIGNED/DOCUMENT_UNMOUNTED），含 summary/oldValue/newValue/nodeId。
 *  - occurredAt 用 datetime2；操作者身分為寫入當下快照。
 *  - 索引：lifecycleId、occurredAt、組合 (lifecycleId, occurredAt)（供依循環/時間查詢）。
 *  - 不可竄改 DB 層強制（縱深防禦第二層）：best-effort REVOKE UPDATE/DELETE（比照 AUDIT_LOG / DOCUMENT_CHANGE_LOG）。
 */
export class LifecycleChangeLog1722729600000 implements MigrationInterface {
  name = 'LifecycleChangeLog1722729600000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE [LIFECYCLE_CHANGE_LOG] (
        [id] uniqueidentifier NOT NULL,
        [lifecycleId] uniqueidentifier NOT NULL,
        [changeType] varchar(30) NOT NULL,
        [summary] nvarchar(400) NOT NULL,
        [oldValue] nvarchar(400) NULL,
        [newValue] nvarchar(400) NULL,
        [nodeId] uniqueidentifier NULL,
        [actorId] uniqueidentifier NULL,
        [actorName] nvarchar(30) NULL,
        [actorEmployeeNo] varchar(10) NULL,
        [occurredAt] datetime2 NOT NULL,
        CONSTRAINT [PK_LIFECYCLE_CHANGE_LOG] PRIMARY KEY ([id])
      )`);
    await q.query(
      `CREATE INDEX [IX_LC_CHANGE_LOG_lifecycleId] ON [LIFECYCLE_CHANGE_LOG] ([lifecycleId])`,
    );
    await q.query(
      `CREATE INDEX [IX_LC_CHANGE_LOG_occurredAt] ON [LIFECYCLE_CHANGE_LOG] ([occurredAt])`,
    );
    await q.query(
      `CREATE INDEX [IX_LC_CHANGE_LOG_lifecycle_occurredAt] ON [LIFECYCLE_CHANGE_LOG] ([lifecycleId],[occurredAt])`,
    );

    const appUser = process.env.APP_MSSQL_USER;
    if (appUser && /^[A-Za-z0-9_@.\-\\]+$/.test(appUser)) {
      try {
        await q.query(`REVOKE UPDATE, DELETE ON [LIFECYCLE_CHANGE_LOG] TO [${appUser}]`);
      } catch {
        // best-effort：整合階段確認 principal。
      }
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE [LIFECYCLE_CHANGE_LOG]`);
  }
}
