import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * 組織單位（5 層：ROOT/DIVISION 本部/DEPARTMENT 部/SECTION 處室/SUBSECTION 課）。
 * 階層由部門代碼前綴推導（見 upstream-hr-source-contract.md §3.5）；
 * orgCode 建索引以支援子樹前綴比對 `LIKE 'prefix%'`（F019/F026/F033）。
 * 本 baseline 僅含 auth/組織核心欄位；其餘由後續 feature 之 migration 擴充。
 */
@Entity({ name: 'ORG_UNIT' })
@Index('IX_ORG_UNIT_company_code', ['companyCode', 'orgCode'], { unique: true })
export class OrgUnit {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 10 })
  companyCode!: string; // 上游 COMPID，本輪限 AS

  @Index('IX_ORG_UNIT_orgCode')
  @Column({ type: 'varchar', length: 10 })
  orgCode!: string; // 5 碼部門代碼

  @Column({ type: 'varchar', length: 10 })
  codePrefix!: string; // 去尾端 0 之有效前綴，供子樹 LIKE 比對

  @Column({ type: 'varchar', length: 10, nullable: true })
  parentCode!: string | null; // 由代碼前綴推導之上層代碼（Root 為 null），F004 新增

  @Column({ type: 'varchar', length: 20 })
  tier!: string; // ROOT / DIVISION / DEPARTMENT / SECTION / SUBSECTION

  @Column({ type: 'nvarchar', length: 100 })
  name!: string;

  @Column({ type: 'varchar', length: 10, nullable: true })
  managerEmpNo!: string | null; // 部門主管員編（F014 當責室長候選）

  @Column({ type: 'bit', default: true })
  isActive!: boolean; // CLOSE_DATE 哨兵 9999-12-31 → true
}
