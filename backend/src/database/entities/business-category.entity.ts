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

  @Column({ type: 'datetime2' })
  createdAt!: Date;

  @Column({ type: 'datetime2' })
  updatedAt!: Date;
}
