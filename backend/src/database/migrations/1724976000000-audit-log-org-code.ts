import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * F042「OJT 進度管理」（E11）：`AUDIT_LOG` 新增 **additive** 之 `orgCode` 欄位。
 *
 * 權威：docs/specs/data-model.md v1.10（`OQ-E11-13=B`）；
 * docs/specs/features/F023-audit-logging.md#ojt-progress-audit-delta `AC-J19`；
 * docs/specs/features/F042-ojt-progress-management.md `AC-18`。
 *
 * 🔴 **為何本項需要 migration，而 D9 批之稽核擴充不需要**：D9 批新增的是 `actionType`／
 * `targetType` 之**列舉值**，兩欄皆為無 CHECK 約束之 varchar ⇒ 新值不需 DDL。本項新增的是
 * **欄位**（新模型多出「使用單位」維度，既有欄位集合承載不下），屬 schema 變更。
 * ⚠ 兩者形狀相近極易混為一談——「上次不用 migration」不是這次也不用的理由。
 *
 * 🔴 **`NULL` 可為（不設 DEFAULT、不回填）**：既有列一律 `NULL`，語意為「本事件不帶使用單位
 * 維度」，與 `targetType='OJT_SESSION'` 之列（必有值）語意不同。給預設值反而會謊稱既有調閱
 * 事件發生在某個單位。
 *
 * 🔴 **無 FK 至 `ORG_UNIT`**：稽核為 append-only 之歷史事實，不得受組織後續裁撤／改組約束
 * （比照本表既有之 `documentId`／`appendixId` 等參照欄之處置）。
 *
 * 🔴 `varchar(10)` 沿用資料庫預設 collation（`_BIN`）——系統代碼之精確相等比對。
 *
 * 🔴 **本 migration 必須對真庫實跑**：欄位不存在時，寫入路徑會在 `OJT_SESSION_UPLOAD` 稽核
 * 落列當下才炸（單元測試一律以假 store 驗證，證明不了欄位存在）。
 */
export class AuditLogOrgCode1724976000000 implements MigrationInterface {
  name = 'AuditLogOrgCode1724976000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE [AUDIT_LOG] ADD [orgCode] varchar(10) NULL`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE [AUDIT_LOG] DROP COLUMN [orgCode]`);
  }
}
