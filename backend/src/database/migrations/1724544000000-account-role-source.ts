import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `ACCOUNT.roleSource` —— 角色來源旗標
 * （🔴 2026-08-25 角色自動化 delta，裁定 `Q1.2`／`OQ-RA-02`）。
 *
 * **用途**：仲裁「同步之角色推導」與「管理員人工指派」之覆寫優先權。
 * 同步之推導**只覆寫 `'derived'` 之列**；一經 `PATCH /admin/accounts/:id/role` 指派，
 * 該列翻為 `'manual'` 並**永不再被同步覆寫**。這是「自動化」與「人工優先權」得以共存的唯一機制。
 *
 * **狀態轉移為單向**：`derived → manual`，無反向路徑。刻意不提供解除鎖定入口——
 * 若日後確有需求屬 additive 之新功能，須另立 AC，不得由本欄語意默默擴充。
 *
 * 🔴 **預設 `'derived'` 為 `OQ-RA-02` 之明文裁決**，非隨手選的預設值：
 * 既有列於 migration 後一律落在 `'derived'`，使首次全量套用得以生效。
 * 若預設 `'manual'`，自動推導對既有帳號將永遠無效，功能等同未上線。
 *
 * ⚠ **已明確接受之代價**（`OQ-RA-02` 逐字記載）：先前被管理員**刻意人工降級**者
 * （例：某處室主管被刻意設為一般使用者以不給後台權限）將於首次套用時被**升回主管**；
 * 因裁定 `Q1.4` 為「不預覽」，此情形無法事前攔截。
 *
 * ⚠ 純 additive：欄位加上、既有列落預設值，**不改變任何既有行為**——
 * 讀寫路徑之接線（推導階段）屬程式碼變更，於同批次一併提交。
 *
 * 🔴 **本 migration 必須對真庫實跑**：本專案既有教訓——單元測試全綠證明不了欄位存在
 * （上游契約 §11 #14）。
 */
export class AccountRoleSource1724544000000 implements MigrationInterface {
  name = 'AccountRoleSource1724544000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE [ACCOUNT] ADD [roleSource] nvarchar(20) NOT NULL
         CONSTRAINT [DF_ACCOUNT_roleSource] DEFAULT 'derived'`,
    );
    // 值域約束：比照 userSubtype 之 INV-1 作法，於 DB 層保證讀取端不必處理未知值。
    await q.query(
      `ALTER TABLE [ACCOUNT] ADD CONSTRAINT [CK_ACCOUNT_roleSource]
         CHECK ([roleSource] IN ('derived','manual'))`,
    );
    // 🔴 回填：`source='manual'` 之帳號，其角色**本來就是管理員於建立時指派的**
    //    （`createManual` 明確要求 `roleCode`），故一律標 `'manual'`。
    //    不回填會讓推導把管理員刻意設為「部門窗口」的手動帳號升成「主管」——
    //    這不在 `OQ-RA-02` 所接受的代價範圍內（該條指的是「刻意降級之上游帳號」）。
    await q.query(
      `UPDATE [ACCOUNT] SET [roleSource] = 'manual' WHERE [source] = 'manual'`,
    );
    // 不建索引：推導階段已全量載入該公司帳號（既有作法），無以本欄為條件之查詢。
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE [ACCOUNT] DROP CONSTRAINT [CK_ACCOUNT_roleSource]`);
    await q.query(`ALTER TABLE [ACCOUNT] DROP CONSTRAINT [DF_ACCOUNT_roleSource]`);
    await q.query(`ALTER TABLE [ACCOUNT] DROP COLUMN [roleSource]`);
  }
}
