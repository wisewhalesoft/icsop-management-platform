import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * F018 使用表單編號（`USAGE_FORM_POOL.formNumber`），2026-08-16 缺失／變更 delta 第 18 項。
 * 權威：docs/specs/architecture-spec.md §10.7（決策 A7）、docs/specs/error-handling.md#usage-form-number。
 *
 * 🔴 **filtered unique index**（`WHERE [formNumber] IS NOT NULL`），不可用單純全表 UNIQUE——
 *   MSSQL 之 UNIQUE 視多個 `NULL` 為相等，會誤擋第二筆空編號（AC-D5：多筆空編號可並存）。
 *   TypeORM 無法表達 filtered index，故它**只存在於本手寫 migration**，entity 上刻意不加
 *   `@Index({ unique: true })`。
 *
 * 🔴 **兩段獨立 `q.query()`，不可合併**：MSSQL 不允許在同一批次中 `ALTER TABLE ADD` 後立即
 *   引用新欄，合併會報 `Invalid column name 'formNumber'`；而 QueryRunner **不吃 `GO`**
 *   （`GO` 是 sqlcmd 的批次分隔符，不是 T-SQL）。這是 filtered index on newly added column 的經典踩點。
 *
 * ⚠ 不做 backfill：既有列自動為 `NULL`（AC-D7 明訂既有列一律 `null`、不得塞假值）。
 * ⚠ 大小寫不敏感來自 DB 之 `_CI_` collation（`Chinese_Taiwan_Stroke_CI_AS`），不另存正規化比較欄。
 *   若目標 DB 為 `_CS_`，改以欄位級 `COLLATE Chinese_Taiwan_Stroke_CI_AS` 覆寫即可，仍不需第二欄。
 * ⚠ `CREATE INDEX ... WHERE` 要求連線之 `ANSI_NULLS` 與 `QUOTED_IDENTIFIER` 為 `ON`
 *   （tedious 預設為 ON；以 sqlcmd 手動重跑者須自行確認）。
 */
export class UsageFormNumber1723939200000 implements MigrationInterface {
  name = 'UsageFormNumber1723939200000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE [USAGE_FORM_POOL] ADD [formNumber] nvarchar(100) NULL`);
    await q.query(
      `CREATE UNIQUE INDEX [UQ_USAGE_FORM_POOL_formNumber]
         ON [USAGE_FORM_POOL] ([formNumber])
         WHERE [formNumber] IS NOT NULL`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX [UQ_USAGE_FORM_POOL_formNumber] ON [USAGE_FORM_POOL]`);
    await q.query(`ALTER TABLE [USAGE_FORM_POOL] DROP COLUMN [formNumber]`);
  }
}
