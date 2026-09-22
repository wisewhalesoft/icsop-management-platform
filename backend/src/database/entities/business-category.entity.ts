import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * 業務/功能類別池（F043 §甲）。與 `LIFECYCLE` **平行且獨立**之第二套 DAG 分類骨架
 * （architecture-spec §14）——兩張表之名稱**刻意不互相比對**（`AC-04`）。
 *
 * 業務身分＝`(name, subcategory)` 組合（INV-B1 唯一索引；MSSQL 視多個 NULL 為相等，恰符本語意）。
 * 無子分類恆為 `NULL`（不得為空字串，INV-B3）。
 */
@Entity({ name: 'BUSINESS_CATEGORY' })
export class BusinessCategory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'nvarchar', length: 100 })
  name!: string;

  @Column({ type: 'nvarchar', length: 100, nullable: true })
  subcategory!: string | null;

  @Column({ type: 'nvarchar', length: 500, nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 10, default: 'active' })
  status!: string; // active / inactive

  /**
   * 排序值（F043 `AC-UX29`／`ARCH-UX5`，migration `1725667200000`）。
   *
   * 🔒 鎖定之識別子為 `sortOrder`（🔴 明文禁止 `order`／`seq`／`displayOrder` 等變體）。
   * ⚠ **不保證唯一、不保證連續**——它是排序鍵而非識別碼；平手時之次要鍵為 `name` 之
   * **UTF-16 碼位序**，由應用層之 `sortByOrderThenName()` 施加（SQL 之 `ORDER BY name` 走的是
   * 資料庫預設 collation `Chinese_Taiwan_Stroke_BIN`＝筆畫序，**不是**碼位序）。
   * 🔒 停用**不改變任何列之 `sortOrder`**（`AC-UX31` ①：停用者仍佔序位，重新啟用時次序不跳）。
   */
  @Column({ type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ type: 'datetime2' })
  createdAt!: Date;

  @Column({ type: 'datetime2' })
  updatedAt!: Date;
}
