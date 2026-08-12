import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 帳號「職位」欄（prototype 08 第 5 欄，G-ADM-001）。
 * 權威：upstream-hr-source-contract.md §5.2（白名單第 12 欄 JOBTITLEID）／§5.4（職稱對照）。
 *
 * 兩段組成：
 *  1. `ACCOUNT.jobTitleCode` ← `VW_HPMUSER.JOBTITLEID`（代碼，非名稱）。
 *  2. `JOB_TITLE` 對照主檔 ← `VW_PERSONAL_JOB` 之 `(COMPID, JTITLE_ID, JTITLE_NM)`。
 *
 * ⚠ 名稱刻意不落在 ACCOUNT：帳號增量同步以 `MTDT` 為水位，若名稱存在帳號列上，
 *   「上游僅職稱主檔改名、帳號本身未異動」之情境不會觸發該帳號重寫，顯示值將永久過時。
 *   改由 JOB_TITLE 解析（與 `orgCode → ORG_UNIT.name` 完全同一模式）即無此問題。
 *
 * ⚠ JOB_TITLE 之唯一鍵為 (companyCode, code) 而非單獨 code——上游跨公司存在一碼多名
 *   （實測 2026-08-12：全公司 71 組 pair / 63 種代碼，8 種歧義；限 AS 則 54/54 零歧義）。
 *
 * 本 migration 僅建結構、不 backfill：`jobTitleCode` 於既有列為 NULL。
 *
 * 🔴 **回填必須手動觸發一次全量重同步**：`SYNC_FULL_RESYNC=1 npm run sync:once`
 *    （⚠ 不可用 `-- --full`：argv 會被 ts-node／dotenvx 包裝層吃掉，實測收不到）。
 *    帳號同步為**增量**（`MTDT > watermark`），既有帳號不會出現在增量結果中，
 *    `classifyAccount` 的 jobTitleCode 比對因而永遠沒有機會觸發——**回填不會自然發生**。
 *    ⚠ 不可類比 `ORG_UNIT.descFull`：組織來源 `VW_DEPT_SQL` 本就全量取回，故其回填可自然完成。
 */
export class AccountJobTitle1723852800000 implements MigrationInterface {
  name = 'AccountJobTitle1723852800000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE [ACCOUNT] ADD [jobTitleCode] varchar(10) NULL`);
    await q.query(`
      CREATE TABLE [JOB_TITLE] (
        [id] uniqueidentifier NOT NULL CONSTRAINT [DF_JOB_TITLE_id] DEFAULT NEWSEQUENTIALID(),
        [companyCode] varchar(10) NOT NULL,
        [code] varchar(10) NOT NULL,
        [name] nvarchar(100) NOT NULL,
        CONSTRAINT [PK_JOB_TITLE] PRIMARY KEY ([id])
      )`);
    await q.query(
      `CREATE UNIQUE INDEX [IX_JOB_TITLE_company_code] ON [JOB_TITLE] ([companyCode], [code])`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE [JOB_TITLE]`);
    await q.query(`ALTER TABLE [ACCOUNT] DROP COLUMN [jobTitleCode]`);
  }
}
