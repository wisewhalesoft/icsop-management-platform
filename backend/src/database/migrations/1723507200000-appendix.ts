import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * F039 附錄管理：新建 APPENDIX_POOL（附錄池）＋ DOC_APPENDIX（文件多對多關聯，含 sortOrder）。
 * 結構比照 1722124800000-usage-form.ts；差異＝DOC_APPENDIX 多一欄 [sortOrder] int NOT NULL。
 *
 * ⚠ OQ-E10-02 已定案（architecture-spec §4.9）：**刻意不建** (documentId, sortOrder) 唯一索引——
 * 「同一文件內 1..N 連續且互異」之不變式由服務層 replaceDocumentAppendices()（單一交易
 * delete-then-insert）保證；POST／DELETE 路徑另以 sp_getapplock 序列化。
 *
 * down()：子表先於父表（比照既有 usage-form migration 順序）。
 */
export class Appendix1723507200000 implements MigrationInterface {
  name = 'Appendix1723507200000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE [APPENDIX_POOL] (
        [id] uniqueidentifier NOT NULL CONSTRAINT [DF_APPENDIX_POOL_id] DEFAULT NEWSEQUENTIALID(),
        [name] nvarchar(400) NOT NULL,
        [blobPath] varchar(1000) NOT NULL,
        [format] varchar(20) NOT NULL,
        [size] bigint NOT NULL,
        [uploadedBy] varchar(100) NOT NULL,
        [uploadedAt] datetime2 NOT NULL CONSTRAINT [DF_APPENDIX_POOL_uploadedAt] DEFAULT SYSUTCDATETIME(),
        CONSTRAINT [PK_APPENDIX_POOL] PRIMARY KEY ([id])
      )`);
    await q.query(`
      CREATE TABLE [DOC_APPENDIX] (
        [documentId] uniqueidentifier NOT NULL,
        [appendixId] uniqueidentifier NOT NULL,
        [sortOrder] int NOT NULL,
        CONSTRAINT [PK_DOC_APPENDIX] PRIMARY KEY ([documentId], [appendixId]),
        CONSTRAINT [FK_DOC_APPENDIX_document] FOREIGN KEY ([documentId])
          REFERENCES [ICSOP_DOCUMENT]([id]),
        CONSTRAINT [FK_DOC_APPENDIX_appendix] FOREIGN KEY ([appendixId])
          REFERENCES [APPENDIX_POOL]([id])
      )`);
    await q.query(
      `CREATE INDEX [IX_DOC_APPENDIX_appendixId] ON [DOC_APPENDIX] ([appendixId])`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE [DOC_APPENDIX]`);
    await q.query(`DROP TABLE [APPENDIX_POOL]`);
  }
}
