import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * F004 組織同步：
 *  - ORG_UNIT 新增 parentCode（由代碼前綴推導之上層代碼）。
 *  - ACCOUNT 新增 VW_HPMUSER 白名單欄位（managerEmpNo/resignDate/hireDate/upstreamModifiedAt）
 *    與停用軌跡（disableReason/disabledAt）。
 *  - 新建 SYNC_RUN 同步執行紀錄表。
 * 不改動 baseline migration（1721520000000）。
 */
export class OrgSync1721606400000 implements MigrationInterface {
  name = 'OrgSync1721606400000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE [ORG_UNIT] ADD [parentCode] varchar(10) NULL`);

    await q.query(`ALTER TABLE [ACCOUNT] ADD
      [managerEmpNo] varchar(10) NULL,
      [resignDate] datetime NULL,
      [hireDate] datetime NULL,
      [upstreamModifiedAt] datetime NULL,
      [disableReason] varchar(10) NULL,
      [disabledAt] datetime NULL`);

    await q.query(`
      CREATE TABLE [SYNC_RUN] (
        [id] uniqueidentifier NOT NULL CONSTRAINT [DF_SYNC_RUN_id] DEFAULT NEWSEQUENTIALID(),
        [triggerType] varchar(10) NOT NULL,
        [status] varchar(10) NOT NULL,
        [changeCount] int NOT NULL CONSTRAINT [DF_SYNC_RUN_changeCount] DEFAULT 0,
        [startedAt] datetime NOT NULL,
        [endedAt] datetime NULL,
        [watermark] datetime NULL,
        [errorCode] varchar(50) NULL,
        [errorMessage] nvarchar(500) NULL,
        [triggeredBy] varchar(50) NULL,
        CONSTRAINT [PK_SYNC_RUN] PRIMARY KEY ([id])
      )`);
    await q.query(`CREATE INDEX [IX_SYNC_RUN_status] ON [SYNC_RUN] ([status])`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE [SYNC_RUN]`);
    await q.query(`ALTER TABLE [ACCOUNT] DROP COLUMN
      [managerEmpNo], [resignDate], [hireDate], [upstreamModifiedAt],
      [disableReason], [disabledAt]`);
    await q.query(`ALTER TABLE [ORG_UNIT] DROP COLUMN [parentCode]`);
  }
}
