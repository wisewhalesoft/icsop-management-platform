import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Baseline：auth／組織核心三表（ROLE / ORG_UNIT / ACCOUNT）。
 * 其餘實體（DOCUMENT、LIFECYCLE、AUDIT_LOG…）由後續 feature 之 /tdd migration 逐步加入。
 * 目標 DB＝外部 MSSQL（APP_MSSQL_*）。
 */
export class BaselineAuthOrg1721520000000 implements MigrationInterface {
  name = 'BaselineAuthOrg1721520000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE [ROLE] (
        [code] varchar(20) NOT NULL,
        [name] nvarchar(50) NOT NULL,
        CONSTRAINT [PK_ROLE] PRIMARY KEY ([code])
      )`);

    await q.query(`
      CREATE TABLE [ORG_UNIT] (
        [id] uniqueidentifier NOT NULL CONSTRAINT [DF_ORG_UNIT_id] DEFAULT NEWSEQUENTIALID(),
        [companyCode] varchar(10) NOT NULL,
        [orgCode] varchar(10) NOT NULL,
        [codePrefix] varchar(10) NOT NULL,
        [tier] varchar(20) NOT NULL,
        [name] nvarchar(100) NOT NULL,
        [managerEmpNo] varchar(10) NULL,
        [isActive] bit NOT NULL CONSTRAINT [DF_ORG_UNIT_isActive] DEFAULT 1,
        CONSTRAINT [PK_ORG_UNIT] PRIMARY KEY ([id])
      )`);
    await q.query(
      `CREATE UNIQUE INDEX [IX_ORG_UNIT_company_code] ON [ORG_UNIT] ([companyCode], [orgCode])`,
    );
    await q.query(`CREATE INDEX [IX_ORG_UNIT_orgCode] ON [ORG_UNIT] ([orgCode])`);

    await q.query(`
      CREATE TABLE [ACCOUNT] (
        [id] uniqueidentifier NOT NULL CONSTRAINT [DF_ACCOUNT_id] DEFAULT NEWSEQUENTIALID(),
        [companyCode] varchar(10) NOT NULL,
        [loginId] varchar(20) NOT NULL,
        [employeeNo] varchar(10) NULL,
        [name] nvarchar(30) NULL,
        [email] varchar(100) NULL,
        [orgCode] varchar(10) NULL,
        [roleCode] varchar(20) NOT NULL,
        [status] varchar(10) NOT NULL CONSTRAINT [DF_ACCOUNT_status] DEFAULT 'active',
        [passwordHash] varchar(200) NULL,
        [source] varchar(10) NOT NULL CONSTRAINT [DF_ACCOUNT_source] DEFAULT 'upstream',
        CONSTRAINT [PK_ACCOUNT] PRIMARY KEY ([id]),
        CONSTRAINT [UQ_ACCOUNT_company_login] UNIQUE ([companyCode], [loginId])
      )`);
    await q.query(`CREATE INDEX [IX_ACCOUNT_email] ON [ACCOUNT] ([email])`);
    await q.query(
      `ALTER TABLE [ACCOUNT] ADD CONSTRAINT [FK_ACCOUNT_role] FOREIGN KEY ([roleCode]) REFERENCES [ROLE] ([code])`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE [ACCOUNT] DROP CONSTRAINT [FK_ACCOUNT_role]`);
    await q.query(`DROP TABLE [ACCOUNT]`);
    await q.query(`DROP TABLE [ORG_UNIT]`);
    await q.query(`DROP TABLE [ROLE]`);
  }
}
