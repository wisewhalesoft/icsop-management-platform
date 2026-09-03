import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** 業務/功能類別內之 DAG 節點（F043 §乙）。可掛載多份 ICSOP 文件（M:N，見 BUSINESS_CATEGORY_DOC）。 */
@Entity({ name: 'BUSINESS_CATEGORY_NODE' })
export class BusinessCategoryNode {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('IX_BUSINESS_CATEGORY_NODE_businessCategoryId')
  @Column({ type: 'uniqueidentifier' })
  businessCategoryId!: string; // → BUSINESS_CATEGORY.id（比照 LIFECYCLE_NODE：不宣告 DB FK）

  @Column({ type: 'nvarchar', length: 100, nullable: true })
  name!: string | null; // 可先建立未命名

  @Column({ type: 'float', default: 0 })
  positionX!: number;

  @Column({ type: 'float', default: 0 })
  positionY!: number;
}
