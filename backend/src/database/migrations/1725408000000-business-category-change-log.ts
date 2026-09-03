import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * F043 §戊 業務/功能類別結構變更歷程：新建 `BUSINESS_CATEGORY_CHANGE_LOG`（append-only 事件日誌）
 * 與 `BUSINESS_CATEGORY_SNAPSHOT`（1:1 自足結構快照）**兩張表**。
 *
 * 權威：docs/specs/architecture-spec.md §14.1 決策 E1（採**乙案**）＋ §14.4 表 2。
 *
 * 🔴 **為何兩表同檔**：兩表 1:1 緊耦合、且屬**同一功能批次首次引入**（不像 LIFECYCLE 側是分兩個
 * 既有 sprint 各自新增）。欄位定義逐一比照 `LIFECYCLE_CHANGE_LOG`／`LIFECYCLE_SNAPSHOT`，
 * 僅 `lifecycleId` → `businessCategoryId`。
 *
 * 🔴 **`changeType` 仍為 `varchar(30)` 且無 CHECK 約束**（比照既有寫法）——值域封閉性
 * （`AC-39` 恰 7 值）由 `business-category-change-event.ts` 之 TS 判別聯集把關。
 *
 * 🔴 **兩表 PK 皆由應用層預生 UUID**（非 `NEWSEQUENTIALID()`）：雙向 1:1 回指需兩個 id 於寫入前
 * 皆已知，否則產生插入順序死結；故 `changeLogId` 不加 DB FK，僅唯一索引把關。
 *
 * 不可竄改（縱深防禦第二層）：best-effort `REVOKE UPDATE, DELETE`，比照 `AUDIT_LOG`／
 * `LIFECYCLE_CHANGE_LOG` 之既有作法。
 */
export class BusinessCategoryChangeLog1725408000000 implements MigrationInterface {
  name = 'BusinessCategoryChangeLog1725408000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE [BUSINESS_CATEGORY_CHANGE_LOG] (
        [id] uniqueidentifier NOT NULL,
        [businessCategoryId] uniqueidentifier NOT NULL,
        [changeType] varchar(30) NOT NULL,
        [summary] nvarchar(400) NOT NULL,
        [oldValue] nvarchar(400) NULL,
        [newValue] nvarchar(400) NULL,
        [nodeId] uniqueidentifier NULL,
        [actorId] uniqueidentifier NULL,
        [actorName] nvarchar(30) NULL,
        [actorEmployeeNo] varchar(10) NULL,
        [occurredAt] datetime2 NOT NULL,
        [snapshotId] uniqueidentifier NULL,
        CONSTRAINT [PK_BUSINESS_CATEGORY_CHANGE_LOG] PRIMARY KEY ([id])
      )`);
    await q.query(
      `CREATE INDEX [IX_BC_CHANGE_LOG_businessCategoryId] ON [BUSINESS_CATEGORY_CHANGE_LOG] ([businessCategoryId])`,
    );
    await q.query(
      `CREATE INDEX [IX_BC_CHANGE_LOG_occurredAt] ON [BUSINESS_CATEGORY_CHANGE_LOG] ([occurredAt])`,
    );
    await q.query(
      `CREATE INDEX [IX_BC_CHANGE_LOG_category_occurredAt] ON [BUSINESS_CATEGORY_CHANGE_LOG] ([businessCategoryId],[occurredAt])`,
    );
    await q.query(
      `CREATE INDEX [IX_BC_CHANGE_LOG_snapshotId] ON [BUSINESS_CATEGORY_CHANGE_LOG] ([snapshotId])`,
    );

    await q.query(`
      CREATE TABLE [BUSINESS_CATEGORY_SNAPSHOT] (
        [id] uniqueidentifier NOT NULL,
        [businessCategoryId] uniqueidentifier NOT NULL,
        [changeLogId] uniqueidentifier NOT NULL,
        [nodesJson] nvarchar(max) NOT NULL,
        [edgesJson] nvarchar(max) NOT NULL,
        [capturedAt] datetime2 NOT NULL,
        CONSTRAINT [PK_BUSINESS_CATEGORY_SNAPSHOT] PRIMARY KEY ([id])
      )`);
    await q.query(
      `CREATE INDEX [IX_BUSINESS_CATEGORY_SNAPSHOT_businessCategoryId] ON [BUSINESS_CATEGORY_SNAPSHOT] ([businessCategoryId])`,
    );
    await q.query(
      `CREATE UNIQUE INDEX [UQ_BUSINESS_CATEGORY_SNAPSHOT_changeLogId] ON [BUSINESS_CATEGORY_SNAPSHOT] ([changeLogId])`,
    );

    const appUser = process.env.APP_MSSQL_USER;
    if (appUser && /^[A-Za-z0-9_@.\-\\]+$/.test(appUser)) {
      for (const table of ['BUSINESS_CATEGORY_CHANGE_LOG', 'BUSINESS_CATEGORY_SNAPSHOT']) {
        try {
          await q.query(`REVOKE UPDATE, DELETE ON [${table}] TO [${appUser}]`);
        } catch {
          // best-effort：整合階段確認 principal（比照既有兩支 migration）。
        }
      }
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE [BUSINESS_CATEGORY_SNAPSHOT]`);
    await q.query(`DROP TABLE [BUSINESS_CATEGORY_CHANGE_LOG]`);
  }
}
