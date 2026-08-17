import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * 使用表單池 USAGE_FORM_POOL（OQ-E05-04 定案：表單池多對多）。
 * 一份表單可被多份文件引用（關聯見 DOC_USAGE_FORM）。覆蓋式，不留歷史版本。
 */
@Entity({ name: 'USAGE_FORM_POOL' })
export class UsageFormPool {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'nvarchar', length: 400 })
  name!: string;

  @Column({ type: 'varchar', length: 1000 })
  blobPath!: string;

  @Column({ type: 'varchar', length: 20 })
  format!: string; // xlsx / xls / pdf

  @Column({ type: 'bigint' })
  size!: string;

  @Column({ type: 'varchar', length: 100 })
  uploadedBy!: string;

  @Column({ type: 'datetime2' })
  uploadedAt!: Date;

  /**
   * F018 delta（2026-08-16）：表單編號（選填、池內唯一、不分大小寫）。
   *
   * 🔴 刻意**不加** `@Index({ unique: true })`——TypeORM 無法表達 filtered index，加了會產生一個
   * 「多筆 NULL 互相衝突」的普通 unique index 定義（MSSQL 視多個 NULL 為相等）。唯一性由手寫
   * migration 之 `UQ_USAGE_FORM_POOL_formNumber ... WHERE [formNumber] IS NOT NULL` 落實。
   * 🔴 不分大小寫**由本欄自己的 collation 保證**，不依賴資料庫預設、亦不另存正規化比較欄。
   * 本專案之 SOP 資料庫實測為 `Chinese_Taiwan_Stroke_BIN`（二進位比對＝大小寫敏感），
   * §10.7 原本「DB 為 `_CI_`」之前提對它為假，故由 `1724025600000-usage-form-number-collation`
   * 以欄位級 `COLLATE` 覆寫。此處宣告與該 migration 一致，避免日後 `migration:generate` 判為差異。
   */
  @Column({ type: 'nvarchar', length: 100, nullable: true, collation: 'Chinese_Taiwan_Stroke_CI_AS' })
  formNumber!: string | null;
}
