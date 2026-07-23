import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * F014 制定組織與當責室長（create-side）：
 *
 * 1) 制定公司/部門/室別欄位型別修正 uniqueidentifier → varchar(10)。
 *    ⚠ 背景：icsop-document 初版將 draftingCompanyId/DeptId/SectionId 建為 uniqueidentifier，
 *    但 org-directory 讀取端（/org-units）與名稱解析（NameResolutionService.resolveOrgUnitName＝
 *    findByOrgCode）一律以 ORG_UNIT.orgCode（5 碼業務鍵）為參照，前端下拉亦僅取得 orgCode（不暴露 UUID）。
 *    故此三欄實際承載 orgCode 字串；沿用 uniqueidentifier 會使寫入 orgCode 時 MSSQL 轉型失敗。
 *    此處校正為 varchar(10)（對齊 ORG_UNIT.orgCode 長度）。既有列皆 NULL（本功能為首個落地端），轉型安全。
 *
 * 2) 新建多值關聯表 DOC_SECONDARY_CHIEF（當責室長-次要 employeeNo）、DOC_USING_DEPT（使用部門 orgCode）；
 *    FK → ICSOP_DOCUMENT ON DELETE CASCADE；各自 (documentId, key) 複合唯一。
 *
 * 本檔對真實 SOP 執行（migration:run）。
 */
export class DocOrgMultivalue1722556800000 implements MigrationInterface {
  name = 'DocOrgMultivalue1722556800000';

  public async up(q: QueryRunner): Promise<void> {
    // 1) 制定組織三欄型別校正（uniqueidentifier → varchar(10)，承載 ORG_UNIT.orgCode）。
    await q.query(`ALTER TABLE [ICSOP_DOCUMENT] ALTER COLUMN [draftingCompanyId] varchar(10) NULL`);
    await q.query(`ALTER TABLE [ICSOP_DOCUMENT] ALTER COLUMN [draftingDeptId] varchar(10) NULL`);
    await q.query(`ALTER TABLE [ICSOP_DOCUMENT] ALTER COLUMN [draftingSectionId] varchar(10) NULL`);

    // 2) 當責室長-次要（多值）。
    await q.query(`
      CREATE TABLE [DOC_SECONDARY_CHIEF] (
        [id] uniqueidentifier NOT NULL CONSTRAINT [DF_DOC_SECONDARY_CHIEF_id] DEFAULT NEWSEQUENTIALID(),
        [documentId] uniqueidentifier NOT NULL,
        [employeeNo] varchar(20) NOT NULL,
        CONSTRAINT [PK_DOC_SECONDARY_CHIEF] PRIMARY KEY ([id]),
        CONSTRAINT [FK_DOC_SECONDARY_CHIEF_document] FOREIGN KEY ([documentId])
          REFERENCES [ICSOP_DOCUMENT]([id]) ON DELETE CASCADE
      )`);
    await q.query(
      `CREATE INDEX [IX_DOC_SECONDARY_CHIEF_doc] ON [DOC_SECONDARY_CHIEF] ([documentId])`,
    );
    await q.query(`
      CREATE UNIQUE INDEX [UQ_DOC_SECONDARY_CHIEF_doc_emp]
        ON [DOC_SECONDARY_CHIEF] ([documentId], [employeeNo])`);

    // 3) 文件使用部門（多值）。
    await q.query(`
      CREATE TABLE [DOC_USING_DEPT] (
        [id] uniqueidentifier NOT NULL CONSTRAINT [DF_DOC_USING_DEPT_id] DEFAULT NEWSEQUENTIALID(),
        [documentId] uniqueidentifier NOT NULL,
        [orgCode] varchar(10) NOT NULL,
        CONSTRAINT [PK_DOC_USING_DEPT] PRIMARY KEY ([id]),
        CONSTRAINT [FK_DOC_USING_DEPT_document] FOREIGN KEY ([documentId])
          REFERENCES [ICSOP_DOCUMENT]([id]) ON DELETE CASCADE
      )`);
    await q.query(`CREATE INDEX [IX_DOC_USING_DEPT_doc] ON [DOC_USING_DEPT] ([documentId])`);
    await q.query(`
      CREATE UNIQUE INDEX [UQ_DOC_USING_DEPT_doc_org]
        ON [DOC_USING_DEPT] ([documentId], [orgCode])`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE [DOC_USING_DEPT]`);
    await q.query(`DROP TABLE [DOC_SECONDARY_CHIEF]`);
    await q.query(`ALTER TABLE [ICSOP_DOCUMENT] ALTER COLUMN [draftingSectionId] uniqueidentifier NULL`);
    await q.query(`ALTER TABLE [ICSOP_DOCUMENT] ALTER COLUMN [draftingDeptId] uniqueidentifier NULL`);
    await q.query(`ALTER TABLE [ICSOP_DOCUMENT] ALTER COLUMN [draftingCompanyId] uniqueidentifier NULL`);
  }
}
