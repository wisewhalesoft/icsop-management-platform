import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 上游日期欄位 datetime → datetime2（第三個實跑 bug 修正，2026-07-21）。
 *
 * 根因：MSSQL `datetime` 範圍僅 1753-01-01 ～ 9999-12-31；上游（遮罩 dev）之日期值可能超出，
 * 綁定時 "Validation failed ... Out of range"。datetime2 範圍 0001–9999 涵蓋所有合法日期。
 * 對象＝承載上游衍生值之欄位：ACCOUNT.{resignDate,hireDate,upstreamModifiedAt}、SYNC_RUN.watermark。
 * （startedAt/endedAt/disabledAt 屬我方 now()、恆在範圍內，不動。）
 * 不改動已套用之 baseline(1721520000000)/org-sync(1721606400000) migration。
 */
export class Datetime2Dates1721692800000 implements MigrationInterface {
  name = 'Datetime2Dates1721692800000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE [ACCOUNT] ALTER COLUMN [resignDate] datetime2 NULL`);
    await q.query(`ALTER TABLE [ACCOUNT] ALTER COLUMN [hireDate] datetime2 NULL`);
    await q.query(
      `ALTER TABLE [ACCOUNT] ALTER COLUMN [upstreamModifiedAt] datetime2 NULL`,
    );
    await q.query(`ALTER TABLE [SYNC_RUN] ALTER COLUMN [watermark] datetime2 NULL`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE [SYNC_RUN] ALTER COLUMN [watermark] datetime NULL`);
    await q.query(
      `ALTER TABLE [ACCOUNT] ALTER COLUMN [upstreamModifiedAt] datetime NULL`,
    );
    await q.query(`ALTER TABLE [ACCOUNT] ALTER COLUMN [hireDate] datetime NULL`);
    await q.query(`ALTER TABLE [ACCOUNT] ALTER COLUMN [resignDate] datetime NULL`);
  }
}
