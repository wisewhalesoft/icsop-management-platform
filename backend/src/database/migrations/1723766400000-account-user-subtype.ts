import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * F041 一般使用者子分類（`ACCOUNT.userSubtype`）。
 * 權威：docs/specs/architecture-spec.md §4.10、docs/specs/data-model.md#account-user-subtype。
 *
 * INV-1：任一 `ACCOUNT.userSubtype` 恆為 'business' 或 'other'——DB 層以 `NOT NULL DEFAULT 'other'`
 * ＋ `CHECK` 約束保證未知值不可能持久化（讀取端之 fail-open 收斂因此不構成實際風險，AC-02）。
 * AC-35：既有列與未指定子分類之新帳號一律落在 DEFAULT 'other'（不限縮），避免上游既有大量帳號
 * 因缺值而意外全數受限。
 *
 * ⚠ 刻意採**單一 `ALTER TABLE ADD`** 陳述式（MSSQL 對既有列自動套用 DEFAULT，不需 UPDATE backfill）。
 *   誤拆成「先 ADD NULL → UPDATE → ALTER COLUMN NOT NULL」三段式雖功能等價，卻多出可被中途失敗
 *   打斷的視窗（架構 §4.10 明列之陷阱提醒）。
 */
export class AccountUserSubtype1723766400000 implements MigrationInterface {
  name = 'AccountUserSubtype1723766400000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE [ACCOUNT] ADD [userSubtype] nvarchar(20) NOT NULL
         CONSTRAINT [DF_ACCOUNT_userSubtype] DEFAULT 'other'`,
    );
    await q.query(
      `ALTER TABLE [ACCOUNT] ADD CONSTRAINT [CK_ACCOUNT_userSubtype]
         CHECK ([userSubtype] IN ('business','other'))`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE [ACCOUNT] DROP CONSTRAINT [CK_ACCOUNT_userSubtype]`);
    await q.query(`ALTER TABLE [ACCOUNT] DROP CONSTRAINT [DF_ACCOUNT_userSubtype]`);
    await q.query(`ALTER TABLE [ACCOUNT] DROP COLUMN [userSubtype]`);
  }
}
