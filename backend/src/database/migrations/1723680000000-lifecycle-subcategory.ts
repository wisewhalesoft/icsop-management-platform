import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * F040 循環子分類（data-model.md §LIFECYCLE 唯一性不變式 INV-1）。
 *
 * 步驟（對應 F040「實作前置檢查」表之步驟 3、4）：
 *   3. ALTER TABLE LIFECYCLE ADD [subcategory] nvarchar(100) NULL —— 既有列全部落在 NULL（＝無子分類），
 *      語意上向後相容、無須 backfill。
 *   4. 於 (name, subcategory) 建立唯一索引。
 *
 * ⚠ MSSQL 之 UNIQUE INDEX **視多個 NULL 為相等**（與 ANSI 標準相反）。此語意對 INV-1 恰好正確：
 *   同一名稱之「無子分類」列只能存在一筆。也因此，**既有同名重複列會使建立索引直接失敗**。
 *
 * ⚠ 本 migration 刻意**不做任何 try/catch 吞錯或條件略過**：若 IX 建立失敗（既有同名重複列尚未清理），
 *   必須讓錯誤直接拋出並中止整個 migration。靜默略過索引將使 INV-1 僅剩服務層單保險。
 *   前置盤點與重複列裁定屬人類決策（F040 步驟 1、2：**嚴禁自動合併**，合併會改變既有文件之
 *   lifecycleId 參照與 DAG 歸屬），故不在此以 SQL 自動處理。
 *
 *   盤點指令（執行本 migration 前人工確認應為 0 筆）：
 *     SELECT name, COUNT(*) AS c FROM [LIFECYCLE] GROUP BY name HAVING COUNT(*) > 1
 */
export class LifecycleSubcategory1723680000000 implements MigrationInterface {
  name = 'LifecycleSubcategory1723680000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE [LIFECYCLE] ADD [subcategory] nvarchar(100) NULL`);
    await q.query(
      `CREATE UNIQUE INDEX [IX_LIFECYCLE_name_subcategory] ON [LIFECYCLE] ([name], [subcategory])`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX [IX_LIFECYCLE_name_subcategory] ON [LIFECYCLE]`);
    await q.query(`ALTER TABLE [LIFECYCLE] DROP COLUMN [subcategory]`);
  }
}
