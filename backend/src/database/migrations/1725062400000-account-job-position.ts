import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 帳號「職位」欄（G-ADM-001 第 6 欄；F003 `AC-P28`～`AC-P33`）。
 * 權威：upstream-hr-source-contract.md §5.2（白名單第 11 欄 `JOB_CODE`）／§5.4.2（職位對照）。
 *
 * 背景：既有之 `jobTitleCode`／`JOB_TITLE` 顯示於畫面之欄位原名「職位」，語意實為**資位**
 * （職等：業務專員／辦事員／副理…）。真正的職位（職務位置：營業一般職／室長／處長…）
 * 另有來源，即本 migration 建立的兩件：
 *  1. `ACCOUNT.jobPositionCode` ← `VW_PERSONNEL_SQL.JOB_CODE`（代碼，非名稱）。
 *     ⚠ 該欄名與 `VW_DEPT_SQL.JOB_CODE`（＝部門主管員編，F014 來源）**同名異義**。
 *  2. `JOB_POSITION` 對照主檔 ← `VW_JOB_FUN` 之 `(COMPID, CODE, DESC_CHI)`。
 *
 * ⚠ 名稱刻意不落在 ACCOUNT：理由與 `1723852800000-account-job-title` 完全相同
 *   （帳號增量以 `MTDT` 為水位，僅主檔改名不會觸發帳號重寫，顯示值將永久過時）。
 *
 * 🔴 唯一鍵為 (companyCode, code) 而非單獨 code，且解析端**禁止跨公司 fallback**：
 *   實測 2026-08-31 四家 73 列中有 7 碼跨公司一碼多名且語意可相反
 *   （`D04` AS＝營業經理／AD＝科長；`C04` AD＝部長／他家＝處長）。
 *
 * 本 migration 僅建結構、不 backfill：`jobPositionCode` 於既有列為 NULL。
 *
 * 🔴 **回填必須手動觸發一次全量重同步**：`SYNC_FULL_RESYNC=1 npm run sync:once`
 *    （⚠ 不可用 `-- --full`：argv 會被 ts-node／dotenvx 包裝層吃掉，實測收不到）。
 *    帳號同步為**增量**（`MTDT > watermark`），既有帳號不會出現在增量結果中——
 *    與 `1723852800000` 踩過的是同一顆雷。另 `classifyAccount` 已將 `jobPositionCode`
 *    納入比對，否則即使全量重同步也會整批判為 noop 而寫不進去。
 */
export class AccountJobPosition1725062400000 implements MigrationInterface {
  name = 'AccountJobPosition1725062400000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE [ACCOUNT] ADD [jobPositionCode] varchar(10) NULL`,
    );
    await q.query(`
      CREATE TABLE [JOB_POSITION] (
        [id] uniqueidentifier NOT NULL CONSTRAINT [DF_JOB_POSITION_id] DEFAULT NEWSEQUENTIALID(),
        [companyCode] varchar(10) NOT NULL,
        [code] varchar(10) NOT NULL,
        [name] nvarchar(100) NOT NULL,
        CONSTRAINT [PK_JOB_POSITION] PRIMARY KEY ([id])
      )`);
    await q.query(
      `CREATE UNIQUE INDEX [IX_JOB_POSITION_company_code] ON [JOB_POSITION] ([companyCode], [code])`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE [JOB_POSITION]`);
    await q.query(`ALTER TABLE [ACCOUNT] DROP COLUMN [jobPositionCode]`);
  }
}
