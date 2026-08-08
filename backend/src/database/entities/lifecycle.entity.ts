import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** 循環（Life Cycle）池（F007）。DAG 結構與 ICSOP 文件掛載之容器。 */
@Entity({ name: 'LIFECYCLE' })
export class Lifecycle {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'nvarchar', length: 100 })
  name!: string;

  /**
   * F040 子分類（非必填）。循環之業務身分＝`(name, subcategory)` 組合（INV-1 唯一索引）。
   * 無子分類恆為 `NULL`（不得為空字串，INV-3）；長度比照 `name`（OQ-E03-11）。
   */
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
