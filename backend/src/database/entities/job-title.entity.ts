import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * 職稱對照主檔（← VW_PERSONAL_JOB 之 `JTITLE_ID` / `JTITLE_NM`；契約 §5.4）。
 *
 * 為何獨立成表而非直接把名稱寫進 ACCOUNT（與 ORG_UNIT 同一模式）：
 *  - 上游職稱改名時只需更新本表 54~71 列，不必 backfill 數千筆帳號；
 *  - 增量同步僅在帳號 `MTDT` 異動時才會重寫該帳號，若名稱落在 ACCOUNT，
 *    「僅主檔改名、帳號未異動」的情境會使顯示值永久過時。
 *
 * ⚠ 鍵為 (companyCode, code) 而非單獨 code：上游**跨公司**存在一碼多名
 *  （實測 2026-08-12：全公司 71 組 pair / 63 種代碼，8 種代碼歧義，如 C01＝協理｜高級協理）。
 *  限單一公司內則為 1:1（AS：54 組 pair / 54 種代碼，零歧義），故以公司分鍵即可消除歧義。
 *  解析順序見 job-title-directory.ts（本公司優先，查無再跨公司 fallback）。
 */
@Entity({ name: 'JOB_TITLE' })
@Index('IX_JOB_TITLE_company_code', ['companyCode', 'code'], { unique: true })
export class JobTitle {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 10 })
  companyCode!: string; // ← COMPID

  @Column({ type: 'varchar', length: 10 })
  code!: string; // ← JTITLE_ID（對應 ACCOUNT.jobTitleCode）

  @Column({ type: 'nvarchar', length: 100 })
  name!: string; // ← JTITLE_NM（例：業務專員、課長、協理）
}
