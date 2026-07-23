import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * org-foundation：ORG_UNIT 新增 descFull（部門全名，← VW_DEPT_SQL.DESC_FULL），供 F020 浮水印
 * 「部門」欄。既有列加欄後為 null；下次全量同步經 classifyOrgUnit（已納入 descFull 比對）自動回填
 * （非 noop）。不改動既有 migration。
 *
 * ⚠ 依 org-foundation worktree 硬約束：本檔僅撰寫，不執行（migration 由整合階段統一跑）。
 */
export class OrgDescFull1722211200000 implements MigrationInterface {
  name = 'OrgDescFull1722211200000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE [ORG_UNIT] ADD [descFull] nvarchar(200) NULL`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE [ORG_UNIT] DROP COLUMN [descFull]`);
  }
}
