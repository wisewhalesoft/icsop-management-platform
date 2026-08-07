import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * F039 稽核 additive 擴充（architecture-spec §3.6 決策三／§4.9）：
 * AUDIT_LOG 新增 [appendixId] uniqueidentifier NULL，承載 targetType='APPENDIX' 列之附錄參照
 * （AC-27 要求 appendixId 與 documentId 同時落地）。
 *
 * 唯一 schema 變更＝單欄位 additive ALTER（比照 1723420800000-index-run-error-code.ts）。
 * 既有列（targetType≠APPENDIX）該欄恆 NULL、**無 backfill**，與現行 formId／lifecycleId 對非對應
 * targetType 列恆 NULL 之語意一致；不建索引（比照 formId 亦無專屬索引）、無 FK 約束
 * （比照 1721952000000-audit-log.ts 之既有純參照欄慣例）。
 */
export class AuditLogAppendixId1723593600000 implements MigrationInterface {
  name = 'AuditLogAppendixId1723593600000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE [AUDIT_LOG] ADD [appendixId] uniqueidentifier NULL`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE [AUDIT_LOG] DROP COLUMN [appendixId]`);
  }
}
