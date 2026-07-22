import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * E04 ICSOP 文件：新建 ICSOP_DOCUMENT（scalar 欄位）。
 *  - lifecycleId FK → LIFECYCLE（NO ACTION：刪循環有文件時，app 層先以 LIFECYCLE_HAS_DOCUMENTS 擋，
 *    FK 為第二道防線；不 cascade，避免刪循環誤刪文件）。
 *  - F013 唯一性：filtered unique index（僅比對 status IN('active','void')；'inactive' 編號釋出可重用）。
 *  - 多值關聯（次要當責室長/使用部門）、附件、連結點為後續增量。
 */
export class IcsopDocument1721865600000 implements MigrationInterface {
  name = 'IcsopDocument1721865600000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE [ICSOP_DOCUMENT] (
        [id] uniqueidentifier NOT NULL CONSTRAINT [DF_ICSOP_DOCUMENT_id] DEFAULT NEWSEQUENTIALID(),
        [status] varchar(20) NOT NULL CONSTRAINT [DF_ICSOP_DOCUMENT_status] DEFAULT 'active',
        [documentNumber] varchar(100) NOT NULL,
        [documentName] nvarchar(200) NOT NULL,
        [lifecycleId] uniqueidentifier NOT NULL,
        [nodeId] uniqueidentifier NULL,
        [draftingCompanyId] uniqueidentifier NULL,
        [draftingDeptId] uniqueidentifier NULL,
        [draftingSectionId] uniqueidentifier NULL,
        [primaryChiefId] varchar(20) NULL,
        [edition] varchar(20) NULL,
        [announcedDate] datetime2 NULL,
        [contentSummary] nvarchar(2000) NULL,
        [createdAt] datetime2 NOT NULL CONSTRAINT [DF_ICSOP_DOCUMENT_createdAt] DEFAULT SYSUTCDATETIME(),
        [updatedAt] datetime2 NOT NULL CONSTRAINT [DF_ICSOP_DOCUMENT_updatedAt] DEFAULT SYSUTCDATETIME(),
        CONSTRAINT [PK_ICSOP_DOCUMENT] PRIMARY KEY ([id]),
        CONSTRAINT [FK_ICSOP_DOCUMENT_lifecycle] FOREIGN KEY ([lifecycleId])
          REFERENCES [LIFECYCLE]([id])
      )`);
    await q.query(`CREATE INDEX [IX_ICSOP_DOCUMENT_lifecycleId] ON [ICSOP_DOCUMENT] ([lifecycleId])`);
    await q.query(`CREATE INDEX [IX_ICSOP_DOCUMENT_number] ON [ICSOP_DOCUMENT] ([documentNumber])`);
    // F013：唯一性僅限「有效＋作廢」；「失效」編號釋出可重用 → 條件式唯一索引。
    await q.query(`
      CREATE UNIQUE INDEX [UQ_ICSOP_DOCUMENT_number_active_void]
        ON [ICSOP_DOCUMENT] ([documentNumber])
        WHERE [status] IN ('active','void')`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE [ICSOP_DOCUMENT]`);
  }
}
