import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * F012 切換原因持久化：DOCUMENT_CHANGE_LOG 新增 [reason] 欄（nvarchar(500) NULL）。
 *
 *  - reason 僅由 STATUS 事件承載（切換狀態時之選填原因）；CONTENT/CREATE/META 事件恆落 NULL。
 *  - nvarchar(500)：spec 與 prototype 15（`<input type="text">` 無 maxlength）皆未定義長度上限，
 *    比照同表 documentNumber varchar(100)／actorName nvarchar(30) 之量級選一保守但夠用之值（設計預設，非 spec 規定）。
 *  - ADD COLUMN 不影響既有 REVOKE UPDATE/DELETE 授權（表層授權不因新增欄位而失效，無需重新 REVOKE）。
 *  - 時間戳 1722988800000：高於既有最高值 1722902400000，避免撞號。
 */
export class DocumentChangeLogReason1722988800000 implements MigrationInterface {
  name = 'DocumentChangeLogReason1722988800000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE [DOCUMENT_CHANGE_LOG] ADD [reason] nvarchar(500) NULL`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE [DOCUMENT_CHANGE_LOG] DROP COLUMN [reason]`);
  }
}
