import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * F027 .xls 原件：新建 DOC_SOURCE_XLS（1:1 覆蓋式，RAG 內容來源）。
 *  - documentId FK → ICSOP_DOCUMENT，UNIQUE（1:1）。
 *  - edition：上傳當下文件版次快照（nullable，文件未有版次時 null）。
 *  - 無 conversionStatus / derivedPdfAttachmentId（OQ-E09-10 定案：取消自動轉檔）。
 * 註：本檔僅撰寫、未於 storage worktree 執行（unit-only）。
 */
export class DocSourceXls1722038400000 implements MigrationInterface {
  name = 'DocSourceXls1722038400000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE [DOC_SOURCE_XLS] (
        [id] uniqueidentifier NOT NULL CONSTRAINT [DF_DOC_SOURCE_XLS_id] DEFAULT NEWSEQUENTIALID(),
        [documentId] uniqueidentifier NOT NULL,
        [blobPath] varchar(1000) NOT NULL,
        [fileName] nvarchar(400) NOT NULL,
        [contentType] varchar(200) NOT NULL,
        [size] bigint NOT NULL,
        [edition] varchar(20) NULL,
        [uploadedBy] varchar(100) NOT NULL,
        [uploadedAt] datetime2 NOT NULL CONSTRAINT [DF_DOC_SOURCE_XLS_uploadedAt] DEFAULT SYSUTCDATETIME(),
        CONSTRAINT [PK_DOC_SOURCE_XLS] PRIMARY KEY ([id]),
        CONSTRAINT [FK_DOC_SOURCE_XLS_document] FOREIGN KEY ([documentId])
          REFERENCES [ICSOP_DOCUMENT]([id])
      )`);
    // 1:1：一文件至多一份 .xls 原件。
    await q.query(`
      CREATE UNIQUE INDEX [UQ_DOC_SOURCE_XLS_documentId]
        ON [DOC_SOURCE_XLS] ([documentId])`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE [DOC_SOURCE_XLS]`);
  }
}
