import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 帳號最後登入時間戳（prototype-alignment · GATE 決策 #2）。
 *
 * 帳號管理清單需「最後登入」欄（prototype 08）。原架構（architecture-spec §5.3）曾規劃 lastActivityAt
 * 但因無狀態 sliding-JWT 而從未落地。定案改為 lastLoginAt：**每次成功登入寫入一次**（途徑 A OIDC／
 * 途徑 B 帳密皆然），非每請求 → 無寫入放大、亦不以 AUDIT 近似造成 login-only/admin-CRUD 之低估。
 *
 * 唯一 schema 變更＝ACCOUNT 新增 [lastLoginAt] datetime2 NULL（範圍 0001–9999，涵蓋所有合法時間）。
 */
export class AccountLastLogin1723334400000 implements MigrationInterface {
  name = 'AccountLastLogin1723334400000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE [ACCOUNT] ADD [lastLoginAt] datetime2 NULL`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE [ACCOUNT] DROP COLUMN [lastLoginAt]`);
  }
}
