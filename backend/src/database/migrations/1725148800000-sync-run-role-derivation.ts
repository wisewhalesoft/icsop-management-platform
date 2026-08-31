import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `SYNC_RUN` 落地「角色推導是否被閾值跳過」之事實（F004 delta，2026-08-31 使用者裁定）。
 *
 * 為何必須落地、不能只留在回應裡：`stats.roleDerivationSkipped` 原僅存在於 `SyncResult`
 * ——那是**觸發當下**的回傳值。但同步的常態是每日 02:00 排程，跳過發生時沒有任何人在看畫面，
 * 隔天管理員看到的只有一列綠色的「成功」，數百筆角色變更被靜默丟棄且無跡可循
 * （實測：AS 602/1124＝53.6% 被跳過，畫面完全無感）。落在 SYNC_RUN 上，同步歷程才說得出實話。
 *
 * ⚠ 三欄皆為「僅將 run() 已算出之 stats 多落地、不新增任何計算邏輯」——與同表之
 *   `accountsCreated`／`accountsUpdated`／`accountsDisabled`（F006 KPI 細分）完全同一模式。
 *
 * 為何不塞進 `ORG_CHANGE_ALERT`（曾考慮並否決）：該表是**文件／人員**形狀（documentId、
 * personEmployeeNo、deptOrgCode…），沒有公司欄；一個「本次同步層級」的事實塞進去，
 * 要靠 `sourceSyncRunId` 迂迴反查才知道是哪家公司。`SYNC_RUN` 本就一列一公司一次執行，
 * 是這個事實的正確歸屬。
 *
 * `roleDerivationSkipped` 給 NOT NULL DEFAULT 0：既有列語意上確實「未被跳過而略過落地」，
 * 以 0 回填不會產生假陽性；另兩欄可為 NULL（既有列無從得知當時的數字，不假造）。
 */
export class SyncRunRoleDerivation1725148800000 implements MigrationInterface {
  name = 'SyncRunRoleDerivation1725148800000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE [SYNC_RUN] ADD [roleDerivationSkipped] bit NOT NULL CONSTRAINT [DF_SYNC_RUN_roleDerivationSkipped] DEFAULT 0`,
    );
    // 分子＝本次會被寫入之角色/子分類變更數；分母＝本次納入推導之帳號數（roleSource='derived'）。
    // 兩者一併落地而非只存比例：比例可由兩數導出，反之不行，且畫面之二次確認需呈現實際筆數。
    await q.query(`ALTER TABLE [SYNC_RUN] ADD [roleChangeCount] int NULL`);
    await q.query(`ALTER TABLE [SYNC_RUN] ADD [roleDerivationBase] int NULL`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE [SYNC_RUN] DROP COLUMN [roleDerivationBase]`);
    await q.query(`ALTER TABLE [SYNC_RUN] DROP COLUMN [roleChangeCount]`);
    await q.query(
      `ALTER TABLE [SYNC_RUN] DROP CONSTRAINT [DF_SYNC_RUN_roleDerivationSkipped]`,
    );
    await q.query(
      `ALTER TABLE [SYNC_RUN] DROP COLUMN [roleDerivationSkipped]`,
    );
  }
}
