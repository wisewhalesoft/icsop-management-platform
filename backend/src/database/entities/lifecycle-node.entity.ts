import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** 循環內 DAG 節點（F008）。可掛載多份 ICSOP 文件（F009）。 */
@Entity({ name: 'LIFECYCLE_NODE' })
export class LifecycleNode {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('IX_LIFECYCLE_NODE_lifecycleId')
  @Column({ type: 'uniqueidentifier' })
  lifecycleId!: string; // → LIFECYCLE.id

  @Column({ type: 'nvarchar', length: 100, nullable: true })
  name!: string | null; // 可先建立未命名

  @Column({ type: 'float', default: 0 })
  positionX!: number;

  @Column({ type: 'float', default: 0 })
  positionY!: number;
}
