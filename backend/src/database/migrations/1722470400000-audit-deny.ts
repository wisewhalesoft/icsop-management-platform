import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * F023 append-only 強制（整合階段②實測）：
 *  - baseline 之 best-effort `REVOKE` 對 role 授權無效；
 *  - `DENY UPDATE,DELETE` 亦被繞過（app 登入 `ICSOPT` 為高權限／owner，owner/sysadmin 略過 DENY）。
 * → 改用 **INSTEAD OF UPDATE, DELETE 觸發器**：觸發器對所有主體皆生效（含 owner/sysadmin），
 *   直接 THROW 阻擋 → AUDIT_LOG 真正不可竄改（AUDIT_IMMUTABLE）。INSERT/SELECT 不受影響。
 *
 * 註：本表為 append-only 稽核，永不 UPDATE/DELETE；保留/封存另循管理流程（非 app 連線）。
 */
export class AuditDeny1722470400000 implements MigrationInterface {
  name = 'AuditDeny1722470400000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TRIGGER [TR_AUDIT_LOG_immutable] ON [AUDIT_LOG]
      INSTEAD OF UPDATE, DELETE AS
      BEGIN
        THROW 50423, 'AUDIT_LOG is append-only and cannot be modified or deleted (AUDIT_IMMUTABLE).', 1;
      END`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TRIGGER IF EXISTS [TR_AUDIT_LOG_immutable]`);
  }
}
