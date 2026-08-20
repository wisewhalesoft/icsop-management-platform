import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * F018 制定部門（`AC-N45`／`AC-N47`，2026-08-20 D9 delta）：新建 `USAGE_FORM_DRAFTING_DEPT`。
 * 本輪**唯一**需 migration 之 schema 變更（architecture-spec §11.10(c)）。
 *
 * DDL **比照既有 `DOC_USING_DEPT`**（`1722556800000-doc-org-multivalue.ts`，同構模式）：
 * 代理鍵 `id` ＋ FK CASCADE ＋ 查詢索引 ＋ 複合唯一索引。
 *
 * 🔴 `orgCode varchar(10)` **沿用資料庫預設 collation（`_BIN`），不覆寫**——本欄為系統代碼
 * （`VW_DEPT_SQL.CODE` 之精確參照），比對語意為精確相等，不存在使用者輸入之大小寫變異。
 * 與 `USAGE_FORM_POOL.formNumber`（`OQ-D18-30`：使用者手動輸入、需不分大小寫唯一，故顯式
 * `COLLATE Chinese_Taiwan_Stroke_CI_AS`）**性質不同**，不可一概而論。
 *
 * 🔴 `ON DELETE CASCADE`：刪除表單時連帶清除其制定部門列——否則會留下指向已刪表單之孤兒列，
 * 且下次同 id 重用時（`NEWSEQUENTIALID` 不會重用，但 app 端預生 uuid 之路徑可能）會顯示錯誤資料。
 *
 * down()：`DROP TABLE` 即連帶移除其索引與 FK。
 */
export class UsageFormDraftingDept1724112000000 implements MigrationInterface {
  name = 'UsageFormDraftingDept1724112000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE [USAGE_FORM_DRAFTING_DEPT] (
        [id] uniqueidentifier NOT NULL CONSTRAINT [DF_USAGE_FORM_DRAFTING_DEPT_id] DEFAULT NEWSEQUENTIALID(),
        [formId] uniqueidentifier NOT NULL,
        [orgCode] varchar(10) NOT NULL,
        CONSTRAINT [PK_USAGE_FORM_DRAFTING_DEPT] PRIMARY KEY ([id]),
        CONSTRAINT [FK_USAGE_FORM_DRAFTING_DEPT_form] FOREIGN KEY ([formId])
          REFERENCES [USAGE_FORM_POOL]([id]) ON DELETE CASCADE
      )`);
    await q.query(
      `CREATE INDEX [IX_USAGE_FORM_DRAFTING_DEPT_form] ON [USAGE_FORM_DRAFTING_DEPT] ([formId])`,
    );
    await q.query(`
      CREATE UNIQUE INDEX [UQ_USAGE_FORM_DRAFTING_DEPT_form_org]
        ON [USAGE_FORM_DRAFTING_DEPT] ([formId], [orgCode])`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE [USAGE_FORM_DRAFTING_DEPT]`);
  }
}
