import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * F005 剩餘告警縫隙（orgsync-alerts）：ORG_CHANGE_ALERT 擴充以承載兩個新 alertKind 之帳號層告警。
 *
 *  - DATA_INCONSISTENCY：EMPSTS='A' 但 RESIGNDT 為過去日之上游資料矛盾（不停用，僅告警）。
 *  - ACCOUNT_DISAPPEARED：本地在職之單一帳號其來源列消失（低於整批中止閾值；不停用，僅告警）。
 *
 * 唯一之 schema 變更＝新增 [accountLoginId] varchar(20) NULL（其餘欄位 beforeValue/afterValue/
 * deptOrgCode/deptName 語意重用，不改 schema）。
 *
 * 🔴 去重鍵＝帳號 loginId，**不以 EMPNO 連坐**（F005 spec：一人多帳號，同一員編可對應多個帳號；
 *    以 EMPNO 去重會使其中一帳號之告警被另一帳號之既有 pending 頂替而永不出現）。
 *
 * 去重之 DB 層第二道防線＝兩個 filtered unique index（各限定自身 alertKind，比照既有
 * UQ_ORG_CHANGE_ALERT_doc_field／_person 之「一 alertKind 一索引」風格；兩類事件依資料語意
 * 各自獨立，故不合併為單一涵蓋兩 alertKind 之索引）。皆限定 status='pending'，故 resolved 之歷史列
 * 可重複同鍵（＝「每日重新浮現」之底層機制）。
 */
export class OrgSyncAlertAccountLogin1723248000000 implements MigrationInterface {
  name = 'OrgSyncAlertAccountLogin1723248000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE [ORG_CHANGE_ALERT] ADD [accountLoginId] varchar(20) NULL`);

    await q.query(`
      CREATE UNIQUE INDEX [UQ_ORG_CHANGE_ALERT_login_inconsistency]
        ON [ORG_CHANGE_ALERT] ([accountLoginId])
        WHERE [status] = 'pending' AND [alertKind] = 'DATA_INCONSISTENCY'`);
    await q.query(`
      CREATE UNIQUE INDEX [UQ_ORG_CHANGE_ALERT_login_disappeared]
        ON [ORG_CHANGE_ALERT] ([accountLoginId])
        WHERE [status] = 'pending' AND [alertKind] = 'ACCOUNT_DISAPPEARED'`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX [UQ_ORG_CHANGE_ALERT_login_disappeared] ON [ORG_CHANGE_ALERT]`);
    await q.query(`DROP INDEX [UQ_ORG_CHANGE_ALERT_login_inconsistency] ON [ORG_CHANGE_ALERT]`);
    await q.query(`ALTER TABLE [ORG_CHANGE_ALERT] DROP COLUMN [accountLoginId]`);
  }
}
