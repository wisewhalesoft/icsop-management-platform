import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * F016 附件：新建 DOCUMENT_ATTACHMENT（承載 ICSOP_PDF / OJT_SIGNIN 單份覆蓋式附件）。
 *  - documentId FK → ICSOP_DOCUMENT（NO ACTION；刪文件之連帶清理由 app 層處理）。
 *  - (documentId, type) 唯一（單份覆蓋式）→ filtered unique index。
 *  - size 以 bigint（bytes，最多 50MB，但保留彈性）。
 * 註：本檔僅撰寫、未於 storage worktree 執行（unit-only；migration:run 待整合階段）。
 */
export class DocumentAttachment1721955600000 implements MigrationInterface {
  name = 'DocumentAttachment1721955600000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE [DOCUMENT_ATTACHMENT] (
        [id] uniqueidentifier NOT NULL CONSTRAINT [DF_DOCUMENT_ATTACHMENT_id] DEFAULT NEWSEQUENTIALID(),
        [documentId] uniqueidentifier NOT NULL,
        [type] varchar(20) NOT NULL,
        [fileName] nvarchar(400) NOT NULL,
        [blobPath] varchar(1000) NOT NULL,
        [contentType] varchar(200) NOT NULL,
        [size] bigint NOT NULL,
        [uploadedBy] varchar(100) NOT NULL,
        [uploadedAt] datetime2 NOT NULL CONSTRAINT [DF_DOCUMENT_ATTACHMENT_uploadedAt] DEFAULT SYSUTCDATETIME(),
        CONSTRAINT [PK_DOCUMENT_ATTACHMENT] PRIMARY KEY ([id]),
        CONSTRAINT [FK_DOCUMENT_ATTACHMENT_document] FOREIGN KEY ([documentId])
          REFERENCES [ICSOP_DOCUMENT]([id])
      )`);
    await q.query(
      `CREATE INDEX [IX_DOCUMENT_ATTACHMENT_documentId] ON [DOCUMENT_ATTACHMENT] ([documentId])`,
    );
    // 單份覆蓋式：同一文件同一類型至多 1 份。
    await q.query(`
      CREATE UNIQUE INDEX [UQ_DOCUMENT_ATTACHMENT_document_type]
        ON [DOCUMENT_ATTACHMENT] ([documentId], [type])`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE [DOCUMENT_ATTACHMENT]`);
  }
}
