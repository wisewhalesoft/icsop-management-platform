import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * 業務/功能類別節點 × ICSOP 文件之 **M:N** 掛載列（F043 §丙）。
 *
 * 🔴 與循環側之單一歸屬（`ICSOP_DOCUMENT.nodeId`）**語意刻意相反**：同一份文件可同時掛在
 * 多個節點／多個類別，且與其循環掛載互不干涉（INV-B4）。
 * INV-B6：`(nodeId, documentId)` 唯一，**僅此一個唯一鍵**（不得另加 `(businessCategoryId,documentId)`
 * 或單獨 `(documentId)`）。
 *
 * 🔴 決策 E9（architecture-spec §14.6.8）：**不加**冗餘 `businessCategoryId` 欄——所屬類別一律
 * 經 `nodeId` join `BUSINESS_CATEGORY_NODE` 取得。
 */
@Entity({ name: 'BUSINESS_CATEGORY_DOC' })
export class BusinessCategoryDoc {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('IX_BUSINESS_CATEGORY_DOC_nodeId')
  @Column({ type: 'uniqueidentifier' })
  nodeId!: string; // → BUSINESS_CATEGORY_NODE.id（決策 E8：不建 FK，刪節點時同交易內顯式刪除）

  @Index('IX_BUSINESS_CATEGORY_DOC_documentId')
  @Column({ type: 'uniqueidentifier' })
  documentId!: string; // → ICSOP_DOCUMENT.id（決策 E8：FK ON DELETE CASCADE，於 migration 宣告）

  @Column({ type: 'uniqueidentifier' })
  mountedByAccountId!: string;

  @Column({ type: 'datetime2' })
  mountedAt!: Date;
}
