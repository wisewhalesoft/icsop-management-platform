import { Column, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

/**
 * 帳號。主鍵 (companyCode, loginId)——loginId ← 上游 USERID（100% 唯一）。
 * ⚠ 不得以 (companyCode, employeeNo) 為鍵（員編不唯一，見 upstream-hr-source-contract.md §7.2）。
 * email 為 Azure AD 身分對應鍵（§12.2）；建索引以支援登入查詢（MSSQL 預設 collation 為
 * 大小寫不敏感，符合 email 比對需求；應用層另會 normalize 為小寫）。
 */
@Entity({ name: 'ACCOUNT' })
@Unique('UQ_ACCOUNT_company_login', ['companyCode', 'loginId'])
export class Account {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 10 })
  companyCode!: string;

  @Column({ type: 'varchar', length: 20 })
  loginId!: string; // 上游 USERID

  @Column({ type: 'varchar', length: 10, nullable: true })
  employeeNo!: string | null; // 非唯一，不可作鍵

  @Column({ type: 'nvarchar', length: 30, nullable: true })
  name!: string | null;

  @Index('IX_ACCOUNT_email')
  @Column({ type: 'varchar', length: 100, nullable: true })
  email!: string | null; // AD 對應鍵（← VW_HPMUSER.EMAILADDR）

  @Column({ type: 'varchar', length: 10, nullable: true })
  orgCode!: string | null; // 對應 ORG_UNIT.orgCode

  @Column({ type: 'varchar', length: 20 })
  roleCode!: string; // 參照 ROLE.code（單一角色，OQ-E01-06）

  @Column({ type: 'varchar', length: 10, default: 'active' })
  status!: string; // active / disabled（上游 EMPSTS='A' 為在職）

  @Column({ type: 'varchar', length: 200, nullable: true })
  passwordHash!: string | null; // 僅手動帳號；嚴禁由上游寫入

  @Column({ type: 'varchar', length: 10, default: 'upstream' })
  source!: string; // manual / upstream
}
