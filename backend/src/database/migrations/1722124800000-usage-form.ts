import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * F018 使用表單：新建 USAGE_FORM_POOL（表單池）+ DOC_USAGE_FORM（文件多對多關聯）。
 *  - 表單池覆蓋式（不留歷史版本）；size bigint。
 *  - DOC_USAGE_FORM 複合 PK (documentId, formId)，雙向 FK；formId 上建索引供關聯數查詢。
 * 註：本檔僅撰寫、未於 storage worktree 執行（unit-only）。
 */
export class UsageForm1722124800000 implements MigrationInterface {
  name = 'UsageForm1722124800000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE [USAGE_FORM_POOL] (
        [id] uniqueidentifier NOT NULL CONSTRAINT [DF_USAGE_FORM_POOL_id] DEFAULT NEWSEQUENTIALID(),
        [name] nvarchar(400) NOT NULL,
        [blobPath] varchar(1000) NOT NULL,
        [format] varchar(20) NOT NULL,
        [size] bigint NOT NULL,
        [uploadedBy] varchar(100) NOT NULL,
        [uploadedAt] datetime2 NOT NULL CONSTRAINT [DF_USAGE_FORM_POOL_uploadedAt] DEFAULT SYSUTCDATETIME(),
        CONSTRAINT [PK_USAGE_FORM_POOL] PRIMARY KEY ([id])
      )`);
    await q.query(`
      CREATE TABLE [DOC_USAGE_FORM] (
        [documentId] uniqueidentifier NOT NULL,
        [formId] uniqueidentifier NOT NULL,
        CONSTRAINT [PK_DOC_USAGE_FORM] PRIMARY KEY ([documentId], [formId]),
        CONSTRAINT [FK_DOC_USAGE_FORM_document] FOREIGN KEY ([documentId])
          REFERENCES [ICSOP_DOCUMENT]([id]),
        CONSTRAINT [FK_DOC_USAGE_FORM_form] FOREIGN KEY ([formId])
          REFERENCES [USAGE_FORM_POOL]([id])
      )`);
    await q.query(
      `CREATE INDEX [IX_DOC_USAGE_FORM_formId] ON [DOC_USAGE_FORM] ([formId])`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE [DOC_USAGE_FORM]`);
    await q.query(`DROP TABLE [USAGE_FORM_POOL]`);
  }
}
