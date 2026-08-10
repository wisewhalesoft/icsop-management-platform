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

  /**
   * F041 一般使用者子分類（'business' / 'other'）。NOT NULL DEFAULT 'other' ＋ CHECK 約束
   * （migration 1723766400000-account-user-subtype）。
   * ⚠ INV-2：僅 roleCode='User' 時具效力；其餘角色之值恆被忽略（角色升降級不清空，AC-36）。
   * ⚠ 非上游來源欄位——F004 組織同步之 upsert payload 不得含此鍵（AC-34）。
   */
  @Column({ type: 'nvarchar', length: 20, default: 'other' })
  userSubtype!: string;

  // --- F004 組織同步新增（← VW_HPMUSER 白名單欄位 + 停用軌跡） ---

  @Column({ type: 'varchar', length: 10, nullable: true })
  managerEmpNo!: string | null; // ← DIRECTOR（直屬主管員編）

  // 承載上游日期：改用 datetime2（範圍 0001–9999），涵蓋所有合法日期，避免 datetime（1753–9999）
  // 之「Out of range」（2026-07-21 實跑抓到）。另於 mapper 以 normalizeUpstreamDate 收斂哨兵/異常值。
  @Column({ type: 'datetime2', nullable: true })
  resignDate!: Date | null; // ← RESIGNDT（哨兵 9999-12-31 → null）

  @Column({ type: 'datetime2', nullable: true })
  hireDate!: Date | null; // ← HIREDT

  @Column({ type: 'datetime2', nullable: true })
  upstreamModifiedAt!: Date | null; // ← MTDT，增量同步水位依據

  @Column({ type: 'varchar', length: 10, nullable: true })
  disableReason!: string | null; // manual / departed

  @Column({ type: 'datetime', nullable: true })
  disabledAt!: Date | null;

  // 最後登入時間戳：每次成功登入（途徑 A OIDC／途徑 B 帳密）各寫入一次，非每請求（避免寫入放大、
  // 亦避免以 AUDIT 近似造成 login-only/admin-CRUD 低估）。供帳號管理清單「最後登入」欄。datetime2 範圍充足。
  @Column({ type: 'datetime2', nullable: true })
  lastLoginAt!: Date | null;
}
