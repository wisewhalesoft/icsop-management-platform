import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * 組織異動待確認提示（F006；data-model §orgchangealert-entity 之擴充）。
 *
 * 單表＋`alertKind` 判別欄（D1）：
 *  - DOCUMENT_FIELD：文件層欄位異動（documentId/affectedField/beforeValue/afterValue）。
 *  - CLOSED_DEPT_PERSON：人員層（§7.3 在職者掛於已關閉部門），不綁任何文件。
 * 兩類共用 status/resolutionKind/resolvedBy/resolvedAt/createdAt/sourceSyncRunId 生命週期欄位，
 * 且後台「待確認異動」頁籤需合併呈現，故不拆兩表。
 *
 * 去重（D3）由 migration 之 filtered unique index 於 DB 層把關（服務層另有第一道）：
 *  - (documentId, affectedField) WHERE status='pending' AND alertKind='DOCUMENT_FIELD'
 *  - (personEmployeeNo)         WHERE status='pending' AND alertKind='CLOSED_DEPT_PERSON'
 *
 * ⚠ documentId 為「條件必填」（data-model 原文寫必填；人員層提示不綁文件，見 impl log flag）。
 */
@Entity({ name: 'ORG_CHANGE_ALERT' })
@Index('IX_ORG_CHANGE_ALERT_status', ['status'])
export class OrgChangeAlert {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 30 })
  alertKind!: string; // DOCUMENT_FIELD / CLOSED_DEPT_PERSON

  @Index('IX_ORG_CHANGE_ALERT_documentId')
  @Column({ type: 'uniqueidentifier', nullable: true })
  documentId!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  documentNumber!: string | null; // 顯示快照（免 join，比照 DOCUMENT_CHANGE_LOG 慣例）

  @Column({ type: 'nvarchar', length: 200, nullable: true })
  documentName!: string | null;

  @Column({ type: 'nvarchar', length: 30, nullable: true })
  affectedField!: string | null; // 值域＝F026 FieldKey（制定公司/當責室長-主要…）

  @Column({ type: 'nvarchar', length: 200, nullable: true })
  beforeValue!: string | null;

  @Column({ type: 'nvarchar', length: 200, nullable: true })
  afterValue!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  personEmployeeNo!: string | null;

  @Column({ type: 'nvarchar', length: 30, nullable: true })
  personName!: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  deptOrgCode!: string | null;

  @Column({ type: 'nvarchar', length: 100, nullable: true })
  deptName!: string | null;

  // 上游 CLOSE_DATE 衍生值 → datetime2（0001–9999），避免 datetime（1753–9999）溢位。
  @Column({ type: 'datetime2', nullable: true })
  deptCloseDate!: Date | null;

  @Column({ type: 'varchar', length: 20 })
  status!: string; // pending / resolved

  @Column({ type: 'varchar', length: 20, nullable: true })
  resolutionKind!: string | null; // FIELD_UPDATED / NO_CHANGE_NEEDED

  @Column({ type: 'uniqueidentifier', nullable: true })
  resolvedBy!: string | null; // → ACCOUNT.id（稽核 actorId 對齊）

  @Column({ type: 'datetime2', nullable: true })
  resolvedAt!: Date | null;

  @Column({ type: 'datetime2' })
  createdAt!: Date;

  @Column({ type: 'uniqueidentifier', nullable: true })
  sourceSyncRunId!: string | null; // → SYNC_RUN.id（ON DELETE SET NULL）
}
