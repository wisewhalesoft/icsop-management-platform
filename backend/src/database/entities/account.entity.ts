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
  loginId!: string; // ← 上游 VW_PERSONNEL_SQL.NO（v2.0；v1.0 為 VW_HPMUSER.USERID）

  /**
   * 換來源前之舊 `loginId`（← `VW_HPMUSER.USERID`），由 migration
   * `AccountLoginIdToEmployeeNo1724198400000` 填入；手動帳號恆為 NULL。
   * 保留為切換稽核軌跡與 `down()` 之還原依據，**刻意不清除**。
   */
  @Column({ type: 'varchar', length: 20, nullable: true })
  legacyLoginId!: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  employeeNo!: string | null; // ← 上游 NO（v2.0 起與 loginId 同源，見契約 §5.2）

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

  /**
   * 🔴 角色來源（2026-08-25 角色自動化 delta，裁定 Q1.2／OQ-RA-02）。
   * `'derived'`＝由同步推導、後續同步可再覆寫；`'manual'`＝管理員指派過，**同步永不覆寫**。
   * `NOT NULL DEFAULT 'derived'` ＋ CHECK 約束（migration 1724544000000-account-role-source）。
   * ⚠ 狀態轉移單向：`derived → manual`，無反向路徑。
   * ⚠ 非上游來源欄位——同步之帳號 upsert payload 不得含此鍵。
   */
  @Column({ type: 'nvarchar', length: 20, default: 'derived' })
  roleSource!: string;

  // --- F004 組織同步新增（← VW_HPMUSER 白名單欄位 + 停用軌跡） ---

  @Column({ type: 'varchar', length: 10, nullable: true })
  managerEmpNo!: string | null; // ← DIRECTOR（直屬主管員編）

  /**
   * 職稱代碼＝畫面之「**資位**」欄（← `VW_PERSONNEL_SQL.TITLE_CODE`，白名單欄；
   * v1.0 舊來源為 `VW_HPMUSER.JOBTITLEID`）。名稱不落此表，改由 JOB_TITLE 對照表解析
   * （與 orgCode→ORG_UNIT.name 同一模式），避免上游改名時需 backfill 全部帳號。
   * 上游實測（2026-08-24，四家在職 1,362 筆）：空值 0、本公司對照命中率 100%。
   */
  @Column({ type: 'varchar', length: 10, nullable: true })
  jobTitleCode!: string | null;

  /**
   * 職位代碼＝畫面之「**職位**」欄（← `VW_PERSONNEL_SQL.JOB_CODE`）。名稱不落此表，
   * 改由 JOB_POSITION 對照表解析（理由同 `jobTitleCode`）。
   * 🔴 該上游欄名與 `VW_DEPT_SQL.JOB_CODE`（＝部門主管員編）**同名異義**，不可互推。
   * 上游實測（2026-08-31，四家在職 1,362 筆）：NULL 0／空字串 0；
   * `(companyCode, code)` 精確命中 1,356/1,362（AS 之 `B20` 6 筆於主檔查無 → 顯示「—」）。
   */
  @Column({ type: 'varchar', length: 10, nullable: true })
  jobPositionCode!: string | null;

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
