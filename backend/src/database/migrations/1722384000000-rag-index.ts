import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * E09 RAG 軌道 B（檢索內文）索引落地：DOCUMENT_CHUNK + INDEX_RUN（App MSSQL）。
 *
 * ⚠ 本檔僅撰寫、**未於 rag worktree 執行**（unit-only；比照 doc-source-xls 慣例）。
 *
 * 分庫（architecture-spec §4.7/§5.7）：
 *  - DOCUMENT_CHUNK / INDEX_RUN 落 **App MSSQL**（本 migration）。
 *  - VECTOR_EMBEDDING 落 **pgvector（獨立資料庫）**，DDL 見檔末 [integration] 註記（維度依模型選型，
 *    OQ-E09-02，本輪未定案 → 不寫死 vector(N)）。兩庫無單一交易，「失敗不留半索引」以應用層補償（F029）。
 *
 * status metadata 以英文內部碼（active/inactive/void）快照，對齊 document-status.ts（見 F029 impl log）。
 * usingDeptIds 以 JSON 陣列快照（nvarchar(max)）；權威過濾發生於向量庫 payload，本欄為反正規化快照。
 */
export class RagIndex1722384000000 implements MigrationInterface {
  name = 'RagIndex1722384000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE [INDEX_RUN] (
        [id] uniqueidentifier NOT NULL CONSTRAINT [DF_INDEX_RUN_id] DEFAULT NEWSEQUENTIALID(),
        [documentId] uniqueidentifier NOT NULL,
        [triggerType] varchar(20) NOT NULL,
        [status] varchar(20) NOT NULL,
        [stage] varchar(20) NOT NULL,
        [chunkCount] int NULL,
        [errorStage] varchar(20) NULL,
        [errorMessage] nvarchar(max) NULL,
        [startedAt] datetime2 NOT NULL CONSTRAINT [DF_INDEX_RUN_startedAt] DEFAULT SYSUTCDATETIME(),
        [endedAt] datetime2 NULL,
        [triggeredBy] varchar(100) NULL,
        CONSTRAINT [PK_INDEX_RUN] PRIMARY KEY ([id]),
        CONSTRAINT [FK_INDEX_RUN_document] FOREIGN KEY ([documentId])
          REFERENCES [ICSOP_DOCUMENT]([id])
      )`);
    // F031 總覽/單文件狀態查詢：依文件取最新一筆。
    await q.query(`
      CREATE INDEX [IX_INDEX_RUN_document_started]
        ON [INDEX_RUN] ([documentId], [startedAt] DESC)`);

    await q.query(`
      CREATE TABLE [DOCUMENT_CHUNK] (
        [id] uniqueidentifier NOT NULL CONSTRAINT [DF_DOCUMENT_CHUNK_id] DEFAULT NEWSEQUENTIALID(),
        [documentId] uniqueidentifier NOT NULL,
        [indexRunId] uniqueidentifier NOT NULL,
        [content] nvarchar(max) NOT NULL,
        [chunkSeq] int NOT NULL,
        [documentNumber] varchar(100) NOT NULL,
        [lifecycleId] uniqueidentifier NOT NULL,
        [chapterSection] nvarchar(100) NOT NULL,
        [usingDeptIds] nvarchar(max) NOT NULL,
        [status] varchar(20) NOT NULL,
        [announcedDate] date NULL,
        [edition] varchar(20) NOT NULL,
        [pageNumber] int NOT NULL,
        [createdAt] datetime2 NOT NULL CONSTRAINT [DF_DOCUMENT_CHUNK_createdAt] DEFAULT SYSUTCDATETIME(),
        CONSTRAINT [PK_DOCUMENT_CHUNK] PRIMARY KEY ([id]),
        CONSTRAINT [FK_DOCUMENT_CHUNK_document] FOREIGN KEY ([documentId])
          REFERENCES [ICSOP_DOCUMENT]([id]),
        CONSTRAINT [FK_DOCUMENT_CHUNK_run] FOREIGN KEY ([indexRunId])
          REFERENCES [INDEX_RUN]([id])
      )`);
    // 權限感知檢索（F033）與 F031 預覽之過濾/排序。
    await q.query(`
      CREATE INDEX [IX_DOCUMENT_CHUNK_document_run]
        ON [DOCUMENT_CHUNK] ([documentId], [indexRunId], [chunkSeq])`);
    await q.query(`
      CREATE INDEX [IX_DOCUMENT_CHUNK_status]
        ON [DOCUMENT_CHUNK] ([status])`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE [DOCUMENT_CHUNK]`);
    await q.query(`DROP TABLE [INDEX_RUN]`);
  }
}

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * [integration] VECTOR_EMBEDDING（pgvector，獨立資料庫；本輪不執行、維度待 OQ-E09-02 選型）
 * ─────────────────────────────────────────────────────────────────────────────
 *   CREATE EXTENSION IF NOT EXISTS vector;
 *   CREATE TABLE vector_embedding (
 *     id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 *     chunk_id      uuid NOT NULL,           -- → DOCUMENT_CHUNK.id（跨庫，無 FK）
 *     embedding_model text NOT NULL,
 *     vector        vector(N),               -- N＝選定模型維度（bge-m3=1024 / e5=384~1024），[BLOCKING] OQ-E09-02
 *     dimension     int NOT NULL,
 *     -- 過濾 payload（DOCUMENT_CHUNK metadata 反正規化，供權限感知檢索直接篩選）：
 *     document_id   uuid NOT NULL,
 *     status        text NOT NULL,           -- active/inactive/void
 *     using_dept_ids text[] NOT NULL,
 *     announced_date date,
 *     created_at    timestamptz NOT NULL DEFAULT now()
 *   );
 *   CREATE INDEX ON vector_embedding USING ivfflat (vector vector_cosine_ops);
 *   CREATE INDEX ON vector_embedding (status);
 *   CREATE INDEX ON vector_embedding USING gin (using_dept_ids);
 */
