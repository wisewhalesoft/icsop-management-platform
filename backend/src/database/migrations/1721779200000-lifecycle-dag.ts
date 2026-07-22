import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * E03 循環 DAG：新建 LIFECYCLE / LIFECYCLE_NODE / LIFECYCLE_EDGE。
 *  - NODE/EDGE 之 lifecycleId FK ON DELETE CASCADE：刪除循環自動移除其節點與連線（F007/OQ-E03-03）。
 *  - EDGE 之 sourceNodeId/targetNodeId 不加 FK（避免 MSSQL 多重 cascade path 限制）；
 *    節點刪除連動邊之整合性由 app 層（F008）於交易內維護。
 *  - 成環/self-loop 不變式由 F008 後端交易內權威驗證，非 DB 約束。
 */
export class LifecycleDag1721779200000 implements MigrationInterface {
  name = 'LifecycleDag1721779200000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE [LIFECYCLE] (
        [id] uniqueidentifier NOT NULL CONSTRAINT [DF_LIFECYCLE_id] DEFAULT NEWSEQUENTIALID(),
        [name] nvarchar(100) NOT NULL,
        [description] nvarchar(500) NULL,
        [status] varchar(10) NOT NULL CONSTRAINT [DF_LIFECYCLE_status] DEFAULT 'active',
        [createdAt] datetime2 NOT NULL CONSTRAINT [DF_LIFECYCLE_createdAt] DEFAULT SYSUTCDATETIME(),
        [updatedAt] datetime2 NOT NULL CONSTRAINT [DF_LIFECYCLE_updatedAt] DEFAULT SYSUTCDATETIME(),
        CONSTRAINT [PK_LIFECYCLE] PRIMARY KEY ([id])
      )`);

    await q.query(`
      CREATE TABLE [LIFECYCLE_NODE] (
        [id] uniqueidentifier NOT NULL CONSTRAINT [DF_LIFECYCLE_NODE_id] DEFAULT NEWSEQUENTIALID(),
        [lifecycleId] uniqueidentifier NOT NULL,
        [name] nvarchar(100) NULL,
        [positionX] float NOT NULL CONSTRAINT [DF_LIFECYCLE_NODE_posX] DEFAULT 0,
        [positionY] float NOT NULL CONSTRAINT [DF_LIFECYCLE_NODE_posY] DEFAULT 0,
        CONSTRAINT [PK_LIFECYCLE_NODE] PRIMARY KEY ([id]),
        CONSTRAINT [FK_LIFECYCLE_NODE_lifecycle] FOREIGN KEY ([lifecycleId])
          REFERENCES [LIFECYCLE]([id]) ON DELETE CASCADE
      )`);
    await q.query(`CREATE INDEX [IX_LIFECYCLE_NODE_lifecycleId] ON [LIFECYCLE_NODE] ([lifecycleId])`);

    await q.query(`
      CREATE TABLE [LIFECYCLE_EDGE] (
        [id] uniqueidentifier NOT NULL CONSTRAINT [DF_LIFECYCLE_EDGE_id] DEFAULT NEWSEQUENTIALID(),
        [lifecycleId] uniqueidentifier NOT NULL,
        [sourceNodeId] uniqueidentifier NOT NULL,
        [targetNodeId] uniqueidentifier NOT NULL,
        CONSTRAINT [PK_LIFECYCLE_EDGE] PRIMARY KEY ([id]),
        CONSTRAINT [FK_LIFECYCLE_EDGE_lifecycle] FOREIGN KEY ([lifecycleId])
          REFERENCES [LIFECYCLE]([id]) ON DELETE CASCADE
      )`);
    await q.query(`CREATE INDEX [IX_LIFECYCLE_EDGE_lifecycleId] ON [LIFECYCLE_EDGE] ([lifecycleId])`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE [LIFECYCLE_EDGE]`);
    await q.query(`DROP TABLE [LIFECYCLE_NODE]`);
    await q.query(`DROP TABLE [LIFECYCLE]`);
  }
}
