import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * 業務/功能類別內之 DAG 有向邊 parent→child（F043 §乙）。
 * 不變式：同一類別內所有邊構成 DAG（禁 self-loop、禁成環），由後端交易內權威驗證（`AC-17`）。
 */
@Entity({ name: 'BUSINESS_CATEGORY_EDGE' })
export class BusinessCategoryEdge {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('IX_BUSINESS_CATEGORY_EDGE_businessCategoryId')
  @Column({ type: 'uniqueidentifier' })
  businessCategoryId!: string; // → BUSINESS_CATEGORY.id

  @Column({ type: 'uniqueidentifier' })
  sourceNodeId!: string; // parent

  @Column({ type: 'uniqueidentifier' })
  targetNodeId!: string; // child
}
