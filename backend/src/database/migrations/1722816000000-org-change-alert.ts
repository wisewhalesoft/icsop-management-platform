import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * F006 組織異動待確認提示：新建 ORG_CHANGE_ALERT（單表＋alertKind 判別欄，D1）。
 *
 *  - DOCUMENT_FIELD：documentId/documentNumber/documentName/affectedField/before/after。
 *  - CLOSED_DEPT_PERSON（契約 §7.3）：person*／dept* 欄位，不綁任何文件。
 *  - 兩類共用 status/resolutionKind/resolvedBy/resolvedAt/createdAt/sourceSyncRunId。
 *
 * 去重（D3／AC10）之 DB 層第二道防線＝filtered unique index（比照 F013 文件編號之既有作法）：
 *  - UQ_ORG_CHANGE_ALERT_doc_field：同文件同欄位至多一筆 pending。
 *  - UQ_ORG_CHANGE_ALERT_person：同員編至多一筆 pending。
 *  兩者皆限定 status='pending'，故歷史 resolved 列可重複同鍵（TS-F006-003）。
 *
 * FK：
 *  - documentId → ICSOP_DOCUMENT(id) ON DELETE CASCADE（提示隨文件刪除消失；本系統目前無文件硬刪路徑，屬防禦性）。
 *  - sourceSyncRunId → SYNC_RUN(id) ON DELETE SET NULL（來源批次被維運清除時提示本身不消失）。
 *
 * 日期欄用 datetime2（0001–9999），避免 datetime（1753–9999）於上游 CLOSE_DATE 之溢位。
 */
export class OrgChangeAlert1722816000000 implements MigrationInterface {
  name = 'OrgChangeAlert1722816000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE [ORG_CHANGE_ALERT] (
        [id] uniqueidentifier NOT NULL CONSTRAINT [DF_ORG_CHANGE_ALERT_id] DEFAULT NEWSEQUENTIALID(),
        [alertKind] varchar(30) NOT NULL,
        [documentId] uniqueidentifier NULL,
        [documentNumber] varchar(100) NULL,
        [documentName] nvarchar(200) NULL,
        [affectedField] nvarchar(30) NULL,
        [beforeValue] nvarchar(200) NULL,
        [afterValue] nvarchar(200) NULL,
        [personEmployeeNo] varchar(20) NULL,
        [personName] nvarchar(30) NULL,
        [deptOrgCode] varchar(10) NULL,
        [deptName] nvarchar(100) NULL,
        [deptCloseDate] datetime2 NULL,
        [status] varchar(20) NOT NULL CONSTRAINT [DF_ORG_CHANGE_ALERT_status] DEFAULT 'pending',
        [resolutionKind] varchar(20) NULL,
        [resolvedBy] uniqueidentifier NULL,
        [resolvedAt] datetime2 NULL,
        [createdAt] datetime2 NOT NULL,
        [sourceSyncRunId] uniqueidentifier NULL,
        CONSTRAINT [PK_ORG_CHANGE_ALERT] PRIMARY KEY ([id]),
        CONSTRAINT [FK_ORG_CHANGE_ALERT_document] FOREIGN KEY ([documentId])
          REFERENCES [ICSOP_DOCUMENT]([id]) ON DELETE CASCADE,
        CONSTRAINT [FK_ORG_CHANGE_ALERT_syncRun] FOREIGN KEY ([sourceSyncRunId])
          REFERENCES [SYNC_RUN]([id]) ON DELETE SET NULL
      )`);

    await q.query(
      `CREATE INDEX [IX_ORG_CHANGE_ALERT_status] ON [ORG_CHANGE_ALERT] ([status])`,
    );
    await q.query(
      `CREATE INDEX [IX_ORG_CHANGE_ALERT_documentId] ON [ORG_CHANGE_ALERT] ([documentId])`,
    );
    await q.query(
      `CREATE INDEX [IX_ORG_CHANGE_ALERT_sourceSyncRunId] ON [ORG_CHANGE_ALERT] ([sourceSyncRunId])`,
    );

    // 去重第二道防線（filtered unique；MSSQL 允許 WHERE 條件式唯一索引）。
    await q.query(`
      CREATE UNIQUE INDEX [UQ_ORG_CHANGE_ALERT_doc_field]
        ON [ORG_CHANGE_ALERT] ([documentId], [affectedField])
        WHERE [status] = 'pending' AND [alertKind] = 'DOCUMENT_FIELD'`);
    await q.query(`
      CREATE UNIQUE INDEX [UQ_ORG_CHANGE_ALERT_person]
        ON [ORG_CHANGE_ALERT] ([personEmployeeNo])
        WHERE [status] = 'pending' AND [alertKind] = 'CLOSED_DEPT_PERSON'`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE [ORG_CHANGE_ALERT]`);
  }
}
