import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * 循環內 DAG 有向邊 parent→child（F008）。
 * 不變式：同一循環內所有邊構成 DAG（禁 self-loop、禁成環），由 F008 後端交易內權威驗證。
 */
@Entity({ name: 'LIFECYCLE_EDGE' })
export class LifecycleEdge {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('IX_LIFECYCLE_EDGE_lifecycleId')
  @Column({ type: 'uniqueidentifier' })
  lifecycleId!: string; // → LIFECYCLE.id

  @Column({ type: 'uniqueidentifier' })
  sourceNodeId!: string; // parent

  @Column({ type: 'uniqueidentifier' })
  targetNodeId!: string; // child
}
