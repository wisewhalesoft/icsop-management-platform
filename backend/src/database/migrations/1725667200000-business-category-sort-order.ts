import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * F043 UX16 delta `AC-UX30`／`ARCH-UX5`（architecture-spec §16.5）：
 * `BUSINESS_CATEGORY` 新增排序欄位 `sortOrder`（`int NOT NULL DEFAULT 0`），
 * 既有列以 `ROW_NUMBER() OVER (ORDER BY [name] ASC) * 10` 一次性回填（間距 10）。
 *
 * 🔴 **`DEFAULT 0` 只服務「加欄當下」之交易安全，不是最終值**——同一支 migration 的第二段
 * 立刻以 `ROW_NUMBER()` 覆寫**全部**列（`UPDATE` 段刻意不帶 `WHERE`），故無任何列會停留在 `0`。
 * 加欄與回填**刻意合併為一支**：分兩支會出現一個「全表皆 0」的可觀測窗口。
 *
 * 🔴 **間距為 10 而非 1**：`AC-UX31` ② 要求新增類別排最後、且允許日後在兩者之間插入而**不需
 * 全表重編號**；間距 1 會讓第一次插入就必須重寫整張表。
 *
 * 🔴 **本段 `ORDER BY [name] ASC` 刻意維持原樣、不套用 `AC-UX31` ③ 之碼位序修正**——
 * ⚠ **這一段與執行期排序只是碰巧同字，不是同一件事，禁止順手統一**：
 *  - **本段（migration，只跑一次）**＝**凍結上線前的既有次序**。上線前之前台下拉走的就是
 *    `typeorm-public-business-category.store.ts` 修正前的 `.find({ order: { name: 'ASC' } })`
 *    ——即這一段同樣走 DB 預設 collation（`Chinese_Taiwan_Stroke_BIN`＝筆畫序）的 SQL 排序。
 *    `AC-UX30` 要的是「**day-0 次序與上線前逐字相同**」，改成碼位序會讓 day-0 的次序**偏離**
 *    上線前的實際畫面，而「有沒有偏離」在上線後**無從回頭比對**（舊次序已不存在）。
 *  - **執行期（每次查詢）**＝平手時之確定性次要鍵，由應用層之 `sortByOrderThenName()` 施加
 *    碼位序（`business-category-sort.ts`）。兩者的職責在本 migration 執行完的那一刻分岔。
 *
 * 🔴 **驗收條件（缺一不可，`migration 寫了 ≠ 已兌現`；`AC-UX30` 末段）**：
 *  ① 對 dev 真庫**實跑 COMMIT**；
 *  ② 以 `SELECT id, name, sortOrder FROM BUSINESS_CATEGORY ORDER BY sortOrder` 覆核值確為
 *     `10, 20, 30, …`，且該次序與**修正前**之前台下拉查詢結果逐列相同；
 *  ③ 重建 image 後實際開一次後台類別清單與前台下拉。
 * **單元測試全綠證明不了欄位存在。**
 */
export class BusinessCategorySortOrder1725667200000 implements MigrationInterface {
  name = 'BusinessCategorySortOrder1725667200000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE [BUSINESS_CATEGORY] ADD [sortOrder] int NOT NULL DEFAULT 0`);
    // 🔴 回填涵蓋**全表**（無 WHERE）；`ROW_NUMBER()` 之秩 × 10 ⇒ 10, 20, 30, …
    await q.query(
      `UPDATE bc
          SET bc.[sortOrder] = ranked.rn * 10
         FROM [BUSINESS_CATEGORY] bc
         JOIN (
           SELECT [id], ROW_NUMBER() OVER (ORDER BY [name] ASC) AS rn
             FROM [BUSINESS_CATEGORY]
         ) ranked ON ranked.[id] = bc.[id]`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    // 🔴 `DEFAULT 0` 是具名未指定之預設約束 ⇒ 先卸約束再卸欄，否則 MSSQL 拒絕 DROP COLUMN。
    await q.query(
      `DECLARE @df sysname;
       SELECT @df = dc.[name]
         FROM sys.default_constraints dc
         JOIN sys.columns c ON c.[default_object_id] = dc.[object_id]
        WHERE dc.[parent_object_id] = OBJECT_ID('[BUSINESS_CATEGORY]')
          AND c.[name] = 'sortOrder';
       IF @df IS NOT NULL EXEC('ALTER TABLE [BUSINESS_CATEGORY] DROP CONSTRAINT [' + @df + ']');
       ALTER TABLE [BUSINESS_CATEGORY] DROP COLUMN [sortOrder]`,
    );
  }
}
