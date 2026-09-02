import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * F042 第五輪（2026-09-02）「OJT 進度追蹤細緻到文件版本」：兩張表各新增一個 **additive** 欄位。
 *
 *  · `ICSOP_DOCUMENT.ojtTrainingEdition`——各使用單位目前必須完成訓練的那個版次（訓練基準版次）。
 *  · `OJT_SESSION.edition`——登記當下之訓練基準版次快照。
 *
 * 完成判定自本輪起為「該列存在 `OJT_SESSION.edition` 與其文件 `ojtTrainingEdition` **相符**之
 * 場次」（`NULL` 對 `NULL` 亦相符），取代原本之「場次數 ≥ 1」。
 *
 * 🔴 **兩欄皆回填，且回填值刻意不同**（人類裁決 2026-09-02）：
 *  ① `ICSOP_DOCUMENT.ojtTrainingEdition := edition`——既有文件之基準版次即其當下版次。
 *  ② `OJT_SESSION.edition := 其文件之 edition`——「既有場次視為當下版次」。
 * ⚠ **不回填等於全庫翻紅**：兩欄皆 `NULL` 時 `NULL = NULL` 在本輪判定下確實相符，但只要文件
 * 有填版次（dev 7／591、正式站未知），該文件全部既有場次就會與基準不符 ⇒ 一批已完成的列在
 * 上線當天無聲地變回「尚未完成」。回填是把「上線不改變任何既有完成狀態」寫成可執行的形式。
 *
 * 🔴 **無 DEFAULT 約束**：`NULL` 在本模型是有意義的值（＝「這份文件沒有版次概念」），
 * 給預設值會讓「沒填版次」與「填了某個預設版次」混為一談。
 *
 * 🔴 **本 migration 必須對真庫實跑**（本 repo 已三度踩到同一形狀）：單元測試一律以記憶體假
 * store 驗證，證明不了欄位存在；欄位缺席時 `GET /admin/ojt-progress/rows` 與後台文件清單之
 * OJT 欄會在查詢當下才炸成 500，症狀是「少數功能 500、其餘正常」。
 */
export class OjtTrainingEdition1725235200000 implements MigrationInterface {
  name = 'OjtTrainingEdition1725235200000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE [ICSOP_DOCUMENT] ADD [ojtTrainingEdition] varchar(20) NULL`);
    await q.query(`ALTER TABLE [OJT_SESSION] ADD [edition] varchar(20) NULL`);
    // ① 文件：基準版次＝當下版次。
    await q.query(`UPDATE [ICSOP_DOCUMENT] SET [ojtTrainingEdition] = [edition]`);
    // ② 場次：視為當下版次（以其文件之版次回填；待歸位列 orgCode IS NULL 同樣回填，
    //    歸位後才需要參與完成判定，屆時值已就位）。
    await q.query(`
      UPDATE s
         SET s.[edition] = d.[edition]
        FROM [OJT_SESSION] s
        INNER JOIN [ICSOP_DOCUMENT] d ON d.[id] = s.[documentId]`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE [OJT_SESSION] DROP COLUMN [edition]`);
    await q.query(`ALTER TABLE [ICSOP_DOCUMENT] DROP COLUMN [ojtTrainingEdition]`);
  }
}
