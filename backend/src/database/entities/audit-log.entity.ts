import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * 稽核紀錄（data-model.md #auditlog-entity）。**Append-only**：一經寫入不可修改/刪除。
 *  - 身分快照（employeeNo/name/company/department/section/roleCode）與該次浮水印同一來源（F023 AC3）。
 *  - documentId/lifecycleId/formId 為條件必填（依 targetType 二擇一，其餘 null）。
 *  - 承載時間戳記之 occurredAt 用 datetime2（範圍 0001–9999，避免 datetime 溢位；比照 SYNC_RUN.watermark）。
 *  - id 由應用層 randomUUID() 明確給定（不依賴 OUTPUT 取回）。
 *
 * ⚠ 不可竄改之 DB 層強制（REVOKE UPDATE/DELETE 應用帳號權限）於 migration 落地，為縱深防禦第二層
 *   （[integration]，TS-F023-013）；本 entity + TypeOrmAuditStore 不提供任何 update/delete 路徑（第一層）。
 */
@Entity({ name: 'AUDIT_LOG' })
@Index('IX_AUDIT_LOG_accountId', ['accountId'])
@Index('IX_AUDIT_LOG_documentId', ['documentId'])
@Index('IX_AUDIT_LOG_occurredAt', ['occurredAt'])
@Index('IX_AUDIT_LOG_document_occurredAt', ['documentId', 'occurredAt'])
@Index('IX_AUDIT_LOG_account_occurredAt', ['accountId', 'occurredAt'])
// F024 kind 篩選（targetType IN）＋ occurredAt 範圍/排序（migration 1723075200000，OQ-AQ-01/NFR-001）。
@Index('IX_AUDIT_LOG_targetType_occurredAt', ['targetType', 'occurredAt'])
export class AuditLog {
  @PrimaryColumn({ type: 'uniqueidentifier' })
  id!: string;

  @Column({ type: 'uniqueidentifier' })
  accountId!: string;

  @Column({ type: 'varchar', length: 10, nullable: true })
  employeeNo!: string | null;

  @Column({ type: 'nvarchar', length: 30, nullable: true })
  name!: string | null;

  @Column({ type: 'nvarchar', length: 100, nullable: true })
  company!: string | null;

  @Column({ type: 'nvarchar', length: 100, nullable: true })
  department!: string | null;

  @Column({ type: 'nvarchar', length: 100, nullable: true })
  section!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  roleCode!: string | null;

  @Column({ type: 'varchar', length: 30 })
  targetType!: string;

  @Column({ type: 'varchar', length: 40 })
  actionType!: string;

  @Column({ type: 'uniqueidentifier', nullable: true })
  documentId!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  documentNumber!: string | null;

  @Column({ type: 'uniqueidentifier', nullable: true })
  lifecycleId!: string | null;

  @Column({ type: 'nvarchar', length: 200, nullable: true })
  lifecycleName!: string | null;

  @Column({ type: 'uniqueidentifier', nullable: true })
  formId!: string | null;

  // F039 附錄下載（targetType='APPENDIX'）之對象參照；比照 formId 定義，不建專屬索引。
  @Column({ type: 'uniqueidentifier', nullable: true })
  appendixId!: string | null;

  /**
   * 🔴 2026-08-25 角色自動化 delta：被異動之帳號 id（僅 targetType='ACCOUNT' 之列非 null）。
   * 無 FK——AUDIT_LOG 為 append-only 稽核事實，不得受目標帳號後續變動約束（比照既有參照欄）。
   */
  @Column({ type: 'uniqueidentifier', nullable: true })
  targetAccountId!: string | null;

  /**
   * 🔴 F042 E11 delta（`AC-18`，`OQ-E11-13=B`）：場次所屬之使用單位代碼
   * （僅 targetType='OJT_SESSION' 之列非 null）。
   *
   * ⚠ **獨立 migration**（`1724976000000-audit-log-org-code`）——新增*欄位*與 D9 批之
   * 「新增*列舉值* ⇒ 不需 migration」是不同型的變更。既有列一律 NULL，不需回填。
   * 無 FK 至 ORG_UNIT——稽核為 append-only 事實，不得受組織後續裁撤／改組約束（比照既有參照欄）。
   */
  @Column({ type: 'varchar', length: 10, nullable: true })
  orgCode!: string | null;

  /**
   * 🔴 F043 決策 E3（architecture-spec §14.6.2）：業務/功能類別 id（僅
   * targetType='BUSINESS_CATEGORY'／'BUSINESS_CATEGORY_CHANGE_LOG' 之列非 null）。
   * 比照既有 `lifecycleId` 之定位——本功能為與循環平行、獨立之第二套分類軸。
   * 無 FK（append-only 稽核事實，不受類別後續刪除約束）；不建索引（非既有查詢熱路徑之過濾鍵）。
   */
  @Column({ type: 'uniqueidentifier', nullable: true })
  businessCategoryId!: string | null;

  /**
   * 🔴 F043 `AC-31`：掛載／移除事件之節點 id（僅 targetType='BUSINESS_CATEGORY' 且動作為
   * `_DOC_MOUNTED`／`_DOC_UNMOUNTED` 之列非 null）。本功能獨有——循環側之掛載住在
   * `ICSOP_DOCUMENT.nodeId`，從不落到稽核列上。
   */
  @Column({ type: 'uniqueidentifier', nullable: true })
  nodeId!: string | null;

  @Column({ type: 'nvarchar', length: 200, nullable: true })
  targetName!: string | null;

  // 完整浮水印字串快照（可長）→ nvarchar(max)。
  @Column({ type: 'nvarchar', length: 'MAX', nullable: true })
  watermarkSnapshot!: string | null;

  @Column({ type: 'datetime2' })
  occurredAt!: Date;

  @Column({ type: 'varchar', length: 10, default: 'DIRECT' })
  source!: string;
}
