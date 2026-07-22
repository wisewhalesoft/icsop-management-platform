import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** 循環（Life Cycle）池（F007）。DAG 結構與 ICSOP 文件掛載之容器。 */
@Entity({ name: 'LIFECYCLE' })
export class Lifecycle {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'nvarchar', length: 100 })
  name!: string;

  @Column({ type: 'nvarchar', length: 500, nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 10, default: 'active' })
  status!: string; // active / inactive

  @Column({ type: 'datetime2' })
  createdAt!: Date;

  @Column({ type: 'datetime2' })
  updatedAt!: Date;
}
