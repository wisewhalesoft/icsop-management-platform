import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `ORG_CHANGE_ALERT` 之 `ROLE_DOWNGRADE_PENDING` 去重索引
 * （🔴 2026-08-25 角色自動化 delta，裁定 `Q1.3`：降級一律轉告警待審、不自動執行）。
 *
 * **本 migration 只加索引，不加欄位**：`alertKind` 為 `varchar(30)` 且**無 CHECK 約束**，
 * 新增字面值 `'ROLE_DOWNGRADE_PENDING'`（22 字元）純屬應用層擴充；
 * 去重鍵沿用既有 `accountLoginId`（F005 兩類已在用，不以 EMPNO 連坐）。
 *
 * **為何仍需要索引**：本表既有慣例是「每個 `alertKind` 各有一支 filtered unique index」
 * 作為應用層去重之**第二道防線**（`UQ_ORG_CHANGE_ALERT_login_inconsistency`／`_disappeared`）。
 * 少了它，應用層去重集合一旦有 bug，同一帳號會每日重複插入 pending 列而無人察覺。
 *
 * ⚠ 與既有兩支索引**互不干擾**：三者皆為 filtered index，過濾條件之 `alertKind` 各不相同，
 * 故同一 `accountLoginId` 可同時有「資料不一致」「消失」「角色降級」三筆 pending 而不衝突
 * ——這是刻意的：三者語意獨立，處理其一不代表其餘已處理。
 *
 * 🔴 **本 migration 必須對真庫實跑**（上游契約 §11 #14 之既有教訓）。
 */
export class AlertRoleDowngrade1724630400000 implements MigrationInterface {
  name = 'AlertRoleDowngrade1724630400000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE UNIQUE INDEX [UQ_ORG_CHANGE_ALERT_login_role_downgrade]
        ON [ORG_CHANGE_ALERT] ([accountLoginId])
        WHERE [status] = 'pending' AND [alertKind] = 'ROLE_DOWNGRADE_PENDING'`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      `DROP INDEX [UQ_ORG_CHANGE_ALERT_login_role_downgrade] ON [ORG_CHANGE_ALERT]`,
    );
  }
}
