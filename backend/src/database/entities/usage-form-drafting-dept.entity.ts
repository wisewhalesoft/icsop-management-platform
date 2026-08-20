import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * 使用表單之制定部門（F018 `AC-N45`，2026-08-20 D9 delta；多值）。
 * (formId, orgCode) 一筆一個制定部門。DDL 與存取模式**比照既有 `DOC_USING_DEPT`**（同構）。
 *
 * `orgCode`＝`ORG_UNIT.orgCode`（業務鍵，任意層級：部／處室／課皆可，`AC-N45`）。
 * FK → `USAGE_FORM_POOL` ON DELETE CASCADE（刪表單連帶清除其多值列）。
 * (formId, orgCode) 複合唯一（同一表單不重複同一部門）。
 *
 * 🔴 **`orgCode` 沿用資料庫預設 collation（`_BIN`，精確比對），不覆寫**（architecture-spec §11.10(c)）：
 * 本欄為**系統代碼**（5 碼前綴階層，`VW_DEPT_SQL.CODE` 之精確參照），非使用者輸入之自由文字，
 * 不存在「大小寫變異」需求。這與 `USAGE_FORM_POOL.formNumber`（`OQ-D18-30`：使用者手動輸入、
 * 需不分大小寫唯一、故顯式覆寫為 `Chinese_Taiwan_Stroke_CI_AS`）**性質不同**；
 * `DOC_USING_DEPT.orgCode` 即為同型先例（已對真庫驗證安全運作）。
 *
 * 🔒 `AC-N46`（純 metadata）：本表**不參與任何可見性／授權判定**，僅供清單顯示與編輯頁回填。
 */
@Entity({ name: 'USAGE_FORM_DRAFTING_DEPT' })
@Index('UQ_USAGE_FORM_DRAFTING_DEPT_form_org', ['formId', 'orgCode'], { unique: true })
export class UsageFormDraftingDept {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('IX_USAGE_FORM_DRAFTING_DEPT_form')
  @Column({ type: 'uniqueidentifier' })
  formId!: string;

  @Column({ type: 'varchar', length: 10 })
  orgCode!: string;
}
