import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * F043 業務/功能類別管理（E12）：新建核心四張表——
 * `BUSINESS_CATEGORY`（類別池）／`BUSINESS_CATEGORY_NODE`（DAG 節點）／
 * `BUSINESS_CATEGORY_EDGE`（DAG 有向邊）／`BUSINESS_CATEGORY_DOC`（M:N 掛載列）。
 *
 * 權威：docs/specs/architecture-spec.md §14.4 表 1 之 SQL 要點（逐字落地）；
 * docs/specs/data-model.md #business-category-entity（INV-B1～INV-B6）。
 *
 * 🔴 **INV-B1**：`(name, subcategory)` 唯一索引——MSSQL 視多個 NULL 為**相等**，故對
 * 「同名之無子分類列至多一筆」恰好正確（比照 F040／LIFECYCLE 之既有結論）。本表為新建空表，
 * 不需前置盤點清理。
 *
 * 🔴 **INV-B6**：`BUSINESS_CATEGORY_DOC` 之唯一鍵**恰為** `(nodeId, documentId)` 一組；
 * **不得**另建 `(businessCategoryId, documentId)` 或單獨 `(documentId)` 之唯一鍵——那會把 M:N
 * 模型悄悄改回「一份文件只能掛一個類別」。
 *
 * 🔴 **決策 E8（architecture-spec §14.6.7）之混合處置**：
 *   · `documentId` 側建 **FK ON DELETE CASCADE**（今日休眠——`ICSOP_DOCUMENT` 從未被硬刪除——
 *     但零額外風險，且是決策 E9 判定「不加冗餘 `businessCategoryId` 欄」之防禦補強）；
 *   · `nodeId` 側**刻意不建 FK**：刪節點需**先**取得「將移除 N 筆掛載關係」之計數以驅動二次
 *     確認（`AC-18`），FK CASCADE 無法提供這個時序；改由 `deleteNodeWithEdges()` 於同一交易內
 *     顯式 DELETE。
 *   · `businessCategoryId`／`sourceNodeId`／`targetNodeId` 皆不宣告 DB FK——比照既有
 *     `LIFECYCLE_NODE`／`LIFECYCLE_EDGE` 之一貫寫法，完整性由服務層與交易邊界把關。
 *
 * `down()`：子表先於父表（DOC → EDGE → NODE → BUSINESS_CATEGORY），比照既有慣例。
 */
export class BusinessCategory1725321600000 implements MigrationInterface {
  name = 'BusinessCategory1725321600000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE [BUSINESS_CATEGORY] (
        [id] uniqueidentifier NOT NULL CONSTRAINT [DF_BUSINESS_CATEGORY_id] DEFAULT NEWSEQUENTIALID(),
        [name] nvarchar(100) NOT NULL,
        [subcategory] nvarchar(100) NULL,
        [description] nvarchar(500) NULL,
        [status] varchar(10) NOT NULL CONSTRAINT [DF_BUSINESS_CATEGORY_status] DEFAULT 'active',
        [createdAt] datetime2 NOT NULL,
        [updatedAt] datetime2 NOT NULL,
        CONSTRAINT [PK_BUSINESS_CATEGORY] PRIMARY KEY ([id])
      )`);
    await q.query(
      `CREATE UNIQUE INDEX [UQ_BUSINESS_CATEGORY_name_subcategory] ON [BUSINESS_CATEGORY] ([name],[subcategory])`,
    );

    await q.query(`
      CREATE TABLE [BUSINESS_CATEGORY_NODE] (
        [id] uniqueidentifier NOT NULL CONSTRAINT [DF_BUSINESS_CATEGORY_NODE_id] DEFAULT NEWSEQUENTIALID(),
        [businessCategoryId] uniqueidentifier NOT NULL,
        [name] nvarchar(100) NULL,
        [positionX] float NOT NULL CONSTRAINT [DF_BCN_positionX] DEFAULT 0,
        [positionY] float NOT NULL CONSTRAINT [DF_BCN_positionY] DEFAULT 0,
        CONSTRAINT [PK_BUSINESS_CATEGORY_NODE] PRIMARY KEY ([id])
      )`);
    await q.query(
      `CREATE INDEX [IX_BUSINESS_CATEGORY_NODE_businessCategoryId] ON [BUSINESS_CATEGORY_NODE] ([businessCategoryId])`,
    );

    await q.query(`
      CREATE TABLE [BUSINESS_CATEGORY_EDGE] (
        [id] uniqueidentifier NOT NULL CONSTRAINT [DF_BUSINESS_CATEGORY_EDGE_id] DEFAULT NEWSEQUENTIALID(),
        [businessCategoryId] uniqueidentifier NOT NULL,
        [sourceNodeId] uniqueidentifier NOT NULL,
        [targetNodeId] uniqueidentifier NOT NULL,
        CONSTRAINT [PK_BUSINESS_CATEGORY_EDGE] PRIMARY KEY ([id])
      )`);
    await q.query(
      `CREATE INDEX [IX_BUSINESS_CATEGORY_EDGE_businessCategoryId] ON [BUSINESS_CATEGORY_EDGE] ([businessCategoryId])`,
    );

    await q.query(`
      CREATE TABLE [BUSINESS_CATEGORY_DOC] (
        [id] uniqueidentifier NOT NULL CONSTRAINT [DF_BUSINESS_CATEGORY_DOC_id] DEFAULT NEWSEQUENTIALID(),
        [nodeId] uniqueidentifier NOT NULL,
        [documentId] uniqueidentifier NOT NULL,
        [mountedByAccountId] uniqueidentifier NOT NULL,
        [mountedAt] datetime2 NOT NULL,
        CONSTRAINT [PK_BUSINESS_CATEGORY_DOC] PRIMARY KEY ([id]),
        CONSTRAINT [FK_BUSINESS_CATEGORY_DOC_document] FOREIGN KEY ([documentId])
          REFERENCES [ICSOP_DOCUMENT]([id]) ON DELETE CASCADE
      )`);
    await q.query(
      `CREATE UNIQUE INDEX [UQ_BUSINESS_CATEGORY_DOC_node_document] ON [BUSINESS_CATEGORY_DOC] ([nodeId],[documentId])`,
    );
    await q.query(
      `CREATE INDEX [IX_BUSINESS_CATEGORY_DOC_documentId] ON [BUSINESS_CATEGORY_DOC] ([documentId])`,
    );
    await q.query(
      `CREATE INDEX [IX_BUSINESS_CATEGORY_DOC_nodeId] ON [BUSINESS_CATEGORY_DOC] ([nodeId])`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE [BUSINESS_CATEGORY_DOC]`);
    await q.query(`DROP TABLE [BUSINESS_CATEGORY_EDGE]`);
    await q.query(`DROP TABLE [BUSINESS_CATEGORY_NODE]`);
    await q.query(`DROP TABLE [BUSINESS_CATEGORY]`);
  }
}
