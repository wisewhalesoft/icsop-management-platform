import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * 文件使用部門（F014，多值）。(documentId, orgCode) 一筆一個使用部門。
 * orgCode＝ORG_UNIT.orgCode（業務鍵，任意層級；權限判定時以前綴展開子樹，§9.2）。
 * FK → ICSOP_DOCUMENT ON DELETE CASCADE（刪文件連帶清除其多值列）。
 * (documentId, orgCode) 複合唯一（同一文件不重複同一部門）。
 */
@Entity({ name: 'DOC_USING_DEPT' })
@Index('UQ_DOC_USING_DEPT_doc_org', ['documentId', 'orgCode'], { unique: true })
@Index('IX_DOC_USING_DEPT_company_org', ['companyCode', 'orgCode'])
export class DocUsingDept {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('IX_DOC_USING_DEPT_doc')
  @Column({ type: 'uniqueidentifier' })
  documentId!: string;

  /**
   * 🔴 B 階段（多公司）：使用部門所屬公司（恆等同其文件之 companyCode）。
   * 沒有本欄，`isUsingDeptMatched` 之前綴比對會跨公司誤中——F041「業務」子分類使用者可能
   * 看到別家公司的文件（越權瀏覽）。既有列已由 migration 依所屬文件回填。
   */
  @Column({ type: 'varchar', length: 10 })
  companyCode!: string;

  @Column({ type: 'varchar', length: 10 })
  orgCode!: string;
}
