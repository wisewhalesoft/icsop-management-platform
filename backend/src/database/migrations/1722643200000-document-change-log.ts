import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * F037 文件變更歷程：新建 DOCUMENT_CHANGE_LOG（append-only 欄位層 before/after 事件日誌）。
 *
 *  - 每列＝一次某文件某欄位之變更（documentId, changeType, field, oldValue, newValue, actorId, occurredAt）。
 *  - oldValue/newValue 為字串化欄位值（可長）→ nvarchar(MAX)。
 *  - occurredAt 用 datetime2（0001–9999，避免 datetime 溢位；比照 AUDIT_LOG）。
 *  - 操作者身分（actorId/actorName/actorEmployeeNo）為寫入當下快照，避免日後改名使歷史跑掉。
 *  - 索引：documentId、occurredAt、組合 (documentId, occurredAt)（供依文件/時間查詢）。
 *  - **不可竄改 DB 層強制（縱深防禦第二層）**：撤銷應用帳號對本表之 UPDATE/DELETE（保留 INSERT/SELECT）；
 *    principal 依部署環境而定，best-effort REVOKE 失敗僅告警不阻斷建表（整合階段確認，比照 AUDIT_LOG）。
 */
export class DocumentChangeLog1722643200000 implements MigrationInterface {
  name = 'DocumentChangeLog1722643200000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE [DOCUMENT_CHANGE_LOG] (
        [id] uniqueidentifier NOT NULL,
        [documentId] uniqueidentifier NOT NULL,
        [documentNumber] varchar(100) NULL,
        [changeType] varchar(20) NOT NULL,
        [field] varchar(100) NOT NULL,
        [oldValue] nvarchar(MAX) NULL,
        [newValue] nvarchar(MAX) NULL,
        [actorId] uniqueidentifier NULL,
        [actorName] nvarchar(30) NULL,
        [actorEmployeeNo] varchar(10) NULL,
        [occurredAt] datetime2 NOT NULL,
        CONSTRAINT [PK_DOCUMENT_CHANGE_LOG] PRIMARY KEY ([id])
      )`);
    await q.query(
      `CREATE INDEX [IX_DOC_CHANGE_LOG_documentId] ON [DOCUMENT_CHANGE_LOG] ([documentId])`,
    );
    await q.query(
      `CREATE INDEX [IX_DOC_CHANGE_LOG_occurredAt] ON [DOCUMENT_CHANGE_LOG] ([occurredAt])`,
    );
    await q.query(
      `CREATE INDEX [IX_DOC_CHANGE_LOG_document_occurredAt] ON [DOCUMENT_CHANGE_LOG] ([documentId],[occurredAt])`,
    );

    const appUser = process.env.APP_MSSQL_USER;
    if (appUser && /^[A-Za-z0-9_@.\-\\]+$/.test(appUser)) {
      try {
        await q.query(`REVOKE UPDATE, DELETE ON [DOCUMENT_CHANGE_LOG] TO [${appUser}]`);
      } catch {
        // best-effort：principal 經 role 授權時 object 級 REVOKE 可能無效／需 DENY，整合階段確認。
      }
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE [DOCUMENT_CHANGE_LOG]`);
  }
}
