import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * F043 決策 E3（architecture-spec §14.6.2）：`AUDIT_LOG` 新增 **additive** 之
 * `businessCategoryId`（比照既有 `lifecycleId`）與 `nodeId`（本功能獨有）兩欄。
 *
 * 🔴 **為何需要 migration**：本項新增的是**欄位**（`AC-31` 要求掛載／移除稽核列同時落地
 * `businessCategoryId`／`nodeId`／`documentId` 三者），不是 `actionType`／`targetType` 之**列舉值**
 * （那兩欄為無 CHECK 之 varchar，加值不需 DDL）。⚠ 兩者形狀相近極易混為一談。
 *
 * 🔴 **NULL 可為（不設 DEFAULT、不回填）**：既有列一律 `NULL`，語意為「本事件不帶類別／節點
 * 維度」。給預設值反而會謊稱既有調閱事件發生在某個類別上。
 *
 * 🔴 **無 FK**：稽核為 append-only 之歷史事實，不得受類別／節點後續刪除約束（比照本表既有
 * `documentId`／`lifecycleId`／`appendixId` 等參照欄之一貫處置）。
 *
 * **不建索引**（比照 `appendixId`／`orgCode` 之既有先例）：非既有查詢熱路徑之過濾鍵；
 * F024「對象」欄之查詢仍以 `targetType`＋`occurredAt` 之既有複合索引為主。
 *
 * 🔴 **本 migration 必須對真庫實跑**：欄位不存在時，`BUSINESS_CATEGORY_DOC_MOUNTED` 稽核落列
 * 當下才會炸——而兩端單元測試（假 store）在整個過程中都是綠的。
 */
export class BusinessCategoryAuditColumns1725494400000 implements MigrationInterface {
  name = 'BusinessCategoryAuditColumns1725494400000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE [AUDIT_LOG] ADD [businessCategoryId] uniqueidentifier NULL`);
    await q.query(`ALTER TABLE [AUDIT_LOG] ADD [nodeId] uniqueidentifier NULL`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE [AUDIT_LOG] DROP COLUMN [nodeId]`);
    await q.query(`ALTER TABLE [AUDIT_LOG] DROP COLUMN [businessCategoryId]`);
  }
}
