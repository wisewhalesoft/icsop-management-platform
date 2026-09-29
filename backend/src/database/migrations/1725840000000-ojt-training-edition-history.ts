import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 2026-09-29「OJT 準時完成率」改為**不分版次統計**：新建 `OJT_TRAINING_EDITION`，記錄每份文件
 * 每一個曾要求訓練之版次（詳見 `entities/ojt-training-edition.entity.ts` 檔頭）。
 *
 * ## 回填（🔴 兩段、來源刻意分開標記）
 *  ① `BACKFILL_BASELINE`：每份文件之**當下**訓練基準版次（含 `NULL`）——這一列是確定的事實。
 *  ② `BACKFILL_SESSION`：場次快照上出現過、但不等於當下基準之版次——⚠ 這是**推定**：
 *     場次登記時快照的是當時之基準（F042 `AC-37`），故「有場次快照為 X」⇒「X 曾是基準」成立；
 *     但反方向不成立——**某版要求了重訓、卻沒有任何單位在那一版辦過訓練者，在上線前之資料裡
 *     沒有任何痕跡，本回填補不回來**。本表上線後之改版才有完整紀錄。
 *     `requiredAt` 取該版次最早一筆場次之上傳時間（實際要求日只會更早，無從得知）。
 *
 * 🔴 `NULL` 比對一律顯式寫出 `IS NULL` 那半句（`s.edition = d.x` 兩者皆 NULL 時為 UNKNOWN）。
 * 🔴 本 migration 必須對真庫實跑（本 repo 已多次踩到「單元全綠、表不存在」）。
 */
export class OjtTrainingEditionHistory1725840000000 implements MigrationInterface {
  name = 'OjtTrainingEditionHistory1725840000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE [OJT_TRAINING_EDITION] (
        [id] uniqueidentifier NOT NULL CONSTRAINT [DF_OJT_TRAINING_EDITION_id] DEFAULT NEWSEQUENTIALID(),
        [documentId] uniqueidentifier NOT NULL,
        [edition] varchar(20) NULL,
        [source] varchar(20) NOT NULL,
        [requiredAt] datetime2 NOT NULL,
        CONSTRAINT [PK_OJT_TRAINING_EDITION] PRIMARY KEY ([id]),
        CONSTRAINT [FK_OJT_TRAINING_EDITION_document] FOREIGN KEY ([documentId])
          REFERENCES [ICSOP_DOCUMENT]([id]) ON DELETE CASCADE
      )`);
    await q.query(
      `CREATE UNIQUE INDEX [UQ_OJT_TRAINING_EDITION_doc_edition] ON [OJT_TRAINING_EDITION] ([documentId], [edition])`,
    );

    // ① 當下基準（每份文件恰一列）。
    await q.query(`
      INSERT INTO [OJT_TRAINING_EDITION] ([documentId], [edition], [source], [requiredAt])
      SELECT d.[id], d.[ojtTrainingEdition], 'BACKFILL_BASELINE', SYSUTCDATETIME()
        FROM [ICSOP_DOCUMENT] d`);

    // ② 場次快照上出現過之其他版次（推定）。
    await q.query(`
      INSERT INTO [OJT_TRAINING_EDITION] ([documentId], [edition], [source], [requiredAt])
      SELECT s.[documentId], s.[edition], 'BACKFILL_SESSION', MIN(s.[uploadedAt])
        FROM [OJT_SESSION] s
       WHERE NOT EXISTS (
               SELECT 1 FROM [OJT_TRAINING_EDITION] t
                WHERE t.[documentId] = s.[documentId]
                  AND (t.[edition] = s.[edition] OR (t.[edition] IS NULL AND s.[edition] IS NULL)))
       GROUP BY s.[documentId], s.[edition]`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX [UQ_OJT_TRAINING_EDITION_doc_edition] ON [OJT_TRAINING_EDITION]`);
    await q.query(`DROP TABLE [OJT_TRAINING_EDITION]`);
  }
}
