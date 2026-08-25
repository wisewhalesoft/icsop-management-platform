import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `AUDIT_LOG.targetAccountId` —— 角色變更稽核之對象參照欄
 * （2026-08-25 角色自動化 delta，裁定 `Q4.5`；`docs/stories/2026-08-25-role-automation-delta.md`）。
 *
 * 🔴 **在此之前，角色變更完全沒有稽核紀錄**——`backend/src/accounts/` 全模組不含任何 audit 呼叫。
 * 手動時代尚可忍受（只有 SysAdmin 動得了角色，且頻率極低），但角色推導自本輪起隨每日 02:00
 * 同步自動執行，「這個人的角色為什麼變了」若無紀錄將**永久無法追溯**。
 *
 * **為何需要新欄位、不能沿用既有參照欄**：`AUDIT_LOG` 現有四個對象參照欄
 * （`documentId`／`lifecycleId`／`formId`／`appendixId`）皆為特定實體專用，
 * 而 `buildAuditRow`（`audit/audit-event.ts`）明文守著「依 `targetType` 對映，其餘恆 null，
 * 避免 polymorphic 交叉外洩」——把帳號 id 塞進 `documentId` 會直接違反該防線，
 * 並使 F024 之「類型＝文件」查詢被角色事件污染。
 *
 * **為何不以 `targetName` 文字快照代替**：角色稽核之核心用途是**依人查詢**
 * （「查這個人的角色異動史」），文字快照只能全文搜尋，且帳號改名後舊紀錄即對不回來。
 *
 * ⚠ **nullable 且無 FK**：
 *  - `NULL` ——既有列（全部為文件／循環／表單／附錄之調閱事件）不需回填，本欄對它們恆為 null。
 *  - **不建 FK 至 `ACCOUNT`** ——`AUDIT_LOG` 為 append-only 之稽核事實，不得因目標帳號之
 *    任何後續變動而受約束；比照既有 `documentId`／`lifecycleId` 等參照欄之作法（皆無 FK）。
 *
 * ⚠ `targetType`／`actionType` **不需 migration**：兩者為 `varchar(30)`／`varchar(40)` 且無 CHECK 約束，
 * 新增字面值 `'ACCOUNT'`／`'ROLE_ASSIGNED'` 純屬應用層擴充（沿用 `ATTACHMENT_UPLOAD` 之既有先例）。
 *
 * 🔴 **本 migration 必須對真庫實跑**：本專案既有教訓——單元測試全綠證明不了欄位存在
 * （見上游契約 §11 #14）。實跑指令見 `docs/specs/features/F004-org-sync.md` 與部署 runbook。
 */
export class AuditTargetAccount1724457600000 implements MigrationInterface {
  name = 'AuditTargetAccount1724457600000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE [AUDIT_LOG] ADD [targetAccountId] uniqueidentifier NULL`);
    // 依人查詢為本欄之唯一用途（「查這個人的角色異動史」），故建索引。
    // filtered index：僅角色事件之列非 null，全表絕大多數列為 null，不必納入索引。
    await q.query(
      `CREATE INDEX [IX_AUDIT_LOG_targetAccountId] ON [AUDIT_LOG] ([targetAccountId]) ` +
        `WHERE [targetAccountId] IS NOT NULL`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX [IX_AUDIT_LOG_targetAccountId] ON [AUDIT_LOG]`);
    await q.query(`ALTER TABLE [AUDIT_LOG] DROP COLUMN [targetAccountId]`);
  }
}
