import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * 職位對照主檔（← VW_JOB_FUN 之 `CODE` / `DESC_CHI`；契約 §5.4.2）。
 *
 * 與 JOB_TITLE（資位）為**兩個正交維度**，不可互相取代：
 *  - 資位（`JOB_TITLE` ← `VW_PERSONAL_JOB.JTITLE_NM`）＝職等，如 業務專員／辦事員／副理；
 *  - 職位（本表 ← `VW_JOB_FUN.DESC_CHI`）＝職務位置，如 營業一般職／事務一般職／室長／處長。
 *  實測 2026-08-31（AS 在職 1,051 人）：資位「副理」× 職位「室長」16 人、
 *  資位「課長」× 職位「處長」12 人——同資位對應多種職位，反之亦然。
 *
 * 獨立成表之理由與 JOB_TITLE 相同：上游改名只需更新本表 73 列，不必 backfill 數千筆帳號；
 * 且帳號增量同步以 `MTDT` 為水位，名稱若落在 ACCOUNT，「僅主檔改名」之情境將永久過時。
 *
 * 🔴 鍵為 (companyCode, code)，且解析**不得**跨公司 fallback：同代碼跨公司語意可**相反**
 *   （實測：`D04` 在 AS＝營業經理、在 AD＝科長；`C04` 在 AD＝部長、他家＝處長）。
 *   詳見 job-position-directory.ts。
 */
@Entity({ name: 'JOB_POSITION' })
@Index('IX_JOB_POSITION_company_code', ['companyCode', 'code'], { unique: true })
export class JobPosition {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 10 })
  companyCode!: string; // ← COMPID

  @Column({ type: 'varchar', length: 10 })
  code!: string; // ← CODE（對應 ACCOUNT.jobPositionCode）

  @Column({ type: 'nvarchar', length: 100 })
  name!: string; // ← DESC_CHI（例：營業一般職、事務一般職、室長、處長）
}
