import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * ICSOP 文件（E04）。19 欄位權威定義見 data-model §document-entity。
 * 本增量含 scalar 欄位；多值關聯（當責室長-次要、使用部門）、附件、連結點為後續增量（F014/F015/F016）。
 * 編號唯一性（F013）以 filtered unique index（WHERE status IN('active','void')）於 migration 落實。
 */
@Entity({ name: 'ICSOP_DOCUMENT' })
export class IcsopDocument {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 20 })
  status!: string; // active / inactive / void

  @Index('IX_ICSOP_DOCUMENT_number')
  @Column({ type: 'varchar', length: 100 })
  documentNumber!: string;

  @Column({ type: 'nvarchar', length: 200 })
  documentName!: string;

  @Index('IX_ICSOP_DOCUMENT_lifecycleId')
  @Column({ type: 'uniqueidentifier' })
  lifecycleId!: string; // → LIFECYCLE（建立時必填）

  @Column({ type: 'uniqueidentifier', nullable: true })
  nodeId!: string | null; // → LIFECYCLE_NODE（唯一權威寫入＝節點抽屜 F009）

  @Column({ type: 'uniqueidentifier', nullable: true })
  draftingCompanyId!: string | null; // → ORG_UNIT（公司）

  @Column({ type: 'uniqueidentifier', nullable: true })
  draftingDeptId!: string | null; // → ORG_UNIT（部）

  @Column({ type: 'uniqueidentifier', nullable: true })
  draftingSectionId!: string | null; // → ORG_UNIT（處/室）

  @Column({ type: 'varchar', length: 20, nullable: true })
  primaryChiefId!: string | null; // 當責室長-主要（員編；PERSON 表待建）

  @Column({ type: 'varchar', length: 20, nullable: true })
  edition!: string | null; // 版次 {YY}'{NN}

  @Column({ type: 'datetime2', nullable: true })
  announcedDate!: Date | null; // 公告日期（決定已公告/進度中衍生）

  @Column({ type: 'nvarchar', length: 2000, nullable: true })
  contentSummary!: string | null;

  @Column({ type: 'datetime2' })
  createdAt!: Date;

  @Column({ type: 'datetime2' })
  updatedAt!: Date;
}
