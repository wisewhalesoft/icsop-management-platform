import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * F018 使用表單編號之**大小寫不敏感唯一性**（`USAGE_FORM_POOL.formNumber`）——
 * 補 `UsageFormNumber1723939200000` 之缺口。
 * 權威：docs/specs/architecture-spec.md §10.7（決策 A7 之條件式決策表）、
 *      docs/specs/error-handling.md#usage-form-number。
 *
 * 🔴 **為何需要本 migration**：§10.7 把「DB 為 CI（case-insensitive）collation」當成既有前提
 *   （`account.entity.ts:6` 之註解即此前提），但**該前提對本專案之 SOP 資料庫為假**——
 *   實測 `DATABASEPROPERTYEX(DB_NAME(),'Collation')` 為 `Chinese_Taiwan_Stroke_BIN`。
 *   `_BIN` 是**二進位比對**，比 `_CS_` 更嚴格（大小寫、腔調、假名、全半形一律相異），
 *   於是 `UQ_USAGE_FORM_POOL_formNumber` 擋不住 `FM-001` 與 `fm-001` 並存
 *   （已於交易內實插驗證後 rollback：兩筆皆成功）。
 *   §10.7 決策表只列了 `_CI_` 與 `_CS_` 兩格、漏了 `_BIN`；`_BIN` 同屬「非 CI」，
 *   適用同一格之修法：**欄位級 collation 覆寫，仍不需要第二個正規化欄位**。
 *
 * 🔴 **本檔為新增而非修改 `1723939200000`**：該支已對真實 SOP 資料庫執行成功並記錄於
 *   `migrations` 表，回頭改它對已套用之環境不會重跑，只會讓「檔案內容」與「實際 schema」失同步。
 *
 * 🔴 **必須 DROP INDEX → ALTER COLUMN → CREATE INDEX**：欄位被索引參照時 MSSQL 拒絕
 *   `ALTER COLUMN`（`The index ... is dependent on column ...`）。三步由 TypeORM 之
 *   migration 交易包覆（`data-source.ts` 未關閉預設交易），任一步失敗整批回滾，
 *   不會留下「索引已刪、欄位未改」之中間狀態。
 *
 * ⚠ 資料面安全：套用時該欄非 `NULL` 之列數為 0（實測 `SELECT COUNT(*) ... WHERE formNumber IS NOT NULL` → 0），
 *   故重建索引不可能因既有大小寫變體重複而失敗。日後若已有資料，須先自行清理重複再套用。
 *
 * ⚠ 應用層之 `toLowerCase()` 正規化比對（`src/usage-forms/form-number.ts`）**維持不動**——
 *   data-model 要求 DB 與應用層**雙保險**，本檔補的是缺席的那一道（DB 側），不是取代另一道。
 *   兩道的差異在併發：應用層之「先查再插」擋不住兩個同時通過檢查的請求，DB 唯一索引才擋得住。
 *
 * ⚠ `CREATE INDEX ... WHERE`（filtered index）要求連線之 `ANSI_NULLS` 與 `QUOTED_IDENTIFIER`
 *   為 `ON`（tedious 預設為 ON；以 sqlcmd 手動重跑者須自行確認）。
 */
export class UsageFormNumberCollation1724025600000 implements MigrationInterface {
  name = 'UsageFormNumberCollation1724025600000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX [UQ_USAGE_FORM_POOL_formNumber] ON [USAGE_FORM_POOL]`);
    await q.query(
      `ALTER TABLE [USAGE_FORM_POOL]
         ALTER COLUMN [formNumber] nvarchar(100) COLLATE Chinese_Taiwan_Stroke_CI_AS NULL`,
    );
    await q.query(
      `CREATE UNIQUE INDEX [UQ_USAGE_FORM_POOL_formNumber]
         ON [USAGE_FORM_POOL] ([formNumber])
         WHERE [formNumber] IS NOT NULL`,
    );
  }

  /**
   * 還原為「不指定 collation」＝跟隨資料庫預設（本 DB 即 `Chinese_Taiwan_Stroke_BIN`），
   * 亦即回到 `1723939200000` 套用後之狀態。
   */
  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX [UQ_USAGE_FORM_POOL_formNumber] ON [USAGE_FORM_POOL]`);
    await q.query(`ALTER TABLE [USAGE_FORM_POOL] ALTER COLUMN [formNumber] nvarchar(100) NULL`);
    await q.query(
      `CREATE UNIQUE INDEX [UQ_USAGE_FORM_POOL_formNumber]
         ON [USAGE_FORM_POOL] ([formNumber])
         WHERE [formNumber] IS NOT NULL`,
    );
  }
}
