import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * F015 文件連結點：新建 DOCUMENT_LINK（單向 source→target）。
 *  - sourceDocumentId / targetDocumentId FK → ICSOP_DOCUMENT（NO ACTION；刪文件之連帶清理由 app 層處理）。
 *  - (sourceDocumentId, targetDocumentId) 複合唯一（避免重複列，OQ-F015-04 採去重）。
 *  - source 索引供 F017「連結點程序書」反查與清單標示。
 * 註：本檔僅撰寫、未執行（unit-only；migration:run 待整合階段）。
 */
export class DocumentLink1722297600000 implements MigrationInterface {
  name = 'DocumentLink1722297600000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE [DOCUMENT_LINK] (
        [id] uniqueidentifier NOT NULL CONSTRAINT [DF_DOCUMENT_LINK_id] DEFAULT NEWSEQUENTIALID(),
        [sourceDocumentId] uniqueidentifier NOT NULL,
        [targetDocumentId] uniqueidentifier NOT NULL,
        [createdAt] datetime2 NOT NULL CONSTRAINT [DF_DOCUMENT_LINK_createdAt] DEFAULT SYSUTCDATETIME(),
        CONSTRAINT [PK_DOCUMENT_LINK] PRIMARY KEY ([id]),
        CONSTRAINT [FK_DOCUMENT_LINK_source] FOREIGN KEY ([sourceDocumentId])
          REFERENCES [ICSOP_DOCUMENT]([id]),
        CONSTRAINT [FK_DOCUMENT_LINK_target] FOREIGN KEY ([targetDocumentId])
          REFERENCES [ICSOP_DOCUMENT]([id])
      )`);
    await q.query(
      `CREATE INDEX [IX_DOCUMENT_LINK_source] ON [DOCUMENT_LINK] ([sourceDocumentId])`,
    );
    await q.query(`
      CREATE UNIQUE INDEX [UQ_DOCUMENT_LINK_source_target]
        ON [DOCUMENT_LINK] ([sourceDocumentId], [targetDocumentId])`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE [DOCUMENT_LINK]`);
  }
}
