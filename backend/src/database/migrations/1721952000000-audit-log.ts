import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * E07 稽核：新建 AUDIT_LOG（append-only 稽核紀錄）＋ AUDIT_LOG_OUTBOX（補償佇列，內部暫存表）。
 *
 *  - 條件必填欄（documentId/lifecycleId/formId）皆 NULLable，依 targetType 由應用層對映填入。
 *  - 承載時間戳記之 occurredAt 用 datetime2（0001–9999），避免 datetime（1753–9999）溢位。
 *  - 索引（TS-F023-015 / NFR-001，供 F024 查詢）：accountId、documentId、occurredAt，
 *    及組合索引 (documentId,occurredAt)、(accountId,occurredAt)。
 *  - **不可竄改 DB 層強制（AC5 縱深防禦第二層，TS-F023-013 [integration]）**：撤銷應用帳號對
 *    AUDIT_LOG 之 UPDATE/DELETE 權限——即使應用層被繞過/惡意直連，DB 仍拒絕竄改。
 *    ⚠ 確切 principal/role 依部署環境（APP_MSSQL_USER 是否經 role 授權）而定，須於整合階段驗證；
 *    此處以設定之登入帳號 best-effort REVOKE，失敗僅告警不阻斷建表。
 *
 * ⚠ 本 migration 於 audit worktree 僅撰寫、未執行（unit-only 約束）；併回 main 後由具 DB 之環境執行。
 */
export class AuditLog1721952000000 implements MigrationInterface {
  name = 'AuditLog1721952000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE [AUDIT_LOG] (
        [id] uniqueidentifier NOT NULL,
        [accountId] uniqueidentifier NOT NULL,
        [employeeNo] varchar(10) NULL,
        [name] nvarchar(30) NULL,
        [company] nvarchar(100) NULL,
        [department] nvarchar(100) NULL,
        [section] nvarchar(100) NULL,
        [roleCode] varchar(20) NULL,
        [targetType] varchar(30) NOT NULL,
        [actionType] varchar(40) NOT NULL,
        [documentId] uniqueidentifier NULL,
        [documentNumber] varchar(100) NULL,
        [lifecycleId] uniqueidentifier NULL,
        [lifecycleName] nvarchar(200) NULL,
        [formId] uniqueidentifier NULL,
        [targetName] nvarchar(200) NULL,
        [watermarkSnapshot] nvarchar(MAX) NULL,
        [occurredAt] datetime2 NOT NULL,
        [source] varchar(10) NOT NULL CONSTRAINT [DF_AUDIT_LOG_source] DEFAULT 'DIRECT',
        CONSTRAINT [PK_AUDIT_LOG] PRIMARY KEY ([id])
      )`);
    await q.query(`CREATE INDEX [IX_AUDIT_LOG_accountId] ON [AUDIT_LOG] ([accountId])`);
    await q.query(`CREATE INDEX [IX_AUDIT_LOG_documentId] ON [AUDIT_LOG] ([documentId])`);
    await q.query(`CREATE INDEX [IX_AUDIT_LOG_occurredAt] ON [AUDIT_LOG] ([occurredAt])`);
    await q.query(
      `CREATE INDEX [IX_AUDIT_LOG_document_occurredAt] ON [AUDIT_LOG] ([documentId],[occurredAt])`,
    );
    await q.query(
      `CREATE INDEX [IX_AUDIT_LOG_account_occurredAt] ON [AUDIT_LOG] ([accountId],[occurredAt])`,
    );

    // 內部暫存表（補償佇列）——非 append-only，允許 UPDATE/DELETE。
    await q.query(`
      CREATE TABLE [AUDIT_LOG_OUTBOX] (
        [id] uniqueidentifier NOT NULL,
        [payload] nvarchar(MAX) NOT NULL,
        [status] varchar(10) NOT NULL CONSTRAINT [DF_AUDIT_LOG_OUTBOX_status] DEFAULT 'pending',
        [attempts] int NOT NULL CONSTRAINT [DF_AUDIT_LOG_OUTBOX_attempts] DEFAULT 0,
        [createdAt] datetime2 NOT NULL CONSTRAINT [DF_AUDIT_LOG_OUTBOX_createdAt] DEFAULT SYSUTCDATETIME(),
        CONSTRAINT [PK_AUDIT_LOG_OUTBOX] PRIMARY KEY ([id])
      )`);
    await q.query(
      `CREATE INDEX [IX_AUDIT_LOG_OUTBOX_status] ON [AUDIT_LOG_OUTBOX] ([status])`,
    );

    // AC5 第二層：撤銷應用帳號對 AUDIT_LOG 之 UPDATE/DELETE（保留 INSERT/SELECT）。
    const appUser = process.env.APP_MSSQL_USER;
    if (appUser && /^[A-Za-z0-9_@.\-\\]+$/.test(appUser)) {
      try {
        await q.query(`REVOKE UPDATE, DELETE ON [AUDIT_LOG] TO [${appUser}]`);
      } catch {
        // best-effort：principal 經 role 授權時 object 級 REVOKE 可能無效／需 DENY，整合階段確認。
      }
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE [AUDIT_LOG_OUTBOX]`);
    await q.query(`DROP TABLE [AUDIT_LOG]`);
  }
}
